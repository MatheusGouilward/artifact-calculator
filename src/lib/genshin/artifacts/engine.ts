import { dpWeightedDrawMasks, popcount } from "./dp";
import {
  ALL_SUB_STATS,
  DEFAULT_SET_PROBABILITY,
  DEFAULT_SLOT_PROBABILITY,
  DOMAIN_ATTEMPTS_PER_RUN,
  MAIN_STAT_PROBABILITIES,
  SUBSTAT_WEIGHTS,
  excludedSubStatForMain,
} from "./tables";
import { ArtifactFarmParams, MainStat, Slot, SubStat, SubsRule } from "./types";

export type ArtifactEngineErrorCode =
  | "INVALID_PARAM"
  | "INVALID_RULE"
  | "INVALID_PROBABILITY"
  | "INVALID_MAIN_FOR_SLOT";

export class ArtifactEngineError extends Error {
  public readonly code: ArtifactEngineErrorCode;

  public constructor(code: ArtifactEngineErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ArtifactEngineError";
  }
}

export interface UpgradeRequirementEnabled {
  enabled: true;
  targetGroup: SubStat[];
  k: number;
}

export type UpgradeRequirement = { enabled: false } | UpgradeRequirementEnabled;

export function mainStatProb(slot: Slot, main: MainStat): number {
  return MAIN_STAT_PROBABILITIES[slot][main] ?? 0;
}

export function availableSubStats(main: MainStat): { subs: SubStat[]; weights: number[] } {
  const excluded = excludedSubStatForMain(main);
  const subs = ALL_SUB_STATS.filter((sub) => sub !== excluded);
  const weights = subs.map((sub) => SUBSTAT_WEIGHTS[sub]);
  return { subs, weights };
}

export function binomialPmf(n: number, p: number, k: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new ArtifactEngineError("INVALID_PARAM", `n must be a non-negative integer, received: ${n}`);
  }
  if (!Number.isInteger(k) || k < 0 || k > n) {
    return 0;
  }
  assertProbability(p, "p");

  if (p === 0) {
    return k === 0 ? 1 : 0;
  }
  if (p === 1) {
    return k === n ? 1 : 0;
  }

  const coefficient = nChooseK(n, k);
  return coefficient * p ** k * (1 - p) ** (n - k);
}

export function binomialTailAtLeast(n: number, p: number, k: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new ArtifactEngineError("INVALID_PARAM", `n must be a non-negative integer, received: ${n}`);
  }
  if (!Number.isInteger(k)) {
    throw new ArtifactEngineError("INVALID_PARAM", `k must be an integer, received: ${k}`);
  }
  assertProbability(p, "p");

  if (k <= 0) {
    return 1;
  }
  if (k > n) {
    return 0;
  }

  let probability = 0;
  for (let i = k; i <= n; i += 1) {
    probability += binomialPmf(n, p, i);
  }

  return clampProbability(probability);
}

export function maskGroupSize(mask: number, subs: SubStat[], orderedPool: SubStat[]): number {
  const uniqueSubs = Array.from(new Set(subs));
  const indexBySub = new Map(orderedPool.map((sub, index) => [sub, index] as const));

  let size = 0;
  for (const sub of uniqueSubs) {
    const index = indexBySub.get(sub);
    if (index === undefined) {
      continue;
    }
    if ((mask & (1 << index)) !== 0) {
      size += 1;
    }
  }

  return size;
}

export function final4MaskDistribution(main: MainStat): {
  from4: Map<number, number>;
  from3: Map<number, number>;
} {
  const { weights } = availableSubStats(main);
  const from4Raw = dpWeightedDrawMasks(weights, 4);
  const from4 = new Map<number, number>();

  for (const [mask, probability] of from4Raw.entries()) {
    from4.set(mask, probability * 0.2);
  }

  const maskWeightSums = buildMaskWeightSums(weights);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const from3Raw = dpWeightedDrawMasks(weights, 3);
  const from3 = new Map<number, number>();

  for (const [mask3, probability3] of from3Raw.entries()) {
    const remainingWeight = totalWeight - maskWeightSums[mask3];
    if (remainingWeight <= 0) {
      continue;
    }

    for (let index = 0; index < weights.length; index += 1) {
      const bit = 1 << index;
      if ((mask3 & bit) !== 0) {
        continue;
      }
      const weight = weights[index];
      if (weight <= 0) {
        continue;
      }

      const mask4 = mask3 | bit;
      const probability = 0.8 * probability3 * (weight / remainingWeight);
      from3.set(mask4, (from3.get(mask4) ?? 0) + probability);
    }
  }

  return { from4, from3 };
}

