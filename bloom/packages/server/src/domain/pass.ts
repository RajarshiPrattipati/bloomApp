// Season Pass reward track (GDD §13.2). XP is earned by PLAYING the core loop
// (so the pass deepens engagement, not bypasses it). Tiers unlock a free reward
// and — for pass holders — a premium reward. Pure functions over GameState.

import { BALANCE } from '@bloom/shared';
import { passActive } from './entitlements.js';
import type { GameState } from './types.js';

export interface PassReward {
  spins?: number;
  coins?: number;
  helpTokens?: number;
}

export type PassTrack = 'free' | 'premium';

/** Deterministic reward for a given 0-indexed tier on a track. */
export function rewardForTier(track: PassTrack, tier: number): PassReward {
  if (track === 'free') {
    if (tier % 5 === 4) return { helpTokens: 3 };
    if (tier % 3 === 2) return { coins: 200 };
    return { spins: 5 };
  }
  // premium track — richer, with a milestone bump every 5th tier
  if (tier % 5 === 4) return { spins: 20, coins: 500, helpTokens: 2 };
  return { spins: 15, coins: 300 };
}

export function addPassXp(s: GameState, amount: number): void {
  const max = BALANCE.pass.tiers * BALANCE.pass.xpPerTier;
  s.passXp = Math.min(max, s.passXp + amount);
}

/** Current unlocked tier (0..tiers). */
export function passTier(s: GameState): number {
  return Math.min(BALANCE.pass.tiers, Math.floor(s.passXp / BALANCE.pass.xpPerTier));
}

function applyReward(s: GameState, r: PassReward): void {
  if (r.spins) s.spins += r.spins;
  if (r.coins) s.coins += r.coins;
  if (r.helpTokens) s.helpTokens += r.helpTokens;
}

export interface PassClaimResult {
  claimedTiers: number;
  granted: PassReward;
}

/** Claim every unlocked-but-unclaimed tier (premium only if the pass is active). */
export function claimPass(s: GameState, now: number): PassClaimResult {
  const tier = passTier(s);
  const granted: Required<PassReward> = { spins: 0, coins: 0, helpTokens: 0 };
  let claimedTiers = 0;

  while (s.passClaimedFree < tier) {
    const r = rewardForTier('free', s.passClaimedFree);
    applyReward(s, r);
    granted.spins += r.spins ?? 0;
    granted.coins += r.coins ?? 0;
    granted.helpTokens += r.helpTokens ?? 0;
    s.passClaimedFree++;
    claimedTiers++;
  }

  if (passActive(s, now)) {
    while (s.passClaimedPremium < tier) {
      const r = rewardForTier('premium', s.passClaimedPremium);
      applyReward(s, r);
      granted.spins += r.spins ?? 0;
      granted.coins += r.coins ?? 0;
      granted.helpTokens += r.helpTokens ?? 0;
      s.passClaimedPremium++;
      claimedTiers++;
    }
  }

  return { claimedTiers, granted };
}

export interface PassStatus {
  tier: number;
  maxTier: number;
  xp: number;
  xpPerTier: number;
  xpIntoTier: number;
  active: boolean;
  claimableFree: number;
  claimablePremium: number;
}

export function passStatus(s: GameState, now: number): PassStatus {
  const tier = passTier(s);
  const active = passActive(s, now);
  return {
    tier,
    maxTier: BALANCE.pass.tiers,
    xp: s.passXp,
    xpPerTier: BALANCE.pass.xpPerTier,
    xpIntoTier: s.passXp % BALANCE.pass.xpPerTier,
    active,
    claimableFree: Math.max(0, tier - s.passClaimedFree),
    claimablePremium: active ? Math.max(0, tier - s.passClaimedPremium) : 0,
  };
}
