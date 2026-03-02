import { describe, expect, it } from "vitest";

import { DEFAULT_TRANSMUTER_SLOT_COST, MainStat, Slot, SubStat } from "@/lib/genshin/artifacts";

import type { ArtifactPriorityReport } from "./artifact-priority";
import { computeGlobalEfficiency } from "./global-efficiency";

const priorityReport: ArtifactPriorityReport = {
  profileId: "critDps",
  powerCurrent: 0.42,
  topPriorities: [Slot.Goblet, Slot.Sands],
  slots: [
    {
      slot: Slot.Flower,
      mainKey: "hp_flat",
      mainOk: true,
      slotScore: 0.55,
      priority: "medium",
      reasons: ["low_score"],
      suggestedFocus: {
        slot: Slot.Flower,
        objectiveMode: "constraints",
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "atLeast", n: 1 },
      },
    },
    {
      slot: Slot.Plume,
      mainKey: "atk_flat",
      mainOk: true,
      slotScore: 0.58,
      priority: "medium",
      reasons: ["low_score"],
      suggestedFocus: {
        slot: Slot.Plume,
        objectiveMode: "constraints",
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "atLeast", n: 1 },
      },
    },
    {
      slot: Slot.Sands,
      mainKey: "atk_pct",
      mainOk: true,
      slotScore: 0.22,
      priority: "high",
      reasons: ["low_score"],
      suggestedFocus: {
        slot: Slot.Sands,
        objectiveMode: "cv",
        mainStat: MainStat.AtkPercent,
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg, SubStat.AtkPercent],
        subsRule: { mode: "atLeast", n: 2 },
        cvThreshold: 22,
      },
    },
    {
      slot: Slot.Goblet,
      mainKey: "dmg_bonus_pyro_pct",
      mainOk: true,
      slotScore: 0.2,
      priority: "high",
      reasons: ["low_score"],
      suggestedFocus: {
        slot: Slot.Goblet,
        objectiveMode: "constraints",
        mainStat: MainStat.PyroDmgBonus,
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "atLeast", n: 1 },
      },
    },
    {
      slot: Slot.Circlet,
      mainKey: "crit_rate_pct",
      mainOk: true,
      slotScore: 0.56,
      priority: "medium",
      reasons: ["low_score"],
      suggestedFocus: {
        slot: Slot.Circlet,
        objectiveMode: "cv",
        mainStat: MainStat.CritRate,
        desiredSubs: [SubStat.CritDmg, SubStat.AtkPercent],
        subsRule: { mode: "atLeast", n: 1 },
        cvThreshold: 24,
      },
    },
  ],
};

const baseInput = {
  objective: "constraints" as const,
  params: {
    slot: Slot.Sands,
    main: MainStat.AtkPercent,
    requiredSubs: [SubStat.CritRate],
    subsRule: { mode: "all" as const },
  },
  recycleRate: 0.7,
  transmuterConfig: {
    enabled: true,
    elixirsAvailable: 10,
    slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
    maxCraftsPerPeriod: 2,
  },
  transmuterChoice: {
    fixedMain: MainStat.AtkPercent,
    fixedSubs: [SubStat.CritRate, SubStat.CritDmg],
  },
  cvThreshold: 30,
};

describe("computeGlobalEfficiency", () => {
  it("keeps attempt totals within [0,1] in probability mode", () => {
    const report = computeGlobalEfficiency(priorityReport, baseInput, "anyUpgradeProb");

    expect(report.totals.pAttemptDomain).toBeGreaterThanOrEqual(0);
    expect(report.totals.pAttemptDomain).toBeLessThanOrEqual(1);
    expect(report.totals.pAttemptStrongbox).toBeGreaterThanOrEqual(0);
    expect(report.totals.pAttemptStrongbox).toBeLessThanOrEqual(1);
  });

  it("any-upgrade totals are at least the best single-slot probability", () => {
    const report = computeGlobalEfficiency(priorityReport, baseInput, "anyUpgradeProb");
    const maxSingleDomain = Math.max(...report.perSlot.map((item) => item.pDomain));
    const maxSingleStrongbox = Math.max(...report.perSlot.map((item) => item.pStrongbox));

    expect(report.totals.pAttemptDomain).toBeGreaterThanOrEqual(maxSingleDomain - 1e-12);
    expect(report.totals.pAttemptStrongbox).toBeGreaterThanOrEqual(maxSingleStrongbox - 1e-12);
  });

  it("flex slot setProbability=1 increases goblet domain contribution", () => {
    const withGobletFlex = computeGlobalEfficiency(
      priorityReport,
      baseInput,
      "anyUpgradeProb",
      180,
      Slot.Goblet,
    );
    const withFlowerFlex = computeGlobalEfficiency(
      priorityReport,
      baseInput,
      "anyUpgradeProb",
      180,
      Slot.Flower,
    );

    const gobletWithFlex = withGobletFlex.perSlot.find((item) => item.slot === Slot.Goblet);
    const gobletWithoutFlex = withFlowerFlex.perSlot.find((item) => item.slot === Slot.Goblet);

    expect((gobletWithFlex?.contributionDomain ?? 0)).toBeGreaterThan(
      (gobletWithoutFlex?.contributionDomain ?? 0),
    );
  });

  it("expected gain mode is non-negative and improves with recycle rate", () => {
    const lowRecycle = computeGlobalEfficiency(
      priorityReport,
      { ...baseInput, recycleRate: 0 },
      "expectedGapGain",
    );
    const highRecycle = computeGlobalEfficiency(
      priorityReport,
      { ...baseInput, recycleRate: 1 },
      "expectedGapGain",
    );

    expect((lowRecycle.totals.gRunDomain ?? 0)).toBeGreaterThanOrEqual(0);
    expect((lowRecycle.totals.gRunStrongbox ?? 0)).toBeGreaterThanOrEqual(0);
    expect((highRecycle.totals.gRunStrongbox ?? 0)).toBeGreaterThanOrEqual(
      (lowRecycle.totals.gRunStrongbox ?? 0) - 1e-12,
    );
  });
});
