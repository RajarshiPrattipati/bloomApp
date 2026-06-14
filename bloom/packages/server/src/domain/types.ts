// Domain state types. These are the in-memory gameplay representation the
// services operate on; adapters map them to/from persistence. Domain operations
// are deterministic given (state, now, rng) — no Date.now / Math.random inside.

import type { WorldEvent } from '@bloom/shared';

export interface GoldenHour {
  buildingIndex: number;
  level: number;
  costPaid: number;
  openedAt: number;
  durationMs: number;
  joinTimes: number[]; // precomputed deterministic bot-helper arrival times
  helpersShown: number; // bot helpers revealed so far
  realHelperIds: string[]; // real players who helped this Golden Hour
  milestonesHit: number[]; // milestone %s already rewarded
}

export interface PendingThankYou {
  dueAt: number;
  fromBot: string;
  spins: number;
}

/** Per-player gameplay state (mutable; mirrors the DB row set). */
export interface GameState {
  playerId: string;
  createdAt: number;
  spinCount: number;

  // wallet
  coins: number;
  spins: number;
  helpTokens: number;
  rareCards: number;
  buildBoost: boolean;
  level: number;

  // momentum (decays in real time)
  momentum: number;
  momentumAt: number;
  momentumPeak: number;
  warnedHot: boolean;

  // village
  buildingsBuilt: number;
  constructing: boolean;
  gh: GoldenHour | null;

  // social
  helpXp: number;
  helpedWindows: Set<string>;
  pendingThankYous: PendingThankYou[];

  // cards & sets
  cards: Record<string, number>; // cardId → count
  completedSets: string[];

  // entitlements (epoch-ms; 0 = inactive) + daily claim
  boostUntil: number;
  passUntil: number;
  lastDailyAt: number;

  // season pass reward track
  passXp: number;
  passClaimedFree: number; // # of free-track tiers already claimed
  passClaimedPremium: number;

  // daily quests
  questDay: number; // day index this quest set belongs to
  questProgress: Record<string, number>;
  questClaimed: string[];

  // event outbox (drained to the client each request)
  outbox: WorldEvent[];
}

export function createGameState(playerId: string, now: number, startSpins: number, startCoins: number, startLevel: number): GameState {
  return {
    playerId,
    createdAt: now,
    spinCount: 0,
    coins: startCoins,
    spins: startSpins,
    helpTokens: 0,
    rareCards: 0,
    buildBoost: false,
    level: startLevel,
    momentum: 1,
    momentumAt: now,
    momentumPeak: 1,
    warnedHot: false,
    buildingsBuilt: 0,
    constructing: false,
    gh: null,
    helpXp: 0,
    helpedWindows: new Set(),
    pendingThankYous: [],
    cards: {},
    completedSets: [],
    boostUntil: 0,
    passUntil: 0,
    lastDailyAt: 0,
    passXp: 0,
    passClaimedFree: 0,
    passClaimedPremium: 0,
    questDay: 0,
    questProgress: {},
    questClaimed: [],
    outbox: [],
  };
}

/** A directed help edge between real players (for the help graph / anti-cheat). */
export interface HelpEdge {
  from: string;
  to: string;
  ts: number;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── persistence serde (Set ⇄ array; outbox is transient, never persisted) ──────
export type GameStateJSON = Omit<GameState, 'helpedWindows' | 'outbox'> & {
  helpedWindows: string[];
};

export function gameStateToJSON(s: GameState): GameStateJSON {
  const { helpedWindows, outbox: _outbox, ...rest } = s;
  return { ...rest, helpedWindows: [...helpedWindows] };
}

export function gameStateFromJSON(j: GameStateJSON): GameState {
  return {
    ...j,
    helpedWindows: new Set(j.helpedWindows),
    // defaults keep older persisted rows forward-compatible
    cards: j.cards ?? {},
    completedSets: j.completedSets ?? [],
    boostUntil: j.boostUntil ?? 0,
    passUntil: j.passUntil ?? 0,
    lastDailyAt: j.lastDailyAt ?? 0,
    passXp: j.passXp ?? 0,
    passClaimedFree: j.passClaimedFree ?? 0,
    passClaimedPremium: j.passClaimedPremium ?? 0,
    questDay: j.questDay ?? 0,
    questProgress: j.questProgress ?? {},
    questClaimed: j.questClaimed ?? [],
    outbox: [],
  };
}
