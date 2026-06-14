// Online running statistics (Welford). Used for per-level coin-velocity cohort
// baselines so the anti-cheat coin-velocity z-score is data-driven (GDD §16
// Rule 5) without needing a ClickHouse round-trip on the hot path.

export interface RunningStats {
  n: number;
  mean: number;
  m2: number; // sum of squares of differences from the mean
}

export function emptyStats(): RunningStats {
  return { n: 0, mean: 0, m2: 0 };
}

export function updateStats(s: RunningStats, x: number): RunningStats {
  const n = s.n + 1;
  const delta = x - s.mean;
  const mean = s.mean + delta / n;
  const m2 = s.m2 + delta * (x - mean);
  return { n, mean, m2 };
}

export function stddev(s: RunningStats): number {
  return s.n > 1 ? Math.sqrt(s.m2 / (s.n - 1)) : 0;
}

/** z-score of x against the cohort; 0 until we have enough samples / variance. */
export function zScore(s: RunningStats, x: number, minN = 20): number {
  if (s.n < minN) return 0;
  const sd = stddev(s);
  if (sd <= 1e-9) return 0;
  return (x - s.mean) / sd;
}
