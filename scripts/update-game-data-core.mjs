import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_DATA_FILE = "src/lib/genshin/game-data-core/generated/game-data-core.json";
const OUTPUT_REPORT_FILE = "src/lib/genshin/game-data-core/generated/game-data-report.json";
const LITE_FALLBACK_FILE = "src/lib/genshin/game-data/generated/game-data-lite.json";
const CHARACTER_PROFILES_OVERRIDE_FILE =
  "src/lib/genshin/game-data-core/overrides/character-profiles.v1.json";

const CATALOG_SOURCE_PRIORITY = ["enka", "animegamedata", "genshindata"];
const CURVE_SOURCE_PRIORITY = ["animegamedata", "genshindata", "enka"];
const REQUIRED_FIELDS = ["name", "rarity"];
const LEVEL_MIN = 1;
const LEVEL_MAX = 90;

const DEFAULT_MAX_CONFLICTS = 100;
const DEFAULT_MAX_MISSING_REQUIRED_RATE = 0.05;
const DEFAULT_MAX_MISSING_CURVE_OR_TALENT_RATE = 0.05;
const DEFAULT_CURVE_EPSILON = 1e-6;
const SCALING_STATS = ["atk", "hp", "def", "em"];
const HIT_KINDS = ["normal", "skill", "burst"];
const HIT_ID_PREFIX_BY_KIND = {
  normal: "na",
  skill: "skill",
  burst: "burst",
};
const DAMAGE_TYPES = [
  "physical",
  "pyro",
  "hydro",
  "electro",
  "cryo",
  "dendro",
  "anemo",
  "geo",
];

const ENKA_BASE = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi";
const ANIME_BASE = "https://raw.githubusercontent.com/DimbreathBot/AnimeGameData/master";
const GENSHIN_BASE = "https://raw.githubusercontent.com/Sycamore0/GenshinData/main";

const WEAPON_TYPE_BY_ID = {
  1: "Sword",
  2: "Claymore",
  3: "Polearm",
  4: "Catalyst",
  5: "Bow",
};

const WEAPON_TYPE_BY_KEY = {
  WEAPON_SWORD_ONE_HAND: "Sword",
  WEAPON_CLAYMORE: "Claymore",
  WEAPON_POLE: "Polearm",
  WEAPON_CATALYST: "Catalyst",
  WEAPON_BOW: "Bow",
};

const ELEMENT_BY_KEY = {
  Fire: "Pyro",
  Water: "Hydro",
  Electric: "Electro",
  Ice: "Cryo",
  Grass: "Dendro",
  Wind: "Anemo",
  Rock: "Geo",
};

const RARITY_BY_QUALITY = {
  QUALITY_PURPLE: 4,
  QUALITY_ORANGE: 5,
};

