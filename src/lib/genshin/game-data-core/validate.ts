import type {
  BuildOptions,
  BuildResult,
  BuildThresholds,
  CharacterFieldConflictKey,
  CharacterProfileV1,
  CharacterProfileV1Override,
  CharacterCurveTable,
  DamageType,
  FieldConflictEntry,
  GameDataCore,
  GameDataCoreCharacter,
  GameDataCoreReport,
  GameDataCoreSource,
  HitCatalogByCharacter,
  HitEntry,
  HitLabelHashByKey,
  HitKind,
  MissingRequiredEntry,
  RequiredCharacterField,
  SourceDataset,
  SourceCharacterRecord,
  ScalingStat,
  TalentMultipliers,
  TextMap,
  WeaponCurveTable,
} from "./types";

const SOURCE_PRIORITY: readonly GameDataCoreSource[] = ["enka", "animegamedata", "genshindata"];
const CURVE_SOURCE_PRIORITY: readonly GameDataCoreSource[] = ["animegamedata", "genshindata", "enka"];
const REQUIRED_FIELDS: readonly RequiredCharacterField[] = ["name", "rarity"];
const HIT_KINDS: readonly HitKind[] = ["normal", "skill", "burst"];
const SCALING_STATS: readonly ScalingStat[] = ["atk", "hp", "def", "em"];
const DAMAGE_TYPES: readonly DamageType[] = [
  "physical",
  "pyro",
  "hydro",
  "electro",
  "cryo",
  "dendro",
  "anemo",
  "geo",
];
const HIT_ID_PREFIX_BY_KIND: Readonly<Record<HitKind, string>> = {
  normal: "na",
  skill: "skill",
  burst: "burst",
};
const TOKEN_LABEL_EN: Readonly<Record<string, string>> = {
  dmg: "DMG",
  hit: "Hit",
  charged: "Charged",
  charge: "Charged",
  attack: "Attack",
  stamina: "Stamina",
  cost: "Cost",
  plunge: "Plunge",
  plunging: "Plunging",
  low: "Low",
  high: "High",
  cd: "CD",
  cooldown: "Cooldown",
  duration: "Duration",
  energy: "Energy",
  param: "Param",
};
const TOKEN_LABEL_PT: Readonly<Record<string, string>> = {
  dmg: "Dano",
  hit: "Acerto",
  charged: "Carregado",
  charge: "Carregado",
  attack: "Ataque",
  stamina: "Vigor",
  cost: "Custo",
  plunge: "Plunging",
  plunging: "Ataque Imersivo",
  low: "Baixo",
  high: "Alto",
  cd: "Recarga",
  cooldown: "Recarga",
  duration: "Duração",
  energy: "Energia",
  param: "Parâmetro",
};

export const DEFAULT_BUILD_THRESHOLDS: BuildThresholds = {
  maxConflicts: 100,
  maxMissingRequiredRate: 0.05,
  maxMissingCurveOrTalentRate: 0.05,
  curveCrossCheckEpsilon: 1e-6,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function roundRate(value: number): number {
  return Number(value.toFixed(6));
}

function roundSix(value: number): number {
  return Number(value.toFixed(6));
}

function normalizeNameKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function validateNameMap(value: unknown, context: string): GameDataCoreCharacter["names"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${context}.names must be an object when present.`);
  }

  const en = asNonEmptyString(value.en);
  const pt = asNonEmptyString(value["pt-BR"]);
  if (!en && !pt) {
    return undefined;
  }
  return {
    ...(en ? { en } : {}),
    ...(pt ? { "pt-BR": pt } : {}),
  };
}

function validateTextMap(value: unknown, context: string): TextMap | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object when present.`);
  }
  const out: TextMap = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = asNonEmptyString(entry);
    if (!normalized) {
      continue;
    }
    out[String(key)] = normalized;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function ensureFieldNumber(value: unknown, context: string): number {
  const parsed = asFiniteNumber(value);
  if (parsed === null) {
    throw new Error(`${context} must be a finite number.`);
  }
  return parsed;
}

function ensureFieldString(value: unknown, context: string): string {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return parsed;
}

function ensureScalingStat(value: unknown, context: string): ScalingStat {
  const parsed = asNonEmptyString(value);
  if (!parsed || !SCALING_STATS.includes(parsed as ScalingStat)) {
    throw new Error(`${context} must be one of: ${SCALING_STATS.join(", ")}.`);
  }
  return parsed as ScalingStat;
}

function ensureDamageType(value: unknown, context: string): DamageType {
  const parsed = asNonEmptyString(value);
  if (!parsed || !DAMAGE_TYPES.includes(parsed as DamageType)) {
    throw new Error(`${context} must be one of: ${DAMAGE_TYPES.join(", ")}.`);
  }
  return parsed as DamageType;
}

function ensureHitKind(value: unknown, context: string): HitKind {
  const parsed = asNonEmptyString(value);
  if (!parsed || !HIT_KINDS.includes(parsed as HitKind)) {
    throw new Error(`${context} must be one of: ${HIT_KINDS.join(", ")}.`);
  }
  return parsed as HitKind;
}

function normalizeHitKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/%/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 10);
}

function hitDisplayOrderScore(sourceKey: string): { group: number; order: number; normalized: string } {
  const normalized = normalizeHitKey(sourceKey);
  const numbered = normalized.match(/(\d+)\s*hit/);
  if (numbered) {
    return {
      group: 0,
      order: Number(numbered[1]),
      normalized,
    };
  }

  if (/charged|charge/.test(normalized)) {
    return { group: 1, order: 0, normalized };
  }

  if (/plung|plunge/.test(normalized)) {
    return { group: 1, order: 1, normalized };
  }

  return { group: 2, order: 0, normalized };
}

function compareHitEntriesForDisplay(a: HitEntry, b: HitEntry): number {
  const aScore = hitDisplayOrderScore(a.sourceKey);
  const bScore = hitDisplayOrderScore(b.sourceKey);
  if (aScore.group !== bScore.group) {
    return aScore.group - bScore.group;
  }
  if (aScore.order !== bScore.order) {
    return aScore.order - bScore.order;
  }
  return aScore.normalized.localeCompare(bScore.normalized);
}

function normalizeTalentLabelText(value: string): string {
  return value
    .split("|")[0]
    .replace(/\{[^}]+\}/g, "")
    .trim();
}

