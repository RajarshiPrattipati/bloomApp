// Postgres-backed repositories (Drizzle). Mirror the in-memory adapters exactly.

import { and, eq, gte, or, sql } from 'drizzle-orm';
import { gameStateFromJSON, gameStateToJSON, type GameState, type HelpEdge } from '../../domain/types.js';
import type {
  GameStateRepo,
  HelpEdgeRepo,
  PlayerRecord,
  PlayerRepo,
  PurchaseRecord,
  PurchaseRepo,
  Repositories,
  SuspicionRecord,
  SuspicionRepo,
  TeamMemberRecord,
  TeamProjectRecord,
  TeamRecord,
  TeamRepo,
} from '../../ports/repositories.js';
import type { Db } from './client.js';
import { gameStates, helpEdges, players, purchases, suspicion, teamMembers, teamProjects, teams } from './schema.js';

export class PgPlayerRepo implements PlayerRepo {
  constructor(private db: Db) {}
  async getByDeviceId(deviceId: string) {
    const rows = await this.db.select().from(players).where(eq(players.deviceId, deviceId)).limit(1);
    return rows[0] ? toPlayer(rows[0]) : null;
  }
  async getById(id: string) {
    const rows = await this.db.select().from(players).where(eq(players.id, id)).limit(1);
    return rows[0] ? toPlayer(rows[0]) : null;
  }
  async create(rec: PlayerRecord) {
    await this.db.insert(players).values({
      id: rec.id,
      deviceId: rec.deviceId,
      platform: rec.platform,
      appVersion: rec.appVersion ?? null,
      createdAt: rec.createdAt,
      lifetimeSpendInr: rec.lifetimeSpendInr,
    });
    return rec;
  }
  async addSpend(id: string, inr: number) {
    const cur = await this.getById(id);
    if (!cur) return;
    await this.db.update(players).set({ lifetimeSpendInr: cur.lifetimeSpendInr + inr }).where(eq(players.id, id));
  }
}

export class PgGameStateRepo implements GameStateRepo {
  constructor(private db: Db) {}
  async load(playerId: string): Promise<GameState | null> {
    const rows = await this.db.select().from(gameStates).where(eq(gameStates.playerId, playerId)).limit(1);
    if (!rows[0]) return null;
    return gameStateFromJSON(rows[0].state as ReturnType<typeof gameStateToJSON>);
  }
  async save(state: GameState): Promise<void> {
    const json = gameStateToJSON(state);
    await this.db
      .insert(gameStates)
      .values({ playerId: state.playerId, state: json, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: gameStates.playerId, set: { state: json, updatedAt: Date.now() } });
  }
}

export class PgHelpEdgeRepo implements HelpEdgeRepo {
  constructor(private db: Db) {}
  async allSince(sinceTs: number): Promise<HelpEdge[]> {
    const rows = await this.db.select().from(helpEdges).where(gte(helpEdges.ts, sinceTs));
    return rows.map((r) => ({ from: r.fromId, to: r.toId, ts: r.ts }));
  }
  async add(edge: HelpEdge) {
    await this.db.insert(helpEdges).values({ fromId: edge.from, toId: edge.to, ts: edge.ts });
  }
}

export class PgSuspicionRepo implements SuspicionRepo {
  constructor(private db: Db) {}
  async get(playerId: string) {
    const rows = await this.db.select().from(suspicion).where(eq(suspicion.playerId, playerId)).limit(1);
    return rows[0] ? { playerId: rows[0].playerId, score: rows[0].score, updatedAt: rows[0].updatedAt } : null;
  }
  async set(rec: SuspicionRecord) {
    await this.db
      .insert(suspicion)
      .values(rec)
      .onConflictDoUpdate({ target: suspicion.playerId, set: { score: rec.score, updatedAt: rec.updatedAt } });
  }
}

export class PgPurchaseRepo implements PurchaseRepo {
  constructor(private db: Db) {}
  async exists(transactionId: string) {
    const rows = await this.db.select({ id: purchases.transactionId }).from(purchases).where(eq(purchases.transactionId, transactionId)).limit(1);
    return rows.length > 0;
  }
  async record(rec: PurchaseRecord) {
    await this.db.insert(purchases).values(rec).onConflictDoNothing();
  }
}

function toPlayer(r: typeof players.$inferSelect): PlayerRecord {
  return {
    id: r.id,
    deviceId: r.deviceId,
    platform: r.platform as PlayerRecord['platform'],
    appVersion: r.appVersion ?? undefined,
    createdAt: r.createdAt,
    lifetimeSpendInr: r.lifetimeSpendInr,
  };
}

export class PgTeamRepo implements TeamRepo {
  constructor(private db: Db) {}
  async create(team: TeamRecord) {
    await this.db.insert(teams).values(team);
    return team;
  }
  async getById(id: string) {
    const rows = await this.db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return rows[0] ?? null;
  }
  async getByMember(playerId: string) {
    const m = await this.db.select().from(teamMembers).where(eq(teamMembers.playerId, playerId)).limit(1);
    if (!m[0]) return null;
    return this.getById(m[0].teamId);
  }
  async addMember(member: TeamMemberRecord) {
    await this.db.insert(teamMembers).values(member).onConflictDoUpdate({ target: teamMembers.playerId, set: { teamId: member.teamId, joinedAt: member.joinedAt, contributed: member.contributed } });
  }
  async removeMember(teamId: string, playerId: string) {
    await this.db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.playerId, playerId)));
  }
  async members(teamId: string) {
    return this.db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
  }
  async memberCount(teamId: string) {
    const rows = await this.db.select({ c: sql<number>`count(*)::int` }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
    return rows[0]?.c ?? 0;
  }
  async addContribution(teamId: string, playerId: string, amount: number) {
    await this.db
      .update(teamMembers)
      .set({ contributed: sql`${teamMembers.contributed} + ${amount}` })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.playerId, playerId)));
  }
  async getProject(teamId: string): Promise<TeamProjectRecord | null> {
    const rows = await this.db.select().from(teamProjects).where(eq(teamProjects.teamId, teamId)).limit(1);
    if (!rows[0]) return null;
    return { ...rows[0], milestonesHit: rows[0].milestonesHit as number[] };
  }
  async saveProject(p: TeamProjectRecord) {
    await this.db
      .insert(teamProjects)
      .values(p)
      .onConflictDoUpdate({ target: teamProjects.teamId, set: { progress: p.progress, milestonesHit: p.milestonesHit, kind: p.kind, target: p.target } });
  }
  async list(limit: number) {
    const rows = await this.db
      .select({ id: teams.id, name: teams.name, ownerId: teams.ownerId, createdAt: teams.createdAt, memberCount: sql<number>`(select count(*)::int from ${teamMembers} where ${teamMembers.teamId} = ${teams.id})` })
      .from(teams)
      .limit(limit);
    return rows;
  }
}

export function pgRepositories(db: Db): Repositories {
  return {
    players: new PgPlayerRepo(db),
    gameStates: new PgGameStateRepo(db),
    helpEdges: new PgHelpEdgeRepo(db),
    suspicion: new PgSuspicionRepo(db),
    purchases: new PgPurchaseRepo(db),
    teams: new PgTeamRepo(db),
  };
}

// silence unused import in some TS configs (and/or kept for future composite filters)
void or;
