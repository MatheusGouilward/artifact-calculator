import type { BuffId, BuffLibraryEntry } from "./types";

export const BUFFS: Record<BuffId, BuffLibraryEntry> = {
  artifact_noblesse_4p: {
    id: "artifact_noblesse_4p",
    category: "buff",
    labelKey: "damageLab.buffs.artifactNoblesse4p",
    descriptionKey: "damageLab.buffs.artifactNoblesse4pDesc",
    requiredParams: [],
  },
  weapon_ttds_r5: {
    id: "weapon_ttds_r5",
    category: "buff",
    labelKey: "damageLab.buffs.weaponTtdsR5",
    descriptionKey: "damageLab.buffs.weaponTtdsR5Desc",
    requiredParams: [],
  },
  bennett_burst_flat_atk: {
    id: "bennett_burst_flat_atk",
    category: "buff",
    labelKey: "damageLab.buffs.bennettBurstFlatAtk",
    descriptionKey: "damageLab.buffs.bennettBurstFlatAtkDesc",
    defaults: { flatAtk: 1000 },
    requiredParams: ["flatAtk"],
  },
  kazuha_a4_bonus: {
    id: "kazuha_a4_bonus",
    category: "buff",
    labelKey: "damageLab.buffs.kazuhaA4Bonus",
    descriptionKey: "damageLab.buffs.kazuhaA4BonusDesc",
    defaults: { em: 800 },
    requiredParams: ["em"],
  },
  artifact_vv_4p: {
    id: "artifact_vv_4p",
    category: "debuff",
    labelKey: "damageLab.buffs.artifactVv4p",
    descriptionKey: "damageLab.buffs.artifactVv4pDesc",
    defaults: { swirlElement: "pyro" },
    requiredParams: ["swirlElement"],
  },
  custom_crit_rate_pct: {
    id: "custom_crit_rate_pct",
    category: "buff",
    labelKey: "damageLab.buffs.customCritRatePct",
    descriptionKey: "damageLab.buffs.customCritRatePctDesc",
    defaults: { valuePct: 30 },
    requiredParams: ["valuePct"],
  },
};

export const BUFF_LIST: readonly BuffLibraryEntry[] = Object.values(BUFFS).sort((a, b) => {
  return a.id.localeCompare(b.id);
});
