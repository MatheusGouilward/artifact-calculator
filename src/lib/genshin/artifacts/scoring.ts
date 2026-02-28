import { dpWeightedDrawMasks, popcount } from "./dp";
import {
  ArtifactEngineError,
  UpgradeRequirement,
  availableSubStats,
  final4MaskDistribution,
  probPerAttempt,
} from "./engine";
import { SUBSTAT_ROLL_VALUES_5STAR } from "./tables";
import {
  ArtifactFarmParams,
  AttemptSource,
  MainStat,
  SubStat,
  SubsRule,
  TransmuterChoice,
  TransmuterConfig,
} from "./types";

const CV_SCALE = 100;
const PERCENT_SUBSTATS = new Set<SubStat>([
  SubStat.HpPercent,
  SubStat.AtkPercent,
  SubStat.DefPercent,
  SubStat.EnergyRecharge,
  SubStat.CritRate,
  SubStat.CritDmg,
]);

const rollDistCache = new Map<string, Map<number, number>>();
const upgradeCompositionCache = new Map<number, Array<{ counts: [number, number, number, number]; prob: number }>>();
const cvMaskCache = new Map<string, Map<number, number>>();

export function rollSumDist(sub: SubStat, m: number): Map<number, number> {
  if (!Number.isInteger(m) || m < 0 || m > 6) {
    throw new ArtifactEngineError("INVALID_PARAM", `m must be integer in [0,6], received: ${m}`);
  }

  const cacheKey = `${sub}:${m}`;
  const cached = rollDistCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let distribution = new Map<number, number>([[0, 1]]);
  const tiers = getScaledRollTiers(sub);

  for (let roll = 0; roll < m; roll += 1) {
    const next = new Map<number, number>();
    for (const [sum, probability] of distribution.entries()) {
      for (const tier of tiers) {
        next.set(sum + tier, (next.get(sum + tier) ?? 0) + probability * 0.25);
      }
    }
    distribution = next;
  }

  rollDistCache.set(cacheKey, distribution);
  return distribution;
}

export function critValueStats(
  params: ArtifactFarmParams,
  attemptSource: AttemptSource,
  upgrade: UpgradeRequirement | undefined,
  transmuterConfig: TransmuterConfig | undefined,
  transmuterChoice: TransmuterChoice | undefined,
  thresholdCv: number,
): {
  pCandidateAttempt: number;
  expectedCvGivenCandidate: number;
  pCvAtLeastGivenCandidate: number;
  pCvAtLeastPerAttempt: number;
} {
  void upgrade;
  void transmuterConfig;

  if (!Number.isFinite(thresholdCv)) {
    throw new ArtifactEngineError("INVALID_PARAM", `thresholdCv must be finite, received: ${thresholdCv}`);
  }
  const thresholdScaled = Math.round(thresholdCv * CV_SCALE);

  let pCandidateAttempt = 0;
  let candidateContext:
    | {
        orderedPool: SubStat[];
        branches: Array<{ mask: number; weightGivenCandidate: number; nRolls: 4 | 5 }>;
      }
    | undefined;

  if (attemptSource === "domain" || attemptSource === "strongbox") {
    pCandidateAttempt =
      attemptSource === "domain"
        ? probPerAttempt(params).pAttempt
        : probPerAttempt({ ...params, setProbOverride: 1 }).pAttempt;
    candidateContext = buildCandidateBranchesForDomainLike(
      params.main,
      params.requiredSubs,
      params.subsRule,
    );
  } else {
    if (!transmuterChoice) {
      return {
        pCandidateAttempt: 0,
        expectedCvGivenCandidate: 0,
        pCvAtLeastGivenCandidate: 0,
        pCvAtLeastPerAttempt: 0,
      };
    }

    const transmuter = buildTransmuterCandidateBranches(
      params.main,
      params.requiredSubs,
      params.subsRule,
      transmuterChoice,
    );
    pCandidateAttempt = transmuter.pCandidateAttempt;
    candidateContext = {
      orderedPool: transmuter.orderedPool,
      branches: transmuter.branches,
    };
  }

  if (!candidateContext || candidateContext.branches.length === 0) {
    return {
      pCandidateAttempt,
      expectedCvGivenCandidate: 0,
      pCvAtLeastGivenCandidate: 0,
      pCvAtLeastPerAttempt: 0,
    };
  }

  let expectedCvScaled = 0;
  let pCvAtLeastGivenCandidate = 0;

  for (const branch of candidateContext.branches) {
    const cvDist = cvDistributionGivenMask(
      branch.mask,
      candidateContext.orderedPool,
      branch.nRolls,
    );

    let branchExpectation = 0;
    let branchTail = 0;
    for (const [cvScaled, probability] of cvDist.entries()) {
      branchExpectation += cvScaled * probability;
      if (cvScaled >= thresholdScaled) {
        branchTail += probability;
      }
    }

    expectedCvScaled += branch.weightGivenCandidate * branchExpectation;
    pCvAtLeastGivenCandidate += branch.weightGivenCandidate * branchTail;
  }

  pCvAtLeastGivenCandidate = clamp01(pCvAtLeastGivenCandidate);

  return {
    pCandidateAttempt: clamp01(pCandidateAttempt),
    expectedCvGivenCandidate: expectedCvScaled / CV_SCALE,
    pCvAtLeastGivenCandidate,
    pCvAtLeastPerAttempt: clamp01(pCandidateAttempt * pCvAtLeastGivenCandidate),
  };
}

