// In-memory adapters — used for unit/integration tests and zero-infra local runs
// (STORAGE=memory CACHE=memory). Behaviour matches the Postgres/Redis adapters.

import { gameStateFromJSON, gameStateToJSON, type GameState, type HelpEdge } from '../../domain/types.js';
import type { Cache } from '../../ports/cache.js';
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

export class MemoryPlayerRepo implements PlayerRepo {
  private byId = new Map<string, PlayerRecord>();
  private byDevice = new Map<string, string>();
  async getByDeviceId(deviceId: string) {
    const id = this.byDevice.get(deviceId);
    return id ? this.byId.get(id) ?? null : null;
  }
  async getById(id: string) {
    return this.byId.get(id) ?? null;
  }
  async create(rec: PlayerRecord) {
    this.byId.set(rec.id, { ...rec });
    this.byDevice.set(rec.deviceId, rec.id);
    return rec;
  }
  async addSpend(id: string, inr: number) {
    const p = this.byId.get(id);
    if (p) p.lifetimeSpendInr += inr;
  }
}

export class MemoryGameStateRepo implements GameStateRepo {
  private store = new Map<string, ReturnType<typeof gameStateToJSON>>();
  async load(playerId: string): Promise<GameState | null> {
    const j = this.store.get(playerId);
    return j ? gameStateFromJSON(structuredClone(j)) : null;
  }
  async save(state: GameState): Promise<void> {
    this.store.set(state.playerId, gameStateToJSON(state));
  }
}

export class MemoryHelpEdgeRepo implements HelpEdgeRepo {
  private edges: HelpEdge[] = [];
  async allSince(sinceTs: number) {
    return this.edges.filter((e) => e.ts >= sinceTs);
  }
  async add(edge: HelpEdge) {
    this.edges.push(edge);
  }
}

export class MemorySuspicionRepo implements SuspicionRepo {
  private store = new Map<string, SuspicionRecord>();
  async get(playerId: string) {
    return this.store.get(playerId) ?? null;
  }
  async set(rec: SuspicionRecord) {
    this.store.set(rec.playerId, { ...rec });
  }
}

export class MemoryPurchaseRepo implements PurchaseRepo {
  private store = new Map<string, PurchaseRecord>();
  async exists(transactionId: string) {
    return this.store.has(transactionId);
  }
  async record(rec: PurchaseRecord) {
    this.store.set(rec.transactionId, { ...rec });
  }
}

interface Entry {
  value: string;
  expiresAt: number; // 0 = no expiry
}
export class MemoryCache implements Cache {
  private store = new Map<string, Entry>();
  private alive(k: string): Entry | null {
    const e = this.store.get(k);
    if (!e) return null;
    if (e.expiresAt && e.expiresAt < Date.now()) {
      this.store.delete(k);
      return null;
    }
    return e;
  }
  async get(key: string) {
    return this.alive(key)?.value ?? null;
  }
  async set(key: string, value: string, ttlSec?: number) {
    this.store.set(key, { value, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  }
  async incr(key: string) {
    const cur = Number(this.alive(key)?.value ?? '0') + 1;
    const e = this.store.get(key);
    this.store.set(key, { value: String(cur), expiresAt: e?.expiresAt ?? 0 });
    return cur;
  }
  async expire(key: string, ttlSec: number) {
    const e = this.alive(key);
    if (e) e.expiresAt = Date.now() + ttlSec * 1000;
  }
  async setIfAbsent(key: string, value: string, ttlSec: number) {
    if (this.alive(key)) return false;
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
    return true;
  }
}

export class MemoryTeamRepo implements TeamRepo {
  private teams = new Map<string, TeamRecord>();
  private membersByTeam = new Map<string, Map<string, TeamMemberRecord>>();
  private teamByPlayer = new Map<string, string>();
  private projects = new Map<string, TeamProjectRecord>();

  async create(team: TeamRecord) {
    this.teams.set(team.id, { ...team });
    this.membersByTeam.set(team.id, new Map());
    return team;
  }
  async getById(id: string) {
    return this.teams.get(id) ?? null;
  }
  async getByMember(playerId: string) {
    const id = this.teamByPlayer.get(playerId);
    return id ? this.teams.get(id) ?? null : null;
  }
  async addMember(m: TeamMemberRecord) {
    this.membersByTeam.get(m.teamId)?.set(m.playerId, { ...m });
    this.teamByPlayer.set(m.playerId, m.teamId);
  }
  async removeMember(teamId: string, playerId: string) {
    this.membersByTeam.get(teamId)?.delete(playerId);
    if (this.teamByPlayer.get(playerId) === teamId) this.teamByPlayer.delete(playerId);
  }
  async members(teamId: string) {
    return [...(this.membersByTeam.get(teamId)?.values() ?? [])];
  }
  async memberCount(teamId: string) {
    return this.membersByTeam.get(teamId)?.size ?? 0;
  }
  async addContribution(teamId: string, playerId: string, amount: number) {
    const m = this.membersByTeam.get(teamId)?.get(playerId);
    if (m) m.contributed += amount;
  }
  async getProject(teamId: string) {
    return this.projects.get(teamId) ?? null;
  }
  async saveProject(p: TeamProjectRecord) {
    this.projects.set(p.teamId, { ...p, milestonesHit: [...p.milestonesHit] });
  }
  async list(limit: number) {
    return [...this.teams.values()]
      .map((t) => ({ ...t, memberCount: this.membersByTeam.get(t.id)?.size ?? 0 }))
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, limit);
  }
}

export function memoryRepositories(): Repositories {
  return {
    players: new MemoryPlayerRepo(),
    gameStates: new MemoryGameStateRepo(),
    helpEdges: new MemoryHelpEdgeRepo(),
    suspicion: new MemorySuspicionRepo(),
    purchases: new MemoryPurchaseRepo(),
    teams: new MemoryTeamRepo(),
  };
}
