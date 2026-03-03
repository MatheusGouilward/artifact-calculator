import { loadGameDataCore } from "@/lib/genshin/game-data-core";
import type { GameDataCore } from "@/lib/genshin/game-data-core";

import { getTalentMultiplier, getTalentMultiplierByHitId } from "./multipliers";
import type {
  AttackKind,
  AttackSpec,
  CharacterProfileV1,
  CharacterState,
  DamageResult,
  DamageType,
  EnemyModel,
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

function resolveEnemy(specEnemy: EnemyModel | undefined, notes: string[]): EnemyModel {
  if (!specEnemy) {
    notes.push("enemy_default_used");
    return {
      level: DEFAULT_ENEMY_LEVEL,
      resistanceByType: {},
      defMultiplierOverride: null,
    };
  }

  return {
    level: Math.floor(clamp(specEnemy.level, 1, 100)),
    resistanceByType: specEnemy.resistanceByType ?? {},
    defMultiplierOverride:
      typeof specEnemy.defMultiplierOverride === "number" && Number.isFinite(specEnemy.defMultiplierOverride)
        ? specEnemy.defMultiplierOverride
        : null,
  };
}

function resolveResistanceMultiplier(resPct: number): number {
  if (resPct < 0) {
    return 1 - resPct / 200;
  }
  if (resPct <= 75) {
    return 1 - resPct / 100;
  }
  return 1 / (4 * (resPct / 100) + 1);
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
  const dmgBonusPct = damageTypeUsed === "physical"
    ? state.combatTotals.dmgBonusPhysicalPct
    : state.combatTotals.dmgBonusByElementPct[damageTypeUsed] ?? 0;

  const attackerLevel = Math.floor(clamp(state.level ?? DEFAULT_ATTACKER_LEVEL, 1, 100));
  const enemy = resolveEnemy(spec.enemy, notes);
  const enemyLevel = enemy.level;
  const defOverride = typeof enemy.defMultiplierOverride === "number" && Number.isFinite(enemy.defMultiplierOverride)
    ? enemy.defMultiplierOverride
    : null;
  const defMultUsed = defOverride !== null
    ? defOverride
    : (attackerLevel + 100) / ((attackerLevel + 100) + (enemyLevel + 100));
  const resPctRaw = enemy.resistanceByType?.[damageTypeUsed];
  const resPctUsed = Number.isFinite(resPctRaw) ? Number(resPctRaw) : DEFAULT_RESISTANCE_PCT;
  const resMultUsed = resolveResistanceMultiplier(resPctUsed);

  const nonCrit = base * (1 + dmgBonusPct / 100) * defMultUsed * resMultUsed;
  const critDmg = Math.max(0, state.combatTotals.critDmgPct / 100);
  const critRateRaw = clamp(state.combatTotals.critRatePct / 100, 0, 1);
  const effectiveCritRate = useCrit ? critRateRaw : 0;

  let crit = nonCrit * (1 + critDmg);
  let avg = nonCrit * (1 + effectiveCritRate * critDmg);

  if (!useCrit) {
    crit = nonCrit;
    avg = nonCrit;
    notes.push("crit_disabled_non_crit_output");
  }

  return {
    nonCrit,
    crit,
    avg,
    breakdown: {
      base,
      multiplier,
      dmgBonusPct,
      critRate: effectiveCritRate,
      critDmg,
      hitKey: lookup.hitKey || spec.hitKey || "",
      kind: spec.kind,
      damageType: damageTypeUsed,
      scalingStatUsed,
      damageTypeUsed,
      enemyLevel,
      defMultUsed,
      resPctUsed,
      resMultUsed,
      notes,
    },
  };
}
