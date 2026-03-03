export type GameDataCoreLocale = "en" | "pt-BR";
export type GameDataCoreSource = "enka" | "animegamedata" | "genshindata";

export interface GameDataCoreLocalizedNameMap {
  en?: string;
  "pt-BR"?: string;
}

export interface GameDataCoreCharacter {
  id: number;
  name: string;
  names?: GameDataCoreLocalizedNameMap;
  nameHash?: string;
  icon?: string;
  rarity?: number;
  element?: string;
  weaponType?: string;
}

export interface CharacterCurveLevel {
  hpBase?: number;
  atkBase?: number;
  defBase?: number;
  asc?: number;
}

export interface CharacterCurveTable {
  id: string;
  levels: Record<number, CharacterCurveLevel>;
}

export interface WeaponCurveLevel {
  atkBase?: number;
  substat?: number;
  asc?: number;
}

export interface WeaponCurveTable {
  id: string;
  levels: Record<number, WeaponCurveLevel>;
}

export interface TalentMultipliers {
  characterId: number;
  normals: Record<string, number[]>;
  skill: Record<string, number[]>;
  burst: Record<string, number[]>;
  notes?: string[];
}

export type ScalingStat = "atk" | "hp" | "def" | "em";
export type DamageType =
  | "physical"
  | "pyro"
  | "hydro"
  | "electro"
  | "cryo"
  | "dendro"
  | "anemo"
  | "geo";

export interface CharacterProfileV1 {
  characterId: number;
  scalingStatByKind: {
    normal: ScalingStat;
    skill: ScalingStat;
    burst: ScalingStat;
  };
  defaultDamageTypeByKind: {
    normal: DamageType;
    skill: DamageType;
    burst: DamageType;
  };
  notes?: string[];
}

export interface CharacterProfileV1Override {
  characterId?: number;
  scalingStatByKind?: Partial<CharacterProfileV1["scalingStatByKind"]>;
  defaultDamageTypeByKind?: Partial<CharacterProfileV1["defaultDamageTypeByKind"]>;
  notes?: string[];
}

export type HitKind = "normal" | "skill" | "burst";

export interface HitEntry {
  id: string;
  kind: HitKind;
  sourceKey: string;
  labelHash?: string;
  labelEn?: string;
  labelPtBR?: string;
  damageType?: DamageType;
  notes?: string[];
}

export interface HitCatalogByCharacter {
  normal: HitEntry[];
  skill: HitEntry[];
  burst: HitEntry[];
}

export type TextMap = Record<string, string>;

export interface HitLabelHashByKey {
  normals: Record<string, string>;
  skill: Record<string, string>;
  burst: Record<string, string>;
}

export interface GameDataCore {
  version: string;
  generatedAt: string;
  characters: Record<number, GameDataCoreCharacter>;
  characterCurves: Record<number, CharacterCurveTable>;
  weaponCurves: Record<number, WeaponCurveTable>;
  talents: Record<number, TalentMultipliers>;
  characterProfiles: Record<number, CharacterProfileV1>;
  hitCatalog: Record<number, HitCatalogByCharacter>;
  textMapEn?: TextMap;
  textMapPtBR?: TextMap;
}

export interface SourceCharacterRecord {
  id: number;
  name?: string;
  names?: GameDataCoreLocalizedNameMap;
  nameHash?: string;
  icon?: string;
  rarity?: number;
  element?: string;
  weaponType?: string;
}

export interface SourceDataset {
  source: GameDataCoreSource;
  fetchedAt: string;
  characters: Record<number, SourceCharacterRecord>;
  characterCurves?: Record<number, CharacterCurveTable>;
  weaponCurves?: Record<number, WeaponCurveTable>;
  talents?: Record<number, TalentMultipliers>;
  hitLabelHashByKey?: Record<number, HitLabelHashByKey>;
  textMapEn?: TextMap;
  textMapPtBR?: TextMap;
}

export type CharacterFieldConflictKey = "rarity" | "element" | "weaponType" | "name";

export interface FieldConflictEntry {
  id: number;
  field: CharacterFieldConflictKey;
  sourceValues: Partial<Record<GameDataCoreSource, string | number>>;
  chosen: string | number;
  reason: string;
}

export type RequiredCharacterField = "name" | "rarity" | "element" | "weaponType";

export interface MissingRequiredEntry {
  id: number;
  missing: RequiredCharacterField[];
}

export interface GameDataCoreReport {
  version: string;
  generatedAt: string;
  sourceCounts: Partial<Record<GameDataCoreSource, number>>;
  sourceStatus?: Partial<Record<GameDataCoreSource, { ok: boolean; message?: string }>>;
  summary: {
    characterCount: number;
    conflictCount: number;
    missingRequiredCount: number;
    missingRequiredRate: number;
    unverifiedNameCount: number;
    characterCurveCoverageRate: number;
    talentCoverageRate: number;
    characterProfileCoverageRate: number;
    hitCatalogCoverageRate: number;
    hitLabelEnCoverageRate: number;
    hitLabelPtBRCoverageRate: number;
    hitLabelExactEnCoverageRate: number;
    hitLabelExactPtBRCoverageRate: number;
    missingCurveOrTalentRate: number;
    curveConflictCount: number;
  };
  thresholds: {
    maxConflicts: number;
    maxMissingRequiredRate: number;
    maxMissingCurveOrTalentRate: number;
    curveCrossCheckEpsilon: number;
  };
  conflicts: FieldConflictEntry[];
  missingRequired: MissingRequiredEntry[];
  coverage: {
    playableCharacterCount: number;
    characterCurveCount: number;
    talentCount: number;
    weaponCurveCount: number;
    characterProfileCount: number;
    hitCatalogCharacterCount: number;
    charactersWithTalentCount: number;
    charactersWithHitCatalogForTalentCount: number;
    missingCharacterCurveIds: number[];
    missingTalentIds: number[];
    missingCurveOrTalentIds: number[];
    missingCharacterProfileIds: number[];
    missingHitCatalogIds: number[];
  };
  missingHitLabelSample?: Array<{
    characterId: number;
    kind: string;
    hitId: string;
    sourceKey: string;
  }>;
  crossCheck: {
    epsilon: number;
    checkedCharacterCurveCount: number;
    checkedWeaponCurveCount: number;
    checkedTalentCount: number;
    curveConflicts: Array<{
      kind: "characterCurve" | "weaponCurve" | "talent";
      id: number;
      metric: "length" | "checksum";
      animeValue: number;
      genshinValue: number;
      delta?: number;
    }>;
  };
}

export interface BuildThresholds {
  maxConflicts: number;
  maxMissingRequiredRate: number;
  maxMissingCurveOrTalentRate: number;
  curveCrossCheckEpsilon: number;
}

export interface BuildOptions {
  generatedAt?: string;
  version?: string;
  thresholds?: Partial<BuildThresholds>;
  characterProfileOverrides?: Record<number, CharacterProfileV1Override>;
}

export interface BuildResult {
  data: GameDataCore;
  report: GameDataCoreReport;
}