function humanizeHitLabel(sourceKey: string, tokenMap: Readonly<Record<string, string>>): string {
  const clean = sourceKey.replace(/^p\d+_/, "").trim();
  if (clean.length === 0) {
    return sourceKey;
  }
  const parts = clean.split("_").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return sourceKey;
  }
  const mapped = parts.map((part) => {
    if (/^\d+$/.test(part)) {
      return part;
    }
    return tokenMap[part] ?? part.charAt(0).toUpperCase() + part.slice(1);
  });
  return mapped.join(" ");
}

function buildNormalizedTextMapLabelIndex(
  textMapEn: TextMap | undefined,
  textMapPtBR: TextMap | undefined,
): Map<string, { en?: string; pt?: string }> {
  const index = new Map<string, { en?: string; pt?: string }>();
  if (!textMapEn) {
    return index;
  }
  for (const [hash, value] of Object.entries(textMapEn)) {
    const normalizedEn = normalizeHitKey(normalizeTalentLabelText(value));
    if (!normalizedEn) {
      continue;
    }
    const current = index.get(normalizedEn) ?? {};
    if (!current.en) {
      current.en = normalizeTalentLabelText(value);
    }
    const ptValue = textMapPtBR?.[hash];
    if (ptValue && !current.pt) {
      current.pt = normalizeTalentLabelText(ptValue);
    }
    index.set(normalizedEn, current);
  }
  return index;
}

function resolveHitEntryLabels(
  entry: HitEntry,
  textMapEn: TextMap | undefined,
  textMapPtBR: TextMap | undefined,
  textMapIndex: Map<string, { en?: string; pt?: string }>,
): HitEntry {
  const exactEn = entry.labelHash ? textMapEn?.[entry.labelHash] : undefined;
  const exactPt = entry.labelHash ? textMapPtBR?.[entry.labelHash] : undefined;
  const heuristicEn = humanizeHitLabel(entry.sourceKey, TOKEN_LABEL_EN);
  const heuristicPt = humanizeHitLabel(entry.sourceKey, TOKEN_LABEL_PT);
  const normalizedSource = normalizeHitKey(entry.sourceKey);
  const normalizedHeuristic = normalizeHitKey(heuristicEn);
  const fromSource = textMapIndex.get(normalizedSource);
  const fromHeuristic = textMapIndex.get(normalizedHeuristic);
  const resolvedEn = exactEn ?? fromSource?.en ?? fromHeuristic?.en ?? heuristicEn;
  const resolvedPt = exactPt ?? fromSource?.pt ?? fromHeuristic?.pt ?? heuristicPt;

  return {
    ...entry,
    labelEn: resolvedEn || entry.sourceKey,
    labelPtBR: resolvedPt || entry.sourceKey,
  };
}

function resolveHitCatalogLabels(
  catalog: HitCatalogByCharacter,
  textMapEn: TextMap | undefined,
  textMapPtBR: TextMap | undefined,
): HitCatalogByCharacter {
  const index = buildNormalizedTextMapLabelIndex(textMapEn, textMapPtBR);
  return {
    normal: catalog.normal.map((entry) => resolveHitEntryLabels(entry, textMapEn, textMapPtBR, index)),
    skill: catalog.skill.map((entry) => resolveHitEntryLabels(entry, textMapEn, textMapPtBR, index)),
    burst: catalog.burst.map((entry) => resolveHitEntryLabels(entry, textMapEn, textMapPtBR, index)),
  };
}

function validateCharacterCurveTable(value: unknown, context: string): CharacterCurveTable {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  const id = ensureFieldString(value.id, `${context}.id`);
  const levelsRaw = value.levels;
  if (!isRecord(levelsRaw)) {
    throw new Error(`${context}.levels must be an object.`);
  }
  const levels: CharacterCurveTable["levels"] = {};
  for (const [levelRaw, levelValue] of Object.entries(levelsRaw)) {
    const level = Number(levelRaw);
    if (!Number.isInteger(level) || level <= 0) {
      throw new Error(`${context}.levels key "${levelRaw}" must be a positive integer.`);
    }
    if (!isRecord(levelValue)) {
      throw new Error(`${context}.levels.${levelRaw} must be an object.`);
    }
    const hpBase = levelValue.hpBase === undefined ? undefined : ensureFieldNumber(levelValue.hpBase, `${context}.levels.${levelRaw}.hpBase`);
    const atkBase = levelValue.atkBase === undefined ? undefined : ensureFieldNumber(levelValue.atkBase, `${context}.levels.${levelRaw}.atkBase`);
    const defBase = levelValue.defBase === undefined ? undefined : ensureFieldNumber(levelValue.defBase, `${context}.levels.${levelRaw}.defBase`);
    const asc = levelValue.asc === undefined ? undefined : ensureFieldNumber(levelValue.asc, `${context}.levels.${levelRaw}.asc`);
    levels[level] = {
      ...(hpBase !== undefined ? { hpBase } : {}),
      ...(atkBase !== undefined ? { atkBase } : {}),
      ...(defBase !== undefined ? { defBase } : {}),
      ...(asc !== undefined ? { asc } : {}),
    };
  }
  return { id, levels };
}

function validateWeaponCurveTable(value: unknown, context: string): WeaponCurveTable {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  const id = ensureFieldString(value.id, `${context}.id`);
  const levelsRaw = value.levels;
  if (!isRecord(levelsRaw)) {
    throw new Error(`${context}.levels must be an object.`);
  }
  const levels: WeaponCurveTable["levels"] = {};
  for (const [levelRaw, levelValue] of Object.entries(levelsRaw)) {
    const level = Number(levelRaw);
    if (!Number.isInteger(level) || level <= 0) {
      throw new Error(`${context}.levels key "${levelRaw}" must be a positive integer.`);
    }
    if (!isRecord(levelValue)) {
      throw new Error(`${context}.levels.${levelRaw} must be an object.`);
    }
    const atkBase = levelValue.atkBase === undefined ? undefined : ensureFieldNumber(levelValue.atkBase, `${context}.levels.${levelRaw}.atkBase`);
    const substat = levelValue.substat === undefined ? undefined : ensureFieldNumber(levelValue.substat, `${context}.levels.${levelRaw}.substat`);
    const asc = levelValue.asc === undefined ? undefined : ensureFieldNumber(levelValue.asc, `${context}.levels.${levelRaw}.asc`);
    levels[level] = {
      ...(atkBase !== undefined ? { atkBase } : {}),
      ...(substat !== undefined ? { substat } : {}),
      ...(asc !== undefined ? { asc } : {}),
    };
  }
  return { id, levels };
}

