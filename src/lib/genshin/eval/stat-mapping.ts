import type { StatKey } from "./stat-keys";

const ENKA_PROP_ID_TO_STAT_KEY: Record<string, StatKey> = {
  FIGHT_PROP_HP: "hp_flat",
  FIGHT_PROP_HP_PERCENT: "hp_pct",
  FIGHT_PROP_ATTACK: "atk_flat",
  FIGHT_PROP_ATTACK_PERCENT: "atk_pct",
  FIGHT_PROP_DEFENSE: "def_flat",
  FIGHT_PROP_DEFENSE_PERCENT: "def_pct",
  FIGHT_PROP_CHARGE_EFFICIENCY: "er_pct",
  FIGHT_PROP_ELEMENT_MASTERY: "em",
  FIGHT_PROP_CRITICAL: "crit_rate_pct",
  FIGHT_PROP_CRITICAL_HURT: "crit_dmg_pct",
  FIGHT_PROP_HEAL_ADD: "healing_bonus_pct",
  FIGHT_PROP_PHYSICAL_ADD_HURT: "dmg_bonus_physical_pct",
  FIGHT_PROP_FIRE_ADD_HURT: "dmg_bonus_pyro_pct",
  FIGHT_PROP_WATER_ADD_HURT: "dmg_bonus_hydro_pct",
  FIGHT_PROP_ELEC_ADD_HURT: "dmg_bonus_electro_pct",
  FIGHT_PROP_ICE_ADD_HURT: "dmg_bonus_cryo_pct",
  FIGHT_PROP_GRASS_ADD_HURT: "dmg_bonus_dendro_pct",
  FIGHT_PROP_WIND_ADD_HURT: "dmg_bonus_anemo_pct",
  FIGHT_PROP_ROCK_ADD_HURT: "dmg_bonus_geo_pct",
};

const PERCENT_HINT_RE = /%|percent|pct|porcentagem/i;

export function normalizeStatLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/%/g, "")
    .replace(/[_/()+.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

function isElementalBonus(text: string): boolean {
  return hasAny(text, ["bonus", "bono", "bns", "dmg", "damage", "dano", "hurt"]);
}

export function mapEnkaStatToStatKey(label: string): StatKey | null {
  const raw = label.trim();
  if (!raw) {
    return null;
  }

  const propIdKey = raw.toUpperCase();
  if (propIdKey in ENKA_PROP_ID_TO_STAT_KEY) {
    return ENKA_PROP_ID_TO_STAT_KEY[propIdKey];
  }

  const normalized = normalizeStatLabel(raw);
  if (!normalized) {
    return null;
  }

  const hasPercentHint = PERCENT_HINT_RE.test(raw) || hasAny(normalized, ["percent", "pct", "porcentagem"]);

  if (hasAny(normalized, ["recarga de energia", "energy recharge"])) {
    return "er_pct";
  }

  if (hasAny(normalized, ["proficiencia elemental", "elemental mastery"]) || normalized === "em") {
    return "em";
  }

  if (hasAny(normalized, ["dano critico", "crit dmg", "critical damage"])) {
    return "crit_dmg_pct";
  }

  if (hasAny(normalized, ["taxa critica", "crit rate", "critical rate"])) {
    return "crit_rate_pct";
  }

  if (hasAny(normalized, ["bonus de cura", "healing bonus"])) {
    return "healing_bonus_pct";
  }

  if (
    hasAny(normalized, ["fisico", "physical"]) &&
    (isElementalBonus(normalized) || hasPercentHint)
  ) {
    return "dmg_bonus_physical_pct";
  }

  if (hasAny(normalized, ["pyro", "piro"]) && isElementalBonus(normalized)) {
    return "dmg_bonus_pyro_pct";
  }
  if (normalized.includes("hydro") && isElementalBonus(normalized)) {
    return "dmg_bonus_hydro_pct";
  }
  if (normalized.includes("electro") && isElementalBonus(normalized)) {
    return "dmg_bonus_electro_pct";
  }
  if (normalized.includes("cryo") && isElementalBonus(normalized)) {
    return "dmg_bonus_cryo_pct";
  }
  if (normalized.includes("dendro") && isElementalBonus(normalized)) {
    return "dmg_bonus_dendro_pct";
  }
  if (normalized.includes("anemo") && isElementalBonus(normalized)) {
    return "dmg_bonus_anemo_pct";
  }
  if (normalized.includes("geo") && isElementalBonus(normalized)) {
    return "dmg_bonus_geo_pct";
  }

  if (hasAny(normalized, ["vida", "hp"])) {
    return hasPercentHint ? "hp_pct" : "hp_flat";
  }
  if (hasAny(normalized, ["atq", "atk", "ataque", "attack"])) {
    return hasPercentHint ? "atk_pct" : "atk_flat";
  }
  if (hasAny(normalized, ["def", "defesa", "defense"])) {
    return hasPercentHint ? "def_pct" : "def_flat";
  }

  return null;
}
