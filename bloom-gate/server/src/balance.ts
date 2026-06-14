// ─────────────────────────────────────────────────────────────────────────────
// balance.ts — THE single source of tunable truth for the gate (PRD TR-4).
// Server-authoritative. The client fetches the display-safe slice via /api/config
// and NEVER hardcodes economy values. Tune feel here, not in code.
//
// Env overrides (used by the sim/E2E harness to compress or stretch time):
//   BLOOM_GH_MS, BLOOM_DECAY_PER_SEC, BLOOM_BOT_PERIOD_MS, BLOOM_BOT_OPEN_MS
// ─────────────────────────────────────────────────────────────────────────────

const env = (k: string, d: number) => (process.env[k] ? Number(process.env[k]) : d);

export type OutcomeKind =
  | 'coins'
  | 'help_tokens'
  | 'build_boost'
  | 'mystery_gift'
  | 'extra_spins'
  | 'rare_card'
  | 'jackpot'
  | 'momentum_spark';

export interface OutcomeDef {
  kind: OutcomeKind;
  weight: number;
  icon: string;
  label: string;
}

export const BALANCE = {
  // ── Spin drop table (PRD §4.1 / GDD §5.2). Weights sum to 100. ──
  dropTable: [
    { kind: 'coins',          weight: 46, icon: '🪙', label: 'Coins' },
    { kind: 'help_tokens',    weight: 18, icon: '🎟️', label: 'Help Tokens' },
    { kind: 'build_boost',    weight: 13, icon: '🔨', label: 'Build Boost' },
    { kind: 'mystery_gift',   weight: 8,  icon: '🎁', label: 'Mystery Gift' },
    { kind: 'extra_spins',    weight: 7,  icon: '🔁', label: 'Extra Spins' },
    { kind: 'rare_card',      weight: 3,  icon: '🃏', label: 'Rare Card' },
    { kind: 'jackpot',        weight: 2,  icon: '💎', label: 'Jackpot x5' },
    { kind: 'momentum_spark', weight: 3,  icon: '🔥', label: 'Momentum Spark' },
  ] as OutcomeDef[],

  coin: { base: 50, perLevel: 12, jackpotMultiplier: 5 },

  // ── Building / village (PRD §4.2, GDD §6) ──
  building: {
    baseCost: 200,
    growth: 1.45,
    indexStep: 0.15,
    slotsPerVillage: 6,
    boostDiscountPct: 0.25, // a Build Boost spin = 25% off the next build
  },

  // ── Golden Hour (PRD §4.3, GDD §7). Times compressed for the gate. ──
  goldenHour: {
    durationMs: env('BLOOM_GH_MS', 75_000), // ~75s window (compressed)
    maxHelpers: 10,
    benefitCapPct: 0.20,           // max 20% refunded
    helperCadenceMinMs: 4_000,
    helperCadenceMaxMs: 9_000,
    milestones: [3, 6, 10],        // helper counts that pop rewards
    milestoneSpins: 3,
    milestoneCoins: 40,
  },

  // ── Momentum (PRD §4.4, GDD §9) ──
  momentum: {
    min: 1.0,
    max: 3.0,
    sparkGain: 0.3,
    helpGain: 0.2,
    decayPerSec: env('BLOOM_DECAY_PER_SEC', 0.014), // ≈ -0.1× per 7s when idle
    hotThreshold: 1.5,            // at/above this the meter is "hot"
  },

  rewards: {
    helpTokensPerHit: 1,
    extraSpinsPerHit: 5,
    mysteryCoinsMin: 20,
    mysteryCoinsMax: 120,
  },

  // ── Bot stranger pool (PRD §4.5, GDD §8.1) ──
  bots: {
    names: [
      'Priya', 'Arjun', 'Meera', 'Rohan', 'Anaya', 'Kabir',
      'Diya', 'Vihaan', 'Sara', 'Ishaan', 'Zoya', 'Aarav',
    ],
    buildings: ['Festival Hall', 'Lotus Well', 'Golden Bridge', 'Spice Market', 'Bell Tower', 'Tea House'],
    poolSize: 12,
    ghPeriodMs: env('BLOOM_BOT_PERIOD_MS', 40_000), // each bot cycles every 40s
    ghOpenMs: env('BLOOM_BOT_OPEN_MS', 28_000),     // open for 28s of it
    surfaceCount: 4,                                // show up to 4 live windows
    helpTokenCost: 1,
    helpRewardCoinsMin: 5,
    helpRewardCoinsMax: 15,
    thankYouDelayMs: 5_000,
    thankYouSpins: 4,
  },

  session: {
    startingSpins: 9999,
    startingCoins: 0,
    startingLevel: 1,
  },

  rngSalt: 'bloom-gate-v1-salt',
} as const;

export function baseCoin(level: number): number {
  return BALANCE.coin.base + level * BALANCE.coin.perLevel;
}

// BuildingCost(level, index) per GDD §6.
export function buildingCost(level: number, index: number): number {
  return Math.round(
    BALANCE.building.baseCost *
      Math.pow(BALANCE.building.growth, level) *
      (1 + index * BALANCE.building.indexStep),
  );
}

// Diminishing-return benefit curve (GDD §8.4) → fraction refunded, capped.
export function goldenHourBenefit(helpers: number): number {
  const cap = BALANCE.goldenHour.benefitCapPct;
  return Math.round(cap * (1 - Math.exp(-helpers / 4)) * 1000) / 1000;
}

export function publicConfig() {
  return {
    dropTable: BALANCE.dropTable.map((o) => ({ kind: o.kind, icon: o.icon, label: o.label })),
    momentum: {
      min: BALANCE.momentum.min,
      max: BALANCE.momentum.max,
      hotThreshold: BALANCE.momentum.hotThreshold,
      decayPerSec: BALANCE.momentum.decayPerSec,
    },
    coin: { base: BALANCE.coin.base, perLevel: BALANCE.coin.perLevel },
    building: { slotsPerVillage: BALANCE.building.slotsPerVillage },
    goldenHour: {
      durationMs: BALANCE.goldenHour.durationMs,
      maxHelpers: BALANCE.goldenHour.maxHelpers,
    },
  };
}
