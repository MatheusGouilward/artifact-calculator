import type {
  EnkaArtifactSummary,
  EnkaAvatarInfo,
  EnkaCharacterSummary,
  EnkaEquip,
  EnkaFightPropMap,
  EnkaNormalizedResponse,
  EnkaUidResponse,
  EnkaWeaponSummary,
} from "./types";

const ICON_BASE_URL = "https://enka.network/ui";
const AVATAR_LEVEL_PROP_ID = "4001";

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

function toIconUrl(icon?: string): string | undefined {
  if (!icon) {
    return undefined;
  }
  return `${ICON_BASE_URL}/${icon}.png`;
}

function getWeaponRefinement(equip: EnkaEquip): number | undefined {
  const values = Object.values(equip.weapon?.affixMap ?? {})
    .map((value) => toNumber(value))
    .filter((value): value is number => value !== undefined);

  if (values.length === 0) {
    return undefined;
  }

  return Math.max(...values) + 1;
}

function normalizeWeapon(equip: EnkaEquip): EnkaWeaponSummary | undefined {
  if (!equip.weapon) {
    return undefined;
  }

  return {
    kind: "weapon",
    id: toNumber(equip.itemId),
    iconUrl: toIconUrl(equip.flat?.icon),
    level: toNumber(equip.weapon.level),
    rarity: toNumber(equip.flat?.rankLevel),
    refinement: getWeaponRefinement(equip),
  };
}

function normalizeArtifact(equip: EnkaEquip): EnkaArtifactSummary | undefined {
  if (!equip.reliquary) {
    return undefined;
  }

  const flatRecord = (equip.flat ?? {}) as Record<string, unknown>;
  const reliquarySet =
    typeof flatRecord.reliquarySet === "object" && flatRecord.reliquarySet
      ? (flatRecord.reliquarySet as Record<string, unknown>)
      : undefined;

  const setId =
    toNumber(flatRecord.setId) ??
    toNumber(flatRecord.reliquarySetId) ??
    toNumber(reliquarySet?.setId);
  const setName =
    (typeof flatRecord.setName === "string" ? flatRecord.setName : undefined) ??
    (typeof reliquarySet?.name === "string" ? reliquarySet.name : undefined);
  const setIconUrl =
    toIconUrl(typeof flatRecord.setIcon === "string" ? flatRecord.setIcon : undefined) ??
    toIconUrl(typeof reliquarySet?.icon === "string" ? reliquarySet.icon : undefined);

  const main = equip.flat?.reliquaryMainstat
    ? {
        key: equip.flat.reliquaryMainstat.mainPropId,
        value: toNumber(equip.flat.reliquaryMainstat.statValue),
      }
    : undefined;

  const subs = equip.flat?.reliquarySubstats
    ?.map((sub) => ({
      key: sub.appendPropId,
      value: toNumber(sub.statValue),
    }))
    .filter((sub) => sub.key !== undefined || sub.value !== undefined);

  return {
    kind: "artifact",
    equipType: equip.flat?.equipType,
    level: toNumber(equip.reliquary.level),
    rarity: toNumber(equip.flat?.rankLevel),
    iconUrl: toIconUrl(equip.flat?.icon),
    setId,
    setName,
    setIconUrl,
    main,
    subs: subs && subs.length > 0 ? subs : undefined,
  };
}

function normalizeFightProps(fightPropMap?: EnkaFightPropMap): Record<string, number> | undefined {
  if (!fightPropMap) {
    return undefined;
  }

  const normalized: Record<string, number> = {};

  for (const [key, value] of Object.entries(fightPropMap)) {
    const parsed = toNumber(value);
    if (parsed !== undefined) {
      normalized[key] = parsed;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function getAvatarLevel(avatar: EnkaAvatarInfo, showLevelMap: Map<number, number>): number | undefined {
  const avatarId = toNumber(avatar.avatarId);
  if (avatarId !== undefined) {
    const showcaseLevel = showLevelMap.get(avatarId);
    if (showcaseLevel !== undefined) {
      return showcaseLevel;
    }
  }

  const propValue =
    avatar.propMap?.[AVATAR_LEVEL_PROP_ID]?.val ??
    avatar.propMap?.[String(Number(AVATAR_LEVEL_PROP_ID))]?.val;

  return toNumber(propValue);
}

function normalizeCharacter(
  avatar: EnkaAvatarInfo,
  showLevelMap: Map<number, number>,
): EnkaCharacterSummary {
  let weapon: EnkaWeaponSummary | undefined;
  const artifacts: EnkaArtifactSummary[] = [];

  for (const equip of avatar.equipList ?? []) {
    if (!weapon) {
      weapon = normalizeWeapon(equip);
    }

    const artifact = normalizeArtifact(equip);
    if (artifact) {
      artifacts.push(artifact);
    }
  }

  return {
    avatarId: toNumber(avatar.avatarId),
    level: getAvatarLevel(avatar, showLevelMap),
    weapon,
    artifacts,
    fightProps: normalizeFightProps(avatar.fightPropMap),
  };
}

function buildShowLevelMap(raw: EnkaUidResponse): Map<number, number> {
  const showLevelMap = new Map<number, number>();

  for (const item of raw.playerInfo?.showAvatarInfoList ?? []) {
    const avatarId = toNumber(item.avatarId);
    const level = toNumber(item.level);
    if (avatarId !== undefined && level !== undefined) {
      showLevelMap.set(avatarId, level);
    }
  }

  return showLevelMap;
}

export function normalizeEnkaUidResponse(
  rawInput: unknown,
  options: { locale: string },
): EnkaNormalizedResponse {
  const raw = (rawInput ?? {}) as EnkaUidResponse;
  const showLevelMap = buildShowLevelMap(raw);
  const avatarInfoList = Array.isArray(raw.avatarInfoList) ? raw.avatarInfoList : undefined;
  const characters = avatarInfoList?.map((avatar) => normalizeCharacter(avatar, showLevelMap)) ?? [];

  return {
    uid: raw.uid !== undefined ? String(raw.uid) : "",
    fetchedAt: new Date().toISOString(),
    ttlSeconds: toNumber(raw.ttl),
    player: {
      nickname: raw.playerInfo?.nickname ?? "",
      level: toNumber(raw.playerInfo?.level),
      worldLevel: toNumber(raw.playerInfo?.worldLevel),
      signature: raw.playerInfo?.signature,
    },
    characters,
    notes: avatarInfoList ? undefined : { showcaseMissing: true },
    metadata: {
      locale: options.locale,
    },
  };
}
