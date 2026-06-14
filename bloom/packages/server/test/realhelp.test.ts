import { afterEach, describe, expect, it } from 'vitest';
import { createContext } from '../src/app/context.js';
import { loadEnv } from '../src/config/env.js';
import { FixedClock } from '../src/ports/clock.js';
import { createGameState } from '../src/domain/types.js';
import { AntiCheatService } from '../src/services/antiCheatService.js';
import { GameService } from '../src/services/gameService.js';
import { LiveGoldenHours } from '../src/services/liveGoldenHours.js';

const env = loadEnv({ NODE_ENV: 'test', STORAGE: 'memory', CACHE: 'memory' });
let toClose: Array<{ close(): Promise<void> }> = [];
afterEach(async () => { for (const c of toClose) await c.close(); toClose = []; });

async function setup() {
  const ctx = await createContext(env, new FixedClock(1_700_000_000_000));
  toClose.push(ctx);
  const game = new GameService(ctx, new AntiCheatService(ctx), new LiveGoldenHours());
  // a target with coins + an open Golden Hour
  const target = createGameState('target', ctx.clock.now(), 100, 100_000, 1);
  await ctx.repos.gameStates.save(target);
  const b = await game.build('target');
  expect(b.ok).toBe(true);
  // a helper
  await ctx.repos.gameStates.save(createGameState('helper', ctx.clock.now(), 100, 0, 1));
  return { ctx, game };
}

describe('real player↔player help', () => {
  it('discovers a live Golden Hour and lets a real player help it', async () => {
    const { ctx, game } = await setup();
    const live = await game.listLive('helper');
    expect(live.find((g) => g.playerId === 'target')).toBeTruthy();

    const r = await game.helpPlayer('helper', 'target');
    expect(r.ok).toBe(true);
    expect(r.coins).toBeGreaterThan(0);
    expect(r.view.wallet.momentum).toBeGreaterThan(1); // helper gained momentum

    // target's Golden Hour now records the real helper + helper count went up
    const target = await ctx.repos.gameStates.load('target');
    expect(target!.gh!.realHelperIds).toContain('helper');

    // an edge was recorded for the help graph
    const edges = await ctx.repos.helpEdges.allSince(0);
    expect(edges.some((e) => e.from === 'helper' && e.to === 'target')).toBe(true);

    // gratitude reciprocity: helper has a pending thank-you scheduled
    const helper = await ctx.repos.gameStates.load('helper');
    expect(helper!.pendingThankYous.length).toBe(1);
  });

  it('is idempotent per Golden Hour and blocks self-help', async () => {
    const { game } = await setup();
    expect((await game.helpPlayer('helper', 'target')).ok).toBe(true);
    const again = await game.helpPlayer('helper', 'target');
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('already_helped');

    const self = await game.helpPlayer('target', 'target');
    expect(self.reason).toBe('self_help');
  });

  it('blocks a help that would close a cycle (anti-ring)', async () => {
    const { ctx, game } = await setup();
    // pre-existing edge target→helper; helper→target would form A→B→A
    await ctx.repos.helpEdges.add({ from: 'target', to: 'helper', ts: ctx.clock.now() - 1000 });
    const r = await game.helpPlayer('helper', 'target');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('cycle_blocked');
  });
});
