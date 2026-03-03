import type {
  CharacterCurveTable,
  HitLabelHashByKey,
  SourceDataset,
  TalentMultipliers,
  WeaponCurveTable,
} from "../types";

const BASE_URL = "https://raw.githubusercontent.com/DimbreathBot/AnimeGameData/master";
const AVATAR_URL = `${BASE_URL}/ExcelBinOutput/AvatarExcelConfigData.json`;
const AVATAR_CURVE_URL = `${BASE_URL}/ExcelBinOutput/AvatarCurveExcelConfigData.json`;
const AVATAR_PROMOTE_URL = `${BASE_URL}/ExcelBinOutput/AvatarPromoteExcelConfigData.json`;
const AVATAR_SKILL_DEPOT_URL = `${BASE_URL}/ExcelBinOutput/AvatarSkillDepotExcelConfigData.json`;
const AVATAR_SKILL_URL = `${BASE_URL}/ExcelBinOutput/AvatarSkillExcelConfigData.json`;
const PROUD_SKILL_URL = `${BASE_URL}/ExcelBinOutput/ProudSkillExcelConfigData.json`;
const WEAPON_URL = `${BASE_URL}/ExcelBinOutput/WeaponExcelConfigData.json`;
const WEAPON_CURVE_URL = `${BASE_URL}/ExcelBinOutput/WeaponCurveExcelConfigData.json`;
const WEAPON_PROMOTE_URL = `${BASE_URL}/ExcelBinOutput/WeaponPromoteExcelConfigData.json`;
const TEXT_MAP_EN_URL = `${BASE_URL}/TextMap/TextMapEN.json`;
const TEXT_MAP_PTBR_URLS = [
  `${BASE_URL}/TextMap/TextMapPT-BR.json`,
  `${BASE_URL}/TextMap/TextMapPTBR.json`,
  `${BASE_URL}/TextMap/TextMapPT.json`,
];

const WEAPON_TYPE_BY_ID: Record<number, string> = {
  1: "Sword",
  2: "Claymore",
  3: "Polearm",
  4: "Catalyst",
  5: "Bow",
};

const WEAPON_TYPE_BY_KEY: Record<string, string> = {
  WEAPON_SWORD_ONE_HAND: "Sword",
  WEAPON_CLAYMORE: "Claymore",
  WEAPON_POLE: "Polearm",
  WEAPON_CATALYST: "Catalyst",
  WEAPON_BOW: "Bow",
};

const ELEMENT_BY_KEY: Record<string, string> = {
  Fire: "Pyro",
  Water: "Hydro",
  Electric: "Electro",
  Ice: "Cryo",
  Grass: "Dendro",
  Wind: "Anemo",
  Rock: "Geo",
};

const RARITY_BY_QUALITY: Record<string, number> = {
  QUALITY_PURPLE: 4,
  QUALITY_ORANGE: 5,
};

const LEVEL_MIN = 1;
const LEVEL_MAX = 90;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function toStringSafe(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function normalizeTextMap(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalized = toStringSafe(value);
    if (!normalized) {
      continue;
    }
    out[String(key)] = normalized;
  }
  return out;
}

function isPlayableAvatarId(id: number): boolean {
  return Number.isInteger(id) && id >= 10000000 && id < 20000000;
}

function toIconName(iconPath: unknown): string | undefined {
  const icon = toStringSafe(iconPath);
  if (!icon) {
    return undefined;
  }
  if (icon.startsWith("/ui/") && icon.endsWith(".png")) {
    return icon.slice(4, -4);
  }
  if (icon.startsWith("UI_") && icon.endsWith(".png")) {
    return icon.slice(0, -4);
  }
  return icon;
}

function resolveWeaponType(value: unknown): string | undefined {
  if (typeof value === "number") {
    return WEAPON_TYPE_BY_ID[value];
  }
  if (typeof value === "string") {
    return WEAPON_TYPE_BY_KEY[value] ?? value;
  }
  return undefined;
}

function resolveElement(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return ELEMENT_BY_KEY[value] ?? value;
}

function resolveRarity(value: unknown): number | undefined {
  if (typeof value === "string") {
    return RARITY_BY_QUALITY[value];
  }
  return toNumber(value);
}

