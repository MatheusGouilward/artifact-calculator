import { MainStat, Slot, SubStat } from "./types";

export const DOMAIN_ATTEMPTS_PER_RUN = Object.freeze({
  oneArtifact: 0.935,
  twoArtifacts: 0.065,
});

export const DEFAULT_SET_PROBABILITY = 0.5;
export const DEFAULT_SLOT_PROBABILITY = 0.2;

export const DEFAULT_TRANSMUTER_SLOT_COST = Object.freeze({
  [Slot.Flower]: 1,
  [Slot.Plume]: 1,
  [Slot.Sands]: 2,
  [Slot.Goblet]: 4,
  [Slot.Circlet]: 3,
});

export const INITIAL_SUB_COUNT_PROBABILITY = Object.freeze({
  threeSubs: 0.8,
  fourSubs: 0.2,
});

export const ROLL_TIER_PROBABILITIES = Object.freeze({
  tier100: 0.25,
  tier90: 0.25,
  tier80: 0.25,
  tier70: 0.25,
});

export const MAIN_STAT_PROBABILITIES: Record<Slot, Partial<Record<MainStat, number>>> = {
  [Slot.Flower]: {
    [MainStat.FlatHp]: 1,
  },
  [Slot.Plume]: {
    [MainStat.FlatAtk]: 1,
  },
  [Slot.Sands]: {
    [MainStat.HpPercent]: 0.2668,
    [MainStat.AtkPercent]: 0.2666,
    [MainStat.DefPercent]: 0.2666,
    [MainStat.EnergyRecharge]: 0.1,
    [MainStat.ElementalMastery]: 0.1,
  },
  [Slot.Goblet]: {
    [MainStat.HpPercent]: 0.1925,
    [MainStat.AtkPercent]: 0.1925,
    [MainStat.DefPercent]: 0.19,
    [MainStat.PyroDmgBonus]: 0.05,
    [MainStat.HydroDmgBonus]: 0.05,
    [MainStat.ElectroDmgBonus]: 0.05,
    [MainStat.CryoDmgBonus]: 0.05,
    [MainStat.DendroDmgBonus]: 0.05,
    [MainStat.AnemoDmgBonus]: 0.05,
    [MainStat.GeoDmgBonus]: 0.05,
    [MainStat.PhysicalDmgBonus]: 0.05,
    [MainStat.ElementalMastery]: 0.025,
  },
  [Slot.Circlet]: {
    [MainStat.HpPercent]: 0.22,
    [MainStat.AtkPercent]: 0.22,
    [MainStat.DefPercent]: 0.22,
    [MainStat.CritRate]: 0.1,
    [MainStat.CritDmg]: 0.1,
    [MainStat.HealingBonus]: 0.1,
    [MainStat.ElementalMastery]: 0.04,
  },
};

export const ALL_SUB_STATS: readonly SubStat[] = Object.freeze([
  SubStat.FlatHp,
  SubStat.FlatAtk,
  SubStat.FlatDef,
  SubStat.HpPercent,
  SubStat.AtkPercent,
  SubStat.DefPercent,
  SubStat.EnergyRecharge,
  SubStat.ElementalMastery,
  SubStat.CritRate,
  SubStat.CritDmg,
]);

export const SUBSTAT_WEIGHTS: Record<SubStat, number> = {
  [SubStat.FlatHp]: 6,
  [SubStat.FlatAtk]: 6,
  [SubStat.FlatDef]: 6,
  [SubStat.HpPercent]: 4,
  [SubStat.AtkPercent]: 4,
  [SubStat.DefPercent]: 4,
  [SubStat.EnergyRecharge]: 4,
  [SubStat.ElementalMastery]: 4,
  [SubStat.CritRate]: 3,
  [SubStat.CritDmg]: 3,
};

export const SUBSTAT_ROLL_VALUES_5STAR: Record<SubStat, readonly [number, number, number, number]> = {
  [SubStat.FlatHp]: [209.13, 239.0, 268.88, 298.75],
  [SubStat.FlatAtk]: [13.62, 15.56, 17.51, 19.45],
  [SubStat.FlatDef]: [16.2, 18.52, 20.83, 23.15],
  [SubStat.HpPercent]: [4.08, 4.66, 5.25, 5.83],
  [SubStat.AtkPercent]: [4.08, 4.66, 5.25, 5.83],
  [SubStat.DefPercent]: [5.1, 5.83, 6.56, 7.29],
  [SubStat.EnergyRecharge]: [4.53, 5.18, 5.83, 6.48],
  [SubStat.ElementalMastery]: [16.32, 18.65, 20.98, 23.31],
  [SubStat.CritRate]: [2.72, 3.11, 3.5, 3.89],
  [SubStat.CritDmg]: [5.44, 6.22, 6.99, 7.77],
};

const MAIN_TO_EXCLUDED_SUBSTAT: Partial<Record<MainStat, SubStat>> = {
  [MainStat.FlatHp]: SubStat.FlatHp,
  [MainStat.FlatAtk]: SubStat.FlatAtk,
  [MainStat.FlatDef]: SubStat.FlatDef,
  [MainStat.HpPercent]: SubStat.HpPercent,
  [MainStat.AtkPercent]: SubStat.AtkPercent,
  [MainStat.DefPercent]: SubStat.DefPercent,
  [MainStat.EnergyRecharge]: SubStat.EnergyRecharge,
  [MainStat.ElementalMastery]: SubStat.ElementalMastery,
  [MainStat.CritRate]: SubStat.CritRate,
  [MainStat.CritDmg]: SubStat.CritDmg,
};

export function excludedSubStatForMain(main: MainStat): SubStat | null {
  return MAIN_TO_EXCLUDED_SUBSTAT[main] ?? null;
}
