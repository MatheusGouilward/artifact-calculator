import { DOMAIN_ATTEMPTS_PER_RUN } from "./tables";
import { ArtifactFarmParams } from "./types";
import {
  ArtifactEngineError,
  UpgradeRequirement,
  chanceAtLeastOne,
  probSuccessPerAttempt,
  probSuccessPerRunFromAttemptSuccess,
  runsForTargetChance,
} from "./engine";

export function probSuccessAfterRunsDomainsOnly(
  params: ArtifactFarmParams,
  upgrade: UpgradeRequirement | undefined,
  runs: number,
): number {
  assertRuns(runs);
  const pAttemptSuccess = probSuccessPerAttempt(params, upgrade).pAttemptSuccess;
  const pRunSuccess = probSuccessPerRunFromAttemptSuccess(pAttemptSuccess);
  return chanceAtLeastOne(pRunSuccess, runs);
}

export function probSuccessAfterRunsWithStrongbox(
  params: ArtifactFarmParams,
  upgrade: UpgradeRequirement | undefined,
  runs: number,
  recycleRate = 1,
): number {
  assertRuns(runs);
  const pAttemptDomain = probSuccessPerAttempt(params, upgrade).pAttemptSuccess;
  const pAttemptStrongbox = probSuccessPerAttempt(
    { ...params, setProbability: 1, setProbOverride: 1 },
    upgrade,
  ).pAttemptSuccess;

  return probSuccessAfterRunsWithStrongboxGivenAttemptProbs(
    runs,
    pAttemptDomain,
    pAttemptStrongbox,
    recycleRate,
  );
}

export function probSuccessAfterRunsWithStrongboxGivenAttemptProbs(
  runs: number,
  pAttemptDomain: number,
  pAttemptStrongbox: number,
  recycleRate = 1,
): number {
  assertRuns(runs);
  assertProbability(pAttemptDomain, "pAttemptDomain");
  assertProbability(pAttemptStrongbox, "pAttemptStrongbox");
  if (runs === 0) {
    return 0;
  }

  const recycle = clamp01(recycleRate);
  if (recycle === 0) {
    const pRunDomain = probSuccessPerRunFromAttemptSuccess(pAttemptDomain);
    return chanceAtLeastOne(pRunDomain, runs);
  }

  const dMax = runs * 2;
  const successAtDomainAttempts = new Float64Array(dMax + 1);
  const prev = new Float64Array(3);
  const curr = new Float64Array(3);

  for (let d = 1; d <= dMax; d += 1) {
    for (let remainder = 0; remainder <= 2; remainder += 1) {
      const nextIfRecycle =
        remainder < 2
          ? prev[remainder + 1]
          : pAttemptStrongbox + (1 - pAttemptStrongbox) * prev[1];

      curr[remainder] =
        pAttemptDomain +
        (1 - pAttemptDomain) * ((1 - recycle) * prev[remainder] + recycle * nextIfRecycle);
    }

    successAtDomainAttempts[d] = clamp01(curr[0]);
    prev[0] = curr[0];
    prev[1] = curr[1];
    prev[2] = curr[2];
  }

  const extraAttemptDistribution = binomialPmfSequence(
    runs,
    DOMAIN_ATTEMPTS_PER_RUN.twoArtifacts,
  );
  let probability = 0;

  for (let extra = 0; extra <= runs; extra += 1) {
    probability += extraAttemptDistribution[extra] * successAtDomainAttempts[runs + extra];
  }

  return clamp01(probability);
}

export function runsForTargetChanceWithStrongbox(
  params: ArtifactFarmParams,
  upgrade: UpgradeRequirement | undefined,
  targetProb: number,
  recycleRate = 1,
  maxRuns = 5000,
): number {
  if (!Number.isFinite(targetProb) || targetProb < 0 || targetProb > 1) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `targetProb must be within [0, 1], received: ${targetProb}`,
    );
  }
  if (!Number.isInteger(maxRuns) || maxRuns < 0) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `maxRuns must be a non-negative integer, received: ${maxRuns}`,
    );
  }

  const recycle = clamp01(recycleRate);
  if (targetProb === 0) {
    return 0;
  }

  if (recycle === 0) {
    const pAttemptSuccess = probSuccessPerAttempt(params, upgrade).pAttemptSuccess;
    const pRunSuccess = probSuccessPerRunFromAttemptSuccess(pAttemptSuccess);
    const runs = runsForTargetChance(pRunSuccess, targetProb);
    return runs <= maxRuns ? runs : Number.POSITIVE_INFINITY;
  }

  const cache = new Map<number, number>();
  const evalRuns = (runs: number): number => {
    const cached = cache.get(runs);
    if (cached !== undefined) {
      return cached;
    }
    const value = probSuccessAfterRunsWithStrongbox(params, upgrade, runs, recycle);
    cache.set(runs, value);
    return value;
  };

  if (evalRuns(maxRuns) < targetProb) {
    return Number.POSITIVE_INFINITY;
  }

  let low = 0;
  let high = 1;

  while (high < maxRuns && evalRuns(high) < targetProb) {
    low = high;
    high = Math.min(maxRuns, high * 2);
  }

  if (evalRuns(high) < targetProb) {
    return Number.POSITIVE_INFINITY;
  }

  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (evalRuns(mid) >= targetProb) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return high;
}

function binomialPmfSequence(n: number, q: number): Float64Array {
  if (!Number.isInteger(n) || n < 0) {
    throw new ArtifactEngineError("INVALID_PARAM", `n must be a non-negative integer, received: ${n}`);
  }
  if (!Number.isFinite(q) || q < 0 || q > 1) {
    throw new ArtifactEngineError("INVALID_PARAM", `q must be within [0, 1], received: ${q}`);
  }

  const pmf = new Float64Array(n + 1);
  if (n === 0) {
    pmf[0] = 1;
    return pmf;
  }
  if (q === 0) {
    pmf[0] = 1;
    return pmf;
  }
  if (q === 1) {
    pmf[n] = 1;
    return pmf;
  }

  pmf[0] = Math.exp(n * Math.log1p(-q));
  const ratioBase = q / (1 - q);

  for (let x = 0; x < n; x += 1) {
    pmf[x + 1] = pmf[x] * (((n - x) / (x + 1)) * ratioBase);
  }

  const total = pmf.reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    for (let x = 0; x <= n; x += 1) {
      pmf[x] /= total;
    }
  }

  return pmf;
}

function assertRuns(runs: number): void {
  if (!Number.isInteger(runs) || runs < 0) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `runs must be a non-negative integer, received: ${runs}`,
    );
  }
}

function assertProbability(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `${name} must be within [0, 1], received: ${value}`,
    );
  }
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