function normalizeRows(raw: unknown): Record<string, Record<string, unknown>> {
  if (Array.isArray(raw)) {
    const rows: Record<string, Record<string, unknown>> = {};
    for (const value of raw) {
      if (!isRecord(value)) {
        continue;
      }
      const id = toNumber(value.Id ?? value.id ?? value.AvatarId);
      if (!id || !isPlayableAvatarId(id)) {
        continue;
      }
      rows[String(id)] = value;
    }
    return rows;
  }

  if (isRecord(raw)) {
    const rows: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!isRecord(value)) {
        continue;
      }
      if (/^\d+$/.test(key)) {
        rows[key] = value;
        continue;
      }
      const id = toNumber(value.Id ?? value.id ?? value.AvatarId);
      if (!id || !isPlayableAvatarId(id)) {
        continue;
      }
      rows[String(id)] = value;
    }
    return rows;
  }

  return {};
}

function normalizeByNumericId(raw: unknown): Record<number, Record<string, unknown>> {
  const out: Record<number, Record<string, unknown>> = {};
  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (!isRecord(value)) {
        continue;
      }
      const id = toNumber(value.Id ?? value.id);
      if (!id || id <= 0) {
        continue;
      }
      out[id] = value;
    }
    return out;
  }
  if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (!isRecord(value)) {
        continue;
      }
      const idFromValue = toNumber(value.Id ?? value.id);
      const id = idFromValue ?? (/^\d+$/.test(key) ? Number(key) : undefined);
      if (!id || id <= 0) {
        continue;
      }
      out[id] = value;
    }
  }
  return out;
}

function resolveName(textMap: Record<string, unknown>, hash: unknown): string | undefined {
  if (hash === undefined || hash === null) {
    return undefined;
  }
  return toStringSafe(textMap[String(hash)]);
}

function roundSix(value: number): number {
  return Number(value.toFixed(6));
}

function buildCurveMultiplierByLevel(rows: unknown): Record<number, Record<string, number>> {
  const table: Record<number, Record<string, number>> = {};
  if (!Array.isArray(rows)) {
    return table;
  }
  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }
    const level = toNumber(row.level ?? row.Level);
    if (!level || level <= 0) {
      continue;
    }
    const curveInfos = Array.isArray(row.curveInfos) ? row.curveInfos : [];
    const map: Record<string, number> = {};
    for (const info of curveInfos) {
      if (!isRecord(info)) {
        continue;
      }
      const type = toStringSafe(info.type);
      const value = toNumber(info.value);
      if (!type || value === undefined) {
        continue;
      }
      map[type] = value;
    }
    table[level] = map;
  }
  return table;
}

function parsePropGrowCurves(value: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (!Array.isArray(value)) {
    return map;
  }
  for (const row of value) {
    if (!isRecord(row)) {
      continue;
    }
    const propType = toStringSafe(row.type ?? row.propType);
    const curveType = toStringSafe(row.growCurve ?? row.typeGrow ?? row.curveType);
    if (!propType || !curveType) {
      continue;
    }
    map[propType] = curveType;
  }
  return map;
}

function parsePromoteGroups(
  rows: unknown,
  key: "avatarPromoteId" | "weaponPromoteId",
): Record<number, Array<Record<string, unknown>>> {
  const groups: Record<number, Array<Record<string, unknown>>> = {};
  if (!Array.isArray(rows)) {
    return groups;
  }
  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }
    const id = toNumber(row[key] ?? row[key[0].toUpperCase() + key.slice(1)]);
    if (!id || id <= 0) {
      continue;
    }
    if (!groups[id]) {
      groups[id] = [];
    }
    groups[id].push(row);
  }
  for (const id of Object.keys(groups).map((item) => Number(item))) {
    groups[id].sort((a, b) => (toNumber(a.promoteLevel) ?? 0) - (toNumber(b.promoteLevel) ?? 0));
  }
  return groups;
}

function getPromoteRowForLevel(
  rows: Array<Record<string, unknown>> | undefined,
  level: number,
): Record<string, unknown> | null {
  if (!rows || rows.length === 0) {
    return null;
  }
  for (const row of rows) {
    const unlockMax = toNumber(row.unlockMaxLevel);
    if (unlockMax !== undefined && level <= unlockMax) {
      return row;
    }
  }
  return rows[rows.length - 1];
}

