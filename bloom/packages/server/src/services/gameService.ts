// GameService — application orchestration of the core loop. Loads state, runs a
// domain op, applies silent anti-cheat dampening, persists, returns the View.

import { BALANCE, type LiveGoldenHour, type PassStatus, type View } from '@bloom/shared';
import {
  addPassXp,
  advance,
  buildAction,
  buildView,
  claimDailyFreeSpins,
  claimPass,
  collectionView,
  createGameState,
  ghEffectiveHelpers,
  helpBot,
  helpPlayer,
  passStatus,
  claimQuests,
  questStatus,
  recordQuestEvent,
  resolveSpin,
  type CollectionView,
  type GameState,
  type PassClaimResult,
  type QuestClaimResult,
  type QuestView,
} from '../domain/index.js';
import type { SpinResult } from '@bloom/shared';
import type { AppContext } from '../app/context.js';
import type { PlayerRecord } from '../ports/repositories.js';
import type { AntiCheatService } from './antiCheatService.js';
import type { LiveGoldenHours } from './liveGoldenHours.js';
import type { PresenceHub } from '../realtime/hub.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export class GameService {
  constructor(
    private ctx: AppContext,
    private antiCheat: AntiCheatService,
    private live: LiveGoldenHours,
    private presence?: PresenceHub,
  ) {}

  private get salt(): string {
    return this.ctx.env.RNG_SALT;
  }

  private async load(playerId: string): Promise<GameState> {
    let s = await this.ctx.repos.gameStates.load(playerId);
    if (!s) {
      // BLOOM_START_COINS is a dev-only seed for testing build/village flows.
      const seedCoins = Number(process.env.BLOOM_START_COINS ?? '') || BALANCE.session.startingCoins;
      s = createGameState(
        playerId,
        this.ctx.clock.now(),
        BALANCE.session.startingSpins,
        seedCoins,
        BALANCE.session.startingLevel,
      );
      await this.ctx.repos.gameStates.save(s);
    }
    return s;
  }

  private async player(playerId: string): Promise<PlayerRecord> {
    const p = await this.ctx.repos.players.getById(playerId);
    if (!p) throw new Error(`player ${playerId} not found`);
    return p;
  }

  async session(playerId: string): Promise<View> {
    const now = this.ctx.clock.now();
    const s = await this.load(playerId);
    advance(s, now);
    const daily = claimDailyFreeSpins(s, now); // retention: free spins once/day
    if (daily > 0) this.telemetry(playerId, 'daily_spins', { granted: daily });
    await this.ctx.repos.gameStates.save(s);
    return buildView(s, now);
  }

  async sync(playerId: string): Promise<View> {
    const now = this.ctx.clock.now();
    const s = await this.load(playerId);
    advance(s, now);
    await this.ctx.repos.gameStates.save(s);
    return buildView(s, now);
  }

  async collection(playerId: string): Promise<CollectionView> {
    return collectionView(await this.load(playerId));
  }

  async passStatus(playerId: string): Promise<PassStatus> {
    return passStatus(await this.load(playerId), this.ctx.clock.now());
  }

  async passClaim(playerId: string): Promise<PassClaimResult & { view: View }> {
    const now = this.ctx.clock.now();
    const s = await this.load(playerId);
    const res = claimPass(s, now);
    await this.ctx.repos.gameStates.save(s);
    if (res.claimedTiers > 0) this.telemetry(playerId, 'pass_claim', { tiers: res.claimedTiers });
    return { ...res, view: buildView(s, now) };
  }

  async quests(playerId: string): Promise<QuestView[]> {
    const now = this.ctx.clock.now();
    const s = await this.load(playerId);
    const status = questStatus(s, now); // may roll the day over
    await this.ctx.repos.gameStates.save(s);
    return status;
  }

  async questsClaim(playerId: string): Promise<QuestClaimResult & { view: View }> {
    const now = this.ctx.clock.now();
    const s = await this.load(playerId);
    const res = claimQuests(s, now);
    await this.ctx.repos.gameStates.save(s);
    if (res.claimed.length > 0) this.telemetry(playerId, 'quest_claim', { ids: res.claimed });
    return { ...res, view: buildView(s, now) };
  }

  async spin(playerId: string): Promise<{ result: SpinResult; view: View }> {
    const now = this.ctx.clock.now();
    const s = await this.load(playerId);
    const player = await this.player(playerId);
    advance(s, now);

    const result = resolveSpin(s, now, this.salt);
    addPassXp(s, BALANCE.pass.xpPerSpin);
    recordQuestEvent(s, 'spin', now);

    // silent reward dampening for flagged accounts (GDD §16)
    const mult = this.antiCheat.rewardMultiplier(playerId);
    if (mult < 1 && result.coinsAwarded > 0) {
      const keep = Math.round(result.coinsAwarded * mult);
      s.coins -= result.coinsAwarded - keep;
      result.coinsAwarded = keep;
    }

    await this.antiCheat.observeSpin(player, s.level, s.spinCount, result.kind, result.coinsAwarded, now);
    await this.ctx.repos.gameStates.save(s);
    this.telemetry(playerId, 'spin', { kind: result.kind, coins: result.coinsAwarded, hot: result.hot });
    return { result, view: buildView(s, now) };
  }

  async build(playerId: string): Promise<{ ok: boolean; reason?: string; view: View }> {
    const now = this.ctx.clock.now();
    const s = await this.load(playerId);
    advance(s, now);
    // BLOOM_GH_MS lets live-ops / tests shorten the Golden Hour (default = balance).
    const ghMs = Number(process.env.BLOOM_GH_MS ?? '') || undefined;
    const res = buildAction(s, now, this.salt, ghMs);
    if (res.ok) { addPassXp(s, BALANCE.pass.xpPerBuild); recordQuestEvent(s, 'build', now); }
    await this.ctx.repos.gameStates.save(s);
    if (res.ok && s.gh) {
      this.live.register(playerId, s.gh.openedAt + s.gh.durationMs); // discoverable by real helpers
      this.telemetry(playerId, 'build', { level: s.level, built: s.buildingsBuilt });
    }
    return { ok: res.ok, ...(res.reason !== undefined ? { reason: res.reason } : {}), view: buildView(s, now) };
  }

  async help(playerId: string, botId: number): Promise<{ ok: boolean; reason?: string; view: View }> {
    const now = this.ctx.clock.now();
    const s = await this.load(playerId);
    advance(s, now);
    const res = helpBot(s, botId, now, this.salt);
    if (res.ok) { addPassXp(s, BALANCE.pass.xpPerHelp); recordQuestEvent(s, 'help', now); }
    await this.ctx.repos.gameStates.save(s);
    if (res.ok) this.telemetry(playerId, 'help', { botId, coins: res.coins });
    return { ok: res.ok, ...(res.reason !== undefined ? { reason: res.reason } : {}), view: buildView(s, now) };
  }

  /** Real players with an open Golden Hour the caller can help right now. */
  async listLive(playerId: string): Promise<LiveGoldenHour[]> {
    const now = this.ctx.clock.now();
    const ids = this.live.list(playerId, now, 5);
    const out: LiveGoldenHour[] = [];
    for (const pid of ids) {
      const st = await this.ctx.repos.gameStates.load(pid);
      const msLeft = st?.gh ? st.gh.openedAt + st.gh.durationMs - now : 0;
      if (!st?.gh || msLeft <= 0) {
        this.live.unregister(pid);
        continue;
      }
      out.push({
        playerId: pid,
        name: `Friend ${pid.slice(0, 4)}`,
        buildingIndex: st.gh.buildingIndex,
        msLeft,
        helpers: ghEffectiveHelpers(st.gh),
        maxHelpers: BALANCE.goldenHour.maxHelpers,
      });
    }
    return out;
  }

  /** Help a real player's Golden Hour (graph-gated; positive-sum reciprocity). */
  async helpPlayer(helperId: string, targetId: string): Promise<{ ok: boolean; reason?: string; coins?: number; view: View }> {
    const now = this.ctx.clock.now();
    const helper = await this.load(helperId);
    advance(helper, now);
    const target = await this.load(targetId);
    advance(target, now);

    const edges = await this.ctx.repos.helpEdges.allSince(now - WEEK);
    const res = helpPlayer(helper, target, now, edges);
    if (res.ok && res.edge) {
      addPassXp(helper, BALANCE.pass.xpPerHelp);
      recordQuestEvent(helper, 'help', now);
      await this.ctx.repos.helpEdges.add(res.edge);
      await this.ctx.repos.gameStates.save(target);
      await this.ctx.repos.gameStates.save(helper);
      if (ghEffectiveHelpers(target.gh!) >= BALANCE.goldenHour.maxHelpers) this.live.unregister(targetId);
      // live ping to the target: a real player just joined their Golden Hour
      this.presence?.broadcast(`player:${targetId}`, {
        type: 'got_helped',
        by: `Friend ${helperId.slice(0, 4)}`,
        helpers: ghEffectiveHelpers(target.gh!),
      });
      this.telemetry(helperId, 'help_player', { targetId, coins: res.coins });
    }
    return { ok: res.ok, ...(res.reason !== undefined ? { reason: res.reason } : {}), ...(res.coins !== undefined ? { coins: res.coins } : {}), view: buildView(helper, now) };
  }

  // Telemetry sink. Production routes this to ClickHouse (GDD §18); here it is a
  // structured log line.
  private telemetry(playerId: string, type: string, data: Record<string, unknown>): void {
    this.ctx.log.debug({ evt: type, playerId, ...data }, 'telemetry');
  }
}