function toNumber(value) {
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

function toNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlayableAvatarId(id) {
  return Number.isInteger(id) && id >= 10000000 && id < 20000000;
}

function roundSix(value) {
  return Number(value.toFixed(6));
}

function normalizeNameKey(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toIconName(iconPath) {
  const icon = toNonEmptyString(iconPath);
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

function resolveWeaponType(value) {
  if (typeof value === "number") {
    return WEAPON_TYPE_BY_ID[value];
  }
  if (typeof value === "string") {
    return WEAPON_TYPE_BY_KEY[value] ?? value;
  }
  return undefined;
}

function resolveElement(value) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return ELEMENT_BY_KEY[value] ?? value;
}

function resolveRarity(value) {
  if (typeof value === "string") {
    return RARITY_BY_QUALITY[value];
  }
  return toNumber(value);
}

function buildVersion(now) {
  let suffix = "";
  try {
    suffix = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  }
  return `${now.toISOString().slice(0, 10)}-${suffix}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "genshin-calculator-game-data-core-updater",
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  return response.json();
}

async function fetchJsonOptional(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "genshin-calculator-game-data-core-updater",
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

function normalizeTextMap(raw) {
  if (!isRecord(raw)) {
    return {};
  }
  const out = {};
  for (const [hash, value] of Object.entries(raw)) {
    const text = toNonEmptyString(value);
    if (!text) {
      continue;
    }
    out[String(hash)] = text;
  }
  return out;
}

function normalizeRows(raw) {
  if (Array.isArray(raw)) {
    const rows = {};
    for (const entry of raw) {
      if (!isRecord(entry)) {
        continue;
      }
      const id = toNumber(entry.Id ?? entry.id ?? entry.AvatarId);
      if (!id || !isPlayableAvatarId(id)) {
        continue;
      }
      rows[String(id)] = entry;
    }
    return rows;
  }
  if (isRecord(raw)) {
    const rows = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!isRecord(value)) {
        continue;
      }
      if (/^\d+$/.test(key)) {
        const id = Number(key);
        if (!isPlayableAvatarId(id)) {
          continue;
        }
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

function normalizeByNumericId(raw) {
  const out = {};
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isRecord(entry)) {
        continue;
      }
      const id = toNumber(entry.Id ?? entry.id);
      if (!id || id <= 0) {
        continue;
      }
      out[id] = entry;
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

function resolveLocalizedName(locs, lang, hash) {
  if (!isRecord(locs) || hash === undefined || hash === null) {
    return undefined;
  }
  const table = locs[lang];
  if (!isRecord(table)) {
    return undefined;
  }
  return toNonEmptyString(table[String(hash)]);
}

function resolveNameFromTextMap(textMap, hash) {
  if (!isRecord(textMap) || hash === undefined || hash === null) {
    return undefined;
  }
  return toNonEmptyString(textMap[String(hash)]);
}

function buildCurveMultiplierByLevel(rows) {
  const table = {};
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
    const map = {};
    for (const info of curveInfos) {
      if (!isRecord(info)) {
        continue;
      }
      const type = toNonEmptyString(info.type);
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

function parsePropGrowCurves(value) {
  const map = {};
  if (!Array.isArray(value)) {
    return map;
  }
  for (const row of value) {
    if (!isRecord(row)) {
      continue;
    }
    const propType = toNonEmptyString(row.type ?? row.propType);
    const curveType = toNonEmptyString(row.growCurve ?? row.typeGrow ?? row.curveType);
    if (!propType || !curveType) {
      continue;
    }
    map[propType] = curveType;
  }
  return map;
}

function parsePromoteGroups(rows, key) {
  const groups = {};
  if (!Array.isArray(rows)) {
    return groups;
  }
  for (const row of rows) {
    if (!isRecord(row)) {
      continue;
    }
    const id = toNumber(row[key]);
    if (!id || id <= 0) {
      continue;
    }
    if (!groups[id]) {
      groups[id] = [];
    }
    groups[id].push(row);
  }
  for (const id of Object.keys(groups).map((value) => Number(value))) {
    groups[id].sort((a, b) => (toNumber(a.promoteLevel) ?? 0) - (toNumber(b.promoteLevel) ?? 0));
  }
  return groups;
}

function getPromoteRowForLevel(rows, level) {
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

function readAddProps(row) {
  if (!row || !isRecord(row) || !Array.isArray(row.addProps)) {
    return [];
  }
  return row.addProps.filter(isRecord);
}

function findAddPropValue(addProps, propType) {
  for (const prop of addProps) {
    const candidate = toNonEmptyString(prop.propType ?? prop.type);
    if (candidate !== propType) {
      continue;
    }
    const value = toNumber(prop.value);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function findFirstAscBonus(addProps) {
  for (const prop of addProps) {
    const propType = toNonEmptyString(prop.propType ?? prop.type) ?? "";
    if (
      propType === "FIGHT_PROP_BASE_HP" ||
      propType === "FIGHT_PROP_BASE_ATTACK" ||
      propType === "FIGHT_PROP_BASE_DEFENSE"
    ) {
      continue;
    }
    const value = toNumber(prop.value);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function parseWeaponPropEntries(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function sanitizeTalentKey(label, index) {
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

function buildCharacterCurves(avatarRows, avatarCurveRows, avatarPromoteRows) {
  const curveByLevel = buildCurveMultiplierByLevel(avatarCurveRows);
  const promoteGroups = parsePromoteGroups(avatarPromoteRows, "avatarPromoteId");
  const curves = {};

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

    const levels = {};
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
      const hpBase =
        baseHp !== undefined ? roundSix(baseHp * (curveRow[hpCurveType] ?? 0) + hpAsc) : undefined;
      const atkBase =
        baseAtk !== undefined ? roundSix(baseAtk * (curveRow[atkCurveType] ?? 0) + atkAsc) : undefined;
      const defBase =
        baseDef !== undefined ? roundSix(baseDef * (curveRow[defCurveType] ?? 0) + defAsc) : undefined;
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

function buildWeaponCurves(weaponRows, weaponCurveRows, weaponPromoteRows) {
  const curveByLevel = buildCurveMultiplierByLevel(weaponCurveRows);
  const promoteGroups = parsePromoteGroups(weaponPromoteRows, "weaponPromoteId");
  const curves = {};

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
    const atkEntry = weaponProp.find((entry) => toNonEmptyString(entry.propType) === "FIGHT_PROP_BASE_ATTACK");
    const subEntry = weaponProp.find((entry) => toNonEmptyString(entry.propType) !== "FIGHT_PROP_BASE_ATTACK");
    const atkInit = toNumber(atkEntry?.initValue);
    const atkCurveType = toNonEmptyString(atkEntry?.type);
    const subInit = toNumber(subEntry?.initValue);
    const subCurveType = toNonEmptyString(subEntry?.type);
    const subPropType = toNonEmptyString(subEntry?.propType);
    if (atkInit === undefined || !atkCurveType) {
      continue;
    }

    const levels = {};
    for (let level = LEVEL_MIN; level <= LEVEL_MAX; level += 1) {
      const curveRow = curveByLevel[level];
      if (!curveRow) {
        continue;
      }
      const promoteRow = getPromoteRowForLevel(promoteGroups[promoteId], level);
      const addProps = readAddProps(promoteRow);
      const atkAsc = findAddPropValue(addProps, "FIGHT_PROP_BASE_ATTACK") ?? 0;
      const subAsc = subPropType ? findAddPropValue(addProps, subPropType) ?? 0 : 0;
      const asc = findFirstAscBonus(addProps);
      const atkBase = roundSix(atkInit * (curveRow[atkCurveType] ?? 0) + atkAsc);
      const substat =
        subInit !== undefined && subCurveType !== undefined
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

function readTalentSection(proudGroups, groupId, textMap, notes) {
  if (!groupId) {
    notes.push("missing_proud_group");
    return {
      values: {},
      labelHashByKey: {},
    };
  }
  const rows = proudGroups[groupId] ?? [];
  if (rows.length === 0) {
    notes.push(`missing_proud_rows:${groupId}`);
    return {
      values: {},
      labelHashByKey: {},
    };
  }
  const byLevel = new Map();
  for (const row of rows) {
    const level = toNumber(row.level);
    if (!level || level <= 0) {
      continue;
    }
    byLevel.set(level, row);
  }

  const required = [];
  for (let level = 1; level <= 10; level += 1) {
    const row = byLevel.get(level);
    if (!row) {
      notes.push(`missing_talent_level:${groupId}:${level}`);
      return {
        values: {},
        labelHashByKey: {},
      };
    }
    required.push(row);
  }

  const first = required[0];
  const descList = Array.isArray(first.paramDescList) ? first.paramDescList : [];
  const firstParamList = Array.isArray(first.paramList) ? first.paramList : [];
  const section = {};
  const labelHashByKey = {};
  for (let index = 0; index < firstParamList.length; index += 1) {
    const descHash = descList[index];
    const rawDesc = descHash === undefined ? undefined : resolveNameFromTextMap(textMap, descHash);
    const label = rawDesc ? rawDesc.split("|")[0] : `param${index + 1}`;
    const values = required.map((row) => {
      const params = Array.isArray(row.paramList) ? row.paramList : [];
      return roundSix(toNumber(params[index]) ?? 0);
    });
    if (!values.some((value) => Math.abs(value) > 0)) {
      continue;
    }
    const key = sanitizeTalentKey(label, index);
    section[key] = values;
    const normalizedHash = toNonEmptyString(descHash === undefined ? undefined : String(descHash));
    if (normalizedHash) {
      labelHashByKey[key] = normalizedHash;
    }
  }
  return {
    values: section,
    labelHashByKey,
  };
}

function buildTalents(avatarRows, depotRowsRaw, skillRowsRaw, proudRowsRaw, textMap) {
  const depots = normalizeByNumericId(depotRowsRaw);
  const skills = normalizeByNumericId(skillRowsRaw);
  const proudRows = Array.isArray(proudRowsRaw) ? proudRowsRaw.filter(isRecord) : [];
  const proudGroups = {};
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

  const talents = {};
  const hitLabelHashByKey = {};
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

    const notes = [];
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

const TEXT_MAP_PTBR_CANDIDATES = [
  "TextMapPT-BR.json",
  "TextMapPTBR.json",
  "TextMapPT.json",
];

async function fetchOptionalPtBRTextMap(baseUrl) {
  for (const fileName of TEXT_MAP_PTBR_CANDIDATES) {
    const raw = await fetchJsonOptional(`${baseUrl}/TextMap/${fileName}`);
    if (raw && isRecord(raw)) {
      return normalizeTextMap(raw);
    }
  }
  return {};
}

async function loadEnkaSource() {
  const [avatarsRaw, locsRaw] = await Promise.all([
    fetchJson(`${ENKA_BASE}/avatars.json`),
    fetchJson(`${ENKA_BASE}/locs.json`),
  ]);

  const avatars = isRecord(avatarsRaw) ? avatarsRaw : {};
  const locs = isRecord(locsRaw) ? locsRaw : {};
  const characters = {};

  for (const [idRaw, row] of Object.entries(avatars)) {
    if (!/^\d+$/.test(idRaw) || !isRecord(row)) {
      continue;
    }
    const id = Number(idRaw);
    if (!isPlayableAvatarId(id)) {
      continue;
    }
    const nameHash = row.NameTextMapHash;
    const nameEn = resolveLocalizedName(locs, "en", nameHash);
    const namePt = resolveLocalizedName(locs, "pt", nameHash);
    const rarity = resolveRarity(row.QualityType);
    const element = resolveElement(row.Element);
    const weaponType = resolveWeaponType(row.WeaponType);
    const icon = toIconName(row.SideIconName);

    characters[id] = {
      id,
      ...(nameEn ? { name: nameEn } : {}),
      ...(nameHash !== undefined ? { nameHash: String(nameHash) } : {}),
      ...((nameEn || namePt)
        ? {
            names: {
              ...(nameEn ? { en: nameEn } : {}),
              ...(namePt ? { "pt-BR": namePt } : {}),
            },
          }
        : {}),
      ...(rarity ? { rarity } : {}),
      ...(element ? { element } : {}),
      ...(weaponType ? { weaponType } : {}),
      ...(icon ? { icon } : {}),
    };
  }

  return {
    source: "enka",
    fetchedAt: new Date().toISOString(),
    characters,
  };
}

async function loadExcelSource(sourceName, baseUrl) {
  const [
    avatarsRaw,
    avatarCurveRaw,
    avatarPromoteRaw,
    depotRaw,
    skillRaw,
    proudRaw,
    weaponRaw,
    weaponCurveRaw,
    weaponPromoteRaw,
    textMapEnRaw,
    textMapPtBRRaw,
  ] = await Promise.all([
    fetchJson(`${baseUrl}/ExcelBinOutput/AvatarExcelConfigData.json`),
    fetchJson(`${baseUrl}/ExcelBinOutput/AvatarCurveExcelConfigData.json`),
    fetchJson(`${baseUrl}/ExcelBinOutput/AvatarPromoteExcelConfigData.json`),
    fetchJson(`${baseUrl}/ExcelBinOutput/AvatarSkillDepotExcelConfigData.json`),
    fetchJson(`${baseUrl}/ExcelBinOutput/AvatarSkillExcelConfigData.json`),
    fetchJson(`${baseUrl}/ExcelBinOutput/ProudSkillExcelConfigData.json`),
    fetchJson(`${baseUrl}/ExcelBinOutput/WeaponExcelConfigData.json`),
    fetchJson(`${baseUrl}/ExcelBinOutput/WeaponCurveExcelConfigData.json`),
    fetchJson(`${baseUrl}/ExcelBinOutput/WeaponPromoteExcelConfigData.json`),
    fetchJson(`${baseUrl}/TextMap/TextMapEN.json`),
    fetchOptionalPtBRTextMap(baseUrl),
  ]);

  const avatarRows = normalizeRows(avatarsRaw);
  const textMapEn = normalizeTextMap(textMapEnRaw);
  const textMapPtBR = normalizeTextMap(textMapPtBRRaw);
  const characters = {};

  for (const [idRaw, row] of Object.entries(avatarRows)) {
    if (!/^\d+$/.test(idRaw)) {
      continue;
    }
    const id = Number(idRaw);
    if (!isPlayableAvatarId(id)) {
      continue;
    }
    const nameHash = row.NameTextMapHash ?? row.NameHash ?? row.nameTextMapHash ?? row.nameHash;
    const name = resolveNameFromTextMap(textMapEn, nameHash);
    const rarity = resolveRarity(row.QualityType ?? row.Rarity ?? row.qualityType ?? row.rarity);
    const element = resolveElement(row.Element ?? row.Vision ?? row.element ?? row.vision);
    const weaponType = resolveWeaponType(row.WeaponType ?? row.weaponType);
    const icon = toIconName(
      row.SideIconName ?? row.IconName ?? row.iconName ?? row.sideIconName ?? row.Icon ?? row.icon,
    );

    characters[id] = {
      id,
      ...(name ? { name, names: { en: name } } : {}),
      ...(nameHash !== undefined ? { nameHash: String(nameHash) } : {}),
      ...(rarity ? { rarity } : {}),
      ...(element ? { element } : {}),
      ...(weaponType ? { weaponType } : {}),
      ...(icon ? { icon } : {}),
    };
  }

  const weaponRows = normalizeByNumericId(weaponRaw);
  const characterCurves = buildCharacterCurves(avatarRows, avatarCurveRaw, avatarPromoteRaw);
  const weaponCurves = buildWeaponCurves(weaponRows, weaponCurveRaw, weaponPromoteRaw);
  const { talents, hitLabelHashByKey } = buildTalents(avatarRows, depotRaw, skillRaw, proudRaw, textMapEn);

  return {
    source: sourceName,
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

async function loadAnimeGameDataSource() {
  return loadExcelSource("animegamedata", ANIME_BASE);
}

async function loadGenshinDataSource() {
  return loadExcelSource("genshindata", GENSHIN_BASE);
}

function pickByPriority(valuesBySource, priority) {
  for (const source of priority) {
    const value = valuesBySource[source];
    if (value !== undefined && value !== null) {
      return { source, value };
    }
  }
  return null;
}

function collectCharacterIds(datasets) {
  const enkaDataset = datasets.find((dataset) => dataset.source === "enka");
  if (enkaDataset && Object.keys(enkaDataset.characters).length > 0) {
    return Object.keys(enkaDataset.characters)
      .map((key) => Number(key))
      .filter((id) => Number.isInteger(id) && id > 0)
      .sort((a, b) => a - b);
  }
  const set = new Set();
  for (const dataset of datasets) {
    for (const key of Object.keys(dataset.characters ?? {})) {
      const id = Number(key);
      if (Number.isInteger(id) && id > 0) {
        set.add(id);
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}

function resolveCatalogRecordsBySource(datasets, id) {
  const map = {};
  for (const dataset of datasets) {
    const row = dataset.characters?.[id];
    if (row) {
      map[dataset.source] = row;
    }
  }
  return map;
}

function resolveCurveRecordsBySource(datasets, id, field) {
  const map = {};
  for (const dataset of datasets) {
    const row = dataset[field]?.[id];
    if (row) {
      map[dataset.source] = row;
    }
  }
  return map;
}

function collectFieldValues(recordsBySource, field) {
  const out = {};
  for (const source of CATALOG_SOURCE_PRIORITY) {
    const row = recordsBySource[source];
    if (!row) {
      continue;
    }
    const value = row[field];
    if (typeof value === "number" || (typeof value === "string" && value.length > 0)) {
      out[source] = value;
    }
  }
  return out;
}

function resolveCatalogName(id, recordsBySource, conflicts) {
  const sourceValues = {};
  for (const source of CATALOG_SOURCE_PRIORITY) {
    const row = recordsBySource[source];
    if (!row) {
      continue;
    }
    const value = row.name ?? row.names?.en;
    if (value) {
      sourceValues[source] = value;
    }
  }
  const enkaName = sourceValues.enka;
  const fallback = enkaName ?? pickByPriority(sourceValues, CATALOG_SOURCE_PRIORITY)?.value;
  if (!fallback) {
    return { name: `Character ${id}`, verified: false };
  }
  if (!enkaName) {
    return { name: fallback, verified: false };
  }
  const normalizedEnka = normalizeNameKey(enkaName);
  const others = Object.entries(sourceValues).filter(([source]) => source !== "enka");
  if (others.length === 0) {
    return { name: enkaName, verified: false };
  }
  const match = others.some(([, value]) => normalizeNameKey(value) === normalizedEnka);
  if (!match) {
    conflicts.push({
      id,
      field: "name",
      sourceValues,
      chosen: enkaName,
      reason: "enka_name_not_confirmed_by_other_source",
    });
    return { name: enkaName, verified: false };
  }
  return { name: enkaName, verified: true };
}

function resolveCatalogField(id, field, recordsBySource, conflicts) {
  const sourceValues = collectFieldValues(recordsBySource, field);
  const values = Object.values(sourceValues);
  if (values.length === 0) {
    return undefined;
  }
  const chosen = pickByPriority(sourceValues, CATALOG_SOURCE_PRIORITY);
  if (!chosen) {
    return undefined;
  }
  if (values.length >= 2) {
    const unique = new Set(values.map((value) => String(value)));
    if (unique.size > 1) {
      conflicts.push({
        id,
        field,
        sourceValues,
        chosen: chosen.value,
        reason: "mismatch_on_multi_source_field",
      });
    }
  }
  return chosen.value;
}

function sortedNumericKeys(obj) {
  return Object.keys(obj)
    .map((key) => Number(key))
    .filter((key) => Number.isInteger(key) && key > 0)
    .sort((a, b) => a - b);
}

function checksumCharacterCurve(table) {
  let sum = 0;
  for (const level of sortedNumericKeys(table.levels ?? {})) {
    const row = table.levels[level] ?? {};
    sum += (row.hpBase ?? 0) + (row.atkBase ?? 0) + (row.defBase ?? 0) + (row.asc ?? 0);
  }
  return roundSix(sum);
}

function checksumWeaponCurve(table) {
  let sum = 0;
  for (const level of sortedNumericKeys(table.levels ?? {})) {
    const row = table.levels[level] ?? {};
    sum += (row.atkBase ?? 0) + (row.substat ?? 0) + (row.asc ?? 0);
  }
  return roundSix(sum);
}

function checksumTalent(talent) {
  let sum = 0;
  for (const section of [talent.normals ?? {}, talent.skill ?? {}, talent.burst ?? {}]) {
    for (const values of Object.values(section)) {
      for (const value of values) {
        sum += value;
      }
    }
  }
  return roundSix(sum);
}

function totalTalentArrayLength(talent) {
  let total = 0;
  for (const section of [talent.normals ?? {}, talent.skill ?? {}, talent.burst ?? {}]) {
    for (const values of Object.values(section)) {
      total += values.length;
    }
  }
  return total;
}

function hasTalentCoverage(talent) {
  if (!talent) {
    return false;
  }
  const sections = [talent.normals, talent.skill, talent.burst];
  for (const section of sections) {
    const arrays = Object.values(section ?? {});
    if (arrays.length === 0) {
      return false;
    }
    if (!arrays.every((values) => Array.isArray(values) && values.length >= 10)) {
      return false;
    }
  }
  return true;
}

function normalizeHitKey(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/%/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function shortHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function hitDisplayOrderScore(sourceKey) {
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

function compareHitEntriesForDisplay(a, b) {
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

function buildHitEntriesForSection(kind, section, labelHashByKey = {}) {
  const sourceKeys = Object.keys(section ?? {})
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
  if (sourceKeys.length === 0) {
    return [];
  }

  sourceKeys.sort((a, b) => a.localeCompare(b));
  const entries = [];
  const occurrences = new Map();
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
      ...(toNonEmptyString(labelHashByKey[sourceKey]) ? { labelHash: String(labelHashByKey[sourceKey]) } : {}),
      labelEn: sourceKey,
    });
  }
  entries.sort(compareHitEntriesForDisplay);
  return entries;
}

function buildHitCatalogByCharacter(talent, labelHashByKey) {
  return {
    normal: buildHitEntriesForSection("normal", talent?.normals, labelHashByKey?.normals ?? {}),
    skill: buildHitEntriesForSection("skill", talent?.skill, labelHashByKey?.skill ?? {}),
    burst: buildHitEntriesForSection("burst", talent?.burst, labelHashByKey?.burst ?? {}),
  };
}

const TOKEN_LABEL_EN = {
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

const TOKEN_LABEL_PT = {
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

function normalizeTalentLabelText(value) {
  return String(value).split("|")[0].replace(/\{[^}]+\}/g, "").trim();
}

function stripParamPlaceholders(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/\{param\d+:[^}]+\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizeHitLabel(sourceKey, tokenMap) {
  const clean = String(sourceKey).replace(/^p\d+_/, "").trim();
  if (!clean) {
    return String(sourceKey);
  }
  const parts = clean.split("_").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return String(sourceKey);
  }
  return parts.map((part) => {
    if (/^\d+$/.test(part)) {
      return part;
    }
    return tokenMap[part] ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
  }).join(" ");
}

function buildNormalizedTextMapLabelIndex(textMapEn, textMapPtBR) {
  const index = new Map();
  if (!textMapEn) {
    return index;
  }
  for (const [hash, enValueRaw] of Object.entries(textMapEn)) {
    const enValue = normalizeTalentLabelText(enValueRaw);
    const normalized = normalizeHitKey(enValue);
    if (!normalized) {
      continue;
    }
    const current = index.get(normalized) ?? {};
    if (!current.en) {
      current.en = enValue;
    }
    const ptValueRaw = textMapPtBR?.[hash];
    if (ptValueRaw && !current.pt) {
      current.pt = normalizeTalentLabelText(ptValueRaw);
    }
    index.set(normalized, current);
  }
  return index;
}

function resolveHitCatalogLabels(catalog, textMapEn, textMapPtBR, textMapIndex) {
  const resolveEntry = (entry) => {
    const exactEn = entry.labelHash ? textMapEn?.[entry.labelHash] : undefined;
    const exactPt = entry.labelHash ? textMapPtBR?.[entry.labelHash] : undefined;
    const heuristicEn = humanizeHitLabel(entry.sourceKey, TOKEN_LABEL_EN);
    const heuristicPt = humanizeHitLabel(entry.sourceKey, TOKEN_LABEL_PT);
    const bySource = textMapIndex.get(normalizeHitKey(entry.sourceKey)) ?? {};
    const byHeuristic = textMapIndex.get(normalizeHitKey(heuristicEn)) ?? {};
    const labelEn = exactEn ?? bySource.en ?? byHeuristic.en ?? heuristicEn ?? entry.sourceKey;
    const labelPtBR = exactPt ?? bySource.pt ?? byHeuristic.pt ?? heuristicPt ?? entry.sourceKey;
    const sanitizedLabelEn = stripParamPlaceholders(labelEn);
    const sanitizedLabelPtBR = stripParamPlaceholders(labelPtBR);
    return {
      ...entry,
      labelEn: sanitizedLabelEn || entry.sourceKey,
      labelPtBR: sanitizedLabelPtBR || entry.sourceKey,
    };
  };

  return {
    normal: (catalog.normal ?? []).map(resolveEntry),
    skill: (catalog.skill ?? []).map(resolveEntry),
    burst: (catalog.burst ?? []).map(resolveEntry),
  };
}

function mergeTextMapByPriority(datasets, field) {
  const merged = {};
  for (const source of CATALOG_SOURCE_PRIORITY) {
    const dataset = datasets.find((entry) => entry.source === source);
    const textMap = dataset?.[field];
    if (!textMap) {
      continue;
    }
    for (const [hash, value] of Object.entries(textMap)) {
      if (merged[hash] !== undefined) {
        continue;
      }
      const normalized = toNonEmptyString(value);
      if (!normalized) {
        continue;
      }
      merged[String(hash)] = normalized;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function isScalingStat(value) {
  return typeof value === "string" && SCALING_STATS.includes(value);
}

function isDamageType(value) {
  return typeof value === "string" && DAMAGE_TYPES.includes(value);
}

function normalizeElementDamageType(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!isDamageType(normalized) || normalized === "physical") {
    return undefined;
  }
  return normalized;
}

function isCatalystWeaponType(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "catalyst";
}

function buildDefaultCharacterProfile(characterId, character) {
  const elementDamageType = normalizeElementDamageType(character?.element);
  const elementalDefault = elementDamageType ?? "physical";
  const normalDefault = isCatalystWeaponType(character?.weaponType) && elementDamageType
    ? elementDamageType
    : "physical";

  return {
    characterId,
    scalingStatByKind: {
      normal: "atk",
      skill: "atk",
      burst: "atk",
    },
    defaultDamageTypeByKind: {
      normal: normalDefault,
      skill: elementalDefault,
      burst: elementalDefault,
    },
  };
}

function mergeCharacterProfileOverride(base, override) {
  if (!isRecord(override)) {
    return base;
  }

  const merged = {
    characterId: base.characterId,
    scalingStatByKind: {
      normal: base.scalingStatByKind.normal,
      skill: base.scalingStatByKind.skill,
      burst: base.scalingStatByKind.burst,
    },
    defaultDamageTypeByKind: {
      normal: base.defaultDamageTypeByKind.normal,
      skill: base.defaultDamageTypeByKind.skill,
      burst: base.defaultDamageTypeByKind.burst,
    },
  };

  if (isRecord(override.scalingStatByKind)) {
    for (const kind of ["normal", "skill", "burst"]) {
      const value = override.scalingStatByKind[kind];
      if (isScalingStat(value)) {
        merged.scalingStatByKind[kind] = value;
      }
    }
  }

  if (isRecord(override.defaultDamageTypeByKind)) {
    for (const kind of ["normal", "skill", "burst"]) {
      const value = override.defaultDamageTypeByKind[kind];
      if (isDamageType(value)) {
        merged.defaultDamageTypeByKind[kind] = value;
      }
    }
  }

  const notes = [
    ...((Array.isArray(base.notes) ? base.notes : [])),
    ...((Array.isArray(override.notes) ? override.notes.filter((entry) => typeof entry === "string" && entry.length > 0) : [])),
  ];

  return {
    ...merged,
    ...(notes.length > 0 ? { notes } : {}),
  };
}

async function loadCharacterProfileOverrides(scriptDir) {
  const filePath = path.resolve(scriptDir, "..", CHARACTER_PROFILES_OVERRIDE_FILE);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {};
    }

    const overrides = {};
    for (const [idRaw, value] of Object.entries(parsed)) {
      const id = Number(idRaw);
      if (!Number.isInteger(id) || id <= 0 || !isRecord(value)) {
        continue;
      }
      overrides[id] = value;
    }
    return overrides;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return {};
    }
    throw error;
  }
}

async function loadLiteFallback(scriptDir) {
  const filePath = path.resolve(scriptDir, "..", LITE_FALLBACK_FILE);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  const characters = {};
  for (const [idRaw, value] of Object.entries(parsed.characters ?? {})) {
    if (!/^\d+$/.test(idRaw) || !isRecord(value)) {
      continue;
    }
    const id = Number(idRaw);
    if (!isPlayableAvatarId(id)) {
      continue;
    }
    characters[id] = {
      id,
      ...(toNonEmptyString(value.name) ? { name: value.name } : {}),
      ...(isRecord(value.names) ? { names: value.names } : {}),
      ...(toNonEmptyString(value.icon) ? { icon: value.icon } : {}),
      ...(toNumber(value.rarity) ? { rarity: toNumber(value.rarity) } : {}),
      ...(toNonEmptyString(value.element) ? { element: value.element } : {}),
      ...(toNonEmptyString(value.weaponType) ? { weaponType: value.weaponType } : {}),
    };
  }
  return {
    source: "enka",
    fetchedAt: new Date().toISOString(),
    characters,
    characterCurves: {},
    weaponCurves: {},
    talents: {},
  };
}

function exceedsRelativeTolerance(a, b, epsilon) {
  const delta = Math.abs(a - b);
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return delta / scale > epsilon;
}

function buildFromSources(datasets, buildConfig) {
  const conflicts = [];
  const missingRequired = [];
  const curveConflicts = [];
  const sourceCounts = {};
  let unverifiedNameCount = 0;

  for (const dataset of datasets) {
    sourceCounts[dataset.source] = Object.keys(dataset.characters ?? {}).length;
  }

  const ids = collectCharacterIds(datasets);
  const mergedTextMapEn = mergeTextMapByPriority(datasets, "textMapEn");
  const mergedTextMapPtBR = mergeTextMapByPriority(datasets, "textMapPtBR");
  const hitLabelIndex = buildNormalizedTextMapLabelIndex(mergedTextMapEn, mergedTextMapPtBR);
  const characters = {};
  const characterCurves = {};
  const talents = {};
  const characterProfiles = {};
  const hitCatalog = {};

  for (const id of ids) {
    const recordsBySource = resolveCatalogRecordsBySource(datasets, id);
    const nameResolved = resolveCatalogName(id, recordsBySource, conflicts);
    if (!nameResolved.verified) {
      unverifiedNameCount += 1;
    }

    const rarity = resolveCatalogField(id, "rarity", recordsBySource, conflicts);
    const element = resolveCatalogField(id, "element", recordsBySource, conflicts);
    const weaponType = resolveCatalogField(id, "weaponType", recordsBySource, conflicts);
    const iconPick = pickByPriority(
      {
        enka: recordsBySource.enka?.icon,
        animegamedata: recordsBySource.animegamedata?.icon,
        genshindata: recordsBySource.genshindata?.icon,
      },
      CATALOG_SOURCE_PRIORITY,
    );
    const nameHash = recordsBySource.enka?.nameHash ?? recordsBySource.animegamedata?.nameHash;

    const character = {
      id,
      name: nameResolved.name,
      names: {
        en: recordsBySource.enka?.names?.en ?? nameResolved.name,
        ...(recordsBySource.enka?.names?.["pt-BR"] ? { "pt-BR": recordsBySource.enka.names["pt-BR"] } : {}),
      },
      ...(nameHash ? { nameHash } : {}),
      ...(iconPick?.value ? { icon: iconPick.value } : {}),
      ...(typeof rarity === "number" ? { rarity } : {}),
      ...(typeof element === "string" ? { element } : {}),
      ...(typeof weaponType === "string" ? { weaponType } : {}),
    };

    const missing = [];
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
    if (missing.length > 0) {
      missingRequired.push({ id, missing });
    }
    characters[id] = character;
    const baseProfile = buildDefaultCharacterProfile(id, character);
    characterProfiles[id] = mergeCharacterProfileOverride(
      baseProfile,
      buildConfig.characterProfileOverrides?.[id],
    );

    const curveBySource = resolveCurveRecordsBySource(datasets, id, "characterCurves");
    const talentBySource = resolveCurveRecordsBySource(datasets, id, "talents");
    const talentLabelHashBySource = resolveCurveRecordsBySource(datasets, id, "hitLabelHashByKey");
    const chosenCurve = pickByPriority(curveBySource, CURVE_SOURCE_PRIORITY);
    const chosenTalent = pickByPriority(talentBySource, CURVE_SOURCE_PRIORITY);
    if (chosenCurve) {
      characterCurves[id] = chosenCurve.value;
    }
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
      hitLabelIndex,
    );

    const animeCurve = curveBySource.animegamedata;
    const genshinCurve = curveBySource.genshindata;
    if (animeCurve && genshinCurve) {
      const animeLen = Object.keys(animeCurve.levels ?? {}).length;
      const genshinLen = Object.keys(genshinCurve.levels ?? {}).length;
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
      if (exceedsRelativeTolerance(animeChecksum, genshinChecksum, buildConfig.thresholds.curveCrossCheckEpsilon)) {
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
      const animeChecksum = checksumTalent(animeTalent);
      const genshinChecksum = checksumTalent(genshinTalent);
      const delta = Math.abs(animeChecksum - genshinChecksum);
      if (exceedsRelativeTolerance(animeChecksum, genshinChecksum, buildConfig.thresholds.curveCrossCheckEpsilon)) {
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

  const allWeaponIds = new Set();
  for (const dataset of datasets) {
    for (const key of Object.keys(dataset.weaponCurves ?? {})) {
      const id = Number(key);
      if (Number.isInteger(id) && id > 0) {
        allWeaponIds.add(id);
      }
    }
  }

  const weaponCurves = {};
  const sortedWeaponIds = [...allWeaponIds].sort((a, b) => a - b);
  for (const id of sortedWeaponIds) {
    const bySource = resolveCurveRecordsBySource(datasets, id, "weaponCurves");
    const chosen = pickByPriority(bySource, CURVE_SOURCE_PRIORITY);
    if (chosen) {
      weaponCurves[id] = chosen.value;
    }

    const animeCurve = bySource.animegamedata;
    const genshinCurve = bySource.genshindata;
    if (animeCurve && genshinCurve) {
      const animeLen = Object.keys(animeCurve.levels ?? {}).length;
      const genshinLen = Object.keys(genshinCurve.levels ?? {}).length;
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
      if (exceedsRelativeTolerance(animeChecksum, genshinChecksum, buildConfig.thresholds.curveCrossCheckEpsilon)) {
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

  const missingRequiredRate = ids.length > 0 ? roundSix(missingRequired.length / ids.length) : 0;
  const missingCharacterCurveIds = ids.filter(
    (id) => !characterCurves[id] || Object.keys(characterCurves[id].levels ?? {}).length === 0,
  );
  const missingTalentIds = ids.filter((id) => !hasTalentCoverage(talents[id]));
  const missingCurveOrTalentSet = new Set([...missingCharacterCurveIds, ...missingTalentIds]);
  const missingCurveOrTalentIds = [...missingCurveOrTalentSet].sort((a, b) => a - b);
  const missingCharacterProfileIds = ids.filter((id) => !characterProfiles[id]);
  const charactersWithTalentIds = ids.filter((id) =>
    Object.keys(talents[id]?.normals ?? {}).length > 0 ||
    Object.keys(talents[id]?.skill ?? {}).length > 0 ||
    Object.keys(talents[id]?.burst ?? {}).length > 0,
  );
  const charactersWithHitCatalogForTalentIds = charactersWithTalentIds.filter((id) => {
    const catalog = hitCatalog[id];
    if (!catalog) {
      return false;
    }
    return (catalog.normal.length + catalog.skill.length + catalog.burst.length) > 0;
  });
  const missingHitCatalogIds = charactersWithTalentIds.filter(
    (id) => !charactersWithHitCatalogForTalentIds.includes(id),
  );
  const allHitEntries = [];
  for (const id of ids) {
    const catalog = hitCatalog[id];
    if (!catalog) {
      continue;
    }
    for (const kind of HIT_KINDS) {
      for (const entry of catalog[kind] ?? []) {
        allHitEntries.push({ characterId: id, kind, entry });
      }
    }
  }
  const characterCurveCoverageRate = ids.length > 0 ? roundSix((ids.length - missingCharacterCurveIds.length) / ids.length) : 0;
  const talentCoverageRate = ids.length > 0 ? roundSix((ids.length - missingTalentIds.length) / ids.length) : 0;
  const characterProfileCoverageRate = ids.length > 0 ? roundSix((ids.length - missingCharacterProfileIds.length) / ids.length) : 0;
  const hitCatalogCoverageRate = charactersWithTalentIds.length > 0
    ? roundSix(charactersWithHitCatalogForTalentIds.length / charactersWithTalentIds.length)
    : 1;
  const totalHitCount = allHitEntries.length;
  const labeledEnCount = allHitEntries.filter(({ entry }) => (entry.labelEn ?? entry.sourceKey) !== entry.sourceKey).length;
  const labeledPtBRCount = allHitEntries.filter(({ entry }) => (entry.labelPtBR ?? entry.sourceKey) !== entry.sourceKey).length;
  const exactLabeledEnCount = allHitEntries.filter(({ entry }) => Boolean(entry.labelHash && mergedTextMapEn?.[entry.labelHash])).length;
  const exactLabeledPtBRCount = allHitEntries.filter(({ entry }) => Boolean(entry.labelHash && mergedTextMapPtBR?.[entry.labelHash])).length;
  const hitLabelEnCoverageRate = totalHitCount > 0 ? roundSix(labeledEnCount / totalHitCount) : 0;
  const hitLabelPtBRCoverageRate = totalHitCount > 0 ? roundSix(labeledPtBRCount / totalHitCount) : 0;
  const hitLabelExactEnCoverageRate = totalHitCount > 0 ? roundSix(exactLabeledEnCount / totalHitCount) : 0;
  const hitLabelExactPtBRCoverageRate = totalHitCount > 0 ? roundSix(exactLabeledPtBRCount / totalHitCount) : 0;
  const missingHitLabelSample = allHitEntries
    .filter(({ entry }) => (entry.labelEn ?? entry.sourceKey) === entry.sourceKey || (entry.labelPtBR ?? entry.sourceKey) === entry.sourceKey)
    .slice(0, 25)
    .map(({ characterId, kind, entry }) => ({
      characterId,
      kind,
      hitId: entry.id,
      sourceKey: entry.sourceKey,
    }));
  const missingCurveOrTalentRate = ids.length > 0 ? roundSix(missingCurveOrTalentIds.length / ids.length) : 0;

  const checkedCharacterCurveCount = ids.filter((id) => {
    const hasAnime = datasets.some((dataset) => dataset.source === "animegamedata" && dataset.characterCurves?.[id]);
    const hasGenshin = datasets.some((dataset) => dataset.source === "genshindata" && dataset.characterCurves?.[id]);
    return Boolean(hasAnime && hasGenshin);
  }).length;
  const checkedTalentCount = ids.filter((id) => {
    const hasAnime = datasets.some((dataset) => dataset.source === "animegamedata" && dataset.talents?.[id]);
    const hasGenshin = datasets.some((dataset) => dataset.source === "genshindata" && dataset.talents?.[id]);
    return Boolean(hasAnime && hasGenshin);
  }).length;
  const checkedWeaponCurveCount = sortedWeaponIds.filter((id) => {
    const hasAnime = datasets.some((dataset) => dataset.source === "animegamedata" && dataset.weaponCurves?.[id]);
    const hasGenshin = datasets.some((dataset) => dataset.source === "genshindata" && dataset.weaponCurves?.[id]);
    return Boolean(hasAnime && hasGenshin);
  }).length;

  const report = {
    version: buildConfig.version,
    generatedAt: buildConfig.generatedAt,
    sourceCounts,
    sourceStatus: buildConfig.sourceStatus,
    summary: {
      characterCount: ids.length,
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
    thresholds: buildConfig.thresholds,
    conflicts,
    missingRequired,
    ...(missingHitLabelSample.length > 0 ? { missingHitLabelSample } : {}),
    coverage: {
      playableCharacterCount: ids.length,
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
      epsilon: buildConfig.thresholds.curveCrossCheckEpsilon,
      checkedCharacterCurveCount,
      checkedWeaponCurveCount,
      checkedTalentCount,
      curveConflicts,
    },
  };

  return {
    data: {
      version: buildConfig.version,
      generatedAt: buildConfig.generatedAt,
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

function assertThresholds(report) {
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
  if ((report.coverage.missingCharacterProfileIds ?? []).length > 0) {
    throw new Error(
      `Character profile coverage threshold exceeded: missing ${report.coverage.missingCharacterProfileIds.length} profiles`,
    );
  }
  if ((report.coverage.missingHitCatalogIds ?? []).length > 0) {
    throw new Error(
      `Hit catalog coverage threshold exceeded: missing ${report.coverage.missingHitCatalogIds.length} entries for talented characters`,
    );
  }
}

async function main() {
  const now = new Date();
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const characterProfileOverrides = await loadCharacterProfileOverrides(scriptDir);
  const thresholds = {
    maxConflicts: toNumber(process.env.GAME_DATA_CORE_MAX_CONFLICTS) ?? DEFAULT_MAX_CONFLICTS,
    maxMissingRequiredRate:
      toNumber(process.env.GAME_DATA_CORE_MAX_MISSING_REQUIRED_RATE) ??
      DEFAULT_MAX_MISSING_REQUIRED_RATE,
    maxMissingCurveOrTalentRate:
      toNumber(process.env.GAME_DATA_CORE_MAX_MISSING_CURVE_OR_TALENT_RATE) ??
      DEFAULT_MAX_MISSING_CURVE_OR_TALENT_RATE,
    curveCrossCheckEpsilon:
      toNumber(process.env.GAME_DATA_CORE_CURVE_EPSILON) ?? DEFAULT_CURVE_EPSILON,
  };

  const sourceStatus = {};
  const datasets = [];
  const loaders = [
    { source: "enka", load: loadEnkaSource },
    { source: "animegamedata", load: loadAnimeGameDataSource },
    { source: "genshindata", load: loadGenshinDataSource },
  ];

  for (const entry of loaders) {
    try {
      const dataset = await entry.load();
      datasets.push(dataset);
      sourceStatus[entry.source] = { ok: true };
    } catch (error) {
      sourceStatus[entry.source] = {
        ok: false,
        message: error instanceof Error ? error.message : "Unknown source error",
      };
    }
  }

  if (!sourceStatus.enka?.ok) {
    try {
      const fallback = await loadLiteFallback(scriptDir);
      datasets.push(fallback);
      sourceStatus.enka = {
        ok: true,
        message: "Using local game-data-lite fallback.",
      };
    } catch (error) {
      sourceStatus.enka = {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to load fallback.",
      };
    }
  }

  if (datasets.length === 0) {
    throw new Error("No game data sources available and fallback could not be loaded.");
  }

  const buildConfig = {
    version: buildVersion(now),
    generatedAt: now.toISOString(),
    thresholds,
    sourceStatus,
    characterProfileOverrides,
  };

  const { data, report } = buildFromSources(datasets, buildConfig);
  assertThresholds(report);

  const dataOutputPath = path.resolve(scriptDir, "..", OUTPUT_DATA_FILE);
  const reportOutputPath = path.resolve(scriptDir, "..", OUTPUT_REPORT_FILE);
  await mkdir(path.dirname(dataOutputPath), { recursive: true });
  await writeFile(dataOutputPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await writeFile(reportOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  // eslint-disable-next-line no-console
  console.log(
    `Updated game-data-core: ${report.summary.characterCount} characters, ${report.summary.curveConflictCount} curve conflicts`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `Coverage curves=${(report.summary.characterCurveCoverageRate * 100).toFixed(2)}% talents=${(report.summary.talentCoverageRate * 100).toFixed(2)}% profiles=${(report.summary.characterProfileCoverageRate * 100).toFixed(2)}% hitCatalog=${(report.summary.hitCatalogCoverageRate * 100).toFixed(2)}% labelsEn=${(report.summary.hitLabelEnCoverageRate * 100).toFixed(2)}% labelsPtBR=${(report.summary.hitLabelPtBRCoverageRate * 100).toFixed(2)}% exactEn=${(report.summary.hitLabelExactEnCoverageRate * 100).toFixed(2)}% exactPtBR=${(report.summary.hitLabelExactPtBRCoverageRate * 100).toFixed(2)}%`,
  );
  // eslint-disable-next-line no-console
  console.log(`Output data: ${dataOutputPath}`);
  // eslint-disable-next-line no-console
  console.log(`Output report: ${reportOutputPath}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