function validateTalentSection(
  value: unknown,
  context: string,
): Record<string, number[]> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  const out: Record<string, number[]> = {};
  for (const [key, row] of Object.entries(value)) {
    if (!Array.isArray(row)) {
      throw new Error(`${context}.${key} must be an array.`);
    }
    out[key] = row.map((item, index) => ensureFieldNumber(item, `${context}.${key}[${index}]`));
  }
  return out;
}

function validateTalentMultipliers(value: unknown, context: string): TalentMultipliers {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  const characterId = ensureFieldNumber(value.characterId, `${context}.characterId`);
  const normals = validateTalentSection(value.normals, `${context}.normals`);
  const skill = validateTalentSection(value.skill, `${context}.skill`);
  const burst = validateTalentSection(value.burst, `${context}.burst`);
  const notes = Array.isArray(value.notes)
    ? value.notes
      .map((entry, index) => ensureFieldString(entry, `${context}.notes[${index}]`))
      .filter((entry) => entry.length > 0)
    : undefined;
  return {
    characterId,
    normals,
    skill,
    burst,
    ...(notes && notes.length > 0 ? { notes } : {}),
  };
}

function validateCharacterProfile(value: unknown, context: string): CharacterProfileV1 {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const characterId = ensureFieldNumber(value.characterId, `${context}.characterId`);
  if (!isRecord(value.scalingStatByKind)) {
    throw new Error(`${context}.scalingStatByKind must be an object.`);
  }
  if (!isRecord(value.defaultDamageTypeByKind)) {
    throw new Error(`${context}.defaultDamageTypeByKind must be an object.`);
  }

  const scalingStatByKind: CharacterProfileV1["scalingStatByKind"] = {
    normal: ensureScalingStat(value.scalingStatByKind.normal, `${context}.scalingStatByKind.normal`),
    skill: ensureScalingStat(value.scalingStatByKind.skill, `${context}.scalingStatByKind.skill`),
    burst: ensureScalingStat(value.scalingStatByKind.burst, `${context}.scalingStatByKind.burst`),
  };
  const defaultDamageTypeByKind: CharacterProfileV1["defaultDamageTypeByKind"] = {
    normal: ensureDamageType(
      value.defaultDamageTypeByKind.normal,
      `${context}.defaultDamageTypeByKind.normal`,
    ),
    skill: ensureDamageType(
      value.defaultDamageTypeByKind.skill,
      `${context}.defaultDamageTypeByKind.skill`,
    ),
    burst: ensureDamageType(
      value.defaultDamageTypeByKind.burst,
      `${context}.defaultDamageTypeByKind.burst`,
    ),
  };

  const notes = Array.isArray(value.notes)
    ? value.notes
      .map((entry, index) => ensureFieldString(entry, `${context}.notes[${index}]`))
      .filter((entry) => entry.length > 0)
    : undefined;

  return {
    characterId,
    scalingStatByKind,
    defaultDamageTypeByKind,
    ...(notes && notes.length > 0 ? { notes } : {}),
  };
}

function validateHitEntry(value: unknown, context: string): HitEntry {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const id = ensureFieldString(value.id, `${context}.id`);
  const kind = ensureHitKind(value.kind, `${context}.kind`);
  const sourceKey = ensureFieldString(value.sourceKey, `${context}.sourceKey`);
  const labelHash = value.labelHash === undefined ? undefined : ensureFieldString(value.labelHash, `${context}.labelHash`);
  const labelEn = value.labelEn === undefined ? undefined : ensureFieldString(value.labelEn, `${context}.labelEn`);
  const labelPtBR = value.labelPtBR === undefined ? undefined : ensureFieldString(value.labelPtBR, `${context}.labelPtBR`);
  const damageType = value.damageType === undefined ? undefined : ensureDamageType(value.damageType, `${context}.damageType`);
  const notes = Array.isArray(value.notes)
    ? value.notes
      .map((entry, index) => ensureFieldString(entry, `${context}.notes[${index}]`))
      .filter((entry) => entry.length > 0)
    : undefined;

  return {
    id,
    kind,
    sourceKey,
    ...(labelHash ? { labelHash } : {}),
    ...(labelEn ? { labelEn } : {}),
    ...(labelPtBR ? { labelPtBR } : {}),
    ...(damageType ? { damageType } : {}),
    ...(notes && notes.length > 0 ? { notes } : {}),
  };
}

function validateHitCatalogByCharacter(value: unknown, context: string): HitCatalogByCharacter {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  const out: HitCatalogByCharacter = {
    normal: [],
    skill: [],
    burst: [],
  };

  for (const kind of HIT_KINDS) {
    const rows = value[kind];
    if (rows === undefined) {
      out[kind] = [];
      continue;
    }
    if (!Array.isArray(rows)) {
      throw new Error(`${context}.${kind} must be an array.`);
    }
    out[kind] = rows.map((row, index) => {
      const entry = validateHitEntry(row, `${context}.${kind}[${index}]`);
      if (entry.kind !== kind) {
        throw new Error(`${context}.${kind}[${index}].kind must be "${kind}".`);
      }
      return entry;
    });
  }

  return out;
}

function validateCurveMap<T>(
  value: unknown,
  context: string,
  validator: (value: unknown, context: string) => T,
): Record<number, T> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }
  const map: Record<number, T> = {};
  for (const [idRaw, row] of Object.entries(value)) {
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`${context} key "${idRaw}" must be a positive integer.`);
    }
    map[id] = validator(row, `${context}.${idRaw}`);
  }
  return map;
}

