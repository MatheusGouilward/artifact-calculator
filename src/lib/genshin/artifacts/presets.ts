import { AttemptSource, MainStat, Slot, SubStat, SubsRule } from "./types";

export type ArtifactPresetFarmStrategy = "domain" | "strongbox" | "transmuter" | "combined";

export interface ArtifactPresetUpgradeRequirement {
  enabled: boolean;
  group: SubStat[];
  k: number;
}

export interface ArtifactPresetCvAnalysis {
  enabled: boolean;
  threshold: number;
  source: AttemptSource;
}

export interface ArtifactPresetStrongboxDefaults {
  recycleRate: number;
}

export interface ArtifactPresetTransmuterDefaults {
  enabled: boolean;
  elixirsAvailable: number;
  maxCraftsPerPeriod: number;
  fixedSubs: SubStat[];
}

export interface ArtifactPreset {
  id: string;
  name: string;
  slot: Slot;
  main?: MainStat;
  desiredSubs: SubStat[];
  subsRule: SubsRule;
  upgradeRequirement: ArtifactPresetUpgradeRequirement;
  cvAnalysis: ArtifactPresetCvAnalysis;
  farmStrategy: ArtifactPresetFarmStrategy;
  strongbox: ArtifactPresetStrongboxDefaults;
  transmuter: ArtifactPresetTransmuterDefaults;
}

export const ARTIFACT_PRESETS: readonly ArtifactPreset[] = [
  {
    id: "crit-dps-cv30",
    name: "Crit DPS (CV30+)",
    slot: Slot.Sands,
    main: MainStat.AtkPercent,
    desiredSubs: [SubStat.CritRate, SubStat.CritDmg, SubStat.EnergyRecharge],
    subsRule: { mode: "atLeast", n: 2 },
    upgradeRequirement: {
      enabled: true,
      group: [SubStat.CritRate, SubStat.CritDmg],
      k: 3,
    },
    cvAnalysis: {
      enabled: true,
      threshold: 30,
      source: "domain",
    },
    farmStrategy: "combined",
    strongbox: {
      recycleRate: 1,
    },
    transmuter: {
      enabled: true,
      elixirsAvailable: 6,
      maxCraftsPerPeriod: 2,
      fixedSubs: [SubStat.CritRate, SubStat.CritDmg],
    },
  },
  {
    id: "support-er-cv20",
    name: "Support ER (ER main, CV20+)",
    slot: Slot.Sands,
    main: MainStat.EnergyRecharge,
    desiredSubs: [SubStat.CritRate, SubStat.CritDmg, SubStat.HpPercent],
    subsRule: { mode: "atLeast", n: 2 },
    upgradeRequirement: {
      enabled: true,
      group: [SubStat.CritRate, SubStat.CritDmg],
      k: 2,
    },
    cvAnalysis: {
      enabled: true,
      threshold: 20,
      source: "strongbox",
    },
    farmStrategy: "strongbox",
    strongbox: {
      recycleRate: 1,
    },
    transmuter: {
      enabled: false,
      elixirsAvailable: 0,
      maxCraftsPerPeriod: 2,
      fixedSubs: [SubStat.CritRate, SubStat.CritDmg],
    },
  },
  {
    id: "em-reaction-cv-irrelevant",
    name: "EM Reaction (EM main, CV irrelevant)",
    slot: Slot.Sands,
    main: MainStat.ElementalMastery,
    desiredSubs: [SubStat.EnergyRecharge, SubStat.AtkPercent, SubStat.CritRate],
    subsRule: { mode: "atLeast", n: 1 },
    upgradeRequirement: {
      enabled: true,
      group: [SubStat.EnergyRecharge, SubStat.AtkPercent],
      k: 2,
    },
    cvAnalysis: {
      enabled: false,
      threshold: 0,
      source: "domain",
    },
    farmStrategy: "domain",
    strongbox: {
      recycleRate: 0.8,
    },
    transmuter: {
      enabled: false,
      elixirsAvailable: 0,
      maxCraftsPerPeriod: 2,
      fixedSubs: [SubStat.CritRate, SubStat.CritDmg],
    },
  },
  {
    id: "goblet-elemental-hard",
    name: "Goblet Elemental (hard mode)",
    slot: Slot.Goblet,
    main: MainStat.PyroDmgBonus,
    desiredSubs: [SubStat.CritRate, SubStat.CritDmg, SubStat.AtkPercent, SubStat.EnergyRecharge],
    subsRule: { mode: "all" },
    upgradeRequirement: {
      enabled: true,
      group: [SubStat.CritRate, SubStat.CritDmg],
      k: 4,
    },
    cvAnalysis: {
      enabled: true,
      threshold: 35,
      source: "domain",
    },
    farmStrategy: "combined",
    strongbox: {
      recycleRate: 1,
    },
    transmuter: {
      enabled: true,
      elixirsAvailable: 8,
      maxCraftsPerPeriod: 2,
      fixedSubs: [SubStat.CritRate, SubStat.CritDmg],
    },
  },
  {
    id: "circlet-crit-focus",
    name: "Circlet CR/CD focus",
    slot: Slot.Circlet,
    main: MainStat.CritRate,
    desiredSubs: [SubStat.CritDmg, SubStat.AtkPercent, SubStat.EnergyRecharge],
    subsRule: { mode: "atLeast", n: 2 },
    upgradeRequirement: {
      enabled: true,
      group: [SubStat.CritDmg, SubStat.AtkPercent],
      k: 3,
    },
    cvAnalysis: {
      enabled: true,
      threshold: 30,
      source: "strongbox",
    },
    farmStrategy: "strongbox",
    strongbox: {
      recycleRate: 1,
    },
    transmuter: {
      enabled: true,
      elixirsAvailable: 6,
      maxCraftsPerPeriod: 2,
      fixedSubs: [SubStat.CritDmg, SubStat.AtkPercent],
    },
  },
];

export function getArtifactPresetById(id: string): ArtifactPreset | undefined {
  return ARTIFACT_PRESETS.find((preset) => preset.id === id);
}
