import { ALL_STAT_KEYS, StatKey } from "./stat-keys";
import { StatBlock } from "./stat-block";
import { extractCombatTotals } from "./enka-fightprops";

export type ObjectiveId = "weighted_stats" | "expected_damage_simple";

export interface WeightedStatsObjectiveConfig {
  id: "weighted_stats";
  weights: Partial<Record<StatKey, number>>;
  caps?: Partial<Record<StatKey, number>>;
  hardMinimums?: Partial<Record<StatKey, number>>;
}

export interface ExpectedDamageSimpleObjectiveConfig {
  id: "expected_damage_simple";
  scaling: {
    stat: "atk" | "hp" | "def" | "em";
    multiplier: number;
    flat?: number;
  };
  damageType?: "physical" | "pyro" | "hydro" | "electro" | "cryo" | "dendro" | "anemo" | "geo";
  useCrit?: boolean;
}

export type ObjectiveConfig = WeightedStatsObjectiveConfig | ExpectedDamageSimpleObjectiveConfig;

export interface ScoreObjectiveOptions {
  normalizeTo100?: boolean;
}

export interface ScoreObjectiveContext {
  combat?: ReturnType<typeof extractCombatTotals>;
}

export interface ObjectiveScoreResult {
  score: number;
  breakdown: Record<string, number>;
  unmetMinimums: StatKey[];
}

function isScoreObjectiveOptions(
  value: ScoreObjectiveContext | ScoreObjectiveOptions,
): value is ScoreObjectiveOptions {
  return "normalizeTo100" in value;
}

export function scoreObjective(
  stats: StatBlock,
  config: ObjectiveConfig,
  contextOrOptions: ScoreObjectiveContext | ScoreObjectiveOptions = {},
  options: ScoreObjectiveOptions = {},
): ObjectiveScoreResult {
  const context = isScoreObjectiveOptions(contextOrOptions) ? {} : contextOrOptions;
  const resolvedOptions = isScoreObjectiveOptions(contextOrOptions) ? contextOrOptions : options;

  switch (config.id) {
    case "weighted_stats":
      return scoreWeightedStats(stats, config, resolvedOptions);
    case "expected_damage_simple":
      return scoreExpectedDamageSimple(config, context);
    default: {
      const exhaustiveCheck: never = config;
      throw new Error(`Unsupported objective config: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

function scoreWeightedStats(
  stats: StatBlock,
  config: WeightedStatsObjectiveConfig,
  options: ScoreObjectiveOptions,
): ObjectiveScoreResult {
  let rawScore = 0;
  const breakdown: Record<string, number> = {};
  const weightedKeys: StatKey[] = [];

  for (const key of ALL_STAT_KEYS) {
    const weight = config.weights[key];
    if (weight === undefined) {
      continue;
    }

    let value = stats[key];
    const cap = config.caps?.[key];
    if (cap !== undefined) {
      value = Math.min(value, cap);
    }

    const contribution = value * weight;
    rawScore += contribution;
    breakdown[key] = contribution;
    weightedKeys.push(key);
  }

  const unmetMinimums: StatKey[] = [];
  if (config.hardMinimums) {
    for (const key of ALL_STAT_KEYS) {
      const minimum = config.hardMinimums[key];
      if (minimum !== undefined && stats[key] < minimum) {
        unmetMinimums.push(key);
      }
    }
  }

  let score = rawScore;
  if (options.normalizeTo100) {
    const canNormalize = weightedKeys.every((key) => config.caps?.[key] !== undefined);
    if (canNormalize) {
      const maxScore = weightedKeys.reduce((sum, key) => {
        const cap = config.caps?.[key] ?? 0;
        const weight = config.weights[key] ?? 0;
        return sum + cap * weight;
      }, 0);

      if (maxScore > 0) {
        score = (rawScore / maxScore) * 100;
        breakdown.normalization_max_score = maxScore;
      }
    }
  }

  breakdown.total_raw_score = rawScore;
  breakdown.total_score = score;

  return { score, breakdown, unmetMinimums };
}

function clampToUnitInterval(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function getDamageBonusPct(
  combat: ReturnType<typeof extractCombatTotals>,
  damageType: ExpectedDamageSimpleObjectiveConfig["damageType"],
): number {
  switch (damageType) {
    case "physical":
      return combat.dmgBonusPhysicalPct;
    case "pyro":
      return combat.dmgBonusByElementPct.pyro;
    case "hydro":
      return combat.dmgBonusByElementPct.hydro;
    case "electro":
      return combat.dmgBonusByElementPct.electro;
    case "cryo":
      return combat.dmgBonusByElementPct.cryo;
    case "dendro":
      return combat.dmgBonusByElementPct.dendro;
    case "anemo":
      return combat.dmgBonusByElementPct.anemo;
    case "geo":
      return combat.dmgBonusByElementPct.geo;
    default:
      return 0;
  }
}

function getScalingTotal(
  combat: ReturnType<typeof extractCombatTotals>,
  scalingStat: ExpectedDamageSimpleObjectiveConfig["scaling"]["stat"],
): number {
  switch (scalingStat) {
    case "atk":
      return combat.atk;
    case "hp":
      return combat.hp;
    case "def":
      return combat.def;
    case "em":
      return combat.em;
    default: {
      const exhaustiveCheck: never = scalingStat;
      throw new Error(`Unsupported scaling stat: ${exhaustiveCheck}`);
    }
  }
}

function scoreExpectedDamageSimple(
  config: ExpectedDamageSimpleObjectiveConfig,
  context: ScoreObjectiveContext,
): ObjectiveScoreResult {
  const combat = context.combat ?? extractCombatTotals();
  const total = getScalingTotal(combat, config.scaling.stat);
  const base = total * config.scaling.multiplier + (config.scaling.flat ?? 0);
  const dmgBonus = getDamageBonusPct(combat, config.damageType);

  const shouldUseCrit = config.useCrit ?? true;
  const critRate = clampToUnitInterval(combat.critRatePct / 100);
  const critDmg = Math.max(combat.critDmgPct / 100, 0);
  const critMult = shouldUseCrit ? 1 + critRate * critDmg : 1;

  const expectedDamage = base * (1 + dmgBonus / 100) * critMult;

  return {
    score: expectedDamage,
    breakdown: {
      base,
      dmgBonus,
      critMult,
      expectedDamage,
    },
    unmetMinimums: [],
  };
}