function readAddProps(row: Record<string, unknown> | null): Array<Record<string, unknown>> {
  if (!row) {
    return [];
  }
  return Array.isArray(row.addProps) ? (row.addProps.filter(isRecord) as Array<Record<string, unknown>>) : [];
}

function findAddPropValue(
  addProps: Array<Record<string, unknown>>,
  propType: string,
): number | undefined {
  for (const prop of addProps) {
    const candidate = toStringSafe(prop.propType ?? prop.type);
    if (candidate !== propType) {
      continue;
    }
    return toNumber(prop.value);
  }
  return undefined;
}

function findFirstAscBonus(addProps: Array<Record<string, unknown>>): number | undefined {
  for (const prop of addProps) {
    const propType = toStringSafe(prop.propType ?? prop.type) ?? "";
    if (propType === "FIGHT_PROP_BASE_HP" || propType === "FIGHT_PROP_BASE_ATTACK" || propType === "FIGHT_PROP_BASE_DEFENSE") {
      continue;
    }
    const value = toNumber(prop.value);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function buildCharacterCurves(
  avatarRows: Record<string, Record<string, unknown>>,
  avatarCurveRows: unknown,
  avatarPromoteRows: unknown,
): Record<number, CharacterCurveTable> {
  const curveByLevel = buildCurveMultiplierByLevel(avatarCurveRows);
  const promoteGroups = parsePromoteGroups(avatarPromoteRows, "avatarPromoteId");
  const curves: Record<number, CharacterCurveTable> = {};

  for (const [idRaw, row] of Object.entries(avatarRows)) {
    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      continue;
    }
    const baseHp = toNumber(row.hpBase ?? row.HpBase);
    const baseAtk = toNumber(row.attackBase ?? row.atkBase ?? row.AttackBase);
    const baseDef = toNumber(row.defenseBase ?? row.defBase ?? row.DefenseBase);
    const promoteId = toNumber(row.avatarPromoteId ?? row.AvatarPromoteId);
    const growMap = parsePropGrowCurves(row.propGrowCurves);
    const hpCurveType = growMap.FIGHT_PROP_BASE_HP;
    const atkCurveType = growMap.FIGHT_PROP_BASE_ATTACK;
    const defCurveType = growMap.FIGHT_PROP_BASE_DEFENSE;

    if (!promoteId || !hpCurveType || !atkCurveType || !defCurveType) {
      continue;
    }

    const levels: CharacterCurveTable["levels"] = {};
    for (let level = LEVEL_MIN; level <= LEVEL_MAX; level += 1) {
      const curveRow = curveByLevel[level];
      if (!curveRow) {
        continue;
      }
      const promoteRow = getPromoteRowForLevel(promoteGroups[promoteId], level);
      const addProps = readAddProps(promoteRow);
      const hpAsc = findAddPropValue(addProps, "FIGHT_PROP_BASE_HP") ?? 0;
      const atkAsc = findAddPropValue(addProps, "FIGHT_PROP_BASE_ATTACK") ?? 0;
      const defAsc = findAddPropValue(addProps, "FIGHT_PROP_BASE_DEFENSE") ?? 0;
      const asc = findFirstAscBonus(addProps);

      const hpBase = baseHp !== undefined ? roundSix(baseHp * (curveRow[hpCurveType] ?? 0) + hpAsc) : undefined;
      const atkBase = baseAtk !== undefined ? roundSix(baseAtk * (curveRow[atkCurveType] ?? 0) + atkAsc) : undefined;
      const defBase = baseDef !== undefined ? roundSix(baseDef * (curveRow[defCurveType] ?? 0) + defAsc) : undefined;

      levels[level] = {
        ...(hpBase !== undefined ? { hpBase } : {}),
        ...(atkBase !== undefined ? { atkBase } : {}),
        ...(defBase !== undefined ? { defBase } : {}),
        ...(asc !== undefined ? { asc: roundSix(asc) } : {}),
      };
    }

    if (Object.keys(levels).length > 0) {
      curves[id] = {
        id: String(id),
        levels,
      };
    }
  }

  return curves;
}

function parseWeaponPropEntries(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord) as Array<Record<string, unknown>>;
}

