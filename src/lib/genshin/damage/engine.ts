import { loadGameDataCore } from "@/lib/genshin/game-data-core";
import type { GameDataCore } from "@/lib/genshin/game-data-core";

import { applyEnemyRes, type EnemyModel } from "./enemy";
import { getTalentMultiplier, getTalentMultiplierByHitId } from "./multipliers";
import type {
  AttackKind,
  AttackSpec,
  CharacterProfileV1,
  CharacterState,
  DamageResult,
  DamageType,
  ScalingStat,
} from "./types";

const DEFAULT_ATTACKER_LEVEL = 90;
const DEFAULT_ENEMY_LEVEL = 90;
const DEFAULT_RESISTANCE_PCT = 10;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizePctPointsToRatio(
  valuePct: number,
  label: string,
  notes: string[],
): { pctPoints: number; ratio: number } {
  if (!Number.isFinite(valuePct)) {
    notes.push(`normalized_${label}_pct_non_finite_to_zero`);
    return { pctPoints: 0, ratio: 0 };
  }
  return { pctPoints: valuePct, ratio: valuePct / 100 };
}

function resolveEnemy(
  specEnemy: EnemyModel | undefined,
  effectiveDamageType: DamageType,
  notes: string[],
): EnemyModel {
  if (!specEnemy) {
    notes.push("enemy_default_used");
    return {
      level: DEFAULT_ENEMY_LEVEL,
      baseResPctPoints: DEFAULT_RESISTANCE_PCT,
      damageType: effectiveDamageType,
    };
  }

  if (specEnemy.damageType !== effectiveDamageType) {
    notes.push(`enemy_damage_type_aligned:${specEnemy.damageType}->${effectiveDamageType}`);
  }

  return {
    level: Math.floor(clamp(specEnemy.level, 1, 100)),
    baseResPctPoints: Number.isFinite(specEnemy.baseResPctPoints)
      ? specEnemy.baseResPctPoints
      : DEFAULT_RESISTANCE_PCT,
    damageType: effectiveDamageType,
  };
}

function getTalentLevelForKind(
  talentLevels: CharacterState["talentLevels"],
  kind: AttackKind,
): number {
  if (kind === "normal") {
    return talentLevels.normal;
  }
  if (kind === "skill") {
    return talentLevels.skill;
  }
  return talentLevels.burst;
}

function buildFallbackProfile(characterId: number): CharacterProfileV1 {
  return {
    characterId,
    scalingStatByKind: {
      normal: "atk",
      skill: "atk",
      burst: "atk",
    },
    defaultDamageTypeByKind: {
      normal: "physical",
      skill: "physical",
      burst: "physical",
    },
    notes: ["fallback_profile_defaults"],
  };
}

function resolveProfile(
  state: CharacterState,
  core: GameDataCore,
  notes: string[],
): CharacterProfileV1 {
  if (state.profile) {
    return state.profile;
  }

  const fromCore = core.characterProfiles[state.characterId];
  if (fromCore) {
    return fromCore;
  }

  notes.push(`missing_character_profile:${state.characterId}:using_defaults`);
  return buildFallbackProfile(state.characterId);
}

function resolveScalingStat(
  profile: CharacterProfileV1,
  kind: AttackKind,
): ScalingStat {
  return profile.scalingStatByKind[kind] ?? "atk";
}

function resolveDamageType(
  profile: CharacterProfileV1,
  kind: AttackKind,
  requested?: DamageType,
): DamageType {
  if (requested) {
    return requested;
  }
  return profile.defaultDamageTypeByKind[kind] ?? "physical";
}

