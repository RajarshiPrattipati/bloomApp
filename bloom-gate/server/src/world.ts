// ─────────────────────────────────────────────────────────────────────────────
// world.ts — the simulation. Everything is advanced LAZILY from timestamps on
// each request: momentum decay, Golden Hour helpers, milestones, GH close,
// thank-you delivery, and the bot stranger pool. Deterministic & testable.
// ─────────────────────────────────────────────────────────────────────────────

import {
  BALANCE,
  buildingCost,
  goldenHourBenefit,
} from './balance.js';
import { hashSeed, mulberry32 } from './rng.js';
import {
  clampMomentum,
  currentBuildingIndex,
  type SessionState,
} from './state.js';

// ── momentum ────────────────────────────────────────────────────────────────
export function applyMomentumDecay(s: SessionState, now: number) {
  const dt = (now - s.momentumAt) / 1000;
  if (dt <= 0) return;
  const before = s.momentum;
  s.momentum = clampMomentum(s.momentum - dt * BALANCE.momentum.decayPerSec);
  s.momentumAt = now;

  // decay-warning: meter was hot, has now cooled meaningfully, not yet warned.
  const hot = BALANCE.momentum.hotThreshold;
  if (
    !s.warnedHot &&
    s.momentumPeak >= hot &&
    before > hot &&
    s.momentum <= hot
  ) {
    s.warnedHot = true;
    s.outbox.push({ type: 'momentum_warning', momentum: round2(s.momentum) });
  }
}

export function gainMomentum(s: SessionState, amount: number, now: number) {
  applyMomentumDecay(s, now);
  s.momentum = clampMomentum(s.momentum + amount);
  s.momentumAt = now;
  if (s.momentum > s.momentumPeak) s.momentumPeak = s.momentum;
  if (s.momentum >= BALANCE.momentum.hotThreshold) s.warnedHot = false; // re-arm
}

// ── golden hour ───────────────────────────────────────────────────────────────
function precomputeJoinTimes(s: SessionState, openedAt: number): number[] {
  const seed = hashSeed(s.sessionId, 'gh', s.buildingsBuilt);
  const rng = mulberry32(seed);
  const { helperCadenceMinMs: lo, helperCadenceMaxMs: hi, maxHelpers } = BALANCE.goldenHour;
  const times: number[] = [];
  let t = openedAt;
  for (let i = 0; i < maxHelpers; i++) {
    t += lo + rng() * (hi - lo);
    times.push(t);
  }
  return times;
}

export function buildAction(s: SessionState, now: number): { ok: boolean; reason?: string } {
  applyMomentumDecay(s, now);
  if (s.constructing || s.gh) return { ok: false, reason: 'already building' };

  const index = currentBuildingIndex(s);
  let cost = buildingCost(s.level, index);
  if (s.buildBoost) {
    cost = Math.round(cost * (1 - BALANCE.building.boostDiscountPct));
    s.buildBoost = false;
  }
  if (s.coins < cost) return { ok: false, reason: 'not enough coins' };

  s.coins -= cost;
  s.constructing = true;
  s.gh = {
    buildingIndex: index,
    level: s.level,
    costPaid: cost,
    openedAt: now,
    durationMs: BALANCE.goldenHour.durationMs,
    joinTimes: precomputeJoinTimes(s, now),
    helpersShown: 0,
    milestonesHit: [],
  };
  return { ok: true };
}

function advanceGoldenHour(s: SessionState, now: number) {
  const gh = s.gh;
  if (!gh) return;

  // how many helpers have arrived by now (capped)
  const arrived = Math.min(
    BALANCE.goldenHour.maxHelpers,
    gh.joinTimes.filter((t) => t <= now).length,
  );
  while (gh.helpersShown < arrived) {
    gh.helpersShown++;
    const name = botName(s, gh.helpersShown);
    s.outbox.push({ type: 'helper_joined', name, helpers: gh.helpersShown });
    if ((BALANCE.goldenHour.milestones as readonly number[]).includes(gh.helpersShown)) {
      gh.milestonesHit.push(gh.helpersShown);
      s.spins += BALANCE.goldenHour.milestoneSpins;
      s.coins += BALANCE.goldenHour.milestoneCoins;
      s.outbox.push({
        type: 'gh_milestone',
        helpers: gh.helpersShown,
        spins: BALANCE.goldenHour.milestoneSpins,
        coins: BALANCE.goldenHour.milestoneCoins,
      });
    }
  }

  // close?
  if (now >= gh.openedAt + gh.durationMs) {
    const benefit = goldenHourBenefit(gh.helpersShown);
    const refund = Math.round(gh.costPaid * benefit);
    s.coins += refund;
    s.buildingsBuilt++;
    s.level++; // each completed building bumps the level (cost curve climbs)
    s.constructing = false;
    s.outbox.push({
      type: 'gh_closed',
      helpers: gh.helpersShown,
      benefitPct: Math.round(benefit * 100),
      refund,
      buildingsBuilt: s.buildingsBuilt,
    });
    s.gh = null;
  }
}

