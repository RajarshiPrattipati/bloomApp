// Server-authoritative spin resolution (GDD §5). Deterministic given the salt.
// Returns the result and mutates wallet/momentum on the state.

import { BALANCE, baseCoin, dropTableTotalWeight, type OutcomeDef, type SpinResult } from '@bloom/shared';
import { dropCard, totalSetBonusPct } from './cards.js';
import { coinBoostMult } from './entitlements.js';
import { gainMomentum } from './momentum.js';
import { spinRng } from './rng.js';
import { round2, type GameState } from './types.js';

const TOTAL_WEIGHT = dropTableTotalWeight();

function pickOutcome(rng: () => number): OutcomeDef {
  let roll = rng() * TOTAL_WEIGHT;
  for (const def of BALANCE.dropTable) {
    roll -= def.weight;
    if (roll < 0) return def;
  }
  // unreachable given positive weights, but typesafe fallback
  return BALANCE.dropTable[BALANCE.dropTable.length - 1]!;
}

export function resolveSpin(s: GameState, now: number, salt: string): SpinResult {
  s.spinCount += 1;
  if (s.spins > 0) s.spins -= 1;

  const momentumBefore = s.momentum;
  const hot = momentumBefore >= BALANCE.momentum.hotThreshold;

  const rng = spinRng(salt, s.playerId, s.spinCount);
  const def = pickOutcome(rng);

  // coin multiplier: completed card sets (permanent) × active Boost subscription
  const setMult = (1 + totalSetBonusPct(s) / 100) * coinBoostMult(s, now);

  let coinsAwarded = 0;
  let tokensAwarded = 0;
  let extraSpins = 0;
  let cardsAwarded = 0;

  switch (def.kind) {
    case 'coins':
      coinsAwarded = Math.round(baseCoin(s.level) * s.momentum * setMult);
      break;
    case 'jackpot':
      coinsAwarded = Math.round(baseCoin(s.level) * BALANCE.coin.jackpotMultiplier * s.momentum * setMult);
      break;
    case 'help_tokens':
      tokensAwarded = BALANCE.rewards.helpTokensPerHit;
      break;
    case 'build_boost':
      s.buildBoost = true;
      break;
    case 'mystery_gift': {
      const span = BALANCE.rewards.mysteryCoinsMax - BALANCE.rewards.mysteryCoinsMin;
      coinsAwarded = Math.round((BALANCE.rewards.mysteryCoinsMin + rng() * span) * s.momentum * setMult);
      break;
    }
    case 'extra_spins':
      extraSpins = BALANCE.rewards.extraSpinsPerHit;
      break;
    case 'rare_card':
      // drop a real card (mutates inventory, emits card_dropped / set_completed)
      dropCard(s, rng);
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
    momentumBefore: round2(momentumBefore),
    momentumAfter: round2(s.momentum),
    hot,
  };
}
