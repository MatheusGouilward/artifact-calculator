import { MainStat, Slot, SubStat, type SubsRule } from "@/lib/genshin/artifacts/types";

import type { WeightedStatsObjectiveConfig } from "./objectives";
import type { StatKey } from "./stat-keys";

export type BuildProfileId = "critDps" | "supportEr" | "emReaction";

export interface BuildPlan {
  id: BuildProfileId;
  name: { en: string; ptBR: string };
  objective: WeightedStatsObjectiveConfig;
  acceptedMainsBySlot: Partial<Record<Slot, StatKey[]>>;
  slotTargets: Partial<Record<Slot, Partial<Record<StatKey, number>>>>;
  focusDefaults: Partial<
    Record<
      Slot,
      {
        objectiveMode: "constraints" | "cv";
        cvThresholdBase?: number;
        desiredSubs?: SubStat[];
        subsRule?: SubsRule;
        mainStatOverride?: MainStat;
      }
    >
  >;
}

const CRIT_SUBS = [SubStat.CritRate, SubStat.CritDmg, SubStat.AtkPercent, SubStat.EnergyRecharge] as const;

export const BUILD_PLANS: Record<BuildProfileId, BuildPlan> = {
  critDps: {
    id: "critDps",
    name: {
      en: "Crit DPS",
      ptBR: "DPS Crítico",
    },
    objective: {
      id: "weighted_stats",
      weights: {
        crit_rate_pct: 2,
        crit_dmg_pct: 1,
        atk_pct: 0.9,
        er_pct: 0.5,
        em: 0.2,
      },
      caps: {
        crit_rate_pct: 100,
        crit_dmg_pct: 300,
        atk_pct: 200,
        er_pct: 250,
        em: 400,
      },
      hardMinimums: {
        er_pct: 110,
      },
    },
    acceptedMainsBySlot: {
      [Slot.Flower]: ["hp_flat"],
      [Slot.Plume]: ["atk_flat"],
      [Slot.Sands]: ["atk_pct", "er_pct", "em"],
      [Slot.Goblet]: [
        "atk_pct",
        "em",
        "dmg_bonus_physical_pct",
        "dmg_bonus_pyro_pct",
        "dmg_bonus_hydro_pct",
        "dmg_bonus_electro_pct",
        "dmg_bonus_cryo_pct",
        "dmg_bonus_dendro_pct",
        "dmg_bonus_anemo_pct",
        "dmg_bonus_geo_pct",
      ],
      [Slot.Circlet]: ["crit_rate_pct", "crit_dmg_pct"],
    },
    slotTargets: {
      [Slot.Flower]: { crit_rate_pct: 8, crit_dmg_pct: 16, atk_pct: 8, er_pct: 5 },
      [Slot.Plume]: { crit_rate_pct: 8, crit_dmg_pct: 16, atk_pct: 8, er_pct: 5 },
      [Slot.Sands]: { atk_pct: 46.6, crit_rate_pct: 6, crit_dmg_pct: 12, er_pct: 8 },
      [Slot.Goblet]: { crit_rate_pct: 7, crit_dmg_pct: 14, atk_pct: 7, er_pct: 5 },
      [Slot.Circlet]: { crit_rate_pct: 31.1, crit_dmg_pct: 20, atk_pct: 6, er_pct: 5 },
    },
    focusDefaults: {
      [Slot.Flower]: {
        objectiveMode: "cv",
        cvThresholdBase: 30,
        desiredSubs: [...CRIT_SUBS],
        subsRule: { mode: "atLeast", n: 2 },
      },
      [Slot.Plume]: {
        objectiveMode: "cv",
        cvThresholdBase: 30,
        desiredSubs: [...CRIT_SUBS],
        subsRule: { mode: "atLeast", n: 2 },
      },
      [Slot.Sands]: {
        objectiveMode: "cv",
        cvThresholdBase: 28,
        mainStatOverride: MainStat.AtkPercent,
        desiredSubs: [...CRIT_SUBS],
        subsRule: { mode: "atLeast", n: 2 },
      },
      [Slot.Goblet]: {
        objectiveMode: "cv",
        cvThresholdBase: 26,
        desiredSubs: [...CRIT_SUBS],
        subsRule: { mode: "atLeast", n: 2 },
      },
      [Slot.Circlet]: {
        objectiveMode: "cv",
        cvThresholdBase: 32,
        mainStatOverride: MainStat.CritRate,
        desiredSubs: [...CRIT_SUBS],
        subsRule: { mode: "atLeast", n: 2 },
      },
    },
  },
  supportEr: {
    id: "supportEr",
    name: {
      en: "Support ER",
      ptBR: "Suporte Recarga de Energia",
    },
    objective: {
      id: "weighted_stats",
      weights: {
        er_pct: 2.2,
        hp_pct: 0.9,
        atk_pct: 0.7,
        def_pct: 0.6,
        em: 0.3,
        crit_rate_pct: 0.25,
      },
      caps: {
        er_pct: 320,
        hp_pct: 180,
        atk_pct: 180,
        def_pct: 180,
        em: 300,
        crit_rate_pct: 100,
      },
      hardMinimums: {
        er_pct: 180,
      },
    },
    acceptedMainsBySlot: {
      [Slot.Flower]: ["hp_flat"],
      [Slot.Plume]: ["atk_flat"],
      [Slot.Sands]: ["er_pct", "hp_pct", "atk_pct", "def_pct"],
      [Slot.Goblet]: ["hp_pct", "atk_pct", "def_pct", "em"],
      [Slot.Circlet]: ["healing_bonus_pct", "hp_pct", "atk_pct", "def_pct", "crit_rate_pct"],
    },
    slotTargets: {
      [Slot.Flower]: { er_pct: 12, hp_pct: 10, atk_pct: 8, em: 20 },
      [Slot.Plume]: { er_pct: 12, hp_pct: 10, atk_pct: 8, em: 20 },
      [Slot.Sands]: { er_pct: 51.8, hp_pct: 10, atk_pct: 8, em: 20 },
      [Slot.Goblet]: { er_pct: 12, hp_pct: 46.6, atk_pct: 8, em: 40 },
      [Slot.Circlet]: { er_pct: 12, hp_pct: 20, atk_pct: 10, crit_rate_pct: 8 },
    },
    focusDefaults: {
      [Slot.Flower]: {
        objectiveMode: "constraints",
        desiredSubs: [SubStat.EnergyRecharge, SubStat.ElementalMastery, SubStat.CritRate],
        subsRule: { mode: "atLeast", n: 1 },
      },
      [Slot.Plume]: {
        objectiveMode: "constraints",
        desiredSubs: [SubStat.EnergyRecharge, SubStat.ElementalMastery, SubStat.CritRate],
        subsRule: { mode: "atLeast", n: 1 },
      },
      [Slot.Sands]: {
        objectiveMode: "constraints",
        mainStatOverride: MainStat.EnergyRecharge,
        desiredSubs: [SubStat.CritRate, SubStat.CritDmg, SubStat.ElementalMastery],
        subsRule: { mode: "atLeast", n: 1 },
      },
      [Slot.Goblet]: {
        objectiveMode: "constraints",
        mainStatOverride: MainStat.HpPercent,
        desiredSubs: [SubStat.EnergyRecharge, SubStat.ElementalMastery, SubStat.CritRate],
        subsRule: { mode: "atLeast", n: 1 },
      },
      [Slot.Circlet]: {
        objectiveMode: "constraints",
        mainStatOverride: MainStat.HealingBonus,
        desiredSubs: [SubStat.EnergyRecharge, SubStat.CritRate, SubStat.ElementalMastery],
        subsRule: { mode: "atLeast", n: 1 },
      },
    },
  },
  emReaction: {
    id: "emReaction",
    name: {
      en: "EM Reaction",
      ptBR: "Reação de Proficiência Elemental",
    },
    objective: {
      id: "weighted_stats",
      weights: {
        em: 2.2,
        er_pct: 0.8,
        crit_rate_pct: 0.25,
        crit_dmg_pct: 0.15,
        atk_pct: 0.3,
      },
      caps: {
        em: 1200,
        er_pct: 250,
        crit_rate_pct: 100,
        crit_dmg_pct: 250,
        atk_pct: 180,
      },
      hardMinimums: {
        em: 600,
      },
    },
    acceptedMainsBySlot: {
      [Slot.Flower]: ["hp_flat"],
      [Slot.Plume]: ["atk_flat"],
      [Slot.Sands]: ["em", "er_pct"],
      [Slot.Goblet]: ["em", "dmg_bonus_pyro_pct", "dmg_bonus_hydro_pct", "dmg_bonus_electro_pct", "dmg_bonus_dendro_pct"],
      [Slot.Circlet]: ["em", "crit_rate_pct", "crit_dmg_pct"],
    },
    slotTargets: {
      [Slot.Flower]: { em: 80, er_pct: 8, crit_rate_pct: 5 },
      [Slot.Plume]: { em: 80, er_pct: 8, crit_rate_pct: 5 },
      [Slot.Sands]: { em: 187, er_pct: 10, crit_rate_pct: 4 },
      [Slot.Goblet]: { em: 187, er_pct: 8, crit_rate_pct: 4 },
      [Slot.Circlet]: { em: 187, er_pct: 8, crit_rate_pct: 6 },
    },
    focusDefaults: {
      [Slot.Flower]: {
        objectiveMode: "constraints",
        desiredSubs: [SubStat.ElementalMastery, SubStat.EnergyRecharge, SubStat.CritRate],
        subsRule: { mode: "atLeast", n: 1 },
      },
      [Slot.Plume]: {
        objectiveMode: "constraints",
        desiredSubs: [SubStat.ElementalMastery, SubStat.EnergyRecharge, SubStat.CritRate],
        subsRule: { mode: "atLeast", n: 1 },
      },
      [Slot.Sands]: {
        objectiveMode: "constraints",
        mainStatOverride: MainStat.ElementalMastery,
        desiredSubs: [SubStat.EnergyRecharge, SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "atLeast", n: 1 },
      },
      [Slot.Goblet]: {
        objectiveMode: "constraints",
        mainStatOverride: MainStat.ElementalMastery,
        desiredSubs: [SubStat.EnergyRecharge, SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "atLeast", n: 1 },
      },
      [Slot.Circlet]: {
        objectiveMode: "constraints",
        mainStatOverride: MainStat.ElementalMastery,
        desiredSubs: [SubStat.EnergyRecharge, SubStat.CritRate, SubStat.CritDmg],
        subsRule: { mode: "atLeast", n: 1 },
      },
    },
  },
};

export function getBuildPlan(id: BuildProfileId): BuildPlan {
  return BUILD_PLANS[id];
}