export function validateGameDataCore(payload: unknown): GameDataCore {
  if (!isRecord(payload)) {
    throw new Error("GameDataCore payload must be an object.");
  }

  const version = ensureFieldString(payload.version, "GameDataCore.version");
  const generatedAt = ensureFieldString(payload.generatedAt, "GameDataCore.generatedAt");

  const charactersRaw = payload.characters;
  if (!isRecord(charactersRaw)) {
    throw new Error("GameDataCore.characters must be an object.");
  }

  const characters: Record<number, GameDataCoreCharacter> = {};

  for (const [idRaw, value] of Object.entries(charactersRaw)) {
    if (!isRecord(value)) {
      throw new Error(`GameDataCore.characters.${idRaw} must be an object.`);
    }
    const idFromKey = Number(idRaw);
    if (!Number.isInteger(idFromKey) || idFromKey <= 0) {
      throw new Error(`GameDataCore.characters key "${idRaw}" must be a positive integer string.`);
    }

    const id = ensureFieldNumber(value.id, `GameDataCore.characters.${idRaw}.id`);
    if (id !== idFromKey) {
      throw new Error(`GameDataCore.characters.${idRaw}.id must match object key.`);
    }

    const name = ensureFieldString(value.name, `GameDataCore.characters.${idRaw}.name`);
    const names = validateNameMap(value.names, `GameDataCore.characters.${idRaw}`);
    const icon = asNonEmptyString(value.icon) ?? undefined;
    const element = asNonEmptyString(value.element) ?? undefined;
    const weaponType = asNonEmptyString(value.weaponType) ?? undefined;
    const nameHash = asNonEmptyString(value.nameHash) ?? undefined;

    let rarity: number | undefined;
    if (value.rarity !== undefined) {
      rarity = ensureFieldNumber(value.rarity, `GameDataCore.characters.${idRaw}.rarity`);
    }

    characters[id] = {
      id,
      name,
      ...(names ? { names } : {}),
      ...(nameHash ? { nameHash } : {}),
      ...(icon ? { icon } : {}),
      ...(rarity !== undefined ? { rarity } : {}),
      ...(element ? { element } : {}),
      ...(weaponType ? { weaponType } : {}),
    };
  }

  const characterCurves = validateCurveMap(
    payload.characterCurves ?? {},
    "GameDataCore.characterCurves",
    validateCharacterCurveTable,
  );
  const weaponCurves = validateCurveMap(
    payload.weaponCurves ?? {},
    "GameDataCore.weaponCurves",
    validateWeaponCurveTable,
  );
  const talents = validateCurveMap(
    payload.talents ?? {},
    "GameDataCore.talents",
    validateTalentMultipliers,
  );
  const characterProfiles = validateCurveMap(
    payload.characterProfiles ?? {},
    "GameDataCore.characterProfiles",
    validateCharacterProfile,
  );
  const hitCatalog = validateCurveMap(
    payload.hitCatalog ?? {},
    "GameDataCore.hitCatalog",
    validateHitCatalogByCharacter,
  );
  const textMapEn = validateTextMap(payload.textMapEn, "GameDataCore.textMapEn");
  const textMapPtBR = validateTextMap(payload.textMapPtBR, "GameDataCore.textMapPtBR");

  return {
    version,
    generatedAt,
    characters,
    characterCurves,
    weaponCurves,
    talents,
    characterProfiles,
    hitCatalog,
    ...(textMapEn ? { textMapEn } : {}),
    ...(textMapPtBR ? { textMapPtBR } : {}),
  };
}

function hasValue<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

function pickByPriority<T>(
  valuesBySource: Partial<Record<GameDataCoreSource, T>>,
): { source: GameDataCoreSource; value: T } | null {
  for (const source of SOURCE_PRIORITY) {
    const value = valuesBySource[source];
    if (hasValue(value)) {
      return { source, value };
    }
  }
  return null;
}

function pickByCurvePriority<T>(
  valuesBySource: Partial<Record<GameDataCoreSource, T>>,
): { source: GameDataCoreSource; value: T } | null {
  for (const source of CURVE_SOURCE_PRIORITY) {
    const value = valuesBySource[source];
    if (hasValue(value)) {
      return { source, value };
    }
  }
  return null;
}

function collectFieldValues(
  recordsBySource: Partial<Record<GameDataCoreSource, SourceCharacterRecord>>,
  field: "rarity" | "element" | "weaponType",
): Partial<Record<GameDataCoreSource, string | number>> {
  const values: Partial<Record<GameDataCoreSource, string | number>> = {};
  for (const source of SOURCE_PRIORITY) {
    const record = recordsBySource[source];
    if (!record) {
      continue;
    }
    const candidate = record[field];
    if (typeof candidate === "number" || (typeof candidate === "string" && candidate.length > 0)) {
      values[source] = candidate;
    }
  }
  return values;
}

function registerConflict(
  conflicts: FieldConflictEntry[],
  id: number,
  field: CharacterFieldConflictKey,
  sourceValues: Partial<Record<GameDataCoreSource, string | number>>,
  chosen: string | number,
  reason: string,
): void {
  conflicts.push({
    id,
    field,
    sourceValues,
    chosen,
    reason,
  });
}

function resolveFieldValue(
  id: number,
  field: "rarity" | "element" | "weaponType",
  recordsBySource: Partial<Record<GameDataCoreSource, SourceCharacterRecord>>,
  conflicts: FieldConflictEntry[],
): string | number | undefined {
  const sourceValues = collectFieldValues(recordsBySource, field);
  const availableValues = Object.values(sourceValues);
  if (availableValues.length === 0) {
    return undefined;
  }

  const chosenByPriority = pickByPriority(sourceValues);
  if (!chosenByPriority) {
    return undefined;
  }

  if (availableValues.length >= 2) {
    const uniqueValues = new Set(availableValues.map((value) => String(value)));
    if (uniqueValues.size > 1) {
      registerConflict(
        conflicts,
        id,
        field,
        sourceValues,
        chosenByPriority.value,
        "mismatch_on_multi_source_field",
      );
    }
  }

  return chosenByPriority.value;
}

function collectNameValues(
  recordsBySource: Partial<Record<GameDataCoreSource, SourceCharacterRecord>>,
): Partial<Record<GameDataCoreSource, string>> {
  const values: Partial<Record<GameDataCoreSource, string>> = {};
  for (const source of SOURCE_PRIORITY) {
    const record = recordsBySource[source];
    if (!record) {
      continue;
    }
    const candidate = record.name ?? record.names?.en;
    if (candidate && candidate.trim().length > 0) {
      values[source] = candidate;
    }
  }
  return values;
}

function resolveName(
  id: number,
  recordsBySource: Partial<Record<GameDataCoreSource, SourceCharacterRecord>>,
  conflicts: FieldConflictEntry[],
): { name: string; verified: boolean } {
  const nameValues = collectNameValues(recordsBySource);
  const enkaName = nameValues.enka;
  const preferred = enkaName ?? pickByPriority(nameValues)?.value;
  if (!preferred) {
    return { name: `Character ${id}`, verified: false };
  }

  if (!enkaName) {
    return { name: preferred, verified: false };
  }

  const normalizedWinner = normalizeNameKey(enkaName);
  const comparableEntries = Object.entries(nameValues).filter(
    ([source]) => source !== "enka",
  ) as Array<[GameDataCoreSource, string]>;

  if (comparableEntries.length === 0) {
    return { name: enkaName, verified: false };
  }

  const matchingEntry = comparableEntries.find(([, value]) => normalizeNameKey(value) === normalizedWinner);
  if (!matchingEntry) {
    registerConflict(conflicts, id, "name", nameValues, enkaName, "enka_name_not_confirmed_by_other_source");
    return { name: enkaName, verified: false };
  }

  return { name: enkaName, verified: true };
}

