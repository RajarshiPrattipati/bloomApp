// ─────────────────────────────────────────────────────────────────────────────
// balance.ts — THE single source of tunable truth (production).
// Shared by server (authoritative) and client (display). NEVER hardcode economy
// values elsewhere. Times are PRODUCTION-scale (not the gate's compressed clock).
// ─────────────────────────────────────────────────────────────────────────────

// OutcomeKind is defined once, canonically, in schemas.ts (derived from the zod
// enum) and imported here so the config and the runtime validator can't drift.
import type { OutcomeKind } from './schemas.js';

export interface OutcomeDef {
  readonly kind: OutcomeKind;
  readonly weight: number;
  readonly icon: string;
  readonly label: string;
}

export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export const BALANCE = {
  version: 1,

  // ── Spin drop table (GDD §5.2). Weights sum to 100. ──────────────────────────
  dropTable: [
    { kind: 'coins',          weight: 46, icon: '🪙', label: 'Coins' },
    { kind: 'help_tokens',    weight: 18, icon: '🎟️', label: 'Help Tokens' },
    { kind: 'build_boost',    weight: 13, icon: '🔨', label: 'Build Boost' },
    { kind: 'mystery_gift',   weight: 8,  icon: '🎁', label: 'Mystery Gift' },
    { kind: 'extra_spins',    weight: 7,  icon: '🔁', label: 'Extra Spins' },
    { kind: 'rare_card',      weight: 3,  icon: '🃏', label: 'Rare Card' },
    { kind: 'jackpot',        weight: 2,  icon: '💎', label: 'Jackpot x5' },
    { kind: 'momentum_spark', weight: 3,  icon: '🔥', label: 'Momentum Spark' },
  ] as readonly OutcomeDef[],

  coin: { base: 50, perLevel: 12, jackpotMultiplier: 5 },

  // ── Building / village (GDD §6) ──────────────────────────────────────────────
  building: {
    baseCost: 200,
    growth: 1.45,
    indexStep: 0.15,
    slotsPerVillage: 6,
    boostDiscountPct: 0.25,
  },

  // ── Golden Hour (GDD §7) — PRODUCTION 60-minute window ───────────────────────
  goldenHour: {
    durationMs: 60 * 60 * 1000,
    maxHelpers: 10,
    benefitCapPct: 0.20,            // up to 20% of build cost refunded
    milestones: [3, 6, 10],        // helper counts
    milestoneSpins: 3,
    milestoneCoins: 40,
  },

  // ── Momentum (GDD §9) — decays ~ -0.1x per 6 min ─────────────────────────────
  momentum: {
    min: 1.0,
    max: 3.0,
    sparkGain: 0.3,
    helpGain: 0.2,
    decayPerSec: 0.1 / (6 * 60),   // -0.1x / 6min
    hotThreshold: 1.5,
  },

  rewards: {
    helpTokensPerHit: 1,
    extraSpinsPerHit: 5,
    mysteryCoinsMin: 20,
    mysteryCoinsMax: 120,
  },

  // ── Helping / social anti-abuse caps (GDD §8.4, §16 Rule 3) ──────────────────
  help: {
    tokenCost: 1,
    rewardCoinsMin: 5,
    rewardCoinsMax: 15,
    helperGainXp: 1,
    thankYouSpins: 4,
    // diminishing effect: first 3 full, next 3 → 60%, next → 30%, beyond → 0%
    effectTiers: [
      { upTo: 3, factor: 1.0 },
      { upTo: 6, factor: 0.6 },
      { upTo: 9, factor: 0.3 },
    ] as const,
    // graph limits
    maxHelpFromSameUserPerDay: 3,
    maxMutualHelpsPerWeek: 10,
    maxHelpChainDepth: 2,
  },

  // ── Bot stranger pool (cold-start seeding, GDD §8.1) ─────────────────────────
  bots: {
    poolSize: 60,
    ghPeriodMs: 90 * 1000,
    ghOpenMs: 60 * 1000,
    surfaceCount: 5,
  },

  // ── Cards & sets (GDD §11.2) ─────────────────────────────────────────────────
  cards: {
    rarityTable: [
      { rarity: 'common',    weight: 65, permanentBonusPct: 1 },
      { rarity: 'rare',      weight: 25, permanentBonusPct: 1.5 },
      { rarity: 'epic',      weight: 8,  permanentBonusPct: 2 },
      { rarity: 'legendary', weight: 2,  permanentBonusPct: 3 },
    ] as const,
    setSize: 6,
    setCompletionSpins: 25, // free spins granted when a set is completed
  },

  // ── Teams (GDD §10) ──────────────────────────────────────────────────────────
  teams: {
    minSize: 1,
    maxSize: 30,
    nameMinLen: 3,
    nameMaxLen: 24,
    projectMilestonePcts: [25, 50, 75, 100],
    projectTargetCoins: 50_000,
    milestoneSpins: 10,        // free spins granted to a contributor on each milestone cross
    minContribution: 10,
    maxContribution: 5_000,
  },

  // ── Anti-cheat: SuspicionScore (GDD §16 / "SuspicionScore System") ───────────
  antiCheat: {
    clampMax: 100,
    decayPerHour: 0.96,            // ~50% in 17h
    weights: {
      spinRate: 20,
      timingEntropy: 15,
      coinVelocity: 15,
      helpAbuse: 20,
      rngAnomaly: 10,
      deviceRisk: 10,
    },
    thresholds: {
      normal: 30,        // 0–30 normal
      softNerf: 50,      // 31–50 soft nerfs
      shadowPool: 70,    // 51–70 shadow pool
      severe: 85,        // 71–85 severe throttle
      // 86–100 manual review / ban
    },
    spinRate: { fastMs: 350, veryFastMs: 250, lowStdevMs: 80 },
    timingEntropy: { low: 2.2, veryLow: 1.6 },
    coinVelocity: { z3: 3, z4: 4 },
    helpAbuse: { sameUserPerDay: 3, mutualPerWeek: 10, cycleInstant: 20 },
    trustOffsets: {
      spend99: -15, spend499: -25,
      age7d: -5, age30d: -10,
      social10: -5,
    },
  },

  // ── Monetization (GDD §13). amountInr is display; store prices are authoritative ─
  iap: {
    spinPacks: [
      { sku: 'spins_120',  spins: 120,  inr: 10 },
      { sku: 'spins_700',  spins: 700,  inr: 49 },
      { sku: 'spins_1800', spins: 1800, inr: 99 },
      { sku: 'spins_6000', spins: 6000, inr: 299 },
    ] as const,
    seasonPass: { sku: 'season_pass', inr: 399, durationDays: 42 },
    boostSub: { sku: 'boost_monthly', inr: 99, coinBonusPct: 20, durationDays: 30 },
  },

  // ── Season Pass reward track (GDD §13.2) ─────────────────────────────────────
  pass: {
    xpPerTier: 100,
    tiers: 30,
    xpPerSpin: 1,
    xpPerHelp: 5,
    xpPerBuild: 10,
  },

  session: {
    startingSpins: 50,
    startingCoins: 0,
    startingLevel: 1,
    dailyFreeSpins: 20,
  },
} as const;

