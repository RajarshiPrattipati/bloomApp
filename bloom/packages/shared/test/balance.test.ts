import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  baseCoin,
  buildingCost,
  clampMomentum,
  dropTableTotalWeight,
  goldenHourBenefit,
  helpEffectFactor,
  publicConfig,
  ViewSchema,
  WalletSchema,
} from '../src/index.js';

describe('balance economy', () => {
  it('drop table weights sum to exactly 100', () => {
    expect(dropTableTotalWeight()).toBe(100);
  });

  it('coin curve grows linearly with level', () => {
    expect(baseCoin(1)).toBe(62);
    expect(baseCoin(10)).toBe(170);
    expect(baseCoin(2) - baseCoin(1)).toBe(BALANCE.coin.perLevel);
  });

  it('building cost grows faster than coin rewards (inflation control)', () => {
    const c1 = buildingCost(1, 0);
    const c10 = buildingCost(10, 0);
    const coinGrowth = baseCoin(10) / baseCoin(1);
    const costGrowth = c10 / c1;
    expect(costGrowth).toBeGreaterThan(coinGrowth);
  });

  it('golden hour benefit is monotonic and capped at 20%', () => {
    let prev = 0;
    for (let h = 0; h <= 10; h++) {
      const b = goldenHourBenefit(h);
      expect(b).toBeGreaterThanOrEqual(prev);
      expect(b).toBeLessThanOrEqual(BALANCE.goldenHour.benefitCapPct + 1e-9);
      prev = b;
    }
  });

  it('help effectiveness diminishes per GDD tiers', () => {
    expect(helpEffectFactor(1)).toBe(1.0);
    expect(helpEffectFactor(3)).toBe(1.0);
    expect(helpEffectFactor(4)).toBe(0.6);
    expect(helpEffectFactor(7)).toBe(0.3);
    expect(helpEffectFactor(99)).toBe(0);
  });

  it('momentum clamps to [min,max]', () => {
    expect(clampMomentum(0.2)).toBe(BALANCE.momentum.min);
    expect(clampMomentum(9)).toBe(BALANCE.momentum.max);
    expect(clampMomentum(2.1)).toBeCloseTo(2.1);
  });
});

describe('publicConfig safety', () => {
  it('never leaks server-only fields', () => {
    const json = JSON.stringify(publicConfig());
    expect(json).not.toContain('rngSalt');
    expect(json).not.toContain('antiCheat');
    expect(json).not.toContain('trustOffsets');
  });
});

describe('schemas', () => {
  it('accepts a valid wallet and rejects a bad one', () => {
    const ok = WalletSchema.safeParse({
      coins: 100, spins: 10, helpTokens: 2, rareCards: 0,
      buildBoost: false, level: 3, helpXp: 5, momentum: 1.6,
      boostActive: false, passActive: false,
    });
    expect(ok.success).toBe(true);
    const bad = WalletSchema.safeParse({ coins: -1 });
    expect(bad.success).toBe(false);
  });

  it('validates a full View round-trip', () => {
    const view = {
      wallet: { coins: 0, spins: 50, helpTokens: 0, rareCards: 0, buildBoost: false, level: 1, helpXp: 0, momentum: 1, boostActive: false, passActive: false },
      village: { buildingsBuilt: 0, slotsPerVillage: 6, currentIndex: 0, constructing: false },
      goldenHour: null,
      strangerPool: [],
      nextBuildCost: 290,
      canBuild: true,
      events: [{ type: 'momentum_warning', momentum: 1.4 }],
    };
    expect(ViewSchema.safeParse(view).success).toBe(true);
  });
});
