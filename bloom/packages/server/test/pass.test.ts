import { BALANCE } from '@bloom/shared';
import { describe, expect, it } from 'vitest';
import { addPassXp, claimPass, passStatus, passTier, rewardForTier } from '../src/domain/pass.js';
import { grantPass } from '../src/domain/entitlements.js';
import { createGameState } from '../src/domain/types.js';

function fresh() {
  return createGameState('p', 0, 0, 0, 1);
}

describe('season pass track', () => {
  it('xp accrues into tiers and caps at maxTier', () => {
    const s = fresh();
    addPassXp(s, BALANCE.pass.xpPerTier * 2 + 10);
    expect(passTier(s)).toBe(2);
    addPassXp(s, BALANCE.pass.xpPerTier * BALANCE.pass.tiers * 10);
    expect(passTier(s)).toBe(BALANCE.pass.tiers); // clamped
  });

  it('free claims grant rewards once and advance the pointer', () => {
    const s = fresh();
    addPassXp(s, BALANCE.pass.xpPerTier * 3); // tier 3 → 3 free tiers claimable (0,1,2)
    const before = { spins: s.spins, coins: s.coins, tokens: s.helpTokens };
    const r1 = claimPass(s, 0);
    expect(r1.claimedTiers).toBe(3);
    expect(s.passClaimedFree).toBe(3);
    // re-claim grants nothing
    const r2 = claimPass(s, 0);
    expect(r2.claimedTiers).toBe(0);
    // something was granted
    const gainedSomething =
      s.spins > before.spins || s.coins > before.coins || s.helpTokens > before.tokens;
    expect(gainedSomething).toBe(true);
  });

  it('premium track only claims when the pass is active', () => {
    const noPass = fresh();
    addPassXp(noPass, BALANCE.pass.xpPerTier * 4);
    const r = claimPass(noPass, 1000);
    expect(noPass.passClaimedPremium).toBe(0); // premium not claimed without pass
    expect(r.claimedTiers).toBe(4); // free only

    const withPass = fresh();
    grantPass(withPass, 1000);
    addPassXp(withPass, BALANCE.pass.xpPerTier * 4);
    const r2 = claimPass(withPass, 2000);
    expect(withPass.passClaimedPremium).toBe(4); // premium claimed
    expect(r2.claimedTiers).toBe(8); // 4 free + 4 premium
    expect(r2.granted.coins).toBeGreaterThan(0);
  });

  it('status reports claimable counts and progress into the current tier', () => {
    const s = fresh();
    addPassXp(s, BALANCE.pass.xpPerTier * 2 + 30);
    const st = passStatus(s, 0);
    expect(st.tier).toBe(2);
    expect(st.xpIntoTier).toBe(30);
    expect(st.claimableFree).toBe(2);
    expect(st.claimablePremium).toBe(0); // no active pass
  });

  it('premium rewards are richer than free at the same tier', () => {
    const free = rewardForTier('free', 4);
    const prem = rewardForTier('premium', 4);
    const sum = (r: { spins?: number; coins?: number; helpTokens?: number }) => (r.spins ?? 0) + (r.coins ?? 0) + (r.helpTokens ?? 0);
    expect(sum(prem)).toBeGreaterThan(sum(free));
  });
});
