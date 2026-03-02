import { describe, expect, it } from "vitest";

import { DEFAULT_TRANSMUTER_SLOT_COST, MainStat, Slot, SubStat } from "@/lib/genshin/artifacts";

import type { ArtifactPriorityReport } from "./artifact-priority";
import { computeFocusGlobalEfficiency } from "./focus-global-efficiency";

const priorityReport: ArtifactPriorityReport = {
  profileId: "critDps",
  powerCurrent: 0.41,
  topPriorities: [Slot.Goblet, Slot.Sands],
  slots: [
    {
      slot: Slot.Flower,
      mainKey: "hp_flat",
      mainOk: true,
      slotScore: 0.53,
      priority: "medium",
      reasons: ["low_score"],
      suggestedFocus: {
        slot: Slot.Flower,
        objectiveMode: "constraints",
        mainStat: MainStat.FlatHp,
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "atLeast", n: 1 },
      },
    },
    {
      slot: Slot.Plume,
      mainKey: "atk_flat",
      mainOk: true,
      slotScore: 0.49,
      priority: "medium",
      reasons: ["low_score"],
      suggestedFocus: {
        slot: Slot.Plume,
        objectiveMode: "constraints",
        mainStat: MainStat.FlatAtk,
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "atLeast", n: 1 },
      },
    },
    {
      slot: Slot.Sands,
      mainKey: "atk_pct",
      mainOk: true,
      slotScore: 0.2,
      priority: "high",
      reasons: ["low_score"],
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
      slotScore: 0.19,
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
      slotScore: 0.64,
      priority: "low",
      reasons: [],
      suggestedFocus: {
        slot: Slot.Circlet,
        objectiveMode: "cv",
        mainStat: MainStat.CritRate,
        desiredSubs: [SubStat.CritDmg, SubStat.AtkPercent],
        subsRule: { mode: "atLeast", n: 1 },
        cvThreshold: 26,
      },
    },
  ],
};

const optimizerBaseInput = {
  objective: "constraints" as const,
  params: {
    slot: Slot.Sands,
    main: MainStat.AtkPercent,
    requiredSubs: [SubStat.CritRate, SubStat.CritDmg],
    subsRule: { mode: "atLeast" as const, n: 1 },
  },
  recycleRate: 0.75,
  transmuterConfig: {
    enabled: true,
    elixirsAvailable: 12,
    slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
    maxCraftsPerPeriod: 2,
  },
  transmuterChoice: {
    fixedMain: MainStat.AtkPercent,
    fixedSubs: [SubStat.CritRate, SubStat.CritDmg],
  },
  cvThreshold: 30,
};

describe("computeFocusGlobalEfficiency", () => {
  it("keeps totals non-negative and total >= focus", () => {
    const report = computeFocusGlobalEfficiency(
      priorityReport,
      Slot.Sands,
      optimizerBaseInput,
      180,
      Slot.Goblet,
      "domainsOnly",
    );

    expect(report.totals.pAttemptAny).toBeGreaterThanOrEqual(0);
    expect(report.totals.expectedGainAttemptTotal).toBeGreaterThanOrEqual(0);
    expect(report.totals.expectedGainAttemptFocus).toBeGreaterThanOrEqual(0);
    expect(report.totals.expectedGainAttemptCollateral).toBeGreaterThanOrEqual(0);
    expect(report.totals.expectedGainPerDay).toBeGreaterThanOrEqual(0);
    expect(report.totals.expectedGainAttemptTotal).toBeGreaterThanOrEqual(
      report.totals.expectedGainAttemptFocus - 1e-12,
    );
  });

  it("flex slot increases goblet contribution in a sanity scenario", () => {
    const gobletFlex = computeFocusGlobalEfficiency(
      priorityReport,
      Slot.Sands,
      optimizerBaseInput,
      180,
      Slot.Goblet,
      "domainsOnly",
    );
    const flowerFlex = computeFocusGlobalEfficiency(
      priorityReport,
      Slot.Sands,
      optimizerBaseInput,
      180,
      Slot.Flower,
      "domainsOnly",
    );

    const gobletWithFlex = gobletFlex.perSlot.find((item) => item.slot === Slot.Goblet)?.expectedGainAttempt ?? 0;
    const gobletWithoutFlex =
      flowerFlex.perSlot.find((item) => item.slot === Slot.Goblet)?.expectedGainAttempt ?? 0;

    expect(gobletWithFlex).toBeGreaterThan(gobletWithoutFlex);
  });

  it("domainsStrongbox expected gain is >= domainsOnly when recycleRate=1", () => {
    const base = {
      ...optimizerBaseInput,
      recycleRate: 1,
    };
    const domainsOnly = computeFocusGlobalEfficiency(
      priorityReport,
      Slot.Sands,
      base,
      180,
      Slot.Goblet,
      "domainsOnly",
    );
    const domainsStrongbox = computeFocusGlobalEfficiency(
      priorityReport,
      Slot.Sands,
      base,
      180,
      Slot.Goblet,
      "domainsStrongbox",
    );

    expect(domainsStrongbox.totals.expectedGainAttemptTotal).toBeGreaterThanOrEqual(
      domainsOnly.totals.expectedGainAttemptTotal - 1e-12,
    );
    expect(domainsStrongbox.totals.expectedGainPerDay).toBeGreaterThanOrEqual(
      domainsOnly.totals.expectedGainPerDay - 1e-12,
    );
  });
});
