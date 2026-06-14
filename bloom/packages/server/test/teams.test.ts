import { BALANCE } from '@bloom/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { applyContribution, newProject, projectPct } from '../src/domain/teams.js';
import { createContext } from '../src/app/context.js';
import { loadEnv } from '../src/config/env.js';
import { FixedClock } from '../src/ports/clock.js';
import { TeamService } from '../src/services/teamService.js';
import { createGameState } from '../src/domain/types.js';

const env = loadEnv({ NODE_ENV: 'test', STORAGE: 'memory', CACHE: 'memory' });
let toClose: Array<{ close(): Promise<void> }> = [];
afterEach(async () => { for (const c of toClose) await c.close(); toClose = []; });
async function ctxFor() {
  const ctx = await createContext(env, new FixedClock(1_700_000_000_000));
  toClose.push(ctx);
  return ctx;
}

describe('team project domain', () => {
  it('crosses milestones exactly once as progress accrues', () => {
    const p = newProject();
    const target = p.target;
    const c1 = applyContribution(p, Math.ceil(target * 0.26)); // → 26%
    expect(c1).toContain(25);
    expect(projectPct(p)).toBeGreaterThanOrEqual(25);
    const c2 = applyContribution(p, Math.ceil(target * 0.30)); // → 56%
    expect(c2).toContain(50);
    expect(c2).not.toContain(25); // not re-awarded
    const c3 = applyContribution(p, target); // → 100%
    expect(c3).toEqual(expect.arrayContaining([75, 100]));
    expect(p.progress).toBe(target);
  });
});

describe('TeamService', () => {
  it('creates, prevents double-join, lets others join, and lists', async () => {
    const ctx = await ctxFor();
    const svc = new TeamService(ctx);
    const created = await svc.create('owner', 'Bloomers');
    expect(created.ok).toBe(true);
    expect(created.team?.name).toBe('Bloomers');

    // owner cannot create/join another
    expect((await svc.create('owner', 'Second')).reason).toBe('already_in_team');

    const join = await svc.join('member2', created.team!.id);
    expect(join.ok).toBe(true);
    expect(join.team?.memberCount).toBe(2);

    expect((await svc.join('member2', created.team!.id)).reason).toBe('already_in_team');
    expect((await svc.join('x', 'not-a-real-id')).reason).toBe('team_not_found');

    const list = await svc.list();
    expect(list.find((t) => t.id === created.team!.id)?.memberCount).toBe(2);
  });

  it('contributes coins (clamped per-call), crosses a milestone once, grants spins, deducts coins', async () => {
    const ctx = await ctxFor();
    const svc = new TeamService(ctx);
    await svc.create('p', 'T');
    const s = createGameState('p', ctx.clock.now(), 10, 100_000, 1);
    await ctx.repos.gameStates.save(s);

    // single contributions are capped at maxContribution (anti-whale), so cross
    // the 25% milestone over several calls.
    const per = BALANCE.teams.maxContribution; // 5000
    const need25 = BALANCE.teams.projectTargetCoins * 0.25; // 12500
    const calls = Math.ceil(need25 / per) + 1; // ensure we pass 25%
    let crossed: number[] = [];
    let spinsGranted = 0;
    for (let i = 0; i < calls; i++) {
      const r = await svc.contribute('p', per);
      expect(r.ok).toBe(true);
      crossed = crossed.concat(r.crossedMilestones ?? []);
      spinsGranted += r.spinsGranted ?? 0;
    }
    expect(crossed).toContain(25);
    expect(crossed.filter((m) => m === 25)).toHaveLength(1); // awarded exactly once
    expect(spinsGranted).toBe(BALANCE.teams.milestoneSpins);

    const after = await ctx.repos.gameStates.load('p');
    expect(after!.coins).toBe(100_000 - per * calls);
    expect(after!.spins).toBe(10 + BALANCE.teams.milestoneSpins);
  });

  it('rejects contribution when not in a team or short on coins', async () => {
    const ctx = await ctxFor();
    const svc = new TeamService(ctx);
    expect((await svc.contribute('nobody', 100)).reason).toBe('not_in_team');
    await svc.create('poor', 'Broke');
    const s = createGameState('poor', ctx.clock.now(), 10, 5, 1);
    await ctx.repos.gameStates.save(s);
    expect((await svc.contribute('poor', 1000)).reason).toBe('not_enough_coins');
  });

  it('leave removes membership', async () => {
    const ctx = await ctxFor();
    const svc = new TeamService(ctx);
    await svc.create('p', 'T');
    expect((await svc.getMine('p'))?.name).toBe('T');
    expect((await svc.leave('p')).ok).toBe(true);
    expect(await svc.getMine('p')).toBeNull();
  });
});
