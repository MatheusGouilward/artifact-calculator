import type { Locale } from "@/lib/i18n";

import type { CharacterState, DamageType, ScalingStat } from "../types";

export type SwirlElement = "pyro" | "hydro" | "electro" | "cryo";

export type BuffId =
  | "artifact_noblesse_4p"
  | "weapon_ttds_r5"
  | "bennett_burst_flat_atk"
  | "kazuha_a4_bonus"
  | "artifact_vv_4p"
  | "custom_crit_rate_pct";

export type BuffCategory = "buff" | "debuff";

export interface BuffState {
  id: BuffId;
  enabled: boolean;
  params?: Record<string, number | string | boolean>;
}

export interface BuffApplyContext {
  locale: Locale;
  mainDamageType: DamageType;
  selectedElement?: DamageType | null;
  scalingStat: ScalingStat;
  notes?: string[];
}

export interface PlayerDelta {
  atkPctPoints: number;
  atkFlat: number;
  critRatePctPoints: number;
  critDmgPctPoints: number;
  dmgBonusPctPointsByType: Partial<Record<DamageType, number>>;
}

export interface EnemyDelta {
  resShredPctPointsByType: Partial<Record<DamageType, number>>;
}

export interface AppliedBuff {
  id: BuffId;
  category: BuffCategory;
  labelKey: string;
  playerDelta: PlayerDelta;
  enemyDelta: EnemyDelta;
  notes: string[];
}

export interface ApplyBuffStatesResult {
  combatTotals2: CharacterState["combatTotals"];
  enemyDelta: EnemyDelta;
  applied: AppliedBuff[];
}

export interface BuffLibraryEntry {
  id: BuffId;
  category: BuffCategory;
  labelKey: string;
  descriptionKey: string;
  defaults?: Record<string, number | string | boolean>;
  requiredParams?: string[];
}
