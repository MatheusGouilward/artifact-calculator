import {
  ArtifactEngineError,
  UpgradeRequirement,
  chanceAtLeastOne,
  probPerRunFromAttempt,
} from "./engine";
import { critValueStats } from "./scoring";
import {
  probSuccessAfterRunsDomainsOnly,
  probSuccessAfterRunsWithStrongbox,
  probSuccessAfterRunsWithStrongboxGivenAttemptProbs,
} from "./strongbox";
import {
  computeTransmuterCraftsPossible,
  probSuccessAfterPeriodCombined,
  probSuccessAfterTransmuterCrafts,
  probSuccessPerTransmuterAttempt,
} from "./transmuter";
import { ArtifactFarmParams, TransmuterChoice, TransmuterConfig } from "./types";

export type StrategyObjective = "constraints" | "cv";

export type StrategyName =
  | "Domains only"
  | "Domains + Strongbox"
  | "Transmuter only (period)"
  | "Combined (Domains+Strongbox + Transmuter)";

export interface StrategyResult {
  name: StrategyName;
  objective: StrategyObjective;
  pSuccess: number;
  details?: {
    runs: number;
    recycleRate: number;
    crafts: number;
    note?: string;
  };
}

export interface EvaluateStrategiesInput {
  objective: StrategyObjective;
  params: ArtifactFarmParams;
  upgrade?: UpgradeRequirement;
  runs: number;
  recycleRate?: number;
  transmuterConfig: TransmuterConfig;
  transmuterChoice: TransmuterChoice;
  cvThreshold?: number;
}

const STRATEGY_ORDER: StrategyName[] = [
  "Domains only",
  "Domains + Strongbox",
  "Transmuter only (period)",
  "Combined (Domains+Strongbox + Transmuter)",
];

const COMPLEXITY_SCORE: Record<StrategyName, number> = {
  "Domains only": 0,
  "Domains + Strongbox": 1,
  "Transmuter only (period)": 2,
  "Combined (Domains+Strongbox + Transmuter)": 3,
};

export function evaluateStrategies(input: EvaluateStrategiesInput): StrategyResult[] {
  assertRuns(input.runs);
  const recycleRate = clamp01(input.recycleRate ?? 1);
  const crafts = computeTransmuterCraftsPossible(input.params.slot, input.transmuterConfig);

  return STRATEGY_ORDER.map((name) => ({
    name,
    objective: input.objective,
    pSuccess: pSuccessForStrategyAtRuns(input, name, input.runs),
    details: {
      runs: input.runs,
      recycleRate,
      crafts,
      note: strategyNote(name, input.transmuterConfig.enabled, crafts),
    },
  }));
}

export function strategySuccessAtRuns(
  input: EvaluateStrategiesInput,
  strategyName: StrategyName,
  runs: number,
): number {
  return pSuccessForStrategyAtRuns(input, strategyName, runs);
}

export function bestStrategy(results: StrategyResult[]): StrategyResult {
  if (!Array.isArray(results) || results.length === 0) {
    throw new ArtifactEngineError("INVALID_PARAM", "results must be a non-empty array.");
  }

  let best = results[0];
  const epsilon = 1e-12;

  for (let index = 1; index < results.length; index += 1) {
    const current = results[index];
    if (current.pSuccess > best.pSuccess + epsilon) {
      best = current;
      continue;
    }

    if (
      Math.abs(current.pSuccess - best.pSuccess) <= epsilon &&
      complexityOf(current.name) < complexityOf(best.name)
    ) {
      best = current;
    }
  }

  return best;
}

export function runsForTargetChanceStrategy(
  input: EvaluateStrategiesInput,
  strategyName: StrategyName,
  targetProb: number,
  maxRuns = 10000,
): number {
  if (!Number.isFinite(targetProb) || targetProb < 0 || targetProb > 1) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `targetProb must be within [0, 1], received: ${targetProb}`,
    );
  }
  assertRuns(maxRuns);

  const pAtZero = pSuccessForStrategyAtRuns(input, strategyName, 0);
  if (targetProb <= pAtZero) {
    return 0;
  }
  if (maxRuns === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (strategyName === "Transmuter only (period)") {
    return Number.POSITIVE_INFINITY;
  }

  let low = 0;
  let high = Math.min(1, maxRuns);

  while (high < maxRuns && pSuccessForStrategyAtRuns(input, strategyName, high) < targetProb) {
    low = high;
    high = Math.min(maxRuns, high * 2);
  }

  if (pSuccessForStrategyAtRuns(input, strategyName, high) < targetProb) {
    return Number.POSITIVE_INFINITY;
  }

  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (pSuccessForStrategyAtRuns(input, strategyName, mid) >= targetProb) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return high;
}

