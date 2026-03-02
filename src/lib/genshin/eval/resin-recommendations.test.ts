import { describe, expect, it } from "vitest";

import { DEFAULT_TRANSMUTER_SLOT_COST, MainStat, Slot, SubStat } from "@/lib/genshin/artifacts";

import type { ArtifactPriorityReport } from "./artifact-priority";
import { computeResinRecommendations } from "./resin-recommendations";

const basePriorityReport: ArtifactPriorityReport = {
  profileId: "critDps",
  powerCurrent: 0.45,
  slots: [
    {
      slot: Slot.Flower,
      mainKey: "hp_flat",
      mainOk: true,
      slotScore: 0.52,
      priority: "medium",
      reasons: ["low_score"],
      suggestedFocus: {
        slot: Slot.Flower,
        objectiveMode: "constraints",
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "all" },
      },
    },
    {
      slot: Slot.Plume,
      mainKey: "atk_flat",
      mainOk: true,
      slotScore: 0.5,
      priority: "medium",
      reasons: ["low_score"],
      suggestedFocus: {
        slot: Slot.Plume,
        objectiveMode: "constraints",
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "all" },
      },
    },
    {
      slot: Slot.Sands,
      mainKey: "atk_pct",
      mainOk: true,
      slotScore: 0.21,
      priority: "high",
      reasons: ["low_score", "missing_crit"],
      suggestedFocus: {
        slot: Slot.Sands,
        objectiveMode: "cv",
        mainStat: MainStat.AtkPercent,
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg, SubStat.AtkPercent],
        subsRule: { mode: "atLeast", n: 2 },
        cvThreshold: 24,
      },
    },
    {
      slot: Slot.Goblet,
      mainKey: "dmg_bonus_pyro_pct",
      mainOk: true,
      slotScore: 0.28,
      priority: "high",
      reasons: ["low_score"],
      suggestedFocus: {
        slot: Slot.Goblet,
        objectiveMode: "constraints",
        mainStat: MainStat.PyroDmgBonus,
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "all" },
      },
    },
    {
      slot: Slot.Circlet,
      mainKey: "crit_rate_pct",
      mainOk: true,
      slotScore: 0.71,
      priority: "low",
      reasons: [],
      suggestedFocus: {
        slot: Slot.Circlet,
        objectiveMode: "cv",
        mainStat: MainStat.CritRate,
        desiredSubs: [SubStat.CritDmg, SubStat.AtkPercent],
        subsRule: { mode: "atLeast", n: 1 },
        cvThreshold: 28,
      },
    },
  ],
  topPriorities: [Slot.Sands, Slot.Goblet],
};

const baseOptimizerInput = {
  objective: "constraints" as const,
  params: {
    slot: Slot.Sands,
    main: MainStat.AtkPercent,
    requiredSubs: [SubStat.CritRate],
    subsRule: { mode: "all" as const },
  },
  recycleRate: 1,
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

describe("computeResinRecommendations", () => {
  it("returns finite days when success is reachable", () => {
    const report = computeResinRecommendations(basePriorityReport, baseOptimizerInput, 180);

    expect(report.items).toHaveLength(2);
    expect(report.items.some((item) => Number.isFinite(item.days50))).toBe(true);
    expect(report.items.some((item) => Number.isFinite(item.days90))).toBe(true);
  });

  it("chooses best strategy deterministically for the same input", () => {
    const first = computeResinRecommendations(basePriorityReport, baseOptimizerInput, 180);
    const second = computeResinRecommendations(basePriorityReport, baseOptimizerInput, 180);

    expect(first.items).toHaveLength(second.items.length);
    for (let index = 0; index < first.items.length; index += 1) {
      expect(first.items[index].slot).toBe(second.items[index].slot);
      expect(first.items[index].bestStrategyName).toBe(second.items[index].bestStrategyName);
      expect(first.items[index].days50).toBe(second.items[index].days50);
      expect(first.items[index].days90).toBe(second.items[index].days90);
    }
  });
});
