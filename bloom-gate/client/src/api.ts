// Thin client → server bridge. The client decides NOTHING about rewards.

export interface SpinResult {
  spinId: number;
  kind: string;
  icon: string;
  label: string;
  coinsAwarded: number;
  tokensAwarded: number;
  extraSpins: number;
  cardsAwarded: number;
  momentumBefore: number;
  momentumAfter: number;
  hot: boolean;
}

export interface Wallet {
  coins: number;
  spins: number;
  helpTokens: number;
  rareCards: number;
  buildBoost: boolean;
  level: number;
  helpXP: number;
  momentum: number;
}

export interface Village {
  buildingsBuilt: number;
  slotsPerVillage: number;
  currentIndex: number;
  constructing: boolean;
}

export interface GoldenHourView {
  buildingIndex: number;
  msLeft: number;
  durationMs: number;
  helpers: number;
  maxHelpers: number;
}

export interface StrangerWindow {
  botId: number;
  windowIndex: number;
  name: string;
  building: string;
  progress: number;
  msLeft: number;
}

export interface WorldEvent {
  type: string;
  [k: string]: unknown;
}

export interface View {
  wallet: Wallet;
  village: Village;
  goldenHour: GoldenHourView | null;
  strangerPool: StrangerWindow[];
  nextBuildCost: number;
  canBuild: boolean;
  events: WorldEvent[];
}

export interface PublicConfig {
  dropTable: { kind: string; icon: string; label: string }[];
  momentum: { min: number; max: number; hotThreshold: number; decayPerSec: number };
  coin: { base: number; perLevel: number };
  building: { slotsPerVillage: number };
  goldenHour: { durationMs: number; maxHelpers: number };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getConfig(): Promise<PublicConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('config failed');
  return res.json();
}

export function makeSessionId(): string {
  const k = 'bloom_session_id';
  let id = localStorage.getItem(k);
  if (!id) {
    id = 's_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(k, id);
  }
  return id;
}

export const startSession = (sessionId: string) =>
  post<{ sessionId: string } & View>('/api/session', { sessionId });
export const spin = (sessionId: string) =>
  post<{ result: SpinResult } & View>('/api/spin', { sessionId });
export const build = (sessionId: string) =>
  post<{ build: { ok: boolean; reason?: string } } & View>('/api/build', { sessionId });
export const help = (sessionId: string, botId: number) =>
  post<{ help: { ok: boolean; reason?: string; coins?: number } } & View>('/api/help', {
    sessionId,
    botId,
  });
export const sync = (sessionId: string) => post<View>('/api/sync', { sessionId });

export function event(sessionId: string, type: string, extra: Record<string, unknown> = {}) {
  post('/api/event', { sessionId, type, ...extra }).catch(() => {});
}
