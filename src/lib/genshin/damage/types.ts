import type {
  CharacterProfileV1,
  DamageType,
  ScalingStat,
} from "@/lib/genshin/game-data-core";
import type { EnemyModel as ExplicitEnemyModel } from "./enemy";

export type { CharacterProfileV1, DamageType, ScalingStat } from "@/lib/genshin/game-data-core";
export type EnemyModel = ExplicitEnemyModel;

export type AttackKind = "normal" | "skill" | "burst";

export interface AttackSpec {
  kind: AttackKind;
  hitId?: string;
  hitKey?: string;
  damageType?: DamageType;
  useCrit?: boolean;
  enemy?: EnemyModel;
  resShredPctPoints?: number;
}

export interface CharacterState {
  characterId: number;
  level?: number;
  talentLevels: {
    normal: number;
    skill: number;
    burst: number;
  };
  combatTotals: {
    hp: number;
    atk: number;
    def: number;
    em: number;
    critRatePct: number;
    critDmgPct: number;
    dmgBonusPhysicalPct: number;
    dmgBonusByElementPct: Record<DamageType, number>;
  };
  profile?: CharacterProfileV1;
}

export interface DamageResult {
  nonCrit: number;
  crit: number;
  avg: number;
  breakdown: {
    base: number;
    multiplier: number;
    dmgBonusPct: number;
    critRate: number;
    critDmg: number;
    hitKey: string;
    kind: AttackKind;
    damageType: DamageType;
    scalingStatUsed: ScalingStat;
    damageTypeUsed: DamageType;
    enemyLevel: number;
    defMultUsed: number;
    resPctUsed: number;
    resMultUsed: number;
    notes: string[];
  };
}

export interface TalentMultiplierLookup {
  multiplier: number;
  hitKey: string;
  talentLevel: number;
  notes: string[];
}
