import { ALL_STAT_KEYS } from "./stat-keys";
import { StatBlock } from "./stat-block";

export type ModifierSource = "artifact" | "weapon" | "set" | "talent" | "team" | "external";

export interface Modifier {
  source: ModifierSource;
  label?: string;
  stats: Partial<StatBlock>;
}

export function applyModifiers(base: StatBlock, mods: Modifier[]): StatBlock {
  const result: StatBlock = {
    ...base,
  };

  for (const mod of mods) {
    for (const key of ALL_STAT_KEYS) {
      const delta = mod.stats[key];
      if (delta !== undefined) {
        result[key] += delta;
      }
    }
  }

  return result;
}

export function groupModifiersBySource(mods: Modifier[]): Record<ModifierSource, Modifier[]> {
  const grouped: Record<ModifierSource, Modifier[]> = {
    artifact: [],
    weapon: [],
    set: [],
    talent: [],
    team: [],
    external: [],
  };

  for (const mod of mods) {
    grouped[mod.source].push(mod);
  }

  return grouped;
}