export function probFinal4SubsSatisfyRule(
  required: SubStat[],
  main: MainStat,
  rule: SubsRule,
): number {
  const matcher = createCandidateMaskMatcher(required, main, rule);
  if (!matcher.possible) {
    return 0;
  }

  const distribution = final4MaskDistribution(main);
  let probability = 0;

  for (const [mask, branchProbability] of distribution.from4.entries()) {
    if (matcher.matches(mask)) {
      probability += branchProbability;
    }
  }

  for (const [mask, branchProbability] of distribution.from3.entries()) {
    if (matcher.matches(mask)) {
      probability += branchProbability;
    }
  }

  return clampProbability(probability);
}

export function probPerAttempt(params: ArtifactFarmParams): {
  breakdown: { pSet: number; pSlot: number; pMain: number; pSubs: number };
  pAttempt: number;
} {
  validateParams(params);

  const resolvedSetProbability = params.setProbability ?? params.setProbOverride ?? DEFAULT_SET_PROBABILITY;
  const pSlot = params.slotProbability ?? DEFAULT_SLOT_PROBABILITY;
  const pMain = mainStatProb(params.slot, params.main);

  if (pMain <= 0) {
    throw new ArtifactEngineError(
      "INVALID_MAIN_FOR_SLOT",
      `Main stat "${params.main}" is not valid for slot "${params.slot}".`,
    );
  }

  const pSubs = probFinal4SubsSatisfyRule(params.requiredSubs, params.main, params.subsRule);
  const pAttempt = clampProbability(resolvedSetProbability * pSlot * pMain * pSubs);

  return {
    breakdown: {
      pSet: resolvedSetProbability,
      pSlot,
      pMain,
      pSubs,
    },
    pAttempt,
  };
}

export function probUpgradeHitsAtLeastGivenMask(
  mask: number,
  targetGroup: SubStat[],
  main: MainStat,
  nRolls: number,
  k: number,
): number {
  if (!Number.isInteger(nRolls) || nRolls < 0) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `nRolls must be a non-negative integer, received: ${nRolls}`,
    );
  }
  if (!Number.isInteger(k) || k < 0) {
    throw new ArtifactEngineError("INVALID_PARAM", `k must be a non-negative integer, received: ${k}`);
  }

  const orderedPool = availableSubStats(main).subs;
  const groupSize = maskGroupSize(mask, targetGroup, orderedPool);
  const p = groupSize / 4;

  return binomialTailAtLeast(nRolls, p, k);
}

export function probUpgradeGivenCandidate(
  params: ArtifactFarmParams,
  upgrade: UpgradeRequirementEnabled,
): number {
  validateParams(params);
  validateUpgradeRequirement(upgrade);

  const matcher = createCandidateMaskMatcher(params.requiredSubs, params.main, params.subsRule);
  if (!matcher.possible) {
    return 0;
  }

  const distribution = final4MaskDistribution(params.main);
  let denominator = 0;
  let numerator = 0;

  for (const [mask, branchProbability] of distribution.from4.entries()) {
    if (!matcher.matches(mask)) {
      continue;
    }
    denominator += branchProbability;
    numerator +=
      branchProbability *
      probUpgradeHitsAtLeastGivenMask(mask, upgrade.targetGroup, params.main, 5, upgrade.k);
  }

  for (const [mask, branchProbability] of distribution.from3.entries()) {
    if (!matcher.matches(mask)) {
      continue;
    }
    denominator += branchProbability;
    numerator +=
      branchProbability *
      probUpgradeHitsAtLeastGivenMask(mask, upgrade.targetGroup, params.main, 4, upgrade.k);
  }

  if (denominator <= 0) {
    return 0;
  }

  return clampProbability(numerator / denominator);
}

export function probSuccessPerAttempt(
  params: ArtifactFarmParams,
  upgrade?: UpgradeRequirement,
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
  const candidate = probPerAttempt(params);

  if (!upgrade || !upgrade.enabled) {
    return {
      breakdown: {
        ...candidate.breakdown,
        pUpgradeCond: 1,
      },
      pAttemptCandidate: candidate.pAttempt,
      pAttemptSuccess: candidate.pAttempt,
    };
  }

  const pUpgradeCond = probUpgradeGivenCandidate(params, upgrade);
  const pAttemptSuccess = clampProbability(candidate.pAttempt * pUpgradeCond);

  return {
    breakdown: {
      ...candidate.breakdown,
      pUpgradeCond,
    },
    pAttemptCandidate: candidate.pAttempt,
    pAttemptSuccess,
  };
}

export function probPerRunFromAttempt(pAttempt: number): number {
  assertProbability(pAttempt, "pAttempt");
  const pMiss = 1 - pAttempt;
  const pHitOnTwoDrops = 1 - pMiss ** 2;
  return (
    DOMAIN_ATTEMPTS_PER_RUN.oneArtifact * pAttempt +
    DOMAIN_ATTEMPTS_PER_RUN.twoArtifacts * pHitOnTwoDrops
  );
}

export function probSuccessPerRunFromAttemptSuccess(pAttemptSuccess: number): number {
  return probPerRunFromAttempt(pAttemptSuccess);
}

