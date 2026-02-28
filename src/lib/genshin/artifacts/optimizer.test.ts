import { describe, expect, it } from "vitest";

import { DEFAULT_TRANSMUTER_SLOT_COST } from "./tables";
import { bestStrategy, evaluateStrategies } from "./optimizer";
import { MainStat, Slot, SubStat } from "./types";

const baseInput = {
  params: {
    slot: Slot.Sands,
    main: MainStat.AtkPercent,
    requiredSubs: [SubStat.CritRate],
    subsRule: { mode: "all" as const },
  },
  runs: 160,
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
};

describe("optimizer", () => {
  it("returns all 4 strategies", () => {
    const constraints = evaluateStrategies({
      ...baseInput,
      objective: "constraints",
    });
    const cv = evaluateStrategies({
      ...baseInput,
      objective: "cv",
      cvThreshold: 30,
    });

    expect(constraints).toHaveLength(4);
    expect(cv).toHaveLength(4);
  });

  it("keeps all strategy probabilities within [0,1]", () => {
    const results = evaluateStrategies({
      ...baseInput,
      objective: "cv",
      cvThreshold: 35,
    });

    for (const result of results) {
      expect(result.pSuccess).toBeGreaterThanOrEqual(0);
      expect(result.pSuccess).toBeLessThanOrEqual(1);
    }
  });

  it("returns transmuter-only and combined as 0 when transmuter is disabled", () => {
    const results = evaluateStrategies({
      ...baseInput,
      objective: "constraints",
      transmuterConfig: {
        ...baseInput.transmuterConfig,
        enabled: false,
      },
    });

    const transmuterOnly = results.find((result) => result.name === "Transmuter only (period)");
    const combined = results.find((result) => result.name === "Combined (Domains+Strongbox + Transmuter)");

    expect(transmuterOnly?.pSuccess).toBe(0);
    expect(combined?.pSuccess).toBe(0);
    expect(transmuterOnly?.details?.note).toBeTruthy();
    expect(combined?.details?.note).toBeTruthy();
  });

  it("selects max probability and tie-breaks by lower complexity", () => {
    const winner = bestStrategy([
      {
        name: "Domains + Strongbox",
        objective: "constraints",
        pSuccess: 0.55,
      },
      {
        name: "Domains only",
        objective: "constraints",
        pSuccess: 0.55,
      },
      {
        name: "Transmuter only (period)",
        objective: "constraints",
        pSuccess: 0.4,
      },
      {
        name: "Combined (Domains+Strongbox + Transmuter)",
        objective: "constraints",
        pSuccess: 0.45,
      },
    ]);

    expect(winner.name).toBe("Domains only");
    expect(winner.pSuccess).toBe(0.55);
  });
});
