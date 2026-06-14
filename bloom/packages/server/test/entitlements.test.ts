import { BALANCE } from '@bloom/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { boostActive, claimDailyFreeSpins, coinBoostMult, grantBoost, grantPass, passActive } from '../src/domain/entitlements.js';
import { createGameState } from '../src/domain/types.js';
import { resolveSpin } from '../src/domain/spin.js';
import { createContext } from '../src/app/context.js';
import { loadEnv } from '../src/config/env.js';
import { FixedClock } from '../src/ports/clock.js';
import { PaymentService } from '../src/services/paymentService.js';

const DAY = 24 * 60 * 60 * 1000;
const env = loadEnv({ NODE_ENV: 'test', STORAGE: 'memory', CACHE: 'memory' });

describe('entitlement domain', () => {
  it('boost activates, multiplies coins, and expires', () => {
    const s = createGameState('p', 0, 10, 0, 1);
    expect(boostActive(s, 0)).toBe(false);
    expect(coinBoostMult(s, 0)).toBe(1);
    grantBoost(s, 0);
    expect(boostActive(s, DAY)).toBe(true);
    expect(coinBoostMult(s, DAY)).toBeCloseTo(1 + BALANCE.iap.boostSub.coinBonusPct / 100);
    expect(boostActive(s, BALANCE.iap.boostSub.durationDays * DAY + 1)).toBe(false);
  });

  it('boost increases coin-spin payouts via resolveSpin', () => {
    let plain = 0, boosted = 0;
    for (let i = 0; i < 60; i++) {
      const a = createGameState('p', 0, 10, 0, 1); a.spinCount = i;
      const b = createGameState('p', 0, 10, 0, 1); b.spinCount = i; grantBoost(b, 0);
      const ra = resolveSpin(a, 1000, 'salt');
      const rb = resolveSpin(b, 1000, 'salt');
      if (ra.kind === 'coins' && ra.coinsAwarded > 0) { plain = ra.coinsAwarded; boosted = rb.coinsAwarded; break; }
    }
    expect(boosted).toBeGreaterThan(plain);
  });

  it('pass activates and expires', () => {
    const s = createGameState('p', 0, 10, 0, 1);
    grantPass(s, 1000);
    expect(passActive(s, 1000 + DAY)).toBe(true);
    expect(passActive(s, 1000 + (BALANCE.iap.seasonPass.durationDays + 1) * DAY)).toBe(false);
  });

  it('daily free spins are granted once per day and richer with boost', () => {
    const s = createGameState('p', 0, 0, 0, 1);
    const g1 = claimDailyFreeSpins(s, DAY);
    expect(g1).toBe(BALANCE.session.dailyFreeSpins);
    expect(claimDailyFreeSpins(s, DAY + 1000)).toBe(0); // same day → none
    const g2 = claimDailyFreeSpins(s, DAY * 3);
    expect(g2).toBe(BALANCE.session.dailyFreeSpins);
    grantBoost(s, DAY * 3);
    const g3 = claimDailyFreeSpins(s, DAY * 4 + 1);
    expect(g3).toBe(Math.round(BALANCE.session.dailyFreeSpins * 1.5));
  });
});

let toClose: Array<{ close(): Promise<void> }> = [];
afterEach(async () => { for (const c of toClose) await c.close(); toClose = []; });

describe('PaymentService entitlement grants', () => {
  it('boost_sub purchase activates the boost', async () => {
    const ctx = await createContext(env, new FixedClock(1_700_000_000_000));
    toClose.push(ctx);
    await ctx.repos.players.create({ id: 'p', deviceId: 'd', platform: 'ios', createdAt: 1, lifetimeSpendInr: 0 });
    const pay = new PaymentService(ctx);
    const r = await pay.verify('p', 'ios', 'boost_monthly', 'sandbox-ok:boost_monthly', 'tx-boost-1');
    expect(r.ok).toBe(true);
    expect(r.view?.wallet.boostActive).toBe(true);
  });

  it('season_pass purchase activates the pass', async () => {
    const ctx = await createContext(env, new FixedClock(1_700_000_000_000));
    toClose.push(ctx);
    await ctx.repos.players.create({ id: 'p2', deviceId: 'd2', platform: 'android', createdAt: 1, lifetimeSpendInr: 0 });
    const pay = new PaymentService(ctx);
    const r = await pay.verify('p2', 'android', 'season_pass', 'sandbox-ok:season_pass', 'tx-pass-1');
    expect(r.ok).toBe(true);
    expect(r.view?.wallet.passActive).toBe(true);
  });
});