function buildWeaponCurves(
  weaponRows: Record<number, Record<string, unknown>>,
  weaponCurveRows: unknown,
  weaponPromoteRows: unknown,
): Record<number, WeaponCurveTable> {
  const curveByLevel = buildCurveMultiplierByLevel(weaponCurveRows);
  const promoteGroups = parsePromoteGroups(weaponPromoteRows, "weaponPromoteId");
  const curves: Record<number, WeaponCurveTable> = {};

  for (const [idRaw, row] of Object.entries(weaponRows)) {
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      continue;
    }
    const promoteId = toNumber(row.weaponPromoteId ?? row.WeaponPromoteId);
    if (!promoteId) {
      continue;
    }
    const weaponProp = parseWeaponPropEntries(row.weaponProp ?? row.WeaponProp);
    const atkEntry = weaponProp.find((entry) => toStringSafe(entry.propType) === "FIGHT_PROP_BASE_ATTACK");
    const subEntry = weaponProp.find((entry) => toStringSafe(entry.propType) !== "FIGHT_PROP_BASE_ATTACK");
    const atkInit = toNumber(atkEntry?.initValue);
    const atkCurveType = toStringSafe(atkEntry?.type);
    const subInit = toNumber(subEntry?.initValue);
    const subCurveType = toStringSafe(subEntry?.type);
    const subPropType = toStringSafe(subEntry?.propType);

    if (atkInit === undefined || !atkCurveType) {
      continue;
    }

    const levels: WeaponCurveTable["levels"] = {};
    for (let level = LEVEL_MIN; level <= LEVEL_MAX; level += 1) {
      const curveRow = curveByLevel[level];
      if (!curveRow) {
        continue;
      }
      const promoteRow = getPromoteRowForLevel(promoteGroups[promoteId], level);
      const addProps = readAddProps(promoteRow);
      const atkAsc = findAddPropValue(addProps, "FIGHT_PROP_BASE_ATTACK") ?? 0;
      const subAsc = subPropType ? (findAddPropValue(addProps, subPropType) ?? 0) : 0;
      const asc = findFirstAscBonus(addProps);

      const atkBase = roundSix(atkInit * (curveRow[atkCurveType] ?? 0) + atkAsc);
      const substat = subInit !== undefined && subCurveType
        ? roundSix(subInit * (curveRow[subCurveType] ?? 0) + subAsc)
        : undefined;

      levels[level] = {
        atkBase,
        ...(substat !== undefined ? { substat } : {}),
        ...(asc !== undefined ? { asc: roundSix(asc) } : {}),
      };
    }

    if (Object.keys(levels).length > 0) {
      curves[id] = {
        id: String(id),
        levels,
      };
    }
  }

  return curves;
}

function sanitizeTalentKey(label: string, index: number): string {
  const normalized = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return normalized ? `p${index + 1}_${normalized}` : `p${index + 1}`;
}

interface TalentSectionResult {
  values: Record<string, number[]>;
  labelHashByKey: Record<string, string>;
}

function readTalentSection(
  proudGroups: Record<number, Array<Record<string, unknown>>>,
  groupId: number | undefined,
  textMap: Record<string, unknown>,
  notes: string[],
): TalentSectionResult {
  if (!groupId) {
    notes.push("missing_proud_group");
    return { values: {}, labelHashByKey: {} };
  }
  const rows = proudGroups[groupId] ?? [];
  if (rows.length === 0) {
    notes.push(`missing_proud_rows:${groupId}`);
    return { values: {}, labelHashByKey: {} };
  }

  const byLevel = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    const level = toNumber(row.level);
    if (!level || level <= 0) {
      continue;
    }
    byLevel.set(level, row);
  }

  const requiredLevels: Record<string, unknown>[] = [];
  for (let level = 1; level <= 10; level += 1) {
    const row = byLevel.get(level);
    if (!row) {
      notes.push(`missing_talent_level:${groupId}:${level}`);
      return { values: {}, labelHashByKey: {} };
    }
    requiredLevels.push(row);
  }

  const first = requiredLevels[0];
  const descList = Array.isArray(first.paramDescList) ? first.paramDescList : [];
  const firstParamList = Array.isArray(first.paramList) ? first.paramList : [];
  const section: Record<string, number[]> = {};
  const labelHashByKey: Record<string, string> = {};

  for (let index = 0; index < firstParamList.length; index += 1) {
    const descHash = descList[index];
    const rawDesc = descHash === undefined ? undefined : toStringSafe(textMap[String(descHash)]);
    const label = rawDesc ? rawDesc.split("|")[0] : `param${index + 1}`;
    const values = requiredLevels.map((row) => {
      const rowParamList = Array.isArray(row.paramList) ? row.paramList : [];
      return roundSix(toNumber(rowParamList[index]) ?? 0);
    });
    const hasNonZero = values.some((value) => Math.abs(value) > 0);
    if (!hasNonZero) {
      continue;
    }
    const key = sanitizeTalentKey(label, index);
    section[key] = values;
    const normalizedHash = toStringSafe(descHash === undefined ? undefined : String(descHash));
    if (normalizedHash) {
      labelHashByKey[key] = normalizedHash;
    }
  }

  return {
    values: section,
    labelHashByKey,
  };
}

