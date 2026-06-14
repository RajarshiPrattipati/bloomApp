import { describe, expect, it } from 'vitest';
import { emptyStats, stddev, updateStats, zScore, type RunningStats } from '../src/domain/stats.js';

function build(values: number[]): RunningStats {
  return values.reduce((s, x) => updateStats(s, x), emptyStats());
}

describe('running stats (Welford)', () => {
  it('computes mean and sample stddev correctly', () => {
    const s = build([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBeCloseTo(5);
    expect(stddev(s)).toBeCloseTo(2.138, 2); // sample stddev of the classic dataset
  });

  it('returns z=0 until enough samples (cold start safety)', () => {
    const s = build([10, 10, 10]); // n < 20
    expect(zScore(s, 1000)).toBe(0);
  });

  it('flags a far outlier with a high z once the cohort is established', () => {
    // 40 samples clustered ~100, then test a farming-like outlier
    const s = build(Array.from({ length: 40 }, (_, i) => 100 + (i % 5) - 2));
    expect(zScore(s, 100)).toBeLessThan(1); // normal player ≈ cohort mean
    expect(zScore(s, 1000)).toBeGreaterThan(4); // 10× the mean → extreme z
  });

  it('returns z=0 when the cohort has no variance', () => {
    const s = build(Array.from({ length: 30 }, () => 50));
    expect(zScore(s, 50)).toBe(0);
  });
});
