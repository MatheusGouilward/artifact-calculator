export const ALL_STAT_KEYS = [
  "hp_flat",
  "hp_pct",
  "atk_flat",
  "atk_pct",
  "def_flat",
  "def_pct",
  "er_pct",
  "em",
  "crit_rate_pct",
  "crit_dmg_pct",
  "healing_bonus_pct",
  "dmg_bonus_physical_pct",
  "dmg_bonus_pyro_pct",
  "dmg_bonus_hydro_pct",
  "dmg_bonus_electro_pct",
  "dmg_bonus_cryo_pct",
  "dmg_bonus_dendro_pct",
  "dmg_bonus_anemo_pct",
  "dmg_bonus_geo_pct",
] as const;

export type StatKey = (typeof ALL_STAT_KEYS)[number];
