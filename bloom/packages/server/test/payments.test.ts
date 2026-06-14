import { afterEach, describe, expect, it } from 'vitest';
import { createContext } from '../src/app/context.js';
import { loadEnv } from '../src/config/env.js';
import { FixedClock } from '../src/ports/clock.js';
import { PaymentService } from '../src/services/paymentService.js';

const env = loadEnv({ NODE_ENV: 'test', STORAGE: 'memory', CACHE: 'memory' });

async function ctxFor() {
  return createContext(env, new FixedClock(1_700_000_000_000));
}

let toClose: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  for (const c of toClose) await c.close();
  toClose = [];
});

describe('PaymentService (sandbox verifier)', () => {
  it('grants spins for a valid receipt and dedupes the transaction', async () => {
    const ctx = await ctxFor();
    toClose.push(ctx);
    await ctx.repos.players.create({ id: 'p1', deviceId: 'd1', platform: 'ios', createdAt: 1, lifetimeSpendInr: 0 });
    const pay = new PaymentService(ctx);

    const r1 = await pay.verify('p1', 'ios', 'spins_120', 'sandbox-ok:spins_120', 'tx-1');
    expect(r1.ok).toBe(true);
    expect(r1.granted?.spins).toBe(120);
    expect(r1.view?.wallet.spins).toBeGreaterThanOrEqual(120);

    // replay of the same transaction id is refused
    const r2 = await pay.verify('p1', 'ios', 'spins_120', 'sandbox-ok:spins_120', 'tx-1');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('purchase_replay');

    // spend was recorded on the player
    const p = await ctx.repos.players.getById('p1');
    expect(p?.lifetimeSpendInr).toBe(10);
  });

  it('rejects an unknown product and an invalid receipt', async () => {
    const ctx = await ctxFor();
    toClose.push(ctx);
    const pay = new PaymentService(ctx);
    expect((await pay.verify('p1', 'ios', 'no_such_sku', 'x', 'tx-2')).ok).toBe(false);
    const bad = await pay.verify('p1', 'ios', 'spins_120', 'wrong-receipt', 'tx-3');
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('purchase_invalid');
  });
});