function collectCharacterIds(datasets: SourceDataset[]): number[] {
  const enkaDataset = datasets.find((dataset) => dataset.source === "enka");
  if (enkaDataset && Object.keys(enkaDataset.characters).length > 0) {
    return Object.keys(enkaDataset.characters)
      .map((key) => Number(key))
      .filter((id) => Number.isInteger(id) && id > 0)
      .sort((a, b) => a - b);
  }

  const idSet = new Set<number>();
  for (const dataset of datasets) {
    for (const key of Object.keys(dataset.characters)) {
      const id = Number(key);
      if (Number.isInteger(id) && id > 0) {
        idSet.add(id);
      }
    }
  }
  return [...idSet].sort((a, b) => a - b);
}

function resolveRecordsBySource(
  datasets: SourceDataset[],
  id: number,
): Partial<Record<GameDataCoreSource, SourceCharacterRecord>> {
  const records: Partial<Record<GameDataCoreSource, SourceCharacterRecord>> = {};
  for (const dataset of datasets) {
    const record = dataset.characters[id];
    if (record) {
      records[dataset.source] = record;
    }
  }
  return records;
}

function resolveLocalizedNames(
  recordsBySource: Partial<Record<GameDataCoreSource, SourceCharacterRecord>>,
  resolvedName: string,
): GameDataCoreCharacter["names"] | undefined {
  const en = recordsBySource.enka?.names?.en ?? resolvedName;
  const pt = recordsBySource.enka?.names?.["pt-BR"] ?? recordsBySource.animegamedata?.names?.["pt-BR"];
  if (!en && !pt) {
    return undefined;
  }
  return {
    ...(en ? { en } : {}),
    ...(pt ? { "pt-BR": pt } : {}),
  };
}

function resolveMissingRequired(character: GameDataCoreCharacter): RequiredCharacterField[] {
  const missing: RequiredCharacterField[] = [];
  for (const field of REQUIRED_FIELDS) {
    const value = character[field];
    if (typeof value === "string" && value.trim().length > 0) {
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      continue;
    }
    missing.push(field);
  }
  return missing;
}

