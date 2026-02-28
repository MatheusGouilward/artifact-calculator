import { dpWeightedDrawMasks, popcount } from "./dp";
import {
  ArtifactEngineError,
  UpgradeRequirement,
  UpgradeRequirementEnabled,
  availableSubStats,
  binomialTailAtLeast,
  maskGroupSize,
} from "./engine";
import {
  probSuccessAfterRunsDomainsOnly,
  probSuccessAfterRunsWithStrongbox,
} from "./strongbox";
import { DEFAULT_TRANSMUTER_SLOT_COST } from "./tables";
import {
  ArtifactFarmParams,
  MainStat,
  Slot,
  SubStat,
  SubsRule,
  TransmuterChoice,
  TransmuterConfig,
} from "./types";

export function probSuccessPerTransmuterAttempt(
  params: ArtifactFarmParams,
  upgrade: UpgradeRequirement | undefined,
  transmuterChoice: TransmuterChoice,
): {
  breakdown: {
    pSet: number;
    pSlot: number;
    pMain: number;
    pSubs: number;
    pUpgradeCond: number;
  };
  pAttemptCandidate: number;
  pAttemptSuccess: number;
} {
  let distribution: ReturnType<typeof buildTransmuterMaskDistribution>;
  try {
    distribution = buildTransmuterMaskDistribution(params, transmuterChoice);
  } catch {
    return {
      breakdown: {
        pSet: 1,
        pSlot: 1,
        pMain: 1,
        pSubs: 0,
        pUpgradeCond: 0,
      },
      pAttemptCandidate: 0,
      pAttemptSuccess: 0,
    };
  }
  const matcher = createCandidateMaskMatcher(params.requiredSubs, distribution.orderedPool, params.subsRule);

  if (!matcher.possible) {
    return {
      breakdown: {
        pSet: 1,
        pSlot: 1,
        pMain: 1,
        pSubs: 0,
        pUpgradeCond: 0,
      },
      pAttemptCandidate: 0,
      pAttemptSuccess: 0,
    };
  }

  let candidateProbability = 0;
  for (const [mask, probability] of distribution.maskProbability.entries()) {
    if (matcher.matches(mask)) {
      candidateProbability += probability;
    }
  }
  candidateProbability = clampProbability(candidateProbability);

  let pUpgradeCond = 1;
  if (upgrade && upgrade.enabled) {
    validateUpgradeRequirement(upgrade);

    let denominator = 0;
    let numerator = 0;
    for (const [mask, probability] of distribution.maskProbability.entries()) {
      if (!matcher.matches(mask)) {
        continue;
      }

      denominator += probability;
      const groupSize = maskGroupSize(mask, upgrade.targetGroup, distribution.orderedPool);
      numerator += probability * binomialTailAtLeast(5, groupSize / 4, upgrade.k);
    }

    pUpgradeCond = denominator > 0 ? clampProbability(numerator / denominator) : 0;
  }

  const pAttemptSuccess = clampProbability(candidateProbability * pUpgradeCond);

  return {
    breakdown: {
      pSet: 1,
      pSlot: 1,
      pMain: 1,
      pSubs: candidateProbability,
      pUpgradeCond,
    },
    pAttemptCandidate: candidateProbability,
    pAttemptSuccess,
  };
}

export function computeTransmuterCraftsPossible(
  slot: Slot,
  config: TransmuterConfig,
): number {
  if (!config.enabled) {
    return 0;
  }

  const slotCost = resolveSlotCost(config.slotCost)[slot];
  if (slotCost <= 0) {
    return 0;
  }

  const elixirs = Math.max(0, Math.floor(config.elixirsAvailable));
  const maxCraftsByElixir = Math.floor(elixirs / slotCost);
  const maxCraftsPerPeriod = Math.max(0, Math.floor(config.maxCraftsPerPeriod ?? 2));

  return Math.max(0, Math.min(maxCraftsByElixir, maxCraftsPerPeriod));
}

export function probSuccessAfterTransmuterCrafts(
  pAttemptSuccess: number,
  crafts: number,
): number {
  if (!Number.isFinite(pAttemptSuccess) || pAttemptSuccess < 0 || pAttemptSuccess > 1) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `pAttemptSuccess must be within [0, 1], received: ${pAttemptSuccess}`,
    );
  }
  if (!Number.isInteger(crafts) || crafts < 0) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `crafts must be a non-negative integer, received: ${crafts}`,
    );
  }

  return 1 - (1 - pAttemptSuccess) ** crafts;
}

export function probSuccessAfterPeriodCombined(
  params: ArtifactFarmParams,
  upgrade: UpgradeRequirement | undefined,
  runs: number,
  strongboxRecycleRate: number,
  transmuterConfig: TransmuterConfig,
  transmuterChoice: TransmuterChoice,
): {
  domainsOnlySuccess: number;
  domainsPlusStrongboxSuccess: number;
  transmuterOnlySuccess: number;
  combinedSuccess: number;
  transmuterCrafts: number;
  transmuterAttemptSuccess: number;
} {
  const domainsOnlySuccess = probSuccessAfterRunsDomainsOnly(params, upgrade, runs);
  const domainsPlusStrongboxSuccess = probSuccessAfterRunsWithStrongbox(
    params,
    upgrade,
    runs,
    strongboxRecycleRate,
  );

  const transmuterCrafts = computeTransmuterCraftsPossible(params.slot, transmuterConfig);
  const transmuterAttemptSuccess =
    transmuterCrafts > 0 && transmuterConfig.enabled
      ? probSuccessPerTransmuterAttempt(params, upgrade, transmuterChoice).pAttemptSuccess
      : 0;
  const transmuterOnlySuccess = probSuccessAfterTransmuterCrafts(
    transmuterAttemptSuccess,
    transmuterCrafts,
  );

  const combinedSuccess =
    1 - (1 - domainsPlusStrongboxSuccess) * (1 - transmuterOnlySuccess);

  return {
    domainsOnlySuccess,
    domainsPlusStrongboxSuccess,
    transmuterOnlySuccess: clampProbability(transmuterOnlySuccess),
    combinedSuccess: clampProbability(combinedSuccess),
    transmuterCrafts,
    transmuterAttemptSuccess: clampProbability(transmuterAttemptSuccess),
  };
}

