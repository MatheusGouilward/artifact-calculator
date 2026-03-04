import { describe, expect, it } from "vitest";

import type { AttackKind, DamageType } from "./types";
import { computeSuggestionRankings, type DamageSetup } from "./suggestions";

function makeSetup(overrides: Partial<DamageSetup["combatTotals"]> = {}): DamageSetup {
  return {
    mode: "manual",
    label: "Setup A",
    characterId: 10000002,
    talentLevels: {
      normal: 6,
      skill: 6,
      burst: 6,
    },
    combatTotals: {
      hp: 12000,
      atk: 1000,
      def: 700,
      em: 0,
      erPct: 100,
      critRatePct: 20,
      critDmgPct: 300,
      dmgBonusPhysicalPct: 0,
      dmgBonusByElementPct: {
        physical: 0,
        pyro: 0,
        hydro: 0,
        electro: 0,
        cryo: 0,
        dendro: 0,
        anemo: 0,
        geo: 0,
      },
      ...overrides,
    },
    damageTypeOverride: "physical",
  };
}

function mockMetricEvaluator(
  setup: DamageSetup,
  context: { sectionFilter: AttackKind[]; includeCrit: boolean; enemy?: { baseResPctPoints?: number } },
) {
  const sectionCount = Math.max(1, context.sectionFilter.length);
  const critRate = context.includeCrit ? Math.max(0, Math.min(1, setup.combatTotals.critRatePct / 100)) : 0;
  const critDmg = Math.max(0, setup.combatTotals.critDmgPct / 100);
  const dmgBonus = setup.damageTypeOverride === "physical"
    ? setup.combatTotals.dmgBonusPhysicalPct / 100
    : setup.combatTotals.dmgBonusByElementPct[(setup.damageTypeOverride ?? "physical") as DamageType] / 100;
  const resistancePct = context.enemy?.baseResPctPoints ?? 10;
  const resistanceMult = 1 - resistancePct / 100;
  const base = setup.combatTotals.atk * (1 + dmgBonus);
  const metric = base * (1 + critRate * critDmg) * sectionCount * resistanceMult;
  return {
    metric,
    notes: ["mock_metric"],
    effectiveDamageType: (setup.damageTypeOverride ?? "physical") as DamageType,
  };
}

describe("computeSuggestionRankings", () => {
  it("ranks crit rate above crit dmg when crit dmg is very high", () => {
    const setup = makeSetup({
      critRatePct: 20,
      critDmgPct: 300,
      atk: 900,
      dmgBonusPhysicalPct: 0,
    });

    const results = computeSuggestionRankings(setup, {
      topN: 6,
      evaluateMetric: mockMetricEvaluator,
    });

    const critRateIndex = results.findIndex((entry) => entry.suggestionId === "critRate5Pct");
    const critDmgIndex = results.findIndex((entry) => entry.suggestionId === "critDmg10Pct");
    expect(critRateIndex).toBeGreaterThanOrEqual(0);
    expect(critDmgIndex).toBeGreaterThanOrEqual(0);
    expect(critRateIndex).toBeLessThan(critDmgIndex);
  });

  it("clamps crit rate to 100 and records a clamp note", () => {
    const setup = makeSetup({
      critRatePct: 99,
      critDmgPct: 100,
      atk: 1000,
    });

    const results = computeSuggestionRankings(setup, {
      topN: 6,
      evaluateMetric: mockMetricEvaluator,
    });
    const critRateResult = results.find((entry) => entry.suggestionId === "critRate5Pct");

    expect(critRateResult).toBeDefined();
    expect(critRateResult?.notes).toContain("crit_rate_clamped");
    expect((critRateResult?.deltaPct ?? 0) < 2).toBe(true);
  });

  it("keeps rankings valid while higher enemy resistance lowers absolute gains", () => {
    const setup = makeSetup({
      critRatePct: 60,
      critDmgPct: 120,
      atk: 1100,
      dmgBonusPhysicalPct: 20,
    });

    const lowResistance = computeSuggestionRankings(setup, {
      topN: 5,
      enemy: {
        level: 90,
        baseResPctPoints: 10,
        damageType: "physical",
      },
      evaluateMetric: mockMetricEvaluator,
    });
    const highResistance = computeSuggestionRankings(setup, {
      topN: 5,
      enemy: {
        level: 90,
        baseResPctPoints: 80,
        damageType: "physical",
      },
      evaluateMetric: mockMetricEvaluator,
    });

    expect(lowResistance.length).toBeGreaterThan(0);
    expect(highResistance.length).toBeGreaterThan(0);
    expect(highResistance[0]?.avgBefore ?? 0).toBeLessThan(lowResistance[0]?.avgBefore ?? 0);
    expect(highResistance[0]?.deltaAbs ?? 0).toBeLessThan(lowResistance[0]?.deltaAbs ?? 0);
  });
});