function mergeTextMapByPriority(
  datasets: SourceDataset[],
  field: "textMapEn" | "textMapPtBR",
): TextMap | undefined {
  const merged: TextMap = {};
  for (const source of SOURCE_PRIORITY) {
    const dataset = datasets.find((entry) => entry.source === source);
    const textMap = dataset?.[field];
    if (!textMap) {
      continue;
    }
    for (const [hash, value] of Object.entries(textMap)) {
      if (merged[hash] !== undefined) {
        continue;
      }
      const normalized = asNonEmptyString(value);
      if (!normalized) {
        continue;
      }
      merged[String(hash)] = normalized;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildDefaultCharacterProfile(characterId: number): CharacterProfileV1 {
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
  };
}

function mergeCharacterProfileOverride(
  base: CharacterProfileV1,
  override: CharacterProfileV1Override | undefined,
): CharacterProfileV1 {
  if (!override) {
    return base;
  }

  const notes = [
    ...(base.notes ?? []),
    ...(Array.isArray(override.notes) ? override.notes : []),
  ];

  return {
    characterId: base.characterId,
    scalingStatByKind: {
      normal: override.scalingStatByKind?.normal ?? base.scalingStatByKind.normal,
      skill: override.scalingStatByKind?.skill ?? base.scalingStatByKind.skill,
      burst: override.scalingStatByKind?.burst ?? base.scalingStatByKind.burst,
    },
    defaultDamageTypeByKind: {
      normal: override.defaultDamageTypeByKind?.normal ?? base.defaultDamageTypeByKind.normal,
      skill: override.defaultDamageTypeByKind?.skill ?? base.defaultDamageTypeByKind.skill,
      burst: override.defaultDamageTypeByKind?.burst ?? base.defaultDamageTypeByKind.burst,
    },
    ...(notes.length > 0 ? { notes } : {}),
  };
}

function resolveThresholds(options?: BuildOptions): BuildThresholds {
  const thresholds = options?.thresholds;
  return {
    maxConflicts: thresholds?.maxConflicts ?? DEFAULT_BUILD_THRESHOLDS.maxConflicts,
    maxMissingRequiredRate:
      thresholds?.maxMissingRequiredRate ?? DEFAULT_BUILD_THRESHOLDS.maxMissingRequiredRate,
    maxMissingCurveOrTalentRate:
      thresholds?.maxMissingCurveOrTalentRate ??
      DEFAULT_BUILD_THRESHOLDS.maxMissingCurveOrTalentRate,
    curveCrossCheckEpsilon:
      thresholds?.curveCrossCheckEpsilon ?? DEFAULT_BUILD_THRESHOLDS.curveCrossCheckEpsilon,
  };
}

function sortedNumericKeys(map: Record<number, unknown>): number[] {
  return Object.keys(map)
    .map((key) => Number(key))
    .filter((key) => Number.isInteger(key) && key > 0)
    .sort((a, b) => a - b);
}

function checksumCharacterCurve(table: CharacterCurveTable): number {
  let sum = 0;
  for (const level of sortedNumericKeys(table.levels)) {
    const row = table.levels[level] ?? {};
    sum += (row.hpBase ?? 0) + (row.atkBase ?? 0) + (row.defBase ?? 0) + (row.asc ?? 0);
  }
  return roundSix(sum);
}

function checksumWeaponCurve(table: WeaponCurveTable): number {
  let sum = 0;
  for (const level of sortedNumericKeys(table.levels)) {
    const row = table.levels[level] ?? {};
    sum += (row.atkBase ?? 0) + (row.substat ?? 0) + (row.asc ?? 0);
  }
  return roundSix(sum);
}

function checksumTalents(talent: TalentMultipliers): number {
  let sum = 0;
  for (const section of [talent.normals, talent.skill, talent.burst]) {
    for (const values of Object.values(section)) {
      for (const value of values) {
        sum += value;
      }
    }
  }
  return roundSix(sum);
}

function totalTalentArrayLength(talent: TalentMultipliers): number {
  let total = 0;
  for (const section of [talent.normals, talent.skill, talent.burst]) {
    for (const values of Object.values(section)) {
      total += values.length;
    }
  }
  return total;
}

function exceedsRelativeTolerance(a: number, b: number, epsilon: number): boolean {
  const delta = Math.abs(a - b);
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return delta / scale > epsilon;
}

function hasTalentCoverage(talent: TalentMultipliers | undefined): boolean {
  if (!talent) {
    return false;
  }
  const sections = [talent.normals, talent.skill, talent.burst];
  for (const section of sections) {
    const arrays = Object.values(section);
    if (arrays.length === 0) {
      return false;
    }
    if (!arrays.every((values) => values.length >= 10)) {
      return false;
    }
  }
  return true;
}

function buildHitEntriesForSection(
  kind: HitKind,
  section: Record<string, number[]>,
  labelHashByKey: Record<string, string> = {},
): HitEntry[] {
  const sourceKeys = Object.keys(section)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (sourceKeys.length === 0) {
    return [];
  }

  sourceKeys.sort((a, b) => a.localeCompare(b));
  const entries: HitEntry[] = [];
  const occurrences = new Map<string, number>();
  for (const sourceKey of sourceKeys) {
    const normalized = normalizeHitKey(sourceKey);
    const baseId = `${HIT_ID_PREFIX_BY_KIND[kind]}_${shortHash(normalized)}`;
    const seen = (occurrences.get(baseId) ?? 0) + 1;
    occurrences.set(baseId, seen);
    const id = seen === 1 ? baseId : `${baseId}_${seen}`;
    entries.push({
      id,
      kind,
      sourceKey,
      ...(asNonEmptyString(labelHashByKey[sourceKey]) ? { labelHash: String(labelHashByKey[sourceKey]) } : {}),
      labelEn: sourceKey,
    });
  }

  entries.sort(compareHitEntriesForDisplay);
  return entries;
}

function buildHitCatalogByCharacter(
  talent: TalentMultipliers | undefined,
  labelHashByKey: HitLabelHashByKey | undefined,
): HitCatalogByCharacter {
  if (!talent) {
    return {
      normal: [],
      skill: [],
      burst: [],
    };
  }

  return {
    normal: buildHitEntriesForSection("normal", talent.normals, labelHashByKey?.normals ?? {}),
    skill: buildHitEntriesForSection("skill", talent.skill, labelHashByKey?.skill ?? {}),
    burst: buildHitEntriesForSection("burst", talent.burst, labelHashByKey?.burst ?? {}),
  };
}

function assertThresholds(report: GameDataCoreReport): void {
  if (report.summary.conflictCount > report.thresholds.maxConflicts) {
    throw new Error(
      `Conflict threshold exceeded: ${report.summary.conflictCount} > ${report.thresholds.maxConflicts}`,
    );
  }

  if (report.summary.missingRequiredRate > report.thresholds.maxMissingRequiredRate) {
    throw new Error(
      `Missing required threshold exceeded: ${report.summary.missingRequiredRate} > ${report.thresholds.maxMissingRequiredRate}`,
    );
  }

  if (report.summary.missingCurveOrTalentRate > report.thresholds.maxMissingCurveOrTalentRate) {
    throw new Error(
      `Curve/talent coverage threshold exceeded: ${report.summary.missingCurveOrTalentRate} > ${report.thresholds.maxMissingCurveOrTalentRate}`,
    );
  }

  if (report.coverage.missingCharacterProfileIds.length > 0) {
    throw new Error(
      `Character profile coverage threshold exceeded: missing ${report.coverage.missingCharacterProfileIds.length} profiles`,
    );
  }

  if (report.coverage.missingHitCatalogIds.length > 0) {
    throw new Error(
      `Hit catalog coverage threshold exceeded: missing ${report.coverage.missingHitCatalogIds.length} entries for talented characters`,
    );
  }
}

export function buildGameDataCoreFromSources(
  datasets: SourceDataset[],
  options: BuildOptions = {},
): BuildResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const version = options.version ?? generatedAt.slice(0, 10);
  const thresholds = resolveThresholds(options);

  const conflicts: FieldConflictEntry[] = [];
  const missingRequired: MissingRequiredEntry[] = [];
  const sourceCounts: Partial<Record<GameDataCoreSource, number>> = {};
  let unverifiedNameCount = 0;

  for (const dataset of datasets) {
    sourceCounts[dataset.source] = Object.keys(dataset.characters).length;
  }

  const characters: Record<number, GameDataCoreCharacter> = {};
  const characterProfiles: Record<number, CharacterProfileV1> = {};
  const hitCatalog: Record<number, HitCatalogByCharacter> = {};
  const ids = collectCharacterIds(datasets);
  const mergedTextMapEn = mergeTextMapByPriority(datasets, "textMapEn");
  const mergedTextMapPtBR = mergeTextMapByPriority(datasets, "textMapPtBR");

  for (const id of ids) {
    const base = buildDefaultCharacterProfile(id);
    const override = options.characterProfileOverrides?.[id];
    characterProfiles[id] = mergeCharacterProfileOverride(base, override);
  }

  for (const id of ids) {
    const recordsBySource = resolveRecordsBySource(datasets, id);
    const resolvedName = resolveName(id, recordsBySource, conflicts);
    if (!resolvedName.verified) {
      unverifiedNameCount += 1;
    }

    const rarity = resolveFieldValue(id, "rarity", recordsBySource, conflicts);
    const element = resolveFieldValue(id, "element", recordsBySource, conflicts);
    const weaponType = resolveFieldValue(id, "weaponType", recordsBySource, conflicts);

    const iconByPriority = pickByPriority({
      enka: recordsBySource.enka?.icon,
      animegamedata: recordsBySource.animegamedata?.icon,
      genshindata: recordsBySource.genshindata?.icon,
    });
    const nameHash = recordsBySource.enka?.nameHash ?? recordsBySource.animegamedata?.nameHash;

    const character: GameDataCoreCharacter = {
      id,
      name: resolvedName.name,
      ...(resolveLocalizedNames(recordsBySource, resolvedName.name)
        ? { names: resolveLocalizedNames(recordsBySource, resolvedName.name) }
        : {}),
      ...(nameHash ? { nameHash } : {}),
      ...(iconByPriority?.value ? { icon: iconByPriority.value } : {}),
      ...(typeof rarity === "number" ? { rarity } : {}),
      ...(typeof element === "string" ? { element } : {}),
      ...(typeof weaponType === "string" ? { weaponType } : {}),
    };

    const missingFields = resolveMissingRequired(character);
    if (missingFields.length > 0) {
      missingRequired.push({
        id,
        missing: missingFields,
      });
    }

    characters[id] = character;
  }

  const characterCurves: Record<number, CharacterCurveTable> = {};
  const talents: Record<number, TalentMultipliers> = {};
  const curveConflicts: GameDataCoreReport["crossCheck"]["curveConflicts"] = [];

  for (const id of ids) {
    const curveBySource: Partial<Record<GameDataCoreSource, CharacterCurveTable>> = {};
    const talentBySource: Partial<Record<GameDataCoreSource, TalentMultipliers>> = {};
    const talentLabelHashBySource: Partial<Record<GameDataCoreSource, HitLabelHashByKey>> = {};
    for (const dataset of datasets) {
      const curve = dataset.characterCurves?.[id];
      if (curve) {
        curveBySource[dataset.source] = curve;
      }
      const talent = dataset.talents?.[id];
      if (talent) {
        talentBySource[dataset.source] = talent;
      }
      const labelHashByKey = dataset.hitLabelHashByKey?.[id];
      if (labelHashByKey) {
        talentLabelHashBySource[dataset.source] = labelHashByKey;
      }
    }

    const chosenCurve = pickByCurvePriority(curveBySource);
    if (chosenCurve) {
      characterCurves[id] = chosenCurve.value;
    }
    const chosenTalent = pickByCurvePriority(talentBySource);
    if (chosenTalent) {
      talents[id] = chosenTalent.value;
    }
    hitCatalog[id] = resolveHitCatalogLabels(
      buildHitCatalogByCharacter(
        chosenTalent?.value,
        chosenTalent ? talentLabelHashBySource[chosenTalent.source] : undefined,
      ),
      mergedTextMapEn,
      mergedTextMapPtBR,
    );

    const animeCurve = curveBySource.animegamedata;
    const genshinCurve = curveBySource.genshindata;
    if (animeCurve && genshinCurve) {
      const animeLen = Object.keys(animeCurve.levels).length;
      const genshinLen = Object.keys(genshinCurve.levels).length;
      if (animeLen !== genshinLen) {
        curveConflicts.push({
          kind: "characterCurve",
          id,
          metric: "length",
          animeValue: animeLen,
          genshinValue: genshinLen,
        });
      }
      const animeChecksum = checksumCharacterCurve(animeCurve);
      const genshinChecksum = checksumCharacterCurve(genshinCurve);
      const delta = Math.abs(animeChecksum - genshinChecksum);
      if (exceedsRelativeTolerance(animeChecksum, genshinChecksum, thresholds.curveCrossCheckEpsilon)) {
        curveConflicts.push({
          kind: "characterCurve",
          id,
          metric: "checksum",
          animeValue: animeChecksum,
          genshinValue: genshinChecksum,
          delta,
        });
      }
    }

    const animeTalent = talentBySource.animegamedata;
    const genshinTalent = talentBySource.genshindata;
    if (animeTalent && genshinTalent) {
      const animeLen = totalTalentArrayLength(animeTalent);
      const genshinLen = totalTalentArrayLength(genshinTalent);
      if (animeLen !== genshinLen) {
        curveConflicts.push({
          kind: "talent",
          id,
          metric: "length",
          animeValue: animeLen,
          genshinValue: genshinLen,
        });
      }
      const animeChecksum = checksumTalents(animeTalent);
      const genshinChecksum = checksumTalents(genshinTalent);
      const delta = Math.abs(animeChecksum - genshinChecksum);
      if (exceedsRelativeTolerance(animeChecksum, genshinChecksum, thresholds.curveCrossCheckEpsilon)) {
        curveConflicts.push({
          kind: "talent",
          id,
          metric: "checksum",
          animeValue: animeChecksum,
          genshinValue: genshinChecksum,
          delta,
        });
      }
    }
  }

  const allWeaponIds = new Set<number>();
  for (const dataset of datasets) {
    for (const key of Object.keys(dataset.weaponCurves ?? {})) {
      const id = Number(key);
      if (Number.isInteger(id) && id > 0) {
        allWeaponIds.add(id);
      }
    }
  }
  const weaponCurves: Record<number, WeaponCurveTable> = {};
  for (const id of [...allWeaponIds].sort((a, b) => a - b)) {
    const bySource: Partial<Record<GameDataCoreSource, WeaponCurveTable>> = {};
    for (const dataset of datasets) {
      const curve = dataset.weaponCurves?.[id];
      if (curve) {
        bySource[dataset.source] = curve;
      }
    }
    const chosen = pickByCurvePriority(bySource);
    if (chosen) {
      weaponCurves[id] = chosen.value;
    }

    const animeCurve = bySource.animegamedata;
    const genshinCurve = bySource.genshindata;
    if (animeCurve && genshinCurve) {
      const animeLen = Object.keys(animeCurve.levels).length;
      const genshinLen = Object.keys(genshinCurve.levels).length;
      if (animeLen !== genshinLen) {
        curveConflicts.push({
          kind: "weaponCurve",
          id,
          metric: "length",
          animeValue: animeLen,
          genshinValue: genshinLen,
        });
      }
      const animeChecksum = checksumWeaponCurve(animeCurve);
      const genshinChecksum = checksumWeaponCurve(genshinCurve);
      const delta = Math.abs(animeChecksum - genshinChecksum);
      if (exceedsRelativeTolerance(animeChecksum, genshinChecksum, thresholds.curveCrossCheckEpsilon)) {
        curveConflicts.push({
          kind: "weaponCurve",
          id,
          metric: "checksum",
          animeValue: animeChecksum,
          genshinValue: genshinChecksum,
          delta,
        });
      }
    }
  }

  const characterCount = ids.length;
  const missingRequiredRate =
    characterCount > 0 ? roundRate(missingRequired.length / characterCount) : 0;
  const missingCharacterCurveIds = ids.filter((id) => !characterCurves[id] || Object.keys(characterCurves[id].levels).length === 0);
  const missingTalentIds = ids.filter((id) => !hasTalentCoverage(talents[id]));
  const missingCurveOrTalentIds = ids.filter((id) => missingCharacterCurveIds.includes(id) || missingTalentIds.includes(id));
  const missingCharacterProfileIds = ids.filter((id) => !characterProfiles[id]);
  const charactersWithTalentIds = ids.filter((id) => Object.keys(talents[id]?.normals ?? {}).length > 0
    || Object.keys(talents[id]?.skill ?? {}).length > 0
    || Object.keys(talents[id]?.burst ?? {}).length > 0);
  const charactersWithHitCatalogForTalentIds = charactersWithTalentIds.filter((id) => {
    const catalog = hitCatalog[id];
    if (!catalog) {
      return false;
    }
    return catalog.normal.length + catalog.skill.length + catalog.burst.length > 0;
  });
  const missingHitCatalogIds = charactersWithTalentIds.filter((id) => !charactersWithHitCatalogForTalentIds.includes(id));

  const characterCurveCoverageRate = characterCount > 0
    ? roundRate((characterCount - missingCharacterCurveIds.length) / characterCount)
    : 0;
  const talentCoverageRate = characterCount > 0
    ? roundRate((characterCount - missingTalentIds.length) / characterCount)
    : 0;
  const characterProfileCoverageRate = characterCount > 0
    ? roundRate((characterCount - missingCharacterProfileIds.length) / characterCount)
    : 0;
  const hitCatalogCoverageRate = charactersWithTalentIds.length > 0
    ? roundRate(charactersWithHitCatalogForTalentIds.length / charactersWithTalentIds.length)
    : 1;
  const allHitEntries: Array<{ characterId: number; kind: HitKind; entry: HitEntry }> = [];
  for (const id of ids) {
    const catalog = hitCatalog[id];
    if (!catalog) {
      continue;
    }
    for (const kind of HIT_KINDS) {
      for (const entry of catalog[kind]) {
        allHitEntries.push({
          characterId: id,
          kind,
          entry,
        });
      }
    }
  }
  const totalHitCount = allHitEntries.length;
  const labeledEnCount = allHitEntries.filter(({ entry }) => (entry.labelEn ?? entry.sourceKey) !== entry.sourceKey).length;
  const labeledPtBRCount = allHitEntries.filter(({ entry }) => (entry.labelPtBR ?? entry.sourceKey) !== entry.sourceKey).length;
  const exactLabeledEnCount = allHitEntries.filter(({ entry }) => Boolean(entry.labelHash && mergedTextMapEn?.[entry.labelHash])).length;
  const exactLabeledPtBRCount = allHitEntries.filter(({ entry }) => Boolean(entry.labelHash && mergedTextMapPtBR?.[entry.labelHash])).length;
  const hitLabelEnCoverageRate = totalHitCount > 0 ? roundRate(labeledEnCount / totalHitCount) : 0;
  const hitLabelPtBRCoverageRate = totalHitCount > 0 ? roundRate(labeledPtBRCount / totalHitCount) : 0;
  const hitLabelExactEnCoverageRate = totalHitCount > 0 ? roundRate(exactLabeledEnCount / totalHitCount) : 0;
  const hitLabelExactPtBRCoverageRate = totalHitCount > 0 ? roundRate(exactLabeledPtBRCount / totalHitCount) : 0;
  const missingHitLabelSample = allHitEntries
    .filter(({ entry }) => (entry.labelEn ?? entry.sourceKey) === entry.sourceKey || (entry.labelPtBR ?? entry.sourceKey) === entry.sourceKey)
    .slice(0, 25)
    .map(({ characterId, kind, entry }) => ({
      characterId,
      kind,
      hitId: entry.id,
      sourceKey: entry.sourceKey,
    }));
  const missingCurveOrTalentRate = characterCount > 0
    ? roundRate(missingCurveOrTalentIds.length / characterCount)
    : 0;

  const report: GameDataCoreReport = {
    version,
    generatedAt,
    sourceCounts,
    summary: {
      characterCount,
      conflictCount: conflicts.length,
      missingRequiredCount: missingRequired.length,
      missingRequiredRate,
      unverifiedNameCount,
      characterCurveCoverageRate,
      talentCoverageRate,
      characterProfileCoverageRate,
      hitCatalogCoverageRate,
      hitLabelEnCoverageRate,
      hitLabelPtBRCoverageRate,
      hitLabelExactEnCoverageRate,
      hitLabelExactPtBRCoverageRate,
      missingCurveOrTalentRate,
      curveConflictCount: curveConflicts.length,
    },
    thresholds,
    conflicts,
    missingRequired,
    ...(missingHitLabelSample.length > 0 ? { missingHitLabelSample } : {}),
    coverage: {
      playableCharacterCount: characterCount,
      characterCurveCount: Object.keys(characterCurves).length,
      talentCount: Object.keys(talents).length,
      weaponCurveCount: Object.keys(weaponCurves).length,
      characterProfileCount: Object.keys(characterProfiles).length,
      hitCatalogCharacterCount: Object.keys(hitCatalog).length,
      charactersWithTalentCount: charactersWithTalentIds.length,
      charactersWithHitCatalogForTalentCount: charactersWithHitCatalogForTalentIds.length,
      missingCharacterCurveIds,
      missingTalentIds,
      missingCurveOrTalentIds,
      missingCharacterProfileIds,
      missingHitCatalogIds,
    },
    crossCheck: {
      epsilon: thresholds.curveCrossCheckEpsilon,
      checkedCharacterCurveCount: ids.filter((id) => {
        const hasAnime = datasets.some((dataset) => dataset.source === "animegamedata" && Boolean(dataset.characterCurves?.[id]));
        const hasGenshin = datasets.some((dataset) => dataset.source === "genshindata" && Boolean(dataset.characterCurves?.[id]));
        return hasAnime && hasGenshin;
      }).length,
      checkedWeaponCurveCount: [...allWeaponIds].filter((id) => {
        const hasAnime = datasets.some((dataset) => dataset.source === "animegamedata" && Boolean(dataset.weaponCurves?.[id]));
        const hasGenshin = datasets.some((dataset) => dataset.source === "genshindata" && Boolean(dataset.weaponCurves?.[id]));
        return hasAnime && hasGenshin;
      }).length,
      checkedTalentCount: ids.filter((id) => {
        const hasAnime = datasets.some((dataset) => dataset.source === "animegamedata" && Boolean(dataset.talents?.[id]));
        const hasGenshin = datasets.some((dataset) => dataset.source === "genshindata" && Boolean(dataset.talents?.[id]));
        return hasAnime && hasGenshin;
      }).length,
      curveConflicts,
    },
  };

  assertThresholds(report);

  return {
    data: {
      version,
      generatedAt,
      characters,
      characterCurves,
      weaponCurves,
      talents,
      characterProfiles,
      hitCatalog,
      ...(mergedTextMapEn ? { textMapEn: mergedTextMapEn } : {}),
      ...(mergedTextMapPtBR ? { textMapPtBR: mergedTextMapPtBR } : {}),
    },
    report,
  };
}
