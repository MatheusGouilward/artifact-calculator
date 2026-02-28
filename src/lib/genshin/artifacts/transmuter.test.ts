import { describe, expect, it } from "vitest";

import { DEFAULT_TRANSMUTER_SLOT_COST } from "./tables";
import { MainStat, Slot, SubStat } from "./types";
import { probFinal4SubsSatisfyRule } from "./engine";
import {
  computeTransmuterCraftsPossible,
  probSuccessAfterPeriodCombined,
  probSuccessPerTransmuterAttempt,
} from "./transmuter";

describe("transmuter", () => {
  it("fixed subs improve or match candidate probability for those same required subs", () => {
    const params = {
      slot: Slot.Sands,
      main: MainStat.AtkPercent,
      requiredSubs: [SubStat.CritRate, SubStat.CritDmg],
      subsRule: { mode: "all" as const },
    };

    const trans = probSuccessPerTransmuterAttempt(params, undefined, {
      fixedMain: MainStat.AtkPercent,
      fixedSubs: [SubStat.CritRate, SubStat.CritDmg],
    });

    const baseline = probFinal4SubsSatisfyRule(
      [SubStat.CritRate, SubStat.CritDmg],
      MainStat.AtkPercent,
      { mode: "all" },
    );

    expect(trans.breakdown.pSubs).toBeGreaterThanOrEqual(baseline - 1e-12);
  });

  it("returns 0 when fixed subs violate main-equivalent exclusion", () => {
    const params = {
      slot: Slot.Sands,
      main: MainStat.HpPercent,
      requiredSubs: [],
      subsRule: { mode: "all" as const },
    };

    const trans = probSuccessPerTransmuterAttempt(params, undefined, {
      fixedMain: MainStat.HpPercent,
      fixedSubs: [SubStat.HpPercent, SubStat.CritRate],
    });

    expect(trans.pAttemptSuccess).toBe(0);
  });

  it("attempt and combined probabilities remain in [0,1]", () => {
    const params = {
      slot: Slot.Circlet,
      main: MainStat.CritRate,
      requiredSubs: [SubStat.CritDmg],
      subsRule: { mode: "all" as const },
    };

    const transAttempt = probSuccessPerTransmuterAttempt(
      params,
      {
        enabled: true,
        targetGroup: [SubStat.CritRate, SubStat.CritDmg],
        k: 3,
      },
      {
        fixedMain: MainStat.CritRate,
        fixedSubs: [SubStat.CritDmg, SubStat.EnergyRecharge],
      },
    );

    const combined = probSuccessAfterPeriodCombined(
      params,
      undefined,
      150,
      1,
      {
        enabled: true,
        elixirsAvailable: 10,
        slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
        maxCraftsPerPeriod: 2,
      },
      {
        fixedMain: MainStat.CritRate,
        fixedSubs: [SubStat.CritDmg, SubStat.CritRate],
      },
    );

    expect(transAttempt.pAttemptSuccess).toBeGreaterThanOrEqual(0);
    expect(transAttempt.pAttemptSuccess).toBeLessThanOrEqual(1);
    expect(combined.combinedSuccess).toBeGreaterThanOrEqual(0);
    expect(combined.combinedSuccess).toBeLessThanOrEqual(1);
  });

  it("craft count respects slot cost and max crafts per period", () => {
    const craftsCirclet = computeTransmuterCraftsPossible(Slot.Circlet, {
      enabled: true,
      elixirsAvailable: 10,
      slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
      maxCraftsPerPeriod: 2,
    });
    const craftsGoblet = computeTransmuterCraftsPossible(Slot.Goblet, {
      enabled: true,
      elixirsAvailable: 10,
      slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
      maxCraftsPerPeriod: 10,
    });

    expect(craftsCirclet).toBe(2);
    expect(craftsGoblet).toBe(2);
  });
});
