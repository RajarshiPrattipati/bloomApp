import { afterEach, describe, expect, it } from 'vitest';
import { createContext } from '../src/app/context.js';
import { loadEnv } from '../src/config/env.js';
import { FixedClock } from '../src/ports/clock.js';
import { createGameState } from '../src/domain/types.js';
import { PresenceHub, type Connection } from '../src/realtime/hub.js';
import { AntiCheatService } from '../src/services/antiCheatService.js';
import { GameService } from '../src/services/gameService.js';
import { LiveGoldenHours } from '../src/services/liveGoldenHours.js';

const env = loadEnv({ NODE_ENV: 'test', STORAGE: 'memory', CACHE: 'memory' });
let toClose: Array<{ close(): Promise<void> }> = [];
afterEach(async () => { for (const c of toClose) await c.close(); toClose = []; });

describe('realtime help notifications', () => {
  it('broadcasts a live got_helped ping to the target when a real player helps', async () => {
    const ctx = await createContext(env, new FixedClock(1_700_000_000_000));
    toClose.push(ctx);
    const presence = new PresenceHub();
    const game = new GameService(ctx, new AntiCheatService(ctx), new LiveGoldenHours(), presence);

    // target with coins → open a Golden Hour
    await ctx.repos.gameStates.save(createGameState('target', ctx.clock.now(), 100, 100_000, 1));
    expect((await game.build('target')).ok).toBe(true);
    await ctx.repos.gameStates.save(createGameState('helper', ctx.clock.now(), 100, 0, 1));

    // the target is "connected" and subscribed to their personal channel
    const received: unknown[] = [];
    const targetConn: Connection = { playerId: 'target', send: (d) => received.push(JSON.parse(d)) };
    presence.subscribe('player:target', targetConn);

    const r = await game.helpPlayer('helper', 'target');
    expect(r.ok).toBe(true);

    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject({ type: 'got_helped', helpers: expect.any(Number) });
  });

  it('does not throw when no presence hub is wired (optional dependency)', async () => {
    const ctx = await createContext(env, new FixedClock(1_700_000_000_000));
    toClose.push(ctx);
    const game = new GameService(ctx, new AntiCheatService(ctx), new LiveGoldenHours()); // no hub
    await ctx.repos.gameStates.save(createGameState('t2', ctx.clock.now(), 100, 100_000, 1));
    await game.build('t2');
    await ctx.repos.gameStates.save(createGameState('h2', ctx.clock.now(), 100, 0, 1));
    const r = await game.helpPlayer('h2', 't2');
    expect(r.ok).toBe(true); // broadcast guarded by ?.
  });
});
