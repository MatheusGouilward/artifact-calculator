import { describe, expect, it } from "vitest";

import { DEFAULT_TRANSMUTER_SLOT_COST } from "./tables";
import { runsForTargetChanceStrategy } from "./optimizer";
import { MainStat, Slot, SubStat } from "./types";

const baseInput = {
  objective: "constraints" as const,
  params: {
    slot: Slot.Sands,
    main: MainStat.AtkPercent,
    requiredSubs: [SubStat.CritRate, SubStat.CritDmg],
    subsRule: { mode: "all" as const },
  },
  runs: 200,
  recycleRate: 1,
  transmuterConfig: {
    enabled: true,
    elixirsAvailable: 10,
    slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
    maxCraftsPerPeriod: 2,
  },
  transmuterChoice: {
    fixedMain: MainStat.AtkPercent,
    fixedSubs: [SubStat.CritRate, SubStat.EnergyRecharge],
  },
  cvThreshold: 30,
};

describe("runsForTargetChanceStrategy", () => {
  it("handles transmuter-only as fixed by crafts (0 or Infinity)", () => {
    const lowTarget = runsForTargetChanceStrategy(
      baseInput,
      "Transmuter only (period)",
      0,
    );
    const highTarget = runsForTargetChanceStrategy(
      baseInput,
      "Transmuter only (period)",
      0.99,
    );

    expect(lowTarget).toBe(0);
    expect(highTarget).toBe(Number.POSITIVE_INFINITY);
  });

  it("domains runs for 90% are >= runs for 50%", () => {
    const runs50 = runsForTargetChanceStrategy(baseInput, "Domains only", 0.5);
    const runs90 = runsForTargetChanceStrategy(baseInput, "Domains only", 0.9);

    expect(runs90).toBeGreaterThanOrEqual(runs50);
  });

  it("strongbox reaches target in <= runs than domains-only when recycleRate=1", () => {
    const target = 0.9;
    const domains = runsForTargetChanceStrategy(baseInput, "Domains only", target);
    const strongbox = runsForTargetChanceStrategy(baseInput, "Domains + Strongbox", target);

    expect(strongbox).toBeLessThanOrEqual(domains);
  });

  it("combined reaches target in <= runs than strongbox when transmuter contributes", () => {
    const target = 0.9;
    const strongbox = runsForTargetChanceStrategy(baseInput, "Domains + Strongbox", target);
    const combined = runsForTargetChanceStrategy(
      baseInput,
      "Combined (Domains+Strongbox + Transmuter)",
      target,
    );

    expect(combined).toBeLessThanOrEqual(strongbox);
  });
});
