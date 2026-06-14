// Server-authoritative spin resolution (PRD §4.1). The client sends a request;
// THIS decides the outcome, the coins, the momentum delta — everything.

import { BALANCE, baseCoin, type OutcomeDef } from './balance.js';
import { hashSeed, mulberry32 } from './rng.js';
import { type SessionState } from './state.js';
import { gainMomentum } from './world.js';

export interface SpinResult {
  spinId: number;
  kind: OutcomeDef['kind'];
  icon: string;
  label: string;
  coinsAwarded: number;
  tokensAwarded: number;
  extraSpins: number;
  cardsAwarded: number;
  momentumBefore: number;
  momentumAfter: number;
  hot: boolean; // was this spin taken while the meter was hot? (PRD metric)
}

const TOTAL_WEIGHT = BALANCE.dropTable.reduce((a, o) => a + o.weight, 0);

function pickOutcome(rng: () => number): OutcomeDef {
  let roll = rng() * TOTAL_WEIGHT;
  for (const def of BALANCE.dropTable) {
    roll -= def.weight;
    if (roll < 0) return def;
  }
  return BALANCE.dropTable[BALANCE.dropTable.length - 1];
}

export function resolveSpin(s: SessionState, now: number): SpinResult {
  s.spinCount += 1;
  if (s.spins > 0) s.spins -= 1;

  const momentumBefore = s.momentum;
  const hot = momentumBefore >= BALANCE.momentum.hotThreshold;

  const seed = hashSeed(s.sessionId, s.spinCount, BALANCE.rngSalt);
  const rng = mulberry32(seed);
  const def = pickOutcome(rng);

  let coinsAwarded = 0;
  let tokensAwarded = 0;
  let extraSpins = 0;
  let cardsAwarded = 0;

  switch (def.kind) {
    case 'coins':
      coinsAwarded = Math.round(baseCoin(s.level) * s.momentum);
      break;
    case 'jackpot':
      coinsAwarded = Math.round(baseCoin(s.level) * BALANCE.coin.jackpotMultiplier * s.momentum);
      break;
    case 'help_tokens':
      tokensAwarded = BALANCE.rewards.helpTokensPerHit;
      break;
    case 'build_boost':
      s.buildBoost = true;
      break;
    case 'mystery_gift': {
      const span = BALANCE.rewards.mysteryCoinsMax - BALANCE.rewards.mysteryCoinsMin;
      coinsAwarded = Math.round((BALANCE.rewards.mysteryCoinsMin + rng() * span) * s.momentum);
      break;
    }
    case 'extra_spins':
      extraSpins = BALANCE.rewards.extraSpinsPerHit;
      break;
    case 'rare_card':
      cardsAwarded = 1;
      break;
    case 'momentum_spark':
      gainMomentum(s, BALANCE.momentum.sparkGain, now);
      break;
  }

  s.coins += coinsAwarded;
  s.helpTokens += tokensAwarded;
  s.spins += extraSpins;
  s.rareCards += cardsAwarded;

  return {
    spinId: s.spinCount,
    kind: def.kind,
    icon: def.icon,
    label: def.label,
    coinsAwarded,
    tokensAwarded,
    extraSpins,
    cardsAwarded,
    momentumBefore: Math.round(momentumBefore * 100) / 100,
    momentumAfter: Math.round(s.momentum * 100) / 100,
    hot,
  };
}