// ── derived helpers (pure) ──────────────────────────────────────────────────────
export function baseCoin(level: number): number {
  return BALANCE.coin.base + level * BALANCE.coin.perLevel;
}

export function buildingCost(level: number, index: number): number {
  return Math.round(
    BALANCE.building.baseCost *
      Math.pow(BALANCE.building.growth, level) *
      (1 + index * BALANCE.building.indexStep),
  );
}

// Diminishing-return Golden Hour benefit (fraction of cost refunded, capped).
export function goldenHourBenefit(helpers: number): number {
  const cap = BALANCE.goldenHour.benefitCapPct;
  return Math.round(cap * (1 - Math.exp(-helpers / 4)) * 1000) / 1000;
}

// Per-help effectiveness factor for the Nth help on a building (GDD §8.4).
export function helpEffectFactor(nthHelp: number): number {
  for (const tier of BALANCE.help.effectTiers) {
    if (nthHelp <= tier.upTo) return tier.factor;
  }
  return 0;
}

export function dropTableTotalWeight(): number {
  return BALANCE.dropTable.reduce((a, o) => a + o.weight, 0);
}

export function clampMomentum(v: number): number {
  return Math.max(BALANCE.momentum.min, Math.min(BALANCE.momentum.max, v));
}

// Display-safe config slice for the client (no server-only fields).
export type PublicConfig = ReturnType<typeof publicConfig>;
export function publicConfig() {
  return {
    version: BALANCE.version,
    dropTable: BALANCE.dropTable.map((o) => ({ kind: o.kind, icon: o.icon, label: o.label })),
    momentum: {
      min: BALANCE.momentum.min,
      max: BALANCE.momentum.max,
      hotThreshold: BALANCE.momentum.hotThreshold,
      decayPerSec: BALANCE.momentum.decayPerSec,
    },
    coin: { base: BALANCE.coin.base, perLevel: BALANCE.coin.perLevel },
    building: { slotsPerVillage: BALANCE.building.slotsPerVillage },
    goldenHour: { durationMs: BALANCE.goldenHour.durationMs, maxHelpers: BALANCE.goldenHour.maxHelpers },
    cards: { rarities: BALANCE.cards.rarityTable.map((r) => r.rarity) },
    iap: { spinPacks: BALANCE.iap.spinPacks, seasonPass: BALANCE.iap.seasonPass, boostSub: BALANCE.iap.boostSub },
  };
}
