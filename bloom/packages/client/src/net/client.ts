// BloomClient — the production networking layer. Every gameplay request is
// signed (HMAC over nonce.ts.body), carries a one-time nonce, and a Bearer JWT.
// Mirrors the server contract in @bloom/shared exactly.

import {
  HEADERS,
  type AuthTokenResponse,
  type LiveGoldenHour,
  type PassStatus,
  type PublicConfig,
  type SpinResult,
  type TeamSummary,
  type TeamView,
  type View,
} from '@bloom/shared';

export interface Collection {
  ownedCards: number;
  totalBonusPct: number;
  sets: Array<{ id: string; name: string; owned: number; total: number; complete: boolean; bonusPct: number }>;
}

export interface QuestView {
  id: string;
  label: string;
  type: string;
  progress: number;
  target: number;
  complete: boolean;
  claimed: boolean;
  reward: { spins?: number; coins?: number; helpTokens?: number };
}
import { CONFIG } from '../config.js';
import { hmacHex, newDeviceId, newNonce } from './crypto.js';

const LS_DEVICE = 'bloom_device_id';
const LS_TOKEN = 'bloom_token';

export class BloomClient {
  private token: string | null = null;
  private deviceId: string;
  playerId: string | null = null;
  private registerInFlight: Promise<void> | null = null;

  constructor() {
    this.deviceId = localStorage.getItem(LS_DEVICE) ?? newDeviceId();
    localStorage.setItem(LS_DEVICE, this.deviceId);
    this.token = localStorage.getItem(LS_TOKEN);
  }

  private url(path: string): string {
    return CONFIG.apiBase + path;
  }

  async getConfig(): Promise<PublicConfig> {
    const res = await fetch(this.url('/api/config'));
    if (!res.ok) throw new Error('config failed');
    return res.json();
  }

  /** Signed POST. Attaches Bearer token when authed=true. Retries a 401 ONCE. */
  private async signedPost<T>(path: string, body: object, authed: boolean, retried = false): Promise<T> {
    if (authed && !this.token) await this.register();
    const raw = JSON.stringify(body);
    const nonce = newNonce();
    const ts = String(Date.now());
    const sig = await hmacHex(CONFIG.hmacSecret, `${nonce}.${ts}.${raw}`);
    const token = this.token; // capture after any await
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      [HEADERS.nonce]: nonce,
      [HEADERS.timestamp]: ts,
      [HEADERS.signature]: sig,
      [HEADERS.appVersion]: CONFIG.appVersion,
    };
    if (authed && token) headers[HEADERS.auth] = `Bearer ${token}`;
    const res = await fetch(this.url(path), { method: 'POST', headers, body: raw });
    if (res.status === 401 && authed && !retried) {
      // token expired/invalid → re-register once (single-flight) and retry once
      await this.register();
      return this.signedPost<T>(path, body, authed, true);
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`${path} ${res.status} ${JSON.stringify(err)}`);
    }
    return res.json() as Promise<T>;
  }

  /** Register the device → token. Single-flight: concurrent callers share one. */
  async register(): Promise<void> {
    if (this.registerInFlight) return this.registerInFlight;
    this.registerInFlight = (async () => {
      try {
        const r = await this.signedPost<AuthTokenResponse>(
          '/api/auth/device',
          { deviceId: this.deviceId, platform: CONFIG.platform, appVersion: CONFIG.appVersion },
          false,
        );
        this.token = r.token;
        this.playerId = r.playerId;
        localStorage.setItem(LS_TOKEN, r.token);
      } finally {
        this.registerInFlight = null;
      }
    })();
    return this.registerInFlight;
  }

  async ensureAuth(): Promise<void> {
    if (!this.token) await this.register();
  }

  session(): Promise<View> {
    return this.signedPost<View>('/api/session', {}, true);
  }
  sync(): Promise<View> {
    return this.signedPost<View>('/api/sync', {}, true);
  }
  spin(): Promise<{ result: SpinResult; view: View }> {
    return this.signedPost('/api/spin', {}, true);
  }
  build(): Promise<{ ok: boolean; reason?: string; view: View }> {
    return this.signedPost('/api/build', {}, true);
  }
  help(botId: number): Promise<{ ok: boolean; reason?: string; view: View }> {
    return this.signedPost('/api/help', { botId }, true);
  }
  event(type: string, data?: Record<string, unknown>): void {
    void this.signedPost('/api/event', { type, ...(data ? { data } : {}) }, true).catch(() => {});
  }

  // ── cards ──
  cards(): Promise<Collection> {
    return this.signedPost<Collection>('/api/cards', {}, true);
  }

  // ── season pass ──
  passStatus(): Promise<PassStatus> {
    return this.signedPost<PassStatus>('/api/pass', {}, true);
  }
  passClaim(): Promise<{ claimedTiers: number; view: View }> {
    return this.signedPost('/api/pass/claim', {}, true);
  }

  // ── daily quests ──
  quests(): Promise<QuestView[]> {
    return this.signedPost<QuestView[]>('/api/quests', {}, true);
  }
  questsClaim(): Promise<{ claimed: string[]; view: View }> {
    return this.signedPost('/api/quests/claim', {}, true);
  }

  // ── store (sandbox IAP) ──
  purchase(productId: string): Promise<{ ok: boolean; reason?: string; granted?: { sku: string; spins?: number }; view?: View }> {
    return this.signedPost('/api/purchase/verify', {
      platform: 'android',
      productId,
      receipt: `sandbox-ok:${productId}`,
      transactionId: 'web-' + crypto.randomUUID(),
    }, true);
  }

  // ── real player help ──
  helpLive(): Promise<LiveGoldenHour[]> {
    return this.signedPost<LiveGoldenHour[]>('/api/help/live', {}, true);
  }
  helpPlayer(targetPlayerId: string): Promise<{ ok: boolean; reason?: string; coins?: number; view: View }> {
    return this.signedPost('/api/help/player', { targetPlayerId }, true);
  }

  // ── teams ──
  teamCreate(name: string): Promise<{ ok: boolean; reason?: string; team?: TeamView }> {
    return this.signedPost('/api/team/create', { name }, true);
  }
  teamMine(): Promise<TeamView | null> {
    return this.signedPost<TeamView | null>('/api/team', {}, true);
  }
  teamList(): Promise<TeamSummary[]> {
    return this.signedPost<TeamSummary[]>('/api/team/list', {}, true);
  }
  teamJoin(teamId: string): Promise<{ ok: boolean; reason?: string; team?: TeamView }> {
    return this.signedPost('/api/team/join', { teamId }, true);
  }
  teamLeave(): Promise<{ ok: boolean; reason?: string }> {
    return this.signedPost('/api/team/leave', {}, true);
  }
  teamContribute(amount: number): Promise<{ ok: boolean; reason?: string; team?: TeamView }> {
    return this.signedPost('/api/team/contribute', { amount }, true);
  }

  /** Open the realtime presence socket (token in query — WS can't set headers).
   *  Disabled by default: on the serverless (Vercel) deploy there is no /ws, and
   *  the game stays live via /api/sync polling. Set VITE_REALTIME=1 to enable it
   *  against a persistent server. */
  connectRealtime(onMessage: (msg: unknown) => void): WebSocket | null {
    if (!CONFIG.realtime) return null;
    if (!this.token) return null;
    const base = CONFIG.apiBase || `${location.protocol}//${location.host}`;
    const wsUrl = base.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    };
    return ws;
  }
}
