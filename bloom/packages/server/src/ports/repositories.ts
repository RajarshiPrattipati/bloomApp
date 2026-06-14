// Repository ports. Two implementations exist: in-memory (tests/local) and
// Postgres (Drizzle). Services depend only on these interfaces.

import type { GameState, HelpEdge } from '../domain/types.js';

export interface PlayerRecord {
  id: string;
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  appVersion?: string;
  createdAt: number;
  lifetimeSpendInr: number;
}

export interface PlayerRepo {
  getByDeviceId(deviceId: string): Promise<PlayerRecord | null>;
  getById(id: string): Promise<PlayerRecord | null>;
  create(rec: PlayerRecord): Promise<PlayerRecord>;
  addSpend(id: string, inr: number): Promise<void>;
}

export interface GameStateRepo {
  load(playerId: string): Promise<GameState | null>;
  save(state: GameState): Promise<void>;
}

export interface HelpEdgeRepo {
  /** All edges newer than `sinceTs` (bounded window for graph checks). */
  allSince(sinceTs: number): Promise<HelpEdge[]>;
  add(edge: HelpEdge): Promise<void>;
}

export interface SuspicionRecord {
  playerId: string;
  score: number;
  updatedAt: number;
}

export interface SuspicionRepo {
  get(playerId: string): Promise<SuspicionRecord | null>;
  set(rec: SuspicionRecord): Promise<void>;
}

export interface PurchaseRecord {
  transactionId: string;
  playerId: string;
  productId: string;
  platform: 'ios' | 'android';
  amountInr: number;
  verifiedAt: number;
}

export interface PurchaseRepo {
  exists(transactionId: string): Promise<boolean>;
  record(rec: PurchaseRecord): Promise<void>;
}

// ── teams ──────────────────────────────────────────────────────────────────────
export interface TeamRecord {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}

export interface TeamMemberRecord {
  teamId: string;
  playerId: string;
  joinedAt: number;
  contributed: number;
}

export interface TeamProjectRecord {
  teamId: string;
  kind: string;
  target: number;
  progress: number;
  milestonesHit: number[];
  startedAt: number;
}

export interface TeamRepo {
  create(team: TeamRecord): Promise<TeamRecord>;
  getById(id: string): Promise<TeamRecord | null>;
  getByMember(playerId: string): Promise<TeamRecord | null>;
  addMember(member: TeamMemberRecord): Promise<void>;
  removeMember(teamId: string, playerId: string): Promise<void>;
  members(teamId: string): Promise<TeamMemberRecord[]>;
  memberCount(teamId: string): Promise<number>;
  addContribution(teamId: string, playerId: string, amount: number): Promise<void>;
  getProject(teamId: string): Promise<TeamProjectRecord | null>;
  saveProject(project: TeamProjectRecord): Promise<void>;
  list(limit: number): Promise<Array<TeamRecord & { memberCount: number }>>;
}

/** Everything a service needs, bundled. Assembled by the composition root. */
export interface Repositories {
  players: PlayerRepo;
  gameStates: GameStateRepo;
  helpEdges: HelpEdgeRepo;
  suspicion: SuspicionRepo;
  purchases: PurchaseRepo;
  teams: TeamRepo;
}
