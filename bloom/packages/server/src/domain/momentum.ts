// Momentum: the urgency engine (GDD §9). Decays in real time; helping and sparks
// push it up. Pure given (state, now). Emits a cooling warning when a hot meter
// crosses back below the hot threshold.

import { BALANCE, clampMomentum } from '@bloom/shared';
import { round2, type GameState } from './types.js';

export function applyMomentumDecay(s: GameState, now: number): void {
  const dt = (now - s.momentumAt) / 1000;
  if (dt <= 0) return;
  const before = s.momentum;
  s.momentum = clampMomentum(s.momentum - dt * BALANCE.momentum.decayPerSec);
  s.momentumAt = now;

  const hot = BALANCE.momentum.hotThreshold;
  if (!s.warnedHot && s.momentumPeak >= hot && before > hot && s.momentum <= hot) {
    s.warnedHot = true;
    s.outbox.push({ type: 'momentum_warning', momentum: round2(s.momentum) });
  }
}

export function gainMomentum(s: GameState, amount: number, now: number): void {
  applyMomentumDecay(s, now);
  s.momentum = clampMomentum(s.momentum + amount);
  s.momentumAt = now;
  if (s.momentum > s.momentumPeak) s.momentumPeak = s.momentum;
  if (s.momentum >= BALANCE.momentum.hotThreshold) s.warnedHot = false; // re-arm
}
