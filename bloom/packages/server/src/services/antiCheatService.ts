// Anti-cheat service: gathers behavioural signals (spin timing, RNG outcomes,
// help-graph), computes the SuspicionScore with decay, and exposes the action
// band + a SILENT reward multiplier (GDD §16: slow, don't block).

import { BALANCE, type OutcomeKind } from '@bloom/shared';
import { computeSuspicion, decaySuspicion, type SuspicionBand } from '../domain/anticheat.js';
import {
  helpsFromUserSince,
  mutualHelpsSince,
  wouldCreateCycle,
} from '../domain/social.js';
import { emptyStats, updateStats, zScore, type RunningStats } from '../domain/stats.js';
import type { AppContext } from '../app/context.js';
import type { PlayerRecord } from '../ports/repositories.js';

const TIMING_CAP = 60; // keep last N inter-spin timestamps
const RNG_WINDOW = 500; // outcomes per evaluation window
const EVAL_EVERY_SPINS = 25;

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

export class AntiCheatService {
  // in-memory band cache → zero per-spin I/O on the hot path
  private bandCache = new Map<string, SuspicionBand>();

  constructor(private ctx: AppContext) {}

  /** Record a spin's timing + outcome + earned coins; periodically re-evaluate. */
  async observeSpin(player: PlayerRecord, level: number, spinCount: number, kind: OutcomeKind, coinsAwarded: number, now: number): Promise<void> {
    const tKey = `ac:timing:${player.id}`;
    const ts: number[] = JSON.parse((await this.ctx.cache.get(tKey)) ?? '[]');
    ts.push(now);
    while (ts.length > TIMING_CAP) ts.shift();
    await this.ctx.cache.set(tKey, JSON.stringify(ts), 3600);

    const rKey = `ac:rng:${player.id}`;
    const counts: Partial<Record<OutcomeKind, number>> = JSON.parse((await this.ctx.cache.get(rKey)) ?? '{}');
    counts[kind] = (counts[kind] ?? 0) + 1;
    const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
    if (total > RNG_WINDOW) for (const k of Object.keys(counts) as OutcomeKind[]) counts[k] = Math.floor((counts[k] ?? 0) / 2);
    await this.ctx.cache.set(rKey, JSON.stringify(counts), 3600);

    // accumulate earned coins for the coin-velocity signal
    if (coinsAwarded > 0) {
      const eKey = `ac:earned:${player.id}`;
      const earned = Number((await this.ctx.cache.get(eKey)) ?? '0') + coinsAwarded;
      await this.ctx.cache.set(eKey, String(earned), 86400);
    }

    if (spinCount % EVAL_EVERY_SPINS === 0) await this.evaluate(player, level, ts, counts, now);
  }

  /** Coin velocity (coins/min) over the observed window, vs the level cohort. */
  private async coinVelocityZ(player: PlayerRecord, level: number, timestamps: number[], now: number): Promise<number> {
    const earned = Number((await this.ctx.cache.get(`ac:earned:${player.id}`)) ?? '0');
    if (earned <= 0 || timestamps.length < 2) return 0;
    const spanMin = Math.max(1, ((timestamps[timestamps.length - 1]! - timestamps[0]!) / 60000));
    const velocity = earned / spanMin;

    const cKey = `cohort:level:${level}`;
    const cohort: RunningStats = JSON.parse((await this.ctx.cache.get(cKey)) ?? 'null') ?? emptyStats();
    const z = zScore(cohort, velocity); // z against the cohort as it stands
    await this.ctx.cache.set(cKey, JSON.stringify(updateStats(cohort, velocity)), 7 * 86400);
    return z;
  }

  private async evaluate(
    player: PlayerRecord,
    level: number,
    timestamps: number[],
    rngCounts: Partial<Record<OutcomeKind, number>>,
    now: number,
  ): Promise<void> {
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) intervals.push(timestamps[i]! - timestamps[i - 1]!);

    // help-graph signals (real player↔player edges)
    const edges = await this.ctx.repos.helpEdges.allSince(now - WEEK);
    const perTarget = new Map<string, number>();
    let maxSameUser = 0;
    let maxMutual = 0;
    let cycle = false;
    for (const e of edges) {
      if (e.from !== player.id) continue;
      maxSameUser = Math.max(maxSameUser, helpsFromUserSince(edges, player.id, e.to, now - DAY));
      maxMutual = Math.max(maxMutual, mutualHelpsSince(edges, player.id, e.to, now - WEEK));
      if (wouldCreateCycle(edges, player.id, e.to, BALANCE.help.maxHelpChainDepth)) cycle = true;
      perTarget.set(e.to, (perTarget.get(e.to) ?? 0) + 1);
    }

    const ageDays = (now - player.createdAt) / DAY;
    const uniqueHelped = perTarget.size;

    const fresh = computeSuspicion({
      spinIntervalsMs: intervals,
      coinVelocityZ: await this.coinVelocityZ(player, level, timestamps, now),
      helpAbuse: { sameUserPerDay: maxSameUser, mutualPerWeek: maxMutual, cycleDetected: cycle },
      rngOutcomeCounts: rngCounts,
      device: { emulator: false, reusedHash: false, missingSensorNoise: false },
      trust: { lifetimeSpendInr: player.lifetimeSpendInr, accountAgeDays: ageDays, uniquePlayersHelped: uniqueHelped },
    });

    // accumulate with decay: a bot re-earns its score each window; a human decays out.
    const prev = await this.ctx.repos.suspicion.get(player.id);
    const decayed = prev ? decaySuspicion(prev.score, (now - prev.updatedAt) / 3_600_000) : 0;
    const score = Math.max(decayed, fresh.score);
    await this.ctx.repos.suspicion.set({ playerId: player.id, score, updatedAt: now });
    this.bandCache.set(player.id, bandFromScore(score));
    if (fresh.band !== 'normal') {
      this.ctx.log.warn({ playerId: player.id, score, breakdown: fresh.breakdown }, 'suspicion elevated');
    }
  }

  currentBand(playerId: string): SuspicionBand {
    return this.bandCache.get(playerId) ?? 'normal';
  }

  /** Silent reward dampening by band. Players never see a tax — only slower progress. */
  rewardMultiplier(playerId: string): number {
    switch (this.currentBand(playerId)) {
      case 'normal': return 1;
      case 'soft_nerf': return 0.85;
      case 'shadow_pool': return 0.6;
      case 'severe': return 0.4;
      case 'review': return 0.4;
    }
  }
}

function bandFromScore(score: number): SuspicionBand {
  const t = BALANCE.antiCheat.thresholds;
  if (score <= t.normal) return 'normal';
  if (score <= t.softNerf) return 'soft_nerf';
  if (score <= t.shadowPool) return 'shadow_pool';
  if (score <= t.severe) return 'severe';
  return 'review';
}
