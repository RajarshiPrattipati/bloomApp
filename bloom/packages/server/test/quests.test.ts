import { describe, expect, it } from 'vitest';
import { QUESTS, claimQuests, questStatus, recordQuestEvent } from '../src/domain/quests.js';
import { createGameState } from '../src/domain/types.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY + 5000; // some day, mid-day

function fresh() {
  return createGameState('p', NOW, 0, 0, 1);
}

describe('daily quests', () => {
  it('accrues progress per action type and caps at the target', () => {
    const s = fresh();
    for (let i = 0; i < 30; i++) recordQuestEvent(s, 'spin', NOW);
    const spin = questStatus(s, NOW).find((q) => q.id === 'spin25')!;
    expect(spin.progress).toBe(25); // capped at target
    expect(spin.complete).toBe(true);
    const help = questStatus(s, NOW).find((q) => q.id === 'help3')!;
    expect(help.progress).toBe(0);
  });

  it('claims completed quests once and grants the rewards', () => {
    const s = fresh();
    recordQuestEvent(s, 'build', NOW); // completes build1 (target 1)
    const before = { spins: s.spins, coins: s.coins };
    const r1 = claimQuests(s, NOW);
    expect(r1.claimed).toContain('build1');
    expect(s.coins).toBe(before.coins + 300);
    // re-claim grants nothing
    const r2 = claimQuests(s, NOW);
    expect(r2.claimed).toHaveLength(0);
    expect(s.spins).toBe(before.spins); // build1 reward was coins only
  });

  it('does not claim an incomplete quest', () => {
    const s = fresh();
    recordQuestEvent(s, 'help', NOW); // 1 of 3
    const r = claimQuests(s, NOW);
    expect(r.claimed).not.toContain('help3');
  });

  it('resets progress and claims when the day rolls over', () => {
    const s = fresh();
    recordQuestEvent(s, 'build', NOW);
    claimQuests(s, NOW);
    expect(questStatus(s, NOW).find((q) => q.id === 'build1')!.claimed).toBe(true);

    // next day → fresh set
    const tomorrow = NOW + DAY;
    const status = questStatus(s, tomorrow);
    const build = status.find((q) => q.id === 'build1')!;
    expect(build.progress).toBe(0);
    expect(build.claimed).toBe(false);
  });

  it('exposes a stable quest set', () => {
    expect(QUESTS.map((q) => q.id)).toEqual(['spin25', 'help3', 'build1', 'team1']);
  });
});