export function chanceAtLeastOne(pRun: number, runs: number): number {
  assertProbability(pRun, "pRun");
  if (!Number.isInteger(runs) || runs < 0) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `runs must be a non-negative integer, received: ${runs}`,
    );
  }

  if (runs === 0) {
    return 0;
  }

  return 1 - (1 - pRun) ** runs;
}

export function runsForTargetChance(pRun: number, target: number): number {
  assertProbability(pRun, "pRun");
  if (!Number.isFinite(target) || target < 0 || target > 1) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `target must be within [0, 1], received: ${target}`,
    );
  }

  if (target === 0) {
    return 0;
  }

  if (pRun === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (pRun === 1) {
    return 1;
  }

  if (target === 1) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.ceil(Math.log(1 - target) / Math.log(1 - pRun));
}

export function expectedRuns(pRun: number): number {
  assertProbability(pRun, "pRun");
  if (pRun === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return 1 / pRun;
}

function validateParams(params: ArtifactFarmParams): void {
  if (!params) {
    throw new ArtifactEngineError("INVALID_PARAM", "params is required.");
  }

  if (!Object.values(Slot).includes(params.slot)) {
    throw new ArtifactEngineError("INVALID_PARAM", `Unknown slot: ${String(params.slot)}`);
  }

  if (!Object.values(MainStat).includes(params.main)) {
    throw new ArtifactEngineError("INVALID_PARAM", `Unknown main stat: ${String(params.main)}`);
  }

  if (!Array.isArray(params.requiredSubs)) {
    throw new ArtifactEngineError("INVALID_PARAM", "requiredSubs must be an array.");
  }

  const seen = new Set<SubStat>();
  for (const sub of params.requiredSubs) {
    if (!Object.values(SubStat).includes(sub)) {
      throw new ArtifactEngineError("INVALID_PARAM", `Unknown substat: ${String(sub)}`);
    }
    if (seen.has(sub)) {
      throw new ArtifactEngineError("INVALID_PARAM", `Duplicate required substat: ${sub}`);
    }
    seen.add(sub);
  }

  validateRule(params.subsRule);

  if (params.setProbability !== undefined) {
    assertProbability(params.setProbability, "setProbability");
  }

  if (params.setProbOverride !== undefined) {
    assertProbability(params.setProbOverride, "setProbOverride");
  }

  if (params.slotProbability !== undefined) {
    assertProbability(params.slotProbability, "slotProbability");
  }
}

function validateRule(rule: SubsRule): void {
  if (!rule || (rule.mode !== "all" && rule.mode !== "atLeast")) {
    throw new ArtifactEngineError("INVALID_RULE", "subs rule must be 'all' or 'atLeast'.");
  }

  if (rule.mode === "atLeast") {
    if (!Number.isInteger(rule.n) || rule.n < 0) {
      throw new ArtifactEngineError(
        "INVALID_RULE",
        `atLeast rule requires n as a non-negative integer, received: ${rule.n}`,
      );
    }
  }
}

function validateUpgradeRequirement(upgrade: UpgradeRequirementEnabled): void {
  if (!upgrade || upgrade.enabled !== true) {
    throw new ArtifactEngineError("INVALID_PARAM", "upgrade requirement must be enabled.");
  }

  if (!Array.isArray(upgrade.targetGroup)) {
    throw new ArtifactEngineError("INVALID_PARAM", "upgrade.targetGroup must be an array.");
  }

  for (const sub of upgrade.targetGroup) {
    if (!Object.values(SubStat).includes(sub)) {
      throw new ArtifactEngineError("INVALID_PARAM", `Unknown upgrade target substat: ${String(sub)}`);
    }
  }

  if (!Number.isInteger(upgrade.k) || upgrade.k < 0 || upgrade.k > 5) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `upgrade.k must be an integer in [0, 5], received: ${upgrade.k}`,
    );
  }
}

function createCandidateMaskMatcher(
  required: SubStat[],
  main: MainStat,
  rule: SubsRule,
): {
  possible: boolean;
  matches: (mask: number) => boolean;
} {
  validateRule(rule);

  const requiredUnique = Array.from(new Set(required));
  const { subs: orderedPool } = availableSubStats(main);
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

function assertProbability(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ArtifactEngineError(
      "INVALID_PROBABILITY",
      `${label} must be within [0, 1], received: ${value}`,
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

function buildMaskWeightSums(weights: number[]): Float64Array {
  const maxMask = 1 << weights.length;
  const sums = new Float64Array(maxMask);
  for (let mask = 1; mask < maxMask; mask += 1) {
    const leastBit = mask & -mask;
    const previous = mask ^ leastBit;
    const index = 31 - Math.clz32(leastBit);
    sums[mask] = sums[previous] + weights[index];
  }
  return sums;
}

function nChooseK(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }

  const m = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= m; i += 1) {
    result = (result * (n - m + i)) / i;
  }
  return result;
}