function buildCandidateBranchesForDomainLike(
  main: MainStat,
  requiredSubs: SubStat[],
  rule: SubsRule,
): {
  orderedPool: SubStat[];
  branches: Array<{ mask: number; weightGivenCandidate: number; nRolls: 4 | 5 }>;
} {
  const orderedPool = availableSubStats(main).subs;
  const matcher = createCandidateMaskMatcher(requiredSubs, orderedPool, rule);
  if (!matcher.possible) {
    return { orderedPool, branches: [] };
  }

  const dist = final4MaskDistribution(main);
  const raw: Array<{ mask: number; probability: number; nRolls: 4 | 5 }> = [];
  let denominator = 0;

  for (const [mask, probability] of dist.from4.entries()) {
    if (!matcher.matches(mask)) {
      continue;
    }
    denominator += probability;
    raw.push({ mask, probability, nRolls: 5 });
  }

  for (const [mask, probability] of dist.from3.entries()) {
    if (!matcher.matches(mask)) {
      continue;
    }
    denominator += probability;
    raw.push({ mask, probability, nRolls: 4 });
  }

  if (denominator <= 0) {
    return { orderedPool, branches: [] };
  }

  return {
    orderedPool,
    branches: raw.map((entry) => ({
      mask: entry.mask,
      nRolls: entry.nRolls,
      weightGivenCandidate: entry.probability / denominator,
    })),
  };
}

function buildTransmuterCandidateBranches(
  main: MainStat,
  requiredSubs: SubStat[],
  rule: SubsRule,
  choice: TransmuterChoice,
): {
  orderedPool: SubStat[];
  pCandidateAttempt: number;
  branches: Array<{ mask: number; weightGivenCandidate: number; nRolls: 5 }>;
} {
  if (choice.fixedMain !== main) {
    return { orderedPool: availableSubStats(main).subs, pCandidateAttempt: 0, branches: [] };
  }

  const { subs: orderedPool, weights } = availableSubStats(main);
  const indexBySub = new Map(orderedPool.map((sub, index) => [sub, index] as const));

  const fixedSubs = Array.from(new Set(choice.fixedSubs));
  if (fixedSubs.length !== 2) {
    return { orderedPool, pCandidateAttempt: 0, branches: [] };
  }

  const fixedIndices: number[] = [];
  for (const sub of fixedSubs) {
    const index = indexBySub.get(sub);
    if (index === undefined) {
      return { orderedPool, pCandidateAttempt: 0, branches: [] };
    }
    fixedIndices.push(index);
  }

  const fixedMask = fixedIndices.reduce((mask, index) => mask | (1 << index), 0);
  const remainingIndices = orderedPool
    .map((_, index) => index)
    .filter((index) => !fixedIndices.includes(index));
  const remainingWeights = remainingIndices.map((index) => weights[index]);
  const remainingDist = dpWeightedDrawMasks(remainingWeights, 2);

  const fullMaskDist = new Map<number, number>();
  for (const [remainingMask, probability] of remainingDist.entries()) {
    let fullMask = fixedMask;
    for (let i = 0; i < remainingIndices.length; i += 1) {
      if ((remainingMask & (1 << i)) !== 0) {
        fullMask |= 1 << remainingIndices[i];
      }
    }
    fullMaskDist.set(fullMask, (fullMaskDist.get(fullMask) ?? 0) + probability);
  }

  const matcher = createCandidateMaskMatcher(requiredSubs, orderedPool, rule);
  if (!matcher.possible) {
    return { orderedPool, pCandidateAttempt: 0, branches: [] };
  }

  let candidateProb = 0;
  for (const [mask, probability] of fullMaskDist.entries()) {
    if (matcher.matches(mask)) {
      candidateProb += probability;
    }
  }
  candidateProb = clamp01(candidateProb);

  if (candidateProb <= 0) {
    return { orderedPool, pCandidateAttempt: 0, branches: [] };
  }

  const branches: Array<{ mask: number; weightGivenCandidate: number; nRolls: 5 }> = [];
  for (const [mask, probability] of fullMaskDist.entries()) {
    if (!matcher.matches(mask)) {
      continue;
    }
    branches.push({
      mask,
      nRolls: 5,
      weightGivenCandidate: probability / candidateProb,
    });
  }

  return {
    orderedPool,
    pCandidateAttempt: candidateProb,
    branches,
  };
}

