import { describe, expect, it } from 'vitest';
import {
  computeSuspicion,
  decaySuspicion,
  rngChiSquare,
  timingEntropy,
  type SuspicionInput,
} from '../src/domain/anticheat.js';

// a believable human: varied, slow-ish spins, diverse helping, some spend
const HUMAN: SuspicionInput = {
  spinIntervalsMs: [900, 1400, 700, 2100, 1100, 650, 1800, 1300, 950, 1600],
  coinVelocityZ: 0.4,
  helpAbuse: { sameUserPerDay: 1, mutualPerWeek: 2, cycleDetected: false },
  rngOutcomeCounts: { coins: 46, help_tokens: 18, build_boost: 13, mystery_gift: 8, extra_spins: 7, rare_card: 3, jackpot: 2, momentum_spark: 3 },
  device: { emulator: false, reusedHash: false, missingSensorNoise: false },
  trust: { lifetimeSpendInr: 99, accountAgeDays: 20, uniquePlayersHelped: 12 },
};

// a bot: fast, metronomic spins, low entropy, farming velocity, help ring, emulator
const BOT: SuspicionInput = {
  spinIntervalsMs: Array.from({ length: 20 }, () => 120),
  coinVelocityZ: 4.5,
  helpAbuse: { sameUserPerDay: 9, mutualPerWeek: 15, cycleDetected: true },
  rngOutcomeCounts: { coins: 200, jackpot: 60 }, // wildly off the table
  device: { emulator: true, reusedHash: true, missingSensorNoise: true },
  trust: { lifetimeSpendInr: 0, accountAgeDays: 0, uniquePlayersHelped: 0 },
};

describe('SuspicionScore', () => {
  it('keeps a real human comfortably in the normal band', () => {
    const r = computeSuspicion(HUMAN);
    expect(r.score).toBeLessThanOrEqual(BALANCEnormal());
    expect(r.band).toBe('normal');
  });

  it('flags a bot into shadow_pool or worse', () => {
    const r = computeSuspicion(BOT);
    expect(r.score).toBeGreaterThan(70);
    expect(['shadow_pool', 'severe', 'review']).toContain(r.band);
  });

  it('help-ring cycle alone maxes the help-abuse axis', () => {
    const r = computeSuspicion({ ...HUMAN, helpAbuse: { sameUserPerDay: 0, mutualPerWeek: 0, cycleDetected: true } });
    expect(r.breakdown.helpAbuse).toBe(20);
  });

  it('payment trust reduces the score (fewer false positives on spenders)', () => {
    const base = computeSuspicion({ ...BOT, trust: { lifetimeSpendInr: 0, accountAgeDays: 0, uniquePlayersHelped: 0 } });
    const paid = computeSuspicion({ ...BOT, trust: { lifetimeSpendInr: 600, accountAgeDays: 40, uniquePlayersHelped: 12 } });
    expect(paid.score).toBeLessThan(base.score);
  });

  it('score is clamped to [0,100]', () => {
    const r = computeSuspicion(BOT);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('decays ~50% over 17 hours', () => {
    expect(decaySuspicion(80, 17)).toBeGreaterThan(38);
    expect(decaySuspicion(80, 17)).toBeLessThan(42);
    expect(decaySuspicion(80, 0)).toBe(80);
  });
});

describe('entropy + chi-square helpers', () => {
  it('metronomic intervals have near-zero entropy; varied are high', () => {
    expect(timingEntropy(Array.from({ length: 20 }, () => 100))).toBeLessThan(0.5);
    expect(timingEntropy([100, 600, 1200, 250, 1900, 800, 1400, 350, 2000, 700])).toBeGreaterThan(2.5);
  });
  it('a fair sample has a small chi-square stat; a skewed one is large', () => {
    const fair = rngChiSquare({ coins: 460, help_tokens: 180, build_boost: 130, mystery_gift: 80, extra_spins: 70, rare_card: 30, jackpot: 20, momentum_spark: 30 });
    const skewed = rngChiSquare({ coins: 500, jackpot: 500 });
    expect(fair.stat).toBeLessThan(skewed.stat);
  });
});

function BALANCEnormal() {
  // local mirror of the normal-band threshold to keep the assertion explicit
  return 30;
}
