export type GameDataLocale = "en" | "pt-BR";

export interface LocalizedNameMap {
  en?: string;
  "pt-BR"?: string;
}

export interface CharacterLite {
  id: number;
  name: string;
  icon?: string;
  element?: string;
  weaponType?: string;
  rarity?: number;
  names?: LocalizedNameMap;
}

export interface WeaponLite {
  id: number;
  name: string;
  icon?: string;
  weaponType?: string;
  rarity?: number;
  names?: LocalizedNameMap;
}

export interface ArtifactSetLite {
  id: number;
  name: string;
  icon?: string;
  names?: LocalizedNameMap;
}

export interface GameDataLite {
  version: string;
  generatedAt: string;
  characters: Record<number, CharacterLite>;
  weapons: Record<number, WeaponLite>;
  artifactSets: Record<number, ArtifactSetLite>;
}
