import type { DamageType } from "@/lib/genshin/game-data-core";

export interface EnemyModel {
  level: number;
  baseResPctPoints: number;
  damageType: DamageType;
}

export interface EnemyAppliedDamage {
  nonCrit: number;
  crit: number;
  avg: number;
}

export interface ApplyEnemyResResult {
  nonCrit: number;
  crit: number;
  avg: number;
  resPctUsed: number;
  resMultUsed: number;
  notes: string[];
}

function toFinite(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

export function resMultiplierFromPctPoints(resPctPoints: number): number {
  if (resPctPoints < 0) {
    return 1 - (resPctPoints / 200);
  }
  if (resPctPoints < 75) {
    return 1 - (resPctPoints / 100);
  }
  return 1 / (4 * (resPctPoints / 100) + 1);
}

export function applyEnemyRes(
  computed: EnemyAppliedDamage,
  enemyModel: EnemyModel,
  resShredPctPoints = 0,
): ApplyEnemyResResult {
  const notes: string[] = [];
  const baseRes = toFinite(enemyModel.baseResPctPoints, 10);
  if (!Number.isFinite(enemyModel.baseResPctPoints)) {
    notes.push("enemy_base_res_default_used");
  }

  const shred = toFinite(resShredPctPoints, 0);
  if (!Number.isFinite(resShredPctPoints)) {
    notes.push("enemy_res_shred_non_finite_treated_as_zero");
  } else if (shred !== 0) {
    notes.push(`enemy_res_shred_applied:${shred}`);
  }

  const resPctUsed = baseRes - shred;
  const resMultUsed = resMultiplierFromPctPoints(resPctUsed);

  if (resPctUsed < 0) {
    notes.push(`enemy_res_negative_region:${resPctUsed}`);
  } else if (resPctUsed >= 75) {
    notes.push(`enemy_res_high_region:${resPctUsed}`);
  }

  const nonCrit = toFinite(computed.nonCrit, 0) * resMultUsed;
  const crit = toFinite(computed.crit, 0) * resMultUsed;
  const avg = toFinite(computed.avg, 0) * resMultUsed;

  return {
    nonCrit,
    crit,
    avg,
    resPctUsed,
    resMultUsed,
    notes,
  };
}
