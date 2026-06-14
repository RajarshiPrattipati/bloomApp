import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/domain/types.js';
import { MemoryCache, memoryRepositories } from '../src/adapters/memory/index.js';
import { NonceStore } from '../src/ports/cache.js';

describe('MemoryGameStateRepo serde', () => {
  it('round-trips a GameState, preserving the helpedWindows Set and dropping the transient outbox', async () => {
    const repos = memoryRepositories();
    const s = createGameState('p1', 1000, 50, 0, 1);
    s.helpedWindows.add('3:7');
    s.helpedWindows.add('5:2');
    s.coins = 123;
    s.outbox.push({ type: 'momentum_warning', momentum: 1.4 });
    await repos.gameStates.save(s);

    const loaded = await repos.gameStates.load('p1');
    expect(loaded).not.toBeNull();
    expect(loaded!.coins).toBe(123);
    expect(loaded!.helpedWindows instanceof Set).toBe(true);
    expect(loaded!.helpedWindows.has('3:7')).toBe(true);
    expect(loaded!.helpedWindows.has('5:2')).toBe(true);
    expect(loaded!.outbox).toEqual([]); // transient, not persisted
  });

  it('isolates snapshots (mutating the loaded copy does not change the store)', async () => {
    const repos = memoryRepositories();
    const s = createGameState('p2', 1000, 50, 0, 1);
    await repos.gameStates.save(s);
    const a = await repos.gameStates.load('p2');
    a!.coins = 999;
    const b = await repos.gameStates.load('p2');
    expect(b!.coins).toBe(0);
  });
});

describe('MemoryCache + NonceStore', () => {
  it('setIfAbsent reserves a key once', async () => {
    const c = new MemoryCache();
    expect(await c.setIfAbsent('k', '1', 60)).toBe(true);
    expect(await c.setIfAbsent('k', '1', 60)).toBe(false);
  });
  it('incr counts and get/set work', async () => {
    const c = new MemoryCache();
    expect(await c.incr('n')).toBe(1);
    expect(await c.incr('n')).toBe(2);
    await c.set('s', 'hello');
    expect(await c.get('s')).toBe('hello');
    expect(await c.get('missing')).toBeNull();
  });
  it('NonceStore rejects replays', async () => {
    const nonces = new NonceStore(new MemoryCache(), 60);
    expect(await nonces.useOnce('abc')).toBe(true);
    expect(await nonces.useOnce('abc')).toBe(false);
  });
});

describe('MemoryPurchaseRepo', () => {
  it('detects duplicate transaction ids (replay protection)', async () => {
    const repos = memoryRepositories();
    expect(await repos.purchases.exists('tx1')).toBe(false);
    await repos.purchases.record({ transactionId: 'tx1', playerId: 'p1', productId: 'spins_120', platform: 'ios', amountInr: 10, verifiedAt: 1 });
    expect(await repos.purchases.exists('tx1')).toBe(true);
  });
});