function cvDistributionGivenMask(
  mask: number,
  orderedPool: SubStat[],
  nRolls: 4 | 5,
): Map<number, number> {
  const key = `${mask}|${nRolls}|${orderedPool.join(",")}`;
  const cached = cvMaskCache.get(key);
  if (cached) {
    return cached;
  }

  const presentIndices: number[] = [];
  for (let i = 0; i < orderedPool.length; i += 1) {
    if ((mask & (1 << i)) !== 0) {
      presentIndices.push(i);
    }
  }
  if (presentIndices.length !== 4) {
    return new Map<number, number>([[0, 1]]);
  }

  const compositions = upgradeRollCompositions(nRolls);
  const distribution = new Map<number, number>();

  for (const composition of compositions) {
    let mCritRate = 0;
    let mCritDmg = 0;

    for (let i = 0; i < 4; i += 1) {
      const sub = orderedPool[presentIndices[i]];
      const totalRollsOnSub = 1 + composition.counts[i];
      if (sub === SubStat.CritRate) {
        mCritRate = totalRollsOnSub;
      } else if (sub === SubStat.CritDmg) {
        mCritDmg = totalRollsOnSub;
      }
    }

    const distCritRate = rollSumDist(SubStat.CritRate, mCritRate);
    const distCritDmg = rollSumDist(SubStat.CritDmg, mCritDmg);

    for (const [critRateScaled, pCritRate] of distCritRate.entries()) {
      for (const [critDmgScaled, pCritDmg] of distCritDmg.entries()) {
        const cvScaled = critDmgScaled + 2 * critRateScaled;
        const probability = composition.prob * pCritRate * pCritDmg;
        distribution.set(cvScaled, (distribution.get(cvScaled) ?? 0) + probability);
      }
    }
  }

  cvMaskCache.set(key, distribution);
  return distribution;
}

function upgradeRollCompositions(
  nRolls: number,
): Array<{ counts: [number, number, number, number]; prob: number }> {
  const cached = upgradeCompositionCache.get(nRolls);
  if (cached) {
    return cached;
  }

  const factorial = (n: number): number => {
    let result = 1;
    for (let i = 2; i <= n; i += 1) {
      result *= i;
    }
    return result;
  };

  const numerator = factorial(nRolls);
  const baseProb = (1 / 4) ** nRolls;
  const compositions: Array<{ counts: [number, number, number, number]; prob: number }> = [];

  for (let a = 0; a <= nRolls; a += 1) {
    for (let b = 0; b <= nRolls - a; b += 1) {
      for (let c = 0; c <= nRolls - a - b; c += 1) {
        const d = nRolls - a - b - c;
        const denominator = factorial(a) * factorial(b) * factorial(c) * factorial(d);
        compositions.push({
          counts: [a, b, c, d],
          prob: (numerator / denominator) * baseProb,
        });
      }
    }
  }

  upgradeCompositionCache.set(nRolls, compositions);
  return compositions;
}

function createCandidateMaskMatcher(
  requiredSubs: SubStat[],
  orderedPool: SubStat[],
  rule: SubsRule,
): { possible: boolean; matches: (mask: number) => boolean } {
  if (!rule || (rule.mode !== "all" && rule.mode !== "atLeast")) {
    throw new ArtifactEngineError("INVALID_PARAM", "subs rule must be 'all' or 'atLeast'.");
  }

  const requiredUnique = Array.from(new Set(requiredSubs));
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

  if (rule.mode === "atLeast" && (rule.n > 4 || rule.n > requiredIndices.length)) {
    return { possible: false, matches: () => false };
  }

  const requiredMask = requiredIndices.reduce((mask, index) => mask | (1 << index), 0);

  return {
    possible: true,
    matches: (mask: number) => {
      if (rule.mode === "all") {
        return (mask & requiredMask) === requiredMask;
      }
      return popcount(mask & requiredMask) >= rule.n;
    },
  };
}

function getScaledRollTiers(sub: SubStat): number[] {
  const tiers = SUBSTAT_ROLL_VALUES_5STAR[sub];
  const scale = PERCENT_SUBSTATS.has(sub) ? 100 : 1;
  return tiers.map((value) => Math.round(value * scale));
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}
