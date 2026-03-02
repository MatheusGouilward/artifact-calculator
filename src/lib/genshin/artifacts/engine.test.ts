import { describe, expect, it } from "vitest";

import { dpWeightedDrawMasks } from "./dp";
import {
  availableSubStats,
  binomialTailAtLeast,
  probFinal4SubsSatisfyRule,
  probPerAttempt,
  probSuccessPerAttempt,
  probUpgradeGivenCandidate,
} from "./engine";
import { MainStat, Slot, SubStat } from "./types";

describe("dpWeightedDrawMasks", () => {
  it("sums to 1 for a standard weighted draw without replacement", () => {
    const result = dpWeightedDrawMasks([1, 2, 3, 4], 2);
    const total = Array.from(result.values()).reduce((sum, p) => sum + p, 0);

    expect(total).toBeCloseTo(1, 12);
  });

  it("handles zero-weight entries deterministically", () => {
    const result = dpWeightedDrawMasks([1, 0, 1], 2);
    const total = Array.from(result.values()).reduce((sum, p) => sum + p, 0);

    expect(total).toBeCloseTo(1, 12);
    expect(result.size).toBe(1);
  });
});

describe("availableSubStats", () => {
  it("excludes the substat equivalent of the main stat", () => {
    const fromFlatHpMain = availableSubStats(MainStat.FlatHp);
    const fromHpPercentMain = availableSubStats(MainStat.HpPercent);
    const fromPyroMain = availableSubStats(MainStat.PyroDmgBonus);

    expect(fromFlatHpMain.subs).not.toContain(SubStat.FlatHp);
    expect(fromHpPercentMain.subs).not.toContain(SubStat.HpPercent);
    expect(fromPyroMain.subs.length).toBe(10);
  });
});

describe("probFinal4SubsSatisfyRule", () => {
  it("returns 0 when the requirement is impossible", () => {
    const impossible = probFinal4SubsSatisfyRule(
      [SubStat.FlatHp],
      MainStat.FlatHp,
      { mode: "all" },
    );

    expect(impossible).toBe(0);
  });

  it("stays in [0,1] and is monotonic with stricter requirements", () => {
    const pOneRequired = probFinal4SubsSatisfyRule([SubStat.CritRate], MainStat.AtkPercent, {
      mode: "all",
    });
    const pTwoRequired = probFinal4SubsSatisfyRule(
      [SubStat.CritRate, SubStat.CritDmg],
      MainStat.AtkPercent,
      { mode: "all" },
    );

    expect(pOneRequired).toBeGreaterThanOrEqual(0);
    expect(pOneRequired).toBeLessThanOrEqual(1);
    expect(pTwoRequired).toBeGreaterThanOrEqual(0);
    expect(pTwoRequired).toBeLessThanOrEqual(1);
    expect(pTwoRequired).toBeLessThanOrEqual(pOneRequired + 1e-12);
  });
});

describe("upgrade helpers", () => {
  it("binomial tail handles p=0 and p=1 edge cases", () => {
    expect(binomialTailAtLeast(5, 0, 1)).toBe(0);
    expect(binomialTailAtLeast(5, 0, 0)).toBe(1);
    expect(binomialTailAtLeast(5, 1, 5)).toBe(1);
    expect(binomialTailAtLeast(5, 1, 6)).toBe(0);
  });

  it("five-hit requirement over all substats matches 20% branch weight", () => {
    const pUpgrade = probUpgradeGivenCandidate(
      {
        slot: Slot.Sands,
        main: MainStat.AtkPercent,
        requiredSubs: [],
        subsRule: { mode: "all" },
      },
      {
        enabled: true,
        targetGroup: Object.values(SubStat),
        k: 5,
      },
    );

    expect(pUpgrade).toBeCloseTo(0.2, 12);
  });

  it("upgrade-aware success probability remains in [0,1]", () => {
    const result = probSuccessPerAttempt(
      {
        slot: Slot.Circlet,
        main: MainStat.CritRate,
        requiredSubs: [SubStat.CritDmg],
        subsRule: { mode: "all" },
      },
      {
        enabled: true,
        targetGroup: [SubStat.CritRate, SubStat.CritDmg],
        k: 3,
      },
    );

    expect(result.breakdown.pUpgradeCond).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.pUpgradeCond).toBeLessThanOrEqual(1);
    expect(result.pAttemptSuccess).toBeGreaterThanOrEqual(0);
    expect(result.pAttemptSuccess).toBeLessThanOrEqual(1);
  });

  it("normalizes fixed-slot main stat for Flower and does not throw", () => {
    const invalidForFlower = {
      slot: Slot.Flower,
      main: MainStat.AtkPercent,
      requiredSubs: [SubStat.CritRate],
      subsRule: { mode: "all" as const },
    };
    const validFlower = {
      slot: Slot.Flower,
      main: MainStat.FlatHp,
      requiredSubs: [SubStat.CritRate],
      subsRule: { mode: "all" as const },
    };

    expect(() => probPerAttempt(invalidForFlower)).not.toThrow();
    const normalized = probPerAttempt(invalidForFlower);
    const baseline = probPerAttempt(validFlower);

    expect(normalized.pAttempt).toBeCloseTo(baseline.pAttempt, 12);
    expect(normalized.breakdown.pMain).toBeCloseTo(baseline.breakdown.pMain, 12);
  });

  it("still throws for invalid main stat on non-fixed slots", () => {
    expect(() =>
      probPerAttempt({
        slot: Slot.Sands,
        main: MainStat.PyroDmgBonus,
        requiredSubs: [SubStat.CritRate],
        subsRule: { mode: "all" },
      }),
    ).toThrow(/not valid for slot/i);
  });
});
