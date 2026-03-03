import type { SourceDataset } from "../types";

const STORE_BASE = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi";

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

function isPlayableAvatarId(id: number): boolean {
  return Number.isInteger(id) && id >= 10000000 && id < 20000000;
}

function toStringSafe(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
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

function resolveLocalizedName(
  locs: Record<string, unknown> | undefined,
  lang: "en" | "pt",
  hash: unknown,
): string | undefined {
  if (!locs || hash === undefined || hash === null) {
    return undefined;
  }
  const tableRaw = locs[lang];
  if (!tableRaw || typeof tableRaw !== "object") {
    return undefined;
  }
  const value = (tableRaw as Record<string, unknown>)[String(hash)];
  return toStringSafe(value);
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

export async function loadEnkaSource(): Promise<SourceDataset> {
  const [avatarsRaw, locsRaw] = await Promise.all([
    fetchJson(`${STORE_BASE}/avatars.json`),
    fetchJson(`${STORE_BASE}/locs.json`),
  ]);

  const avatars = (avatarsRaw ?? {}) as Record<string, Record<string, unknown>>;
  const locs = (locsRaw ?? {}) as Record<string, unknown>;
  const characters: SourceDataset["characters"] = {};

  for (const [idRaw, row] of Object.entries(avatars)) {
    if (!/^\d+$/.test(idRaw)) {
      continue;
    }
    const id = Number(idRaw);
    if (!Number.isFinite(id) || !isPlayableAvatarId(id)) {
      continue;
    }

    const nameHash = row.NameTextMapHash;
    const nameEn = resolveLocalizedName(locs, "en", nameHash);
    const namePt = resolveLocalizedName(locs, "pt", nameHash);

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
      ...(toIconName(row.SideIconName) ? { icon: toIconName(row.SideIconName) } : {}),
      ...(resolveRarity(row.QualityType) ? { rarity: resolveRarity(row.QualityType) } : {}),
      ...(resolveElement(row.Element) ? { element: resolveElement(row.Element) } : {}),
      ...(resolveWeaponType(row.WeaponType) ? { weaponType: resolveWeaponType(row.WeaponType) } : {}),
    };
  }

  return {
    source: "enka",
    fetchedAt: new Date().toISOString(),
    characters,
  };
}