function botName(s: SessionState, n: number): string {
  const names = BALANCE.bots.names;
  const seed = hashSeed(s.sessionId, 'helper', s.buildingsBuilt, n);
  return names[seed % names.length];
}

// ── thank-you delivery ────────────────────────────────────────────────────────
function deliverThankYous(s: SessionState, now: number) {
  if (!s.pendingThankYous.length) return;
  const due = s.pendingThankYous.filter((p) => p.dueAt <= now);
  if (!due.length) return;
  s.pendingThankYous = s.pendingThankYous.filter((p) => p.dueAt > now);
  for (const p of due) {
    s.spins += p.spins;
    s.outbox.push({ type: 'thank_you', fromBot: p.fromBot, spins: p.spins });
  }
}

// ── bot stranger pool (global, deterministic from `now`) ──────────────────────
export interface StrangerWindow {
  botId: number;
  windowIndex: number;
  name: string;
  building: string;
  progress: number; // 0..1
  msLeft: number;
}

export function strangerPool(now: number): StrangerWindow[] {
  const { poolSize, ghPeriodMs, ghOpenMs, surfaceCount, names, buildings } = BALANCE.bots;
  const open: StrangerWindow[] = [];
  for (let i = 0; i < poolSize; i++) {
    const offset = (i * 7919) % ghPeriodMs;
    const phase = (now + offset) % ghPeriodMs;
    if (phase < ghOpenMs) {
      open.push({
        botId: i,
        windowIndex: Math.floor((now + offset) / ghPeriodMs),
        name: names[i % names.length],
        building: buildings[i % buildings.length],
        progress: phase / ghOpenMs,
        msLeft: ghOpenMs - phase,
      });
    }
  }
  // most-urgent first, surface a few
  open.sort((a, b) => a.msLeft - b.msLeft);
  return open.slice(0, surfaceCount);
}

export function helpBot(
  s: SessionState,
  botId: number,
  now: number,
): { ok: boolean; reason?: string; coins?: number; momentum?: number } {
  const pool = strangerPool(now);
  const w = pool.find((p) => p.botId === botId) ?? recomputeWindow(botId, now);
  if (!w) return { ok: false, reason: 'window closed' };

  const key = `${botId}:${w.windowIndex}`;
  if (s.helpedWindows.has(key)) return { ok: false, reason: 'already helped' };
  s.helpedWindows.add(key);

  if (s.helpTokens >= BALANCE.bots.helpTokenCost) {
    s.helpTokens -= BALANCE.bots.helpTokenCost;
  } // at the gate, helping is allowed even with 0 tokens (we test the loop)

  // helper rewards (GDD §8.3)
  gainMomentum(s, BALANCE.momentum.helpGain, now);
  s.helpXP++;
  const seed = hashSeed(s.sessionId, 'helpreward', botId, w.windowIndex);
  const rng = mulberry32(seed);
  const span = BALANCE.bots.helpRewardCoinsMax - BALANCE.bots.helpRewardCoinsMin;
  const reward = Math.round(BALANCE.bots.helpRewardCoinsMin + rng() * span);
  s.coins += reward;

  // schedule gratitude
  s.pendingThankYous.push({
    dueAt: now + BALANCE.bots.thankYouDelayMs,
    fromBot: w.name,
    spins: BALANCE.bots.thankYouSpins,
  });

  s.outbox.push({ type: 'help_given', name: w.name, coins: reward, momentum: round2(s.momentum) });
  return { ok: true, coins: reward, momentum: round2(s.momentum) };
}

function recomputeWindow(botId: number, now: number): StrangerWindow | null {
  const { ghPeriodMs, ghOpenMs, names, buildings } = BALANCE.bots;
  const offset = (botId * 7919) % ghPeriodMs;
  const phase = (now + offset) % ghPeriodMs;
  if (phase >= ghOpenMs) return null;
  return {
    botId,
    windowIndex: Math.floor((now + offset) / ghPeriodMs),
    name: names[botId % names.length],
    building: buildings[botId % buildings.length],
    progress: phase / ghOpenMs,
    msLeft: ghOpenMs - phase,
  };
}

// ── the master tick: call at the start of every request ───────────────────────
export function advance(s: SessionState, now: number) {
  applyMomentumDecay(s, now);
  advanceGoldenHour(s, now);
  deliverThankYous(s, now);
}

export function drainOutbox(s: SessionState) {
  const out = s.outbox;
  s.outbox = [];
  return out;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
