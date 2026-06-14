// Entitlements (GDD §13): Boost Sub (+coins, daily spins) and Season Pass. Pure
// helpers over GameState; timestamps are epoch-ms.

import { BALANCE } from '@bloom/shared';
import type { GameState } from './types.js';

const DAY = 24 * 60 * 60 * 1000;

export function boostActive(s: GameState, now: number): boolean {
  return s.boostUntil > now;
}
export function passActive(s: GameState, now: number): boolean {
  return s.passUntil > now;
}

/** Coin multiplier from an active Boost subscription (1.0 if inactive). */
export function coinBoostMult(s: GameState, now: number): number {
  return boostActive(s, now) ? 1 + BALANCE.iap.boostSub.coinBonusPct / 100 : 1;
}

export function grantBoost(s: GameState, now: number): void {
  const base = Math.max(now, s.boostUntil); // stack/extend if already active
  s.boostUntil = base + BALANCE.iap.boostSub.durationDays * DAY;
}
export function grantPass(s: GameState, now: number): void {
  const base = Math.max(now, s.passUntil);
  s.passUntil = base + BALANCE.iap.seasonPass.durationDays * DAY;
}

/** Grant the daily free spins if a day has elapsed. Returns spins granted (0 if not due). */
export function claimDailyFreeSpins(s: GameState, now: number): number {
  if (now - s.lastDailyAt < DAY) return 0;
  s.lastDailyAt = now;
  // boost subscribers get a richer daily (×1.5, rounded)
  const granted = boostActive(s, now)
    ? Math.round(BALANCE.session.dailyFreeSpins * 1.5)
    : BALANCE.session.dailyFreeSpins;
  s.spins += granted;
  return granted;
}
