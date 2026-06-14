// Cards & Sets (GDD §11.2). Rare-card spins drop a card (weighted by rarity);
// completing a set grants a PERMANENT coin bonus — positive-sum collection chase,
// no coin printing (inflation-safe). Pure functions over GameState.

import { BALANCE, type CardRarity } from '@bloom/shared';
import type { GameState } from './types.js';

export interface CardDef {
  id: string;
  setId: string;
  rarity: CardRarity;
}

export interface SetDef {
  id: string;
  name: string;
  bonusPct: number; // permanent coin bonus when the set is complete
  cardIds: string[];
}

// 3 themed sets × 6 cards. Every rarity appears so weighted drops always resolve.
export const SETS: readonly SetDef[] = [
  { id: 'village', name: 'Village Life', bonusPct: 2, cardIds: ['village_1', 'village_2', 'village_3', 'village_4', 'village_5', 'village_6'] },
  { id: 'festival', name: 'Festival', bonusPct: 3, cardIds: ['festival_1', 'festival_2', 'festival_3', 'festival_4', 'festival_5', 'festival_6'] },
  { id: 'legends', name: 'Legends', bonusPct: 5, cardIds: ['legends_1', 'legends_2', 'legends_3', 'legends_4', 'legends_5', 'legends_6'] },
];

export const CATALOG: readonly CardDef[] = [
  { id: 'village_1', setId: 'village', rarity: 'common' },
  { id: 'village_2', setId: 'village', rarity: 'common' },
  { id: 'village_3', setId: 'village', rarity: 'common' },
  { id: 'village_4', setId: 'village', rarity: 'rare' },
  { id: 'village_5', setId: 'village', rarity: 'rare' },
  { id: 'village_6', setId: 'village', rarity: 'rare' },
  { id: 'festival_1', setId: 'festival', rarity: 'common' },
  { id: 'festival_2', setId: 'festival', rarity: 'rare' },
  { id: 'festival_3', setId: 'festival', rarity: 'rare' },
  { id: 'festival_4', setId: 'festival', rarity: 'epic' },
  { id: 'festival_5', setId: 'festival', rarity: 'epic' },
  { id: 'festival_6', setId: 'festival', rarity: 'rare' },
  { id: 'legends_1', setId: 'legends', rarity: 'epic' },
  { id: 'legends_2', setId: 'legends', rarity: 'epic' },
  { id: 'legends_3', setId: 'legends', rarity: 'legendary' },
  { id: 'legends_4', setId: 'legends', rarity: 'legendary' },
  { id: 'legends_5', setId: 'legends', rarity: 'rare' },
  { id: 'legends_6', setId: 'legends', rarity: 'epic' },
];

const BY_RARITY: Record<CardRarity, CardDef[]> = { common: [], rare: [], epic: [], legendary: [] };
for (const c of CATALOG) BY_RARITY[c.rarity].push(c);

const RARITY_TOTAL = BALANCE.cards.rarityTable.reduce((a, r) => a + r.weight, 0);

function pickRarity(rng: () => number): CardRarity {
  let roll = rng() * RARITY_TOTAL;
  for (const r of BALANCE.cards.rarityTable) {
    roll -= r.weight;
    if (roll < 0) return r.rarity;
  }
  return 'common';
}

export function pickCard(rng: () => number): CardDef {
  let rarity = pickRarity(rng);
  let pool = BY_RARITY[rarity];
  if (!pool.length) {
    rarity = 'common';
    pool = BY_RARITY.common.length ? BY_RARITY.common : CATALOG.slice();
  }
  return pool[Math.floor(rng() * pool.length) % pool.length]!;
}

/** Total permanent coin-bonus % from the player's completed sets. */
export function totalSetBonusPct(s: GameState): number {
  let pct = 0;
  for (const setId of s.completedSets) {
    const set = SETS.find((x) => x.id === setId);
    if (set) pct += set.bonusPct;
  }
  return pct;
}

/** Sets newly completed by the current inventory (mutates completedSets). */
export function checkNewlyCompletedSets(s: GameState): SetDef[] {
  const done: SetDef[] = [];
  for (const set of SETS) {
    if (s.completedSets.includes(set.id)) continue;
    if (set.cardIds.every((id) => (s.cards[id] ?? 0) > 0)) {
      s.completedSets.push(set.id);
      done.push(set);
    }
  }
  return done;
}

/** Drop a card into the inventory; emit events; grant set-completion rewards. */
export function dropCard(s: GameState, rng: () => number): CardDef {
  const card = pickCard(rng);
  s.cards[card.id] = (s.cards[card.id] ?? 0) + 1;
  s.outbox.push({ type: 'card_dropped', rarity: card.rarity, cardId: card.id });
  for (const set of checkNewlyCompletedSets(s)) {
    s.spins += BALANCE.cards.setCompletionSpins;
    s.outbox.push({ type: 'set_completed', setId: set.id, bonusPct: set.bonusPct, spins: BALANCE.cards.setCompletionSpins });
  }
  return card;
}

export interface CollectionView {
  ownedCards: number;
  totalBonusPct: number;
  sets: Array<{ id: string; name: string; owned: number; total: number; complete: boolean; bonusPct: number }>;
}

export function collectionView(s: GameState): CollectionView {
  return {
    ownedCards: Object.values(s.cards).reduce((a, b) => a + b, 0),
    totalBonusPct: totalSetBonusPct(s),
    sets: SETS.map((set) => ({
      id: set.id,
      name: set.name,
      owned: set.cardIds.filter((id) => (s.cards[id] ?? 0) > 0).length,
      total: set.cardIds.length,
      complete: s.completedSets.includes(set.id),
      bonusPct: set.bonusPct,
    })),
  };
}