function buildTransmuterMaskDistribution(
  params: ArtifactFarmParams,
  transmuterChoice: TransmuterChoice,
): {
  orderedPool: SubStat[];
  maskProbability: Map<number, number>;
} {
  validateFixedMain(params.slot, params.main, transmuterChoice.fixedMain);

  const { subs: orderedPool, weights } = availableSubStats(transmuterChoice.fixedMain);
  const indexBySub = new Map(orderedPool.map((sub, index) => [sub, index] as const));

  const fixedUnique = Array.from(new Set(transmuterChoice.fixedSubs));
  if (fixedUnique.length !== 2) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      "Transmuter requires exactly 2 distinct fixed substats.",
    );
  }

  const fixedIndices: number[] = [];
  for (const sub of fixedUnique) {
    const index = indexBySub.get(sub);
    if (index === undefined) {
      throw new ArtifactEngineError(
        "INVALID_PARAM",
        `Fixed substat "${sub}" is invalid for main "${transmuterChoice.fixedMain}".`,
      );
    }
    fixedIndices.push(index);
  }

  const fixedMask = fixedIndices.reduce((mask, index) => mask | (1 << index), 0);
  const remainingIndices = orderedPool
    .map((_, index) => index)
    .filter((index) => !fixedIndices.includes(index));
  const remainingWeights = remainingIndices.map((index) => weights[index]);
  const drawnRemainingMasks = dpWeightedDrawMasks(remainingWeights, 2);

  const maskProbability = new Map<number, number>();
  for (const [remainingMask, probability] of drawnRemainingMasks.entries()) {
    let fullMask = fixedMask;
    for (let idx = 0; idx < remainingIndices.length; idx += 1) {
      if ((remainingMask & (1 << idx)) !== 0) {
        fullMask |= 1 << remainingIndices[idx];
      }
    }
    maskProbability.set(fullMask, (maskProbability.get(fullMask) ?? 0) + probability);
  }

  return {
    orderedPool,
    maskProbability,
  };
}

function validateFixedMain(slot: Slot, paramsMain: MainStat, fixedMain: MainStat): void {
  if (paramsMain !== fixedMain) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `Transmuter fixedMain "${fixedMain}" must match selected main "${paramsMain}" for slot "${slot}".`,
    );
  }
}

function resolveSlotCost(
  override?: Partial<Record<Slot, number>>,
): Record<Slot, number> {
  return {
    [Slot.Flower]: override?.[Slot.Flower] ?? DEFAULT_TRANSMUTER_SLOT_COST[Slot.Flower],
    [Slot.Plume]: override?.[Slot.Plume] ?? DEFAULT_TRANSMUTER_SLOT_COST[Slot.Plume],
    [Slot.Sands]: override?.[Slot.Sands] ?? DEFAULT_TRANSMUTER_SLOT_COST[Slot.Sands],
    [Slot.Goblet]: override?.[Slot.Goblet] ?? DEFAULT_TRANSMUTER_SLOT_COST[Slot.Goblet],
    [Slot.Circlet]: override?.[Slot.Circlet] ?? DEFAULT_TRANSMUTER_SLOT_COST[Slot.Circlet],
  };
}

function createCandidateMaskMatcher(
  required: SubStat[],
  orderedPool: SubStat[],
  rule: SubsRule,
): {
  possible: boolean;
  matches: (mask: number) => boolean;
} {
  validateRule(rule);
  const requiredUnique = Array.from(new Set(required));
  const indexBySub = new Map(orderedPool.map((sub, index) => [sub, index] as const));

  const requiredIndices: number[] = [];
  for (const sub of requiredUnique) {
    const index = indexBySub.get(sub);
    if (index === undefined) {
      return { possible: false, matches: () => false };
    }
    requiredIndices.push(index);
  }

  if (rule.mode === "all" && requiredIndices.length > 4) {
    return { possible: false, matches: () => false };
  }

  if (rule.mode === "atLeast") {
    if (rule.n > 4 || rule.n > requiredIndices.length) {
      return { possible: false, matches: () => false };
    }
  }

  const requiredMask = requiredIndices.reduce((mask, index) => mask | (1 << index), 0);
  const matches = (mask: number): boolean => {
    if (rule.mode === "all") {
      return (mask & requiredMask) === requiredMask;
    }
    return popcount(mask & requiredMask) >= rule.n;
  };

  return { possible: true, matches };
}

function validateRule(rule: SubsRule): void {
  if (!rule || (rule.mode !== "all" && rule.mode !== "atLeast")) {
    throw new ArtifactEngineError("INVALID_PARAM", "subs rule must be 'all' or 'atLeast'.");
  }
  if (rule.mode === "atLeast" && (!Number.isInteger(rule.n) || rule.n < 0)) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `atLeast rule requires non-negative integer n, received: ${rule.n}`,
    );
  }
}

function validateUpgradeRequirement(upgrade: UpgradeRequirementEnabled): void {
  if (!Array.isArray(upgrade.targetGroup)) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      "upgrade.targetGroup must be an array.",
    );
  }
  if (!Number.isInteger(upgrade.k) || upgrade.k < 0 || upgrade.k > 5) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `upgrade.k must be an integer in [0,5], received: ${upgrade.k}`,
    );
  }
}

function clampProbability(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}
