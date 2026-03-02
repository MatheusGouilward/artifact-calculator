import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STORE_BASE = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/gi";
const OUTPUT_FILE = "src/lib/genshin/game-data/generated/game-data-lite.json";

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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "genshin-calculator-game-data-updater",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  return response.json();
}

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

function toIconName(iconPath) {
  if (typeof iconPath !== "string" || iconPath.length === 0) {
    return undefined;
  }
  if (iconPath.startsWith("/ui/") && iconPath.endsWith(".png")) {
    return iconPath.slice(4, -4);
  }
  if (iconPath.startsWith("UI_") && iconPath.endsWith(".png")) {
    return iconPath.slice(0, -4);
  }
  return iconPath;
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

function resolveRarityFromQuality(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  return RARITY_BY_QUALITY[value];
}

function resolveLocalizedName(locs, lang, key) {
  if (!key) {
    return undefined;
  }
  const table = locs?.[lang];
  if (!table || typeof table !== "object") {
    return undefined;
  }
  const resolved = table[String(key)];
  if (typeof resolved !== "string" || resolved.trim().length === 0) {
    return undefined;
  }
  return resolved;
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

function buildCharacters(avatars, locs) {
  const characters = {};

  for (const [idRaw, row] of Object.entries(avatars ?? {})) {
    if (!/^\d+$/.test(idRaw)) {
      continue;
    }
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      continue;
    }

    const nameHash = row?.NameTextMapHash;
    const nameEn = resolveLocalizedName(locs, "en", nameHash) ?? `Character ${id}`;
    const namePt = resolveLocalizedName(locs, "pt", nameHash);

    characters[id] = {
      id,
      name: nameEn,
      names: {
        en: nameEn,
        ...(namePt ? { "pt-BR": namePt } : {}),
      },
      icon: toIconName(row?.SideIconName),
      element: resolveElement(row?.Element),
      weaponType: resolveWeaponType(row?.WeaponType),
      rarity: resolveRarityFromQuality(row?.QualityType),
    };
  }

  return characters;
}

function buildWeapons(weaponsRaw, locs) {
  const weapons = {};

  for (const [idRaw, row] of Object.entries(weaponsRaw ?? {})) {
    if (!/^\d+$/.test(idRaw)) {
      continue;
    }
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      continue;
    }

    const nameHash = row?.NameTextMapHash;
    const nameEn = resolveLocalizedName(locs, "en", nameHash) ?? `Weapon ${id}`;
    const namePt = resolveLocalizedName(locs, "pt", nameHash);

    weapons[id] = {
      id,
      name: nameEn,
      names: {
        en: nameEn,
        ...(namePt ? { "pt-BR": namePt } : {}),
      },
      icon: toIconName(row?.Icon),
      weaponType: resolveWeaponType(row?.WeaponType),
      rarity: toNumber(row?.Rarity),
    };
  }

  return weapons;
}

function buildSetIconMap(relicItems) {
  const iconMap = new Map();

  for (const row of Object.values(relicItems ?? {})) {
    const setId = toNumber(row?.SetId);
    if (!setId || setId <= 0) {
      continue;
    }

    const rarity = toNumber(row?.Rarity) ?? 0;
    const current = iconMap.get(setId);
    if (!current || rarity >= current.rarity) {
      iconMap.set(setId, {
        rarity,
        icon: toIconName(row?.Icon),
      });
    }
  }

  return iconMap;
}

function buildArtifactSets(relics, locs) {
  const artifactSets = {};
  const iconBySetId = buildSetIconMap(relics?.Items);

  for (const [idRaw, row] of Object.entries(relics?.Sets ?? {})) {
    if (!/^\d+$/.test(idRaw)) {
      continue;
    }
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      continue;
    }

    const nameHash = row?.Name;
    const nameEn = resolveLocalizedName(locs, "en", nameHash) ?? `Artifact Set ${id}`;
    const namePt = resolveLocalizedName(locs, "pt", nameHash);

    artifactSets[id] = {
      id,
      name: nameEn,
      names: {
        en: nameEn,
        ...(namePt ? { "pt-BR": namePt } : {}),
      },
      icon: iconBySetId.get(id)?.icon,
    };
  }

  return artifactSets;
}

async function main() {
  const now = new Date();

  const [avatars, weaponsRaw, relics, locs] = await Promise.all([
    fetchJson(`${STORE_BASE}/avatars.json`),
    fetchJson(`${STORE_BASE}/weapons.json`),
    fetchJson(`${STORE_BASE}/relics.json`),
    fetchJson(`${STORE_BASE}/locs.json`),
  ]);

  const payload = {
    version: buildVersion(now),
    generatedAt: now.toISOString(),
    characters: buildCharacters(avatars, locs),
    weapons: buildWeapons(weaponsRaw, locs),
    artifactSets: buildArtifactSets(relics, locs),
  };

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outputPath = path.resolve(scriptDir, "..", OUTPUT_FILE);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const counts = {
    characters: Object.keys(payload.characters).length,
    weapons: Object.keys(payload.weapons).length,
    artifactSets: Object.keys(payload.artifactSets).length,
  };

  // eslint-disable-next-line no-console
  console.log(`Updated game-data-lite: ${counts.characters} characters, ${counts.weapons} weapons, ${counts.artifactSets} sets`);
  // eslint-disable-next-line no-console
  console.log(`Output: ${outputPath}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
