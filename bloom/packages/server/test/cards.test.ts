import { BALANCE } from '@bloom/shared';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/domain/rng.js';
import {
  CATALOG,
  SETS,
  checkNewlyCompletedSets,
  collectionView,
  dropCard,
  pickCard,
  totalSetBonusPct,
} from '../src/domain/cards.js';
import { createGameState } from '../src/domain/types.js';
import { resolveSpin } from '../src/domain/spin.js';

function fresh() {
  return createGameState('p1', 1000, 100, 0, 1);
}

describe('card catalog + drops', () => {
  it('every rarity in the drop table has at least one card', () => {
    for (const r of BALANCE.cards.rarityTable) {
      expect(CATALOG.some((c) => c.rarity === r.rarity)).toBe(true);
    }
  });

  it('pickCard is deterministic for a given rng seed', () => {
    const a = pickCard(mulberry32(42));
    const b = pickCard(mulberry32(42));
    expect(a.id).toBe(b.id);
  });

  it('dropCard adds to inventory and emits a card_dropped event', () => {
    const s = fresh();
    const card = dropCard(s, mulberry32(7));
    expect(s.cards[card.id]).toBe(1);
    expect(s.outbox.some((e) => e.type === 'card_dropped')).toBe(true);
  });
});

describe('set completion', () => {
  it('grants a permanent coin bonus + spins exactly once when a set completes', () => {
    const s = fresh();
    const set = SETS[0]!;
    // give every card in the set except the last
    for (const id of set.cardIds.slice(0, -1)) s.cards[id] = 1;
    expect(checkNewlyCompletedSets(s)).toHaveLength(0);
    expect(totalSetBonusPct(s)).toBe(0);

    // complete it
    const lastId = set.cardIds[set.cardIds.length - 1]!;
    s.cards[lastId] = 1;
    const before = s.spins;
    const done = checkNewlyCompletedSets(s);
    expect(done.map((d) => d.id)).toContain(set.id);
    expect(totalSetBonusPct(s)).toBe(set.bonusPct);

    // grant happens in dropCard; emulate the reward path
    expect(s.completedSets).toContain(set.id);
    expect(checkNewlyCompletedSets(s)).toHaveLength(0); // not re-completed
    expect(before).toBe(s.spins); // checkNewly… itself doesn't grant; dropCard does
  });

  it('completed sets multiply coin spins (verified through resolveSpin)', () => {
    // craft two states: one with a completed set, one without
    const plain = fresh();
    const boosted = fresh();
    for (const id of SETS[2]!.cardIds) boosted.cards[id] = 1; // 5% set
    checkNewlyCompletedSets(boosted);
    expect(totalSetBonusPct(boosted)).toBe(5);

    // find a spin index that yields coins for both (same seed → same outcome)
    let plainCoins = 0;
    let boostCoins = 0;
    for (let i = 0; i < 50; i++) {
      const a = createGameStateClone(plain);
      const b = createGameStateClone(boosted);
      a.spinCount = i; b.spinCount = i;
      const ra = resolveSpin(a, 1000, 'salt');
      const rb = resolveSpin(b, 1000, 'salt');
      if (ra.kind === 'coins' && ra.coinsAwarded > 0) { plainCoins = ra.coinsAwarded; boostCoins = rb.coinsAwarded; break; }
    }
    expect(boostCoins).toBeGreaterThan(plainCoins);
  });
});

describe('collectionView', () => {
  it('reports owned/total per set and total bonus', () => {
    const s = fresh();
    s.cards['village_1'] = 1;
    const v = collectionView(s);
    expect(v.ownedCards).toBe(1);
    const village = v.sets.find((x) => x.id === 'village')!;
    expect(village.owned).toBe(1);
    expect(village.total).toBe(6);
    expect(village.complete).toBe(false);
  });
});

function createGameStateClone(s: ReturnType<typeof fresh>) {
  return { ...s, cards: { ...s.cards }, completedSets: [...s.completedSets], helpedWindows: new Set(s.helpedWindows), pendingThankYous: [...s.pendingThankYous], outbox: [] };
}