export function resinForRuns(runs: number): number {
  if (!Number.isFinite(runs)) {
    return Number.POSITIVE_INFINITY;
  }
  assertRuns(runs);
  return runs * 20;
}

function pSuccessForStrategyAtRuns(
  input: EvaluateStrategiesInput,
  strategyName: StrategyName,
  runs: number,
): number {
  assertRuns(runs);
  const recycleRate = clamp01(input.recycleRate ?? 1);
  const crafts = computeTransmuterCraftsPossible(input.params.slot, input.transmuterConfig);
  const transmuterEnabled = input.transmuterConfig.enabled;

  if (input.objective === "constraints") {
    switch (strategyName) {
      case "Domains only":
        return clamp01(probSuccessAfterRunsDomainsOnly(input.params, input.upgrade, runs));
      case "Domains + Strongbox":
        return clamp01(
          probSuccessAfterRunsWithStrongbox(input.params, input.upgrade, runs, recycleRate),
        );
      case "Transmuter only (period)": {
        if (!transmuterEnabled) {
          return 0;
        }
        const pAttemptTransmuter = probSuccessPerTransmuterAttempt(
          input.params,
          input.upgrade,
          input.transmuterChoice,
        ).pAttemptSuccess;
        return clamp01(probSuccessAfterTransmuterCrafts(pAttemptTransmuter, crafts));
      }
      case "Combined (Domains+Strongbox + Transmuter)": {
        if (!transmuterEnabled) {
          return 0;
        }
        return clamp01(
          probSuccessAfterPeriodCombined(
            input.params,
            input.upgrade,
            runs,
            recycleRate,
            input.transmuterConfig,
            input.transmuterChoice,
          ).combinedSuccess,
        );
      }
      default:
        return 0;
    }
  }

  const threshold = input.cvThreshold ?? 30;
  const domainStats = critValueStats(
    input.params,
    "domain",
    input.upgrade,
    input.transmuterConfig,
    input.transmuterChoice,
    threshold,
  );
  const strongboxStats = critValueStats(
    input.params,
    "strongbox",
    input.upgrade,
    input.transmuterConfig,
    input.transmuterChoice,
    threshold,
  );

  const domainSuccess = chanceAtLeastOne(
    probPerRunFromAttempt(domainStats.pCvAtLeastPerAttempt),
    runs,
  );
  const strongboxSuccess = probSuccessAfterRunsWithStrongboxGivenAttemptProbs(
    runs,
    domainStats.pCvAtLeastPerAttempt,
    strongboxStats.pCvAtLeastPerAttempt,
    recycleRate,
  );

  switch (strategyName) {
    case "Domains only":
      return clamp01(domainSuccess);
    case "Domains + Strongbox":
      return clamp01(strongboxSuccess);
    case "Transmuter only (period)": {
      if (!transmuterEnabled) {
        return 0;
      }
      const transmuterStats = critValueStats(
        input.params,
        "transmuter",
        input.upgrade,
        input.transmuterConfig,
        input.transmuterChoice,
        threshold,
      );
      return clamp01(probSuccessAfterTransmuterCrafts(transmuterStats.pCvAtLeastPerAttempt, crafts));
    }
    case "Combined (Domains+Strongbox + Transmuter)": {
      if (!transmuterEnabled) {
        return 0;
      }
      const transmuterStats = critValueStats(
        input.params,
        "transmuter",
        input.upgrade,
        input.transmuterConfig,
        input.transmuterChoice,
        threshold,
      );
      const transmuterSuccess = probSuccessAfterTransmuterCrafts(
        transmuterStats.pCvAtLeastPerAttempt,
        crafts,
      );
      return clamp01(1 - (1 - strongboxSuccess) * (1 - transmuterSuccess));
    }
    default:
      return 0;
  }
}

function strategyNote(
  strategyName: StrategyName,
  transmuterEnabled: boolean,
  crafts: number,
): string | undefined {
  if (
    strategyName !== "Transmuter only (period)" &&
    strategyName !== "Combined (Domains+Strongbox + Transmuter)"
  ) {
    return undefined;
  }

  if (!transmuterEnabled) {
    return "Transmuter is disabled.";
  }

  if (crafts === 0) {
    return "No transmuter crafts available this period.";
  }

  return undefined;
}

function assertRuns(runs: number): void {
  if (!Number.isInteger(runs) || runs < 0) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `runs must be a non-negative integer, received: ${runs}`,
    );
  }
}

function complexityOf(name: StrategyName): number {
  return COMPLEXITY_SCORE[name] ?? Number.MAX_SAFE_INTEGER;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}
