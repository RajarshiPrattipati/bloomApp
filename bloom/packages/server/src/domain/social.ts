// Social layer (GDD §8). Two parts:
//  1) Stranger pool + helping (cold-start, positive-sum) — deterministic from now.
//  2) Help-graph anti-abuse for REAL player↔player help: per-user/day & mutual/week
//     caps + cycle detection (GDD §16 Rule 3). Pure functions over HelpEdge[].

import { BALANCE } from '@bloom/shared';
import { fireMilestones, ghEffectiveHelpers } from './goldenHour.js';
import { gainMomentum } from './momentum.js';
import { mulberry32, seedFrom } from './rng.js';
import { round2, type GameState, type HelpEdge } from './types.js';

const BOT_NAMES = [
  'Priya', 'Arjun', 'Meera', 'Rohan', 'Anaya', 'Kabir',
  'Diya', 'Vihaan', 'Sara', 'Ishaan', 'Zoya', 'Aarav',
];
const BOT_BUILDINGS = ['Festival Hall', 'Lotus Well', 'Golden Bridge', 'Spice Market', 'Bell Tower', 'Tea House'];

export interface StrangerWindow {
  botId: number;
  windowIndex: number;
  name: string;
  building: string;
  progress: number;
  msLeft: number;
}

function windowFor(botId: number, now: number): StrangerWindow | null {
  const { ghPeriodMs, ghOpenMs } = BALANCE.bots;
  const offset = (botId * 7919) % ghPeriodMs;
  const phase = (now + offset) % ghPeriodMs;
  if (phase >= ghOpenMs) return null;
  return {
    botId,
    windowIndex: Math.floor((now + offset) / ghPeriodMs),
    name: BOT_NAMES[botId % BOT_NAMES.length]!,
    building: BOT_BUILDINGS[botId % BOT_BUILDINGS.length]!,
    progress: phase / ghOpenMs,
    msLeft: ghOpenMs - phase,
  };
}

/** Live bot Golden Hours the player can help right now (most-urgent first). */
export function strangerPool(now: number): StrangerWindow[] {
  const open: StrangerWindow[] = [];
  for (let i = 0; i < BALANCE.bots.poolSize; i++) {
    const w = windowFor(i, now);
    if (w) open.push(w);
  }
  open.sort((a, b) => a.msLeft - b.msLeft);
  return open.slice(0, BALANCE.bots.surfaceCount);
}

export interface HelpOutcome {
  ok: boolean;
  reason?: string;
  coins?: number;
  momentum?: number;
}

/** Player helps a bot's Golden Hour: positive-sum, anti-farm via per-window idempotency. */
export function helpBot(s: GameState, botId: number, now: number, salt: string): HelpOutcome {
  const w = windowFor(botId, now);
  if (!w) return { ok: false, reason: 'help_window_closed' };

  const key = `${botId}:${w.windowIndex}`;
  if (s.helpedWindows.has(key)) return { ok: false, reason: 'already_helped' };
  s.helpedWindows.add(key);

  if (s.helpTokens >= BALANCE.help.tokenCost) s.helpTokens -= BALANCE.help.tokenCost;

  gainMomentum(s, BALANCE.momentum.helpGain, now);
  s.helpXp += BALANCE.help.helperGainXp;

  const rng = mulberry32(seedFrom(salt, 'helpreward', s.playerId, botId, w.windowIndex));
  const span = BALANCE.help.rewardCoinsMax - BALANCE.help.rewardCoinsMin;
  const reward = Math.round(BALANCE.help.rewardCoinsMin + rng() * span);
  s.coins += reward;

  s.pendingThankYous.push({ dueAt: now + 5000, fromBot: w.name, spins: BALANCE.help.thankYouSpins });
  s.outbox.push({ type: 'help_given', name: w.name, coins: reward, momentum: round2(s.momentum) });
  return { ok: true, coins: reward, momentum: round2(s.momentum) };
}

/** Deliver any gratitude (Thank-You boosts) that have come due. */
export function deliverThankYous(s: GameState, now: number): void {
  if (!s.pendingThankYous.length) return;
  const due = s.pendingThankYous.filter((p) => p.dueAt <= now);
  if (!due.length) return;
  s.pendingThankYous = s.pendingThankYous.filter((p) => p.dueAt > now);
  for (const p of due) {
    s.spins += p.spins;
    s.outbox.push({ type: 'thank_you', fromBot: p.fromBot, spins: p.spins });
  }
}

// ── Help graph (real player↔player) — anti-abuse, GDD §16 Rule 3 ─────────────────
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

