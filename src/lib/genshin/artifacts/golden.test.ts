import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRANSMUTER_SLOT_COST,
  MainStat,
  Slot,
  SubStat,
  critValueStats,
  probPerAttempt,
  probPerRunFromAttempt,
  probSuccessAfterPeriodCombined,
  probSuccessAfterRunsDomainsOnly,
  probSuccessAfterRunsWithStrongbox,
  runsForTargetChanceStrategy,
  type EvaluateStrategiesInput,
} from "./index";

function round(x: number, d = 10): number {
  return Number(x.toFixed(d));
}

function snapObj(obj: unknown): unknown {
  return snapValue(obj);
}

function snapValue(value: unknown): unknown {
  if (typeof value === "number") {
    return Number.isFinite(value) ? round(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => snapValue(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    output[key] = snapValue(input[key]);
  }
  return output;
}

describe("golden regression snapshots", () => {
  it("Scenario A: domains only constraints outputs", () => {
    const params = {
      slot: Slot.Goblet,
      main: MainStat.PyroDmgBonus,
      requiredSubs: [SubStat.CritRate, SubStat.CritDmg],
      subsRule: { mode: "all" as const },
    };

    const attempt = probPerAttempt(params);
    const pRun = probPerRunFromAttempt(attempt.pAttempt);
    const pSuccessPeriod = probSuccessAfterRunsDomainsOnly(params, undefined, 200);

    const strategyInput: EvaluateStrategiesInput = {
      objective: "constraints",
      params,
      runs: 200,
      recycleRate: 1,
      transmuterConfig: {
        enabled: false,
        elixirsAvailable: 0,
        slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
        maxCraftsPerPeriod: 0,
      },
      transmuterChoice: {
        fixedMain: MainStat.PyroDmgBonus,
        fixedSubs: [SubStat.CritRate, SubStat.CritDmg],
      },
      cvThreshold: 30,
    };

    const runs50 = runsForTargetChanceStrategy(strategyInput, "Domains only", 0.5);
    const runs90 = runsForTargetChanceStrategy(strategyInput, "Domains only", 0.9);

    expect(
      snapObj({
        pAttempt: attempt.pAttempt,
        pRun,
        pSuccessPeriod,
        runs50,
        runs90,
      }),
    ).toMatchInlineSnapshot(`
      {
        "pAttempt": 0.0003346614,
        "pRun": 0.0003564071,
        "pSuccessPeriod": 0.0688120268,
        "runs50": 1945,
        "runs90": 6460,
      }
    `);
  });

  it("Scenario B: domains + strongbox constraints outputs", () => {
    const params = {
      slot: Slot.Goblet,
      main: MainStat.PyroDmgBonus,
      requiredSubs: [SubStat.CritRate, SubStat.CritDmg],
      subsRule: { mode: "all" as const },
    };

    const pSuccessDomainsOnly = probSuccessAfterRunsDomainsOnly(params, undefined, 200);
    const pSuccessPeriod = probSuccessAfterRunsWithStrongbox(params, undefined, 200, 1);
    expect(pSuccessPeriod).toBeGreaterThanOrEqual(pSuccessDomainsOnly);

    const strategyInput: EvaluateStrategiesInput = {
      objective: "constraints",
      params,
      runs: 200,
      recycleRate: 1,
      transmuterConfig: {
        enabled: false,
        elixirsAvailable: 0,
        slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
        maxCraftsPerPeriod: 0,
      },
      transmuterChoice: {
        fixedMain: MainStat.PyroDmgBonus,
        fixedSubs: [SubStat.CritRate, SubStat.CritDmg],
      },
      cvThreshold: 30,
    };

    const runs50 = runsForTargetChanceStrategy(strategyInput, "Domains + Strongbox", 0.5);
    const runs90 = runsForTargetChanceStrategy(strategyInput, "Domains + Strongbox", 0.9);

    expect(
      snapObj({
        pSuccessPeriod,
        runs50,
        runs90,
      }),
    ).toMatchInlineSnapshot(`
      {
        "pSuccessPeriod": 0.1324625818,
        "runs50": 973,
        "runs90": 3231,
      }
    `);
  });

  it("Scenario C: transmuter-only CV objective outputs", () => {
    const params = {
      slot: Slot.Circlet,
      main: MainStat.CritRate,
      requiredSubs: [SubStat.CritDmg, SubStat.EnergyRecharge],
      subsRule: { mode: "atLeast" as const, n: 1 },
    };

    const transmuterConfig = {
      enabled: true,
      elixirsAvailable: 3,
      slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
      maxCraftsPerPeriod: 1,
    };
    const transmuterChoice = {
      fixedMain: MainStat.CritRate,
      fixedSubs: [SubStat.CritRate, SubStat.CritDmg] as [SubStat, SubStat],
    };

    const cv = critValueStats(
      params,
      "transmuter",
      undefined,
      transmuterConfig,
      transmuterChoice,
      30,
    );

    const period = probSuccessAfterPeriodCombined(
      params,
      undefined,
      200,
      1,
      transmuterConfig,
      transmuterChoice,
    );

    const strategyInput: EvaluateStrategiesInput = {
      objective: "cv",
      params,
      runs: 200,
      recycleRate: 1,
      transmuterConfig,
      transmuterChoice,
      cvThreshold: 30,
    };

    const runsAtCurrentSuccess = runsForTargetChanceStrategy(
      strategyInput,
      "Transmuter only (period)",
      1 - (1 - cv.pCvAtLeastPerAttempt) ** period.transmuterCrafts,
    );
    const runsAboveCurrentSuccess =
      cv.pCvAtLeastPerAttempt < 1
        ? runsForTargetChanceStrategy(
            strategyInput,
            "Transmuter only (period)",
            1 - (1 - cv.pCvAtLeastPerAttempt) ** period.transmuterCrafts + 1e-9,
          )
        : Number.POSITIVE_INFINITY;

    expect(
      snapObj({
        pCvAtLeastPerAttempt: cv.pCvAtLeastPerAttempt,
        pSuccessPeriod: period.transmuterOnlySuccess,
        runsAboveCurrentSuccess,
        runsAtCurrentSuccess,
      }),
    ).toMatchInlineSnapshot(`
      {
        "pCvAtLeastPerAttempt": 0,
        "pSuccessPeriod": 0,
        "runsAboveCurrentSuccess": Infinity,
        "runsAtCurrentSuccess": 0,
      }
    `);
  });

  it("Scenario D: combined constraints with upgrade requirement outputs", () => {
    const params = {
      slot: Slot.Sands,
      main: MainStat.EnergyRecharge,
      requiredSubs: [SubStat.CritRate, SubStat.CritDmg, SubStat.AtkPercent],
      subsRule: { mode: "atLeast" as const, n: 2 },
    };
    const upgrade = {
      enabled: true as const,
      targetGroup: [SubStat.CritRate, SubStat.CritDmg],
      k: 3,
    };
    const transmuterConfig = {
      enabled: true,
      elixirsAvailable: 2,
      slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
      maxCraftsPerPeriod: 3,
    };
    const transmuterChoice = {
      fixedMain: MainStat.EnergyRecharge,
      fixedSubs: [SubStat.CritRate, SubStat.CritDmg] as [SubStat, SubStat],
    };

    const period = probSuccessAfterPeriodCombined(
      params,
      upgrade,
      300,
      1,
      transmuterConfig,
      transmuterChoice,
    );

    const strategyInput: EvaluateStrategiesInput = {
      objective: "constraints",
      params,
      upgrade,
      runs: 300,
      recycleRate: 1,
      transmuterConfig,
      transmuterChoice,
      cvThreshold: 30,
    };

    const runs50 = runsForTargetChanceStrategy(
      strategyInput,
      "Combined (Domains+Strongbox + Transmuter)",
      0.5,
    );
    const runs90 = runsForTargetChanceStrategy(
      strategyInput,
      "Combined (Domains+Strongbox + Transmuter)",
      0.9,
    );

    expect(
      snapObj({
        pSuccessPeriod: period.combinedSuccess,
        runs50,
        runs90,
        transmuterCrafts: period.transmuterCrafts,
      }),
    ).toMatchInlineSnapshot(`
      {
        "pSuccessPeriod": 0.6130220361,
        "runs50": 0,
        "runs90": 1881,
        "transmuterCrafts": 1,
      }
    `);
  });
});
