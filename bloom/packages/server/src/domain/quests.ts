// Daily Quests (GDD §14 retention). A small fixed set that resets each day;
// progress accrues from core-loop actions; completed quests grant rewards on
// claim. Pure functions over GameState.

import type { GameState } from './types.js';

const DAY = 24 * 60 * 60 * 1000;

export type QuestType = 'spin' | 'help' | 'build' | 'team_contribute';

export interface QuestReward {
  spins?: number;
  coins?: number;
  helpTokens?: number;
}

export interface QuestDef {
  id: string;
  label: string;
  type: QuestType;
  target: number;
  reward: QuestReward;
}

export const QUESTS: readonly QuestDef[] = [
  { id: 'spin25', label: 'Spin 25 times', type: 'spin', target: 25, reward: { coins: 500 } },
  { id: 'help3', label: 'Help 3 villages', type: 'help', target: 3, reward: { helpTokens: 5 } },
  { id: 'build1', label: 'Build a building', type: 'build', target: 1, reward: { coins: 300 } },
  { id: 'team1', label: 'Contribute to your team', type: 'team_contribute', target: 1, reward: { spins: 10 } },
];

function dayIndex(now: number): number {
  return Math.floor(now / DAY);
}

/** Reset the daily quest set if the day has rolled over. */
export function ensureQuestDay(s: GameState, now: number): void {
  const today = dayIndex(now);
  if (s.questDay !== today) {
    s.questDay = today;
    s.questProgress = {};
    s.questClaimed = [];
  }
}

/** Record progress for all quests of a given type. */
export function recordQuestEvent(s: GameState, type: QuestType, now: number, amount = 1): void {
  ensureQuestDay(s, now);
  for (const q of QUESTS) {
    if (q.type !== type) continue;
    s.questProgress[q.id] = Math.min(q.target, (s.questProgress[q.id] ?? 0) + amount);
  }
}

export interface QuestView {
  id: string;
  label: string;
  type: QuestType;
  progress: number;
  target: number;
  complete: boolean;
  claimed: boolean;
  reward: QuestReward;
}

export function questStatus(s: GameState, now: number): QuestView[] {
  ensureQuestDay(s, now);
  return QUESTS.map((q) => {
    const progress = s.questProgress[q.id] ?? 0;
    return {
      id: q.id,
      label: q.label,
      type: q.type,
      progress,
      target: q.target,
      complete: progress >= q.target,
      claimed: s.questClaimed.includes(q.id),
      reward: q.reward,
    };
  });
}

export interface QuestClaimResult {
  claimed: string[];
  granted: Required<QuestReward>;
}

export function claimQuests(s: GameState, now: number): QuestClaimResult {
  ensureQuestDay(s, now);
  const granted: Required<QuestReward> = { spins: 0, coins: 0, helpTokens: 0 };
  const claimed: string[] = [];
  for (const q of QUESTS) {
    if (s.questClaimed.includes(q.id)) continue;
    if ((s.questProgress[q.id] ?? 0) < q.target) continue;
    s.spins += q.reward.spins ?? 0;
    s.coins += q.reward.coins ?? 0;
    s.helpTokens += q.reward.helpTokens ?? 0;
    granted.spins += q.reward.spins ?? 0;
    granted.coins += q.reward.coins ?? 0;
    granted.helpTokens += q.reward.helpTokens ?? 0;
    s.questClaimed.push(q.id);
    claimed.push(q.id);
  }
  return { claimed, granted };
}
