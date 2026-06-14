// Building + Golden Hour (GDD §6, §7). Deterministic given (state, now, salt).
// Helper arrivals are precomputed from a seeded schedule so advancing the world
// lazily from timestamps is exact and reproducible.

import { BALANCE, buildingCost, goldenHourBenefit } from '@bloom/shared';
import { applyMomentumDecay } from './momentum.js';
import { goldenHourRng, seedFrom } from './rng.js';
import type { GameState, GoldenHour } from './types.js';

const BOT_NAMES = [
  'Priya', 'Arjun', 'Meera', 'Rohan', 'Anaya', 'Kabir',
  'Diya', 'Vihaan', 'Sara', 'Ishaan', 'Zoya', 'Aarav',
];

export function currentBuildingIndex(s: GameState): number {
  return s.buildingsBuilt % BALANCE.building.slotsPerVillage;
}

export function nextBuildCost(s: GameState): number {
  const raw = buildingCost(s.level, currentBuildingIndex(s));
  return s.buildBoost ? Math.round(raw * (1 - BALANCE.building.boostDiscountPct)) : raw;
}

export interface BuildOutcome {
  ok: boolean;
  reason?: string;
}

export function buildAction(s: GameState, now: number, salt: string, durationMs = BALANCE.goldenHour.durationMs): BuildOutcome {
  applyMomentumDecay(s, now);
  if (s.constructing || s.gh) return { ok: false, reason: 'already building' };

  const index = currentBuildingIndex(s);
  const cost = nextBuildCost(s);
  if (s.coins < cost) return { ok: false, reason: 'not enough coins' };
  if (s.buildBoost) s.buildBoost = false;

  s.coins -= cost;
  s.constructing = true;
  s.gh = {
    buildingIndex: index,
    level: s.level,
    costPaid: cost,
    openedAt: now,
    durationMs,
    joinTimes: precomputeJoinTimes(s, now, salt),
    helpersShown: 0,
    realHelperIds: [],
    milestonesHit: [],
  };
  return { ok: true };
}

/** Combined helper count (bots + real players), capped at the max. */
export function ghEffectiveHelpers(gh: GoldenHour): number {
  return Math.min(BALANCE.goldenHour.maxHelpers, gh.helpersShown + gh.realHelperIds.length);
}

/** Fire any milestones the current effective helper count has reached (once each). */
export function fireMilestones(s: GameState, gh: GoldenHour): void {
  const eff = ghEffectiveHelpers(gh);
  for (const m of BALANCE.goldenHour.milestones as readonly number[]) {
    if (eff >= m && !gh.milestonesHit.includes(m)) {
      gh.milestonesHit.push(m);
      s.spins += BALANCE.goldenHour.milestoneSpins;
      s.coins += BALANCE.goldenHour.milestoneCoins;
      s.outbox.push({ type: 'gh_milestone', helpers: eff, spins: BALANCE.goldenHour.milestoneSpins, coins: BALANCE.goldenHour.milestoneCoins });
    }
  }
}

function precomputeJoinTimes(s: GameState, openedAt: number, salt: string): number[] {
  const rng = goldenHourRng(salt, s.playerId, s.buildingsBuilt);
  // helpers arrive spread across the window (production: a 60-min Golden Hour).
  const { durationMs, maxHelpers } = BALANCE.goldenHour;
  const slice = durationMs / (maxHelpers + 1);
  const times: number[] = [];
  for (let i = 1; i <= maxHelpers; i++) {
    // jitter ±40% of a slice around the even mark
    const jitter = (rng() - 0.5) * 0.8 * slice;
    times.push(Math.round(openedAt + i * slice + jitter));
  }
  times.sort((a, b) => a - b);
  return times;
}

function botName(s: GameState, n: number): string {
  const idx = seedFrom('helper-name', s.playerId, s.buildingsBuilt, n) % BOT_NAMES.length;
  return BOT_NAMES[idx]!;
}

/** Advance the active Golden Hour: add arrived helpers, fire milestones, close. */
export function advanceGoldenHour(s: GameState, now: number): void {
  const gh = s.gh;
  if (!gh) return;

  // bots fill the slots not taken by real helpers
  const botCap = Math.max(0, BALANCE.goldenHour.maxHelpers - gh.realHelperIds.length);
  const arrived = Math.min(botCap, gh.joinTimes.filter((t) => t <= now).length);
  while (gh.helpersShown < arrived) {
    gh.helpersShown++;
    s.outbox.push({ type: 'helper_joined', name: botName(s, gh.helpersShown), helpers: ghEffectiveHelpers(gh) });
  }
  fireMilestones(s, gh);

  if (now >= gh.openedAt + gh.durationMs) {
    const eff = ghEffectiveHelpers(gh);
    const benefit = goldenHourBenefit(eff);
    const refund = Math.round(gh.costPaid * benefit);
    s.coins += refund;
    s.buildingsBuilt++;
    s.level++;
    s.constructing = false;
    s.outbox.push({
      type: 'gh_closed',
      helpers: eff,
      benefitPct: Math.round(benefit * 100),
      refund,
      buildingsBuilt: s.buildingsBuilt,
    });
    s.gh = null;
  }
}
