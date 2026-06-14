// TeamService (GDD §10). Create/join/leave/list teams and contribute coins to a
// shared Team Project; crossing a milestone grants free spins. Returns crossed
// milestones so the route can broadcast a live rally ping via the PresenceHub.

import { randomUUID } from 'node:crypto';
import { BALANCE, ERROR, type TeamView } from '@bloom/shared';
import { applyContribution, createGameState, newProject, projectPct, recordQuestEvent, type TeamProject } from '../domain/index.js';
import type { AppContext } from '../app/context.js';
import type { TeamProjectRecord } from '../ports/repositories.js';

export interface TeamActionResult {
  ok: boolean;
  reason?: string;
  team?: TeamView;
}

export interface ContributeResult extends TeamActionResult {
  crossedMilestones?: number[];
  spinsGranted?: number;
  coins?: number;
}

export class TeamService {
  constructor(private ctx: AppContext) {}

  async create(playerId: string, name: string): Promise<TeamActionResult> {
    if (await this.ctx.repos.teams.getByMember(playerId)) return { ok: false, reason: ERROR.alreadyInTeam };
    const now = this.ctx.clock.now();
    const team = await this.ctx.repos.teams.create({ id: randomUUID(), name, ownerId: playerId, createdAt: now });
    await this.ctx.repos.teams.addMember({ teamId: team.id, playerId, joinedAt: now, contributed: 0 });
    const proj = newProject();
    await this.ctx.repos.teams.saveProject({ teamId: team.id, ...proj, startedAt: now });
    this.ctx.log.info({ teamId: team.id, ownerId: playerId }, 'team created');
    return { ok: true, team: await this.view(team.id) };
  }

  async join(playerId: string, teamId: string): Promise<TeamActionResult> {
    if (await this.ctx.repos.teams.getByMember(playerId)) return { ok: false, reason: ERROR.alreadyInTeam };
    const team = await this.ctx.repos.teams.getById(teamId);
    if (!team) return { ok: false, reason: ERROR.teamNotFound };
    if ((await this.ctx.repos.teams.memberCount(teamId)) >= BALANCE.teams.maxSize) return { ok: false, reason: ERROR.teamFull };
    await this.ctx.repos.teams.addMember({ teamId, playerId, joinedAt: this.ctx.clock.now(), contributed: 0 });
    return { ok: true, team: await this.view(teamId) };
  }

  async leave(playerId: string): Promise<TeamActionResult> {
    const team = await this.ctx.repos.teams.getByMember(playerId);
    if (!team) return { ok: false, reason: ERROR.notInTeam };
    await this.ctx.repos.teams.removeMember(team.id, playerId);
    return { ok: true };
  }

  async getMine(playerId: string): Promise<TeamView | null> {
    const team = await this.ctx.repos.teams.getByMember(playerId);
    return team ? this.view(team.id) : null;
  }

  async list(): Promise<Array<{ id: string; name: string; memberCount: number }>> {
    const rows = await this.ctx.repos.teams.list(50);
    return rows.map((t) => ({ id: t.id, name: t.name, memberCount: t.memberCount }));
  }

  async contribute(playerId: string, amount: number): Promise<ContributeResult> {
    const clamped = Math.max(BALANCE.teams.minContribution, Math.min(BALANCE.teams.maxContribution, Math.floor(amount)));
    const team = await this.ctx.repos.teams.getByMember(playerId);
    if (!team) return { ok: false, reason: ERROR.notInTeam };

    const now = this.ctx.clock.now();
    let state = await this.ctx.repos.gameStates.load(playerId);
    if (!state) state = createGameState(playerId, now, BALANCE.session.startingSpins, BALANCE.session.startingCoins, BALANCE.session.startingLevel);
    if (state.coins < clamped) return { ok: false, reason: ERROR.notEnoughCoins };

    // spend coins toward the shared project
    state.coins -= clamped;
    recordQuestEvent(state, 'team_contribute', now);

    const rec = (await this.ctx.repos.teams.getProject(team.id)) ?? { teamId: team.id, ...newProject(), startedAt: now };
    const project: TeamProject = { kind: rec.kind, target: rec.target, progress: rec.progress, milestonesHit: rec.milestonesHit };
    const crossed = applyContribution(project, clamped);

    // milestone reward: free spins to the contributor (everyone benefits over time)
    const spinsGranted = crossed.length * BALANCE.teams.milestoneSpins;
    state.spins += spinsGranted;

    await this.ctx.repos.gameStates.save(state);
    await this.ctx.repos.teams.addContribution(team.id, playerId, clamped);
    const toSave: TeamProjectRecord = { teamId: team.id, kind: project.kind, target: project.target, progress: project.progress, milestonesHit: project.milestonesHit, startedAt: rec.startedAt };
    await this.ctx.repos.teams.saveProject(toSave);

    return { ok: true, crossedMilestones: crossed, spinsGranted, coins: state.coins, team: await this.view(team.id) };
  }

  private async view(teamId: string): Promise<TeamView> {
    const team = (await this.ctx.repos.teams.getById(teamId))!;
    const members = await this.ctx.repos.teams.members(teamId);
    const rec = await this.ctx.repos.teams.getProject(teamId);
    const project = rec
      ? { kind: rec.kind, target: rec.target, progress: rec.progress, pct: projectPct({ kind: rec.kind, target: rec.target, progress: rec.progress, milestonesHit: rec.milestonesHit }), milestonesHit: rec.milestonesHit }
      : null;
    return {
      id: team.id,
      name: team.name,
      ownerId: team.ownerId,
      memberCount: members.length,
      members: members.map((m) => ({ playerId: m.playerId, contributed: m.contributed, joinedAt: m.joinedAt })).sort((a, b) => b.contributed - a.contributed),
      project,
    };
  }
}