function buildTalents(
  avatarRows: Record<string, Record<string, unknown>>,
  depotRowsRaw: unknown,
  skillRowsRaw: unknown,
  proudRowsRaw: unknown,
  textMap: Record<string, unknown>,
): {
  talents: Record<number, TalentMultipliers>;
  hitLabelHashByKey: Record<number, HitLabelHashByKey>;
} {
  const depots = normalizeByNumericId(depotRowsRaw);
  const skills = normalizeByNumericId(skillRowsRaw);
  const proudRows = Array.isArray(proudRowsRaw)
    ? (proudRowsRaw.filter(isRecord) as Array<Record<string, unknown>>)
    : [];
  const proudGroups: Record<number, Array<Record<string, unknown>>> = {};
  for (const row of proudRows) {
    const groupId = toNumber(row.proudSkillGroupId);
    if (!groupId || groupId <= 0) {
      continue;
    }
    if (!proudGroups[groupId]) {
      proudGroups[groupId] = [];
    }
    proudGroups[groupId].push(row);
  }
  for (const id of Object.keys(proudGroups).map((value) => Number(value))) {
    proudGroups[id].sort((a, b) => (toNumber(a.level) ?? 0) - (toNumber(b.level) ?? 0));
  }

  const talents: Record<number, TalentMultipliers> = {};
  const hitLabelHashByKey: Record<number, HitLabelHashByKey> = {};

  for (const [idRaw, avatar] of Object.entries(avatarRows)) {
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      continue;
    }
    const depotId = toNumber(avatar.skillDepotId ?? avatar.SkillDepotId);
    if (!depotId) {
      continue;
    }
    const depot = depots[depotId];
    if (!depot) {
      continue;
    }

    const skillIds = Array.isArray(depot.skills)
      ? depot.skills.map((value) => toNumber(value) ?? 0).filter((value) => value > 0)
      : [];
    const normalSkillId = skillIds[0];
    const burstSkillId = toNumber(depot.energySkill) ?? skillIds[2];
    const skillSkillId = skillIds.find((value) => value !== normalSkillId && value !== burstSkillId);

    const normalGroup = toNumber(skills[normalSkillId ?? -1]?.proudSkillGroupId);
    const skillGroup = toNumber(skills[skillSkillId ?? -1]?.proudSkillGroupId);
    const burstGroup = toNumber(skills[burstSkillId ?? -1]?.proudSkillGroupId);

    const notes: string[] = [];
    const normals = readTalentSection(proudGroups, normalGroup, textMap, notes);
    const skill = readTalentSection(proudGroups, skillGroup, textMap, notes);
    const burst = readTalentSection(proudGroups, burstGroup, textMap, notes);

    talents[id] = {
      characterId: id,
      normals: normals.values,
      skill: skill.values,
      burst: burst.values,
      ...(notes.length > 0 ? { notes } : {}),
    };

    if (
      Object.keys(normals.labelHashByKey).length > 0 ||
      Object.keys(skill.labelHashByKey).length > 0 ||
      Object.keys(burst.labelHashByKey).length > 0
    ) {
      hitLabelHashByKey[id] = {
        normals: normals.labelHashByKey,
        skill: skill.labelHashByKey,
        burst: burst.labelHashByKey,
      };
    }
  }

  return {
    talents,
    hitLabelHashByKey,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "genshin-calculator-game-data-core",
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.json();
}

