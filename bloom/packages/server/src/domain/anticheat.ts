// ─────────────────────────────────────────────────────────────────────────────
// anticheat.ts — SuspicionScore engine (GDD §16 / SuspicionScore System).
// Multi-signal, decaying risk score in [0,100]. No single signal bans anyone;
// only consistent non-human behaviour across dimensions does. Pure functions.
//
// Philosophy: detect silently → slow → isolate → exhaust. Score maps to an
// ACTION band, never a popup. Humans barely notice; bots fail across all axes.
// ─────────────────────────────────────────────────────────────────────────────

import { BALANCE, type OutcomeKind } from '@bloom/shared';

export interface SuspicionInput {
  /** recent inter-spin intervals in ms (humans: 600–1500, varied; bots: tight & fast) */
  spinIntervalsMs: number[];
  /** coin-earn velocity z-score vs the player's level cohort */
  coinVelocityZ: number;
  helpAbuse: { sameUserPerDay: number; mutualPerWeek: number; cycleDetected: boolean };
  /** observed spin outcome counts over a window (for the χ² RNG-integrity check) */
  rngOutcomeCounts: Partial<Record<OutcomeKind, number>>;
  device: { emulator: boolean; reusedHash: boolean; missingSensorNoise: boolean };
  trust: { lifetimeSpendInr: number; accountAgeDays: number; uniquePlayersHelped: number };
}

export interface SuspicionBreakdown {
  spinRate: number;
  timingEntropy: number;
  coinVelocity: number;
  helpAbuse: number;
  rngAnomaly: number;
  deviceRisk: number;
  trustOffset: number;
}

export type SuspicionBand = 'normal' | 'soft_nerf' | 'shadow_pool' | 'severe' | 'review';

