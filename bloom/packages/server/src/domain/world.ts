// World orchestration: advance the simulation lazily from timestamps, and build
// the canonical client View. Deterministic given (state, now, salt).

import { type View, type WorldEvent } from '@bloom/shared';
import { boostActive, passActive } from './entitlements.js';
import { advanceGoldenHour, currentBuildingIndex, ghEffectiveHelpers, nextBuildCost } from './goldenHour.js';
import { applyMomentumDecay } from './momentum.js';
import { deliverThankYous, strangerPool } from './social.js';
import { BALANCE } from '@bloom/shared';
import { round2, type GameState } from './types.js';

/** Master tick — call at the start of every request before reading/mutating. */
export function advance(s: GameState, now: number): void {
  applyMomentumDecay(s, now);
  advanceGoldenHour(s, now);
  deliverThankYous(s, now);
}

export function drainOutbox(s: GameState): WorldEvent[] {
  const out = s.outbox;
  s.outbox = [];
  return out;
}

/** The full world view returned by every action (snapshot + pool + drained events). */
export function buildView(s: GameState, now: number): View {
  return {
    wallet: {
      coins: s.coins,
      spins: s.spins,
      helpTokens: s.helpTokens,
      rareCards: s.rareCards,
      buildBoost: s.buildBoost,
      level: s.level,
      helpXp: s.helpXp,
      momentum: round2(s.momentum),
      boostActive: boostActive(s, now),
      passActive: passActive(s, now),
    },
    village: {
      buildingsBuilt: s.buildingsBuilt,
      slotsPerVillage: BALANCE.building.slotsPerVillage,
      currentIndex: currentBuildingIndex(s),
      constructing: s.constructing,
    },
    goldenHour: s.gh
      ? {
          buildingIndex: s.gh.buildingIndex,
          msLeft: Math.max(0, s.gh.openedAt + s.gh.durationMs - now),
          durationMs: s.gh.durationMs,
          helpers: ghEffectiveHelpers(s.gh),
          maxHelpers: BALANCE.goldenHour.maxHelpers,
        }
      : null,
    strangerPool: strangerPool(now),
    nextBuildCost: nextBuildCost(s),
    canBuild: !s.constructing && !s.gh,
    events: drainOutbox(s),
  };
}
