// In-memory session + world state. No DB at the gate (PRD TR-2). One process,
// one Map. Everything advances LAZILY from timestamps on each request (see
// world.ts) so the simulation is deterministic and trivially testable.

import { BALANCE } from './balance.js';

export interface GoldenHour {
  buildingIndex: number;
  level: number;
  costPaid: number;
  openedAt: number;
  durationMs: number;
  joinTimes: number[]; // precomputed helper arrival times (deterministic)
  helpersShown: number; // how many we've already emitted events for
  milestonesHit: number[];
}

export interface PendingThankYou {
  dueAt: number;
  fromBot: string;
  spins: number;
}

// Events queued for the client (toasts/animations). Drained on each sync/spin.
export interface WorldEvent {
  type:
    | 'helper_joined'
    | 'gh_milestone'
    | 'gh_closed'
    | 'help_given'
    | 'thank_you'
    | 'momentum_warning';
  [k: string]: unknown;
}

export interface SessionState {
  sessionId: string;
  createdAt: number;
  spinCount: number;

  // wallet
  coins: number;
  spins: number;
  helpTokens: number;
  rareCards: number;
  buildBoost: boolean;
  level: number;

  // momentum (decays over real time — see world.applyMomentumDecay)
  momentum: number;
  momentumAt: number;
  momentumPeak: number; // highest since last warning, for decay-warning logic
  warnedHot: boolean;

  // village / building
  buildingsBuilt: number; // total buildings completed
  constructing: boolean; // a Golden Hour is open on the current build

  // golden hour + social
  gh: GoldenHour | null;
  helpXP: number;
  helpedWindows: Set<string>; // botId:windowIndex already helped (anti double-help)
  pendingThankYous: PendingThankYou[];

  // client outbox
  outbox: WorldEvent[];
  lastSyncAt: number;
}

const sessions = new Map<string, SessionState>();

export function getOrCreateSession(sessionId: string): SessionState {
  let s = sessions.get(sessionId);
  if (!s) {
    const now = Date.now();
    s = {
      sessionId,
      createdAt: now,
      spinCount: 0,
      coins: BALANCE.session.startingCoins,
      spins: BALANCE.session.startingSpins,
      helpTokens: 0,
      rareCards: 0,
      buildBoost: false,
      level: BALANCE.session.startingLevel,
      momentum: BALANCE.momentum.min,
      momentumAt: now,
      momentumPeak: BALANCE.momentum.min,
      warnedHot: false,
      buildingsBuilt: 0,
      constructing: false,
      gh: null,
      helpXP: 0,
      helpedWindows: new Set(),
      pendingThankYous: [],
      outbox: [],
      lastSyncAt: now,
    };
    sessions.set(sessionId, s);
  }
  return s;
}

export function clampMomentum(v: number): number {
  return Math.max(BALANCE.momentum.min, Math.min(BALANCE.momentum.max, v));
}

// Current building index within the active village (0..slots-1).
export function currentBuildingIndex(s: SessionState): number {
  return s.buildingsBuilt % BALANCE.building.slotsPerVillage;
}

// Public wallet + world snapshot returned to the client.
export function snapshot(s: SessionState) {
  return {
    wallet: {
      coins: s.coins,
      spins: s.spins,
      helpTokens: s.helpTokens,
      rareCards: s.rareCards,
      buildBoost: s.buildBoost,
      level: s.level,
      helpXP: s.helpXP,
      momentum: Math.round(s.momentum * 100) / 100,
    },
    village: {
      buildingsBuilt: s.buildingsBuilt,
      slotsPerVillage: BALANCE.building.slotsPerVillage,
      currentIndex: currentBuildingIndex(s),
      constructing: s.constructing,
    },
    goldenHour: s.gh
      ? {
          buildingIndex: s.gh.buildingIndex,
          msLeft: Math.max(0, s.gh.openedAt + s.gh.durationMs - Date.now()),
          durationMs: s.gh.durationMs,
          helpers: s.gh.helpersShown,
          maxHelpers: BALANCE.goldenHour.maxHelpers,
        }
      : null,
  };
}