export function helpsFromUserSince(edges: HelpEdge[], from: string, to: string, since: number): number {
  return edges.filter((e) => e.from === from && e.to === to && e.ts >= since).length;
}

export function mutualHelpsSince(edges: HelpEdge[], a: string, b: string, since: number): number {
  return edges.filter(
    (e) => e.ts >= since && ((e.from === a && e.to === b) || (e.from === b && e.to === a)),
  ).length;
}

/** Would adding from→to create a cycle within maxDepth hops? (A→B→A, A→B→C→A) */
export function wouldCreateCycle(edges: HelpEdge[], from: string, to: string, maxDepth: number): boolean {
  // BFS from `to` following existing edges; if we can reach `from` within maxDepth-1
  // hops, the new edge from→to closes a cycle of length ≤ maxDepth.
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    adj.get(e.from)!.add(e.to);
  }
  let frontier = new Set<string>([to]);
  const seen = new Set<string>([to]);
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = new Set<string>();
    for (const node of frontier) {
      for (const nb of adj.get(node) ?? []) {
        if (nb === from) return true;
        if (!seen.has(nb)) { seen.add(nb); next.add(nb); }
      }
    }
    frontier = next;
    if (!frontier.size) break;
  }
  return false;
}

// ── real player→player help (positive-sum + graph-gated) ─────────────────────────
export interface HelpPlayerOutcome {
  ok: boolean;
  reason?: string;
  coins?: number;
  momentum?: number;
  edge?: HelpEdge; // the edge the service should persist on success
}

function friendName(playerId: string): string {
  return `Friend ${playerId.slice(0, 4)}`;
}

/**
 * Helper helps a target player's active Golden Hour. Mutates both states; the
 * caller persists them and records the returned edge. Graph caps + cycle
 * detection are enforced via `edges` (recent help edges).
 */
export function helpPlayer(helper: GameState, target: GameState, now: number, edges: HelpEdge[]): HelpPlayerOutcome {
  if (helper.playerId === target.playerId) return { ok: false, reason: 'self_help' };
  if (!target.gh || !target.constructing) return { ok: false, reason: 'help_window_closed' };
  if (target.gh.realHelperIds.includes(helper.playerId)) return { ok: false, reason: 'already_helped' };
  if (ghEffectiveHelpers(target.gh) >= BALANCE.goldenHour.maxHelpers) return { ok: false, reason: 'help_window_closed' };

  const gate = canHelpPlayer(edges, helper.playerId, target.playerId, now);
  if (!gate.allowed) return { ok: false, reason: gate.reason };

  // benefit to the TARGET's Golden Hour
  target.gh.realHelperIds.push(helper.playerId);
  target.outbox.push({ type: 'helper_joined', name: friendName(helper.playerId), helpers: ghEffectiveHelpers(target.gh) });
  fireMilestones(target, target.gh);

  // rewards to the HELPER (GDD §8.3)
  if (helper.helpTokens >= BALANCE.help.tokenCost) helper.helpTokens -= BALANCE.help.tokenCost;
  gainMomentum(helper, BALANCE.momentum.helpGain, now);
  helper.helpXp += BALANCE.help.helperGainXp;
  const reward = Math.round((BALANCE.help.rewardCoinsMin + BALANCE.help.rewardCoinsMax) / 2);
  helper.coins += reward;

  // reciprocity: the target sends the helper a real Thank-You boost
  helper.pendingThankYous.push({ dueAt: now + 5000, fromBot: friendName(target.playerId), spins: BALANCE.help.thankYouSpins });
  helper.outbox.push({ type: 'help_given', name: friendName(helper.playerId), coins: reward, momentum: round2(helper.momentum) });

  return { ok: true, coins: reward, momentum: round2(helper.momentum), edge: { from: helper.playerId, to: target.playerId, ts: now } };
}

export interface HelpGateResult {
  allowed: boolean;
  reason?: string;
}

/** Gate a real player→player help against the graph caps (does not mutate). */
export function canHelpPlayer(edges: HelpEdge[], from: string, to: string, now: number): HelpGateResult {
  if (from === to) return { allowed: false, reason: 'self_help' };
  if (helpsFromUserSince(edges, from, to, now - DAY) >= BALANCE.help.maxHelpFromSameUserPerDay) {
    return { allowed: false, reason: 'daily_limit' };
  }
  if (mutualHelpsSince(edges, from, to, now - WEEK) >= BALANCE.help.maxMutualHelpsPerWeek) {
    return { allowed: false, reason: 'mutual_limit' };
  }
  if (wouldCreateCycle(edges, from, to, BALANCE.help.maxHelpChainDepth)) {
    return { allowed: false, reason: 'cycle_blocked' };
  }
  return { allowed: true };
}
