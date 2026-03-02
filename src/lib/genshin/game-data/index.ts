export * from "./types";
export * from "./load";
export * from "./resolve";

import type { ArtifactSetLite, CharacterLite, GameDataLocale, WeaponLite } from "./types";

type NamedLite = CharacterLite | WeaponLite | ArtifactSetLite;

export function localizeGameDataName(item: NamedLite | undefined, locale: GameDataLocale): string | undefined {
  if (!item) {
    return undefined;
  }
  return item.names?.[locale] ?? item.name;
}
