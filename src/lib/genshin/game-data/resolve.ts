import type {
  ArtifactSetLite,
  CharacterLite,
  GameDataLite,
  WeaponLite,
} from "./types";

interface ResolvedCharacterLite {
  name: string;
  iconUrl?: string;
  element?: string;
  weaponType?: string;
  rarity?: number;
  raw?: CharacterLite;
}

interface ResolvedWeaponLite {
  name: string;
  iconUrl?: string;
  weaponType?: string;
  rarity?: number;
  raw?: WeaponLite;
}

interface ResolvedArtifactSetLite {
  name: string;
  iconUrl?: string;
  raw?: ArtifactSetLite;
}

function normalizeIconName(iconName?: string | null): string | null {
  if (!iconName) {
    return null;
  }

  const value = iconName.trim();
  if (!value) {
    return null;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/ui/") && value.endsWith(".png")) {
    return value.slice(4, -4);
  }

  if (value.startsWith("UI_") && value.endsWith(".png")) {
    return value.slice(0, -4);
  }

  if (value.startsWith("UI_")) {
    return value;
  }

  return value;
}

export function enkaIconUrl(iconName?: string | null): string | null {
  const normalized = normalizeIconName(iconName);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  return `https://enka.network/ui/${normalized}.png`;
}

export function resolveCharacter(
  id: number | undefined | null,
  dataLite: GameDataLite,
): ResolvedCharacterLite | null {
  if (!id) {
    return null;
  }
  const raw = dataLite.characters[id];
  if (!raw) {
    return null;
  }
  return {
    name: raw.name,
    iconUrl: enkaIconUrl(raw.icon) ?? undefined,
    element: raw.element,
    weaponType: raw.weaponType,
    rarity: raw.rarity,
    raw,
  };
}

export function resolveWeapon(
  id: number | undefined | null,
  dataLite: GameDataLite,
): ResolvedWeaponLite | null {
  if (!id) {
    return null;
  }
  const raw = dataLite.weapons[id];
  if (!raw) {
    return null;
  }
  return {
    name: raw.name,
    iconUrl: enkaIconUrl(raw.icon) ?? undefined,
    weaponType: raw.weaponType,
    rarity: raw.rarity,
    raw,
  };
}

export function resolveArtifactSet(
  id: number | undefined | null,
  dataLite: GameDataLite,
): ResolvedArtifactSetLite | null {
  if (!id) {
    return null;
  }
  const raw = dataLite.artifactSets[id];
  if (!raw) {
    return null;
  }
  return {
    name: raw.name,
    iconUrl: enkaIconUrl(raw.icon) ?? undefined,
    raw,
  };
}
