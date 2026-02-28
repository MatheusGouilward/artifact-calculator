export enum Slot {
  Flower = "Flower",
  Plume = "Plume",
  Sands = "Sands",
  Goblet = "Goblet",
  Circlet = "Circlet",
}

export enum MainStat {
  FlatHp = "Flat HP",
  FlatAtk = "Flat ATK",
  FlatDef = "Flat DEF",
  HpPercent = "HP%",
  AtkPercent = "ATK%",
  DefPercent = "DEF%",
  EnergyRecharge = "ER%",
  ElementalMastery = "EM",
  CritRate = "CritRate",
  CritDmg = "CritDmg",
  HealingBonus = "Healing",
  PhysicalDmgBonus = "Physical DMG%",
  PyroDmgBonus = "Pyro DMG%",
  HydroDmgBonus = "Hydro DMG%",
  ElectroDmgBonus = "Electro DMG%",
  CryoDmgBonus = "Cryo DMG%",
  DendroDmgBonus = "Dendro DMG%",
  AnemoDmgBonus = "Anemo DMG%",
  GeoDmgBonus = "Geo DMG%",
}

export enum SubStat {
  FlatHp = "Flat HP",
  FlatAtk = "Flat ATK",
  FlatDef = "Flat DEF",
  HpPercent = "HP%",
  AtkPercent = "ATK%",
  DefPercent = "DEF%",
  EnergyRecharge = "ER%",
  ElementalMastery = "EM",
  CritRate = "CritRate",
  CritDmg = "CritDmg",
}

export type SubsRule = { mode: "all" } | { mode: "atLeast"; n: number };

export type AttemptSource = "domain" | "strongbox" | "transmuter";

export type SlotCostMap = {
  [Slot.Flower]: number;
  [Slot.Plume]: number;
  [Slot.Sands]: number;
  [Slot.Goblet]: number;
  [Slot.Circlet]: number;
};

export interface TransmuterConfig {
  enabled: boolean;
  elixirsAvailable: number;
  slotCost: SlotCostMap;
  maxCraftsPerPeriod?: number;
}

export interface TransmuterChoice {
  fixedMain: MainStat;
  fixedSubs: SubStat[];
}

export interface ArtifactFarmParams {
  slot: Slot;
  main: MainStat;
  requiredSubs: SubStat[];
  subsRule: SubsRule;
  setProbability?: number;
  setProbOverride?: number;
  slotProbability?: number;
}
