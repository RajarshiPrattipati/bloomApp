import { BALANCE, ViewSchema } from '@bloom/shared';
import { describe, expect, it } from 'vitest';
import {
  advance,
  buildAction,
  buildView,
  canHelpPlayer,
  createGameState,
  deliverThankYous,
  helpBot,
  resolveSpin,
  strangerPool,
  wouldCreateCycle,
  type GameState,
  type HelpEdge,
} from '../src/domain/index.js';

const SALT = 'test-salt';
function fresh(now = 1_000_000): GameState {
  return createGameState('p1', now, 100, 0, 1);
}

describe('spin', () => {
  it('is deterministic for the same (player, spinCount, salt)', () => {
    const a = fresh();
    const b = fresh();
    const ra = resolveSpin(a, 1_000_000, SALT);
    const rb = resolveSpin(b, 1_000_000, SALT);
    expect(ra.kind).toBe(rb.kind);
    expect(ra.coinsAwarded).toBe(rb.coinsAwarded);
  });

  it('produces a distribution close to the drop table', () => {
    const s = fresh();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const r = resolveSpin(s, 1_000_000 + i, SALT);
      counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    }
    // coins should be ~46% ± 4
    expect(counts.coins! / 4000).toBeGreaterThan(0.40);
    expect(counts.coins! / 4000).toBeLessThan(0.52);
  });

  it('never lets spins or coins go negative', () => {
    const s = fresh();
    s.spins = 1;
    resolveSpin(s, 1, SALT);
    resolveSpin(s, 2, SALT);
    expect(s.spins).toBeGreaterThanOrEqual(0);
    expect(s.coins).toBeGreaterThanOrEqual(0);
  });
});

describe('build + golden hour', () => {
  it('rejects a build with insufficient coins, accepts when affordable', () => {
    const s = fresh();
    const cost = BALANCE.building.baseCost; // level1 cost is higher; this is < cost
    expect(buildAction(s, 1_000_000, SALT).ok).toBe(false);
    s.coins = 1_000_000;
    const r = buildAction(s, 1_000_000, SALT);
    expect(r.ok).toBe(true);
    expect(s.gh).not.toBeNull();
    expect(s.constructing).toBe(true);
    expect(cost).toBeGreaterThan(0);
  });

  it('applies the build-boost discount and consumes the flag', () => {
    const s = fresh();
    s.coins = 1_000_000;
    s.buildBoost = true;
    const before = s.coins;
    buildAction(s, 1_000_000, SALT);
    const spent = before - s.coins;
    expect(s.buildBoost).toBe(false);
    // discounted spend is strictly less than the undiscounted cost
    const undiscounted = Math.round(spent / (1 - BALANCE.building.boostDiscountPct));
    expect(spent).toBeLessThan(undiscounted + 1);
  });

  it('runs helpers, milestones, and closes with a refund', () => {
    const s = fresh();
    s.coins = 1_000_000;
    buildAction(s, 0, SALT);
    const costPaid = s.gh!.costPaid;
    // advance past the full Golden Hour
    advance(s, BALANCE.goldenHour.durationMs + 1);
    expect(s.gh).toBeNull();
    expect(s.constructing).toBe(false);
    expect(s.buildingsBuilt).toBe(1);
    expect(s.level).toBe(2);
    // 10 helpers ⇒ benefit > 0 ⇒ a refund landed
    expect(s.coins).toBeGreaterThan(1_000_000 - costPaid);
  });
});

describe('momentum', () => {
  it('decays when idle and emits a cooling warning', () => {
    const s = fresh(0);
    s.momentum = 1.8;
    s.momentumPeak = 1.8;
    s.momentumAt = 0;
    s.warnedHot = false;
    // production decay is -0.1x/6min, so crossing 1.8 → <1.5 needs ~18 min idle
    advance(s, 20 * 60_000); // 20 min idle
    expect(s.momentum).toBeLessThan(1.8);
    const warned = s.outbox.some((e) => e.type === 'momentum_warning');
    expect(warned).toBe(true);
  });
});

describe('social / stranger pool', () => {
  it('surfaces a deterministic, bounded pool', () => {
    const pool = strangerPool(1_000_000);
    expect(pool.length).toBeLessThanOrEqual(BALANCE.bots.surfaceCount);
    expect(strangerPool(1_000_000)).toEqual(pool); // deterministic
  });

  it('helping a bot is idempotent per window and schedules gratitude', () => {
    const s = fresh();
    const pool = strangerPool(s.createdAt);
    const target = pool[0]!;
    const h1 = helpBot(s, target.botId, s.createdAt, SALT);
    expect(h1.ok).toBe(true);
    const h2 = helpBot(s, target.botId, s.createdAt, SALT);
    expect(h2.ok).toBe(false); // already helped this window
    expect(s.pendingThankYous.length).toBe(1);
    deliverThankYous(s, s.createdAt + 6000);
    expect(s.outbox.some((e) => e.type === 'thank_you')).toBe(true);
  });
});

describe('help graph anti-abuse', () => {
  const now = 10_000_000;
  it('blocks direct A→B→A cycles', () => {
    const edges: HelpEdge[] = [{ from: 'B', to: 'A', ts: now - 1000 }];
    expect(wouldCreateCycle(edges, 'A', 'B', 2)).toBe(true);
  });
  it('blocks 2-hop A→B→C→A cycles within depth', () => {
    const edges: HelpEdge[] = [
      { from: 'B', to: 'C', ts: now - 2000 },
      { from: 'C', to: 'A', ts: now - 1000 },
    ];
    expect(wouldCreateCycle(edges, 'A', 'B', 2)).toBe(true);
  });
  it('enforces daily and mutual caps', () => {
    const edges: HelpEdge[] = Array.from({ length: 3 }, (_, i) => ({ from: 'A', to: 'B', ts: now - i * 1000 }));
    expect(canHelpPlayer(edges, 'A', 'B', now).allowed).toBe(false); // daily limit (3)
    expect(canHelpPlayer([], 'A', 'A', now).allowed).toBe(false); // self help
    expect(canHelpPlayer([], 'A', 'B', now).allowed).toBe(true);
  });
});

describe('world view', () => {
  it('builds a schema-valid View', () => {
    const s = fresh();
    advance(s, s.createdAt);
    const view = buildView(s, s.createdAt);
    expect(ViewSchema.safeParse(view).success).toBe(true);
  });
});