export interface SuspicionResult {
  score: number;
  breakdown: SuspicionBreakdown;
  band: SuspicionBand;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stdev(xs: number[]): number {
  if (xs.length < 2) return Infinity; // too little data ⇒ not "suspiciously regular"
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Shannon entropy (bits) of inter-spin intervals bucketed at 100ms. */
export function timingEntropy(intervalsMs: number[]): number {
  if (intervalsMs.length < 2) return Infinity;
  const buckets = new Map<number, number>();
  for (const v of intervalsMs) {
    const b = Math.floor(v / 100);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  const n = intervalsMs.length;
  let h = 0;
  for (const c of buckets.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/** χ² goodness-of-fit statistic of observed outcomes vs the drop table. */
export function rngChiSquare(counts: Partial<Record<OutcomeKind, number>>): { stat: number; total: number } {
  const total = BALANCE.dropTable.reduce((a, o) => a + (counts[o.kind] ?? 0), 0);
  if (total === 0) return { stat: 0, total: 0 };
  let stat = 0;
  for (const o of BALANCE.dropTable) {
    const expected = total * (o.weight / 100);
    const observed = counts[o.kind] ?? 0;
    stat += (observed - expected) ** 2 / expected;
  }
  return { stat, total };
}
// χ² critical values for df = (8 outcomes − 1) = 7
const CHI2_P01 = 18.475; // p < 0.01
const CHI2_P001 = 24.322; // p < 0.001

// ── sub-scores ────────────────────────────────────────────────────────────────
export function spinRateScore(intervalsMs: number[]): number {
  if (intervalsMs.length < 5) return 0;
  const avg = mean(intervalsMs);
  const sd = stdev(intervalsMs);
  let s = 0;
  if (avg < BALANCE.antiCheat.spinRate.fastMs) s += 12;
  if (avg < BALANCE.antiCheat.spinRate.veryFastMs) s += 6;
  if (sd < BALANCE.antiCheat.spinRate.lowStdevMs) s += 4;
  return Math.min(s, BALANCE.antiCheat.weights.spinRate);
}

export function timingEntropyScore(intervalsMs: number[]): number {
  if (intervalsMs.length < 8) return 0;
  const h = timingEntropy(intervalsMs);
  let s = 0;
  if (h < BALANCE.antiCheat.timingEntropy.low) s += 10;
  if (h < BALANCE.antiCheat.timingEntropy.veryLow) s += 5;
  return Math.min(s, BALANCE.antiCheat.weights.timingEntropy);
}

export function coinVelocityScore(z: number): number {
  let s = 0;
  if (z > BALANCE.antiCheat.coinVelocity.z3) s += 8;
  if (z > BALANCE.antiCheat.coinVelocity.z4) s += 7;
  return Math.min(s, BALANCE.antiCheat.weights.coinVelocity);
}

export function helpAbuseScore(h: SuspicionInput['helpAbuse']): number {
  if (h.cycleDetected) return BALANCE.antiCheat.weights.helpAbuse; // instant max (GDD)
  let s = 0;
  if (h.sameUserPerDay > BALANCE.antiCheat.helpAbuse.sameUserPerDay) s += 6;
  if (h.mutualPerWeek > BALANCE.antiCheat.helpAbuse.mutualPerWeek) s += 6;
  return Math.min(s, BALANCE.antiCheat.weights.helpAbuse);
}

export function rngAnomalyScore(counts: Partial<Record<OutcomeKind, number>>): number {
  const { stat, total } = rngChiSquare(counts);
  if (total < 50) return 0; // not enough data to judge
  let s = 0;
  if (stat > CHI2_P01) s += 6;
  if (stat > CHI2_P001) s += 4;
  return Math.min(s, BALANCE.antiCheat.weights.rngAnomaly);
}

export function deviceRiskScore(d: SuspicionInput['device']): number {
  let s = 0;
  if (d.emulator) s += 6;
  if (d.reusedHash) s += 4;
  if (d.missingSensorNoise) s += 3;
  return Math.min(s, BALANCE.antiCheat.weights.deviceRisk);
}

export function trustOffset(t: SuspicionInput['trust']): number {
  const o = BALANCE.antiCheat.trustOffsets;
  let off = 0;
  if (t.lifetimeSpendInr > 499) off += o.spend499;
  else if (t.lifetimeSpendInr > 99) off += o.spend99;
  if (t.accountAgeDays > 30) off += o.age30d;
  else if (t.accountAgeDays > 7) off += o.age7d;
  if (t.uniquePlayersHelped > 10) off += o.social10;
  return off; // negative
}

export function bandFor(score: number): SuspicionBand {
  const t = BALANCE.antiCheat.thresholds;
  if (score <= t.normal) return 'normal';
  if (score <= t.softNerf) return 'soft_nerf';
  if (score <= t.shadowPool) return 'shadow_pool';
  if (score <= t.severe) return 'severe';
  return 'review';
}

/** Compose the full SuspicionScore + action band from raw signals. */
export function computeSuspicion(input: SuspicionInput): SuspicionResult {
  const breakdown: SuspicionBreakdown = {
    spinRate: spinRateScore(input.spinIntervalsMs),
    timingEntropy: timingEntropyScore(input.spinIntervalsMs),
    coinVelocity: coinVelocityScore(input.coinVelocityZ),
    helpAbuse: helpAbuseScore(input.helpAbuse),
    rngAnomaly: rngAnomalyScore(input.rngOutcomeCounts),
    deviceRisk: deviceRiskScore(input.device),
    trustOffset: trustOffset(input.trust),
  };
  const raw =
    breakdown.spinRate +
    breakdown.timingEntropy +
    breakdown.coinVelocity +
    breakdown.helpAbuse +
    breakdown.rngAnomaly +
    breakdown.deviceRisk +
    breakdown.trustOffset;
  const score = Math.max(0, Math.min(BALANCE.antiCheat.clampMax, raw));
  return { score, breakdown, band: bandFor(score) };
}

/** Hourly decay of a stored suspicion score (GDD: ×0.96/hr ⇒ ~50% in 17h). */
export function decaySuspicion(prevScore: number, hoursElapsed: number): number {
  if (hoursElapsed <= 0) return prevScore;
  return prevScore * Math.pow(BALANCE.antiCheat.decayPerHour, hoursElapsed);
}