async function fetchJsonOptional(url: string): Promise<unknown | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "genshin-calculator-game-data-core",
      Accept: "application/json",
    },
  });
  if (response.ok) {
    return response.json();
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Failed to fetch ${url} (${response.status})`);
}

async function fetchOptionalTextMapPtBR(): Promise<Record<string, string>> {
  for (const url of TEXT_MAP_PTBR_URLS) {
    const raw = await fetchJsonOptional(url);
    if (raw && isRecord(raw)) {
      return normalizeTextMap(raw);
    }
  }
  return {};
}

export async function loadAnimeGameDataSource(): Promise<SourceDataset> {
  const [
    avatarsRaw,
    textMapEnRaw,
    textMapPtBRRaw,
    avatarCurveRaw,
    avatarPromoteRaw,
    weaponRaw,
    weaponCurveRaw,
    weaponPromoteRaw,
    depotRaw,
    skillRaw,
    proudRaw,
  ] = await Promise.all([
    fetchJson(AVATAR_URL),
    fetchJson(TEXT_MAP_EN_URL),
    fetchOptionalTextMapPtBR(),
    fetchJson(AVATAR_CURVE_URL),
    fetchJson(AVATAR_PROMOTE_URL),
    fetchJson(WEAPON_URL),
    fetchJson(WEAPON_CURVE_URL),
    fetchJson(WEAPON_PROMOTE_URL),
    fetchJson(AVATAR_SKILL_DEPOT_URL),
    fetchJson(AVATAR_SKILL_URL),
    fetchJson(PROUD_SKILL_URL),
  ]);

  const avatarRows = normalizeRows(avatarsRaw);
  const textMapEn = normalizeTextMap(textMapEnRaw);
  const textMapPtBR = normalizeTextMap(textMapPtBRRaw);
  const weaponRows = normalizeByNumericId(weaponRaw);
  const characters: SourceDataset["characters"] = {};

  for (const [idRaw, row] of Object.entries(avatarRows)) {
    if (!/^\d+$/.test(idRaw)) {
      continue;
    }
    const id = Number(idRaw);
    if (!Number.isFinite(id) || !isPlayableAvatarId(id)) {
      continue;
    }
    const nameHash = row.NameTextMapHash ?? row.NameHash ?? row.nameTextMapHash ?? row.nameHash;
    const nameEn = resolveName(textMapEn, nameHash);
    const rarity = resolveRarity(row.QualityType ?? row.Rarity ?? row.qualityType ?? row.rarity);
    const weaponType = resolveWeaponType(row.WeaponType ?? row.weaponType);
    const element = resolveElement(row.Element ?? row.Vision ?? row.element ?? row.vision);
    const icon = toIconName(row.SideIconName ?? row.IconName ?? row.Icon ?? row.sideIconName ?? row.iconName ?? row.icon);

    characters[id] = {
      id,
      ...(nameEn ? { name: nameEn, names: { en: nameEn } } : {}),
      ...(nameHash !== undefined ? { nameHash: String(nameHash) } : {}),
      ...(icon ? { icon } : {}),
      ...(rarity ? { rarity } : {}),
      ...(element ? { element } : {}),
      ...(weaponType ? { weaponType } : {}),
    };
  }

  const characterCurves = buildCharacterCurves(avatarRows, avatarCurveRaw, avatarPromoteRaw);
  const weaponCurves = buildWeaponCurves(weaponRows, weaponCurveRaw, weaponPromoteRaw);
  const { talents, hitLabelHashByKey } = buildTalents(avatarRows, depotRaw, skillRaw, proudRaw, textMapEn);

  return {
    source: "animegamedata",
    fetchedAt: new Date().toISOString(),
    characters,
    characterCurves,
    weaponCurves,
    talents,
    ...(Object.keys(hitLabelHashByKey).length > 0 ? { hitLabelHashByKey } : {}),
    ...(Object.keys(textMapEn).length > 0 ? { textMapEn } : {}),
    ...(Object.keys(textMapPtBR).length > 0 ? { textMapPtBR } : {}),
  };
}