export function computeHitDamage(
  state: CharacterState,
  spec: AttackSpec,
  core: GameDataCore = loadGameDataCore(),
): DamageResult {
  const notes: string[] = [];
  const useCrit = spec.useCrit !== false;
  const profile = resolveProfile(state, core, notes);
  const scalingStatUsed = resolveScalingStat(profile, spec.kind);
  const damageTypeUsed = resolveDamageType(profile, spec.kind, spec.damageType);
  if (!spec.damageType) {
    notes.push(`using_profile_default_damage_type:${spec.kind}:${damageTypeUsed}`);
  }

  const talentLevel = getTalentLevelForKind(state.talentLevels, spec.kind);
  const lookup = spec.hitId
    ? getTalentMultiplierByHitId(
      core,
      state.characterId,
      spec.kind,
      spec.hitId,
      talentLevel,
      spec.hitKey,
    )
    : getTalentMultiplier(core, state.characterId, spec.kind, spec.hitKey ?? "", talentLevel);

  if (spec.hitId) {
    if (lookup.notes.some((entry) => entry.startsWith("hitId_not_found_fallback:"))) {
      notes.push("hitId_not_found_fallback");
    } else {
      notes.push("hitId_used");
    }
  } else {
    notes.push("legacy_hitKey_used");
  }
  if (!spec.hitId && !spec.hitKey) {
    notes.push("missing_hit_selector_fallback");
  }

  notes.push(...lookup.notes);

  const baseStatRaw = state.combatTotals[scalingStatUsed];
  const baseStat = Number.isFinite(baseStatRaw) ? baseStatRaw : 0;
  const multiplier = lookup.multiplier;
  const base = baseStat * multiplier;
  const rawDmgBonusPct = damageTypeUsed === "physical"
    ? state.combatTotals.dmgBonusPhysicalPct
    : state.combatTotals.dmgBonusByElementPct[damageTypeUsed] ?? 0;
  const dmgBonus = normalizePctPointsToRatio(rawDmgBonusPct, "dmg_bonus", notes);

  const attackerLevel = Math.floor(clamp(state.level ?? DEFAULT_ATTACKER_LEVEL, 1, 100));
  const enemy = resolveEnemy(spec.enemy, damageTypeUsed, notes);
  const enemyLevel = enemy.level;
  const defMultUsed = (attackerLevel + 100) / ((attackerLevel + 100) + (enemyLevel + 100));

  const critRateRaw = normalizePctPointsToRatio(state.combatTotals.critRatePct, "crit_rate", notes);
  const critRateClamped = clamp(critRateRaw.ratio, 0, 1);
  if (critRateClamped !== critRateRaw.ratio) {
    notes.push(`clamped_crit_rate_ratio:${critRateRaw.ratio}->${critRateClamped}`);
  }

  const critDmgRaw = normalizePctPointsToRatio(state.combatTotals.critDmgPct, "crit_dmg", notes);
  const critDmgClamped = Math.max(0, critDmgRaw.ratio);
  if (critDmgClamped !== critDmgRaw.ratio) {
    notes.push(`clamped_crit_dmg_ratio:${critDmgRaw.ratio}->${critDmgClamped}`);
  }

  const preEnemyNonCrit = base * (1 + dmgBonus.ratio) * defMultUsed;
  const effectiveCritRate = useCrit ? critRateClamped : 0;

  let preEnemyCrit = preEnemyNonCrit * (1 + critDmgClamped);
  let preEnemyAvg = preEnemyNonCrit * (1 + effectiveCritRate * critDmgClamped);

  if (!useCrit) {
    preEnemyCrit = preEnemyNonCrit;
    preEnemyAvg = preEnemyNonCrit;
    notes.push("crit_disabled_non_crit_output");
  }

  const enemyAdjusted = applyEnemyRes(
    {
      nonCrit: preEnemyNonCrit,
      crit: preEnemyCrit,
      avg: preEnemyAvg,
    },
    enemy,
    spec.resShredPctPoints ?? 0,
  );
  notes.push(...enemyAdjusted.notes);

  return {
    nonCrit: enemyAdjusted.nonCrit,
    crit: enemyAdjusted.crit,
    avg: enemyAdjusted.avg,
    breakdown: {
      base,
      multiplier,
      dmgBonusPct: dmgBonus.pctPoints,
      critRate: effectiveCritRate,
      critDmg: critDmgClamped,
      hitKey: lookup.hitKey || spec.hitKey || "",
      kind: spec.kind,
      damageType: damageTypeUsed,
      scalingStatUsed,
      damageTypeUsed,
      enemyLevel,
      defMultUsed,
      resPctUsed: enemyAdjusted.resPctUsed,
      resMultUsed: enemyAdjusted.resMultUsed,
      notes,
    },
  };
}
