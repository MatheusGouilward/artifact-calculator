"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Controller, useForm } from "react-hook-form";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  ARTIFACT_PRESETS,
  AttemptSource,
  DEFAULT_TRANSMUTER_SLOT_COST,
  MainStat,
  Slot,
  SubStat,
  type ArtifactPreset,
  type ArtifactCalculatorShareState,
  type ShareTheme,
  bestStrategy,
  critValueStats,
  decodeArtifactCalculatorSharePayload,
  encodeArtifactCalculatorShareState,
  evaluateStrategies,
  expectedRuns,
  excludedSubStatForMain,
  findStopPoint,
  generateEfficiencyCurve,
  getArtifactPresetById,
  probPerRunFromAttempt,
  probSuccessAfterPeriodCombined,
  probSuccessPerAttempt,
  probSuccessPerRunFromAttemptSuccess,
  resinForRuns,
  runsForTargetChanceStrategy,
  runsForTargetChance,
  runsForTargetChanceWithStrongbox,
  sanitizeArtifactCalculatorShareState,
} from "@/lib/genshin/artifacts";
import {
  analyzeArtifactPriorities,
  computeDamageIndexFromEnka,
  computeFocusGlobalEfficiency,
  computeResinRecommendations,
  mapEnkaEquipTypeToSlot,
  mapEnkaStatToStatKey,
  type ArtifactPriorityReport,
  type BuildProfileId,
  type ExpectedDamageSimpleObjectiveConfig,
  type FocusGlobalEfficiencyReport,
  type FocusGlobalStrategyScope,
  type ResinRecommendationReport,
  type StatKey,
} from "@/lib/genshin/eval";
import {
  loadGameDataLite,
  localizeGameDataName,
  resolveArtifactSet,
  resolveCharacter,
  resolveWeapon,
} from "@/lib/genshin/game-data";
import type { EnkaCharacterSummary } from "@/lib/enka/types";
import { useActiveEnkaCharacter } from "@/lib/enka/use-active-character";
import { EnkaActiveCard } from "@/components/enka-active-card";
import { useLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t, type Locale } from "@/lib/i18n";

const TARGET_SETS = ["A", "B"] as const;
const RULE_MODES = ["all", "atLeast"] as const;
const RUN_MODES = ["runs", "resin"] as const;
const UPGRADE_PRESETS = ["crit", "er", "em", "custom"] as const;
const FARM_STRATEGIES = ["domainsOnly", "strongbox", "transmuterOnly", "combined"] as const;
const CV_ATTEMPT_SOURCES = ["domain", "strongbox", "transmuter"] as const;
const OPTIMIZER_OBJECTIVES = ["constraints", "cv"] as const;
const BUILD_PROFILE_OPTIONS: BuildProfileId[] = ["critDps", "supportEr", "emReaction"];
const GLOBAL_STRATEGY_SCOPE_OPTIONS: FocusGlobalStrategyScope[] = ["domainsOnly", "domainsStrongbox"];
const PRESET_NONE = "__none__";
type DamageIndexScalingStat = ExpectedDamageSimpleObjectiveConfig["scaling"]["stat"];
type DamageIndexType = NonNullable<ExpectedDamageSimpleObjectiveConfig["damageType"]>;
const DAMAGE_INDEX_SCALING_OPTIONS: readonly DamageIndexScalingStat[] = ["atk", "hp", "def", "em"];
const DAMAGE_INDEX_DAMAGE_TYPES: readonly DamageIndexType[] = [
  "physical",
  "pyro",
  "hydro",
  "electro",
  "cryo",
  "dendro",
  "anemo",
  "geo",
];
const EFFICIENCY_LINE_COLORS = {
  domainsOnly: "var(--chart-1)",
  domainsStrongbox: "var(--chart-2)",
  transmuterOnly: "var(--chart-3)",
  combined: "var(--chart-4)",
} as const;

const SUBSTAT_OPTIONS: readonly SubStat[] = [
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
];

const SLOT_OPTIONS: readonly Slot[] = [Slot.Flower, Slot.Plume, Slot.Sands, Slot.Goblet, Slot.Circlet];

const MAIN_OPTIONS_BY_SLOT: Record<Slot, MainStat[]> = {
  [Slot.Flower]: [MainStat.FlatHp],
  [Slot.Plume]: [MainStat.FlatAtk],
  [Slot.Sands]: [
    MainStat.HpPercent,
    MainStat.AtkPercent,
    MainStat.DefPercent,
    MainStat.EnergyRecharge,
    MainStat.ElementalMastery,
  ],
  [Slot.Goblet]: [
    MainStat.HpPercent,
    MainStat.AtkPercent,
    MainStat.DefPercent,
    MainStat.PyroDmgBonus,
    MainStat.HydroDmgBonus,
    MainStat.ElectroDmgBonus,
    MainStat.CryoDmgBonus,
    MainStat.DendroDmgBonus,
    MainStat.AnemoDmgBonus,
    MainStat.GeoDmgBonus,
    MainStat.PhysicalDmgBonus,
    MainStat.ElementalMastery,
  ],
  [Slot.Circlet]: [
    MainStat.HpPercent,
    MainStat.AtkPercent,
    MainStat.DefPercent,
    MainStat.CritRate,
    MainStat.CritDmg,
    MainStat.HealingBonus,
    MainStat.ElementalMastery,
  ],
};

const PREFERRED_MAIN_BY_SLOT: Record<Slot, MainStat> = {
  [Slot.Flower]: MainStat.FlatHp,
  [Slot.Plume]: MainStat.FlatAtk,
  [Slot.Sands]: MainStat.AtkPercent,
  [Slot.Goblet]: MainStat.HpPercent,
  [Slot.Circlet]: MainStat.CritRate,
};

const SLOT_LABEL_KEYS: Record<Slot, string> = {
  [Slot.Flower]: "terms.slot.flower",
  [Slot.Plume]: "terms.slot.plume",
  [Slot.Sands]: "terms.slot.sands",
  [Slot.Goblet]: "terms.slot.goblet",
  [Slot.Circlet]: "terms.slot.circlet",
};

const MAIN_STAT_LABEL_KEYS: Record<MainStat, string> = {
  [MainStat.FlatHp]: "terms.stat.flatHp",
  [MainStat.FlatAtk]: "terms.stat.flatAtk",
  [MainStat.FlatDef]: "terms.stat.flatDef",
  [MainStat.HpPercent]: "terms.stat.hpPercent",
  [MainStat.AtkPercent]: "terms.stat.atkPercent",
  [MainStat.DefPercent]: "terms.stat.defPercent",
  [MainStat.EnergyRecharge]: "terms.stat.energyRecharge",
  [MainStat.ElementalMastery]: "terms.stat.elementalMastery",
  [MainStat.CritRate]: "terms.stat.critRate",
  [MainStat.CritDmg]: "terms.stat.critDmg",
  [MainStat.HealingBonus]: "terms.stat.healingBonus",
  [MainStat.PhysicalDmgBonus]: "terms.stat.physicalDmgBonus",
  [MainStat.PyroDmgBonus]: "terms.stat.pyroDmgBonus",
  [MainStat.HydroDmgBonus]: "terms.stat.hydroDmgBonus",
  [MainStat.ElectroDmgBonus]: "terms.stat.electroDmgBonus",
  [MainStat.CryoDmgBonus]: "terms.stat.cryoDmgBonus",
  [MainStat.DendroDmgBonus]: "terms.stat.dendroDmgBonus",
  [MainStat.AnemoDmgBonus]: "terms.stat.anemoDmgBonus",
  [MainStat.GeoDmgBonus]: "terms.stat.geoDmgBonus",
};

const SUBSTAT_LABEL_KEYS: Record<SubStat, string> = {
  [SubStat.FlatHp]: "terms.stat.flatHp",
  [SubStat.FlatAtk]: "terms.stat.flatAtk",
  [SubStat.FlatDef]: "terms.stat.flatDef",
  [SubStat.HpPercent]: "terms.stat.hpPercent",
  [SubStat.AtkPercent]: "terms.stat.atkPercent",
  [SubStat.DefPercent]: "terms.stat.defPercent",
  [SubStat.EnergyRecharge]: "terms.stat.energyRecharge",
  [SubStat.ElementalMastery]: "terms.stat.elementalMastery",
  [SubStat.CritRate]: "terms.stat.critRate",
  [SubStat.CritDmg]: "terms.stat.critDmg",
};

const STAT_KEY_LABEL_KEYS: Record<StatKey, string> = {
  hp_flat: "terms.stat.flatHp",
  hp_pct: "terms.stat.hpPercent",
  atk_flat: "terms.stat.flatAtk",
  atk_pct: "terms.stat.atkPercent",
  def_flat: "terms.stat.flatDef",
  def_pct: "terms.stat.defPercent",
  er_pct: "terms.stat.energyRecharge",
  em: "terms.stat.elementalMastery",
  crit_rate_pct: "terms.stat.critRate",
  crit_dmg_pct: "terms.stat.critDmg",
  healing_bonus_pct: "terms.stat.healingBonus",
  dmg_bonus_physical_pct: "terms.stat.physicalDmgBonus",
  dmg_bonus_pyro_pct: "terms.stat.pyroDmgBonus",
  dmg_bonus_hydro_pct: "terms.stat.hydroDmgBonus",
  dmg_bonus_electro_pct: "terms.stat.electroDmgBonus",
  dmg_bonus_cryo_pct: "terms.stat.cryoDmgBonus",
  dmg_bonus_dendro_pct: "terms.stat.dendroDmgBonus",
  dmg_bonus_anemo_pct: "terms.stat.anemoDmgBonus",
  dmg_bonus_geo_pct: "terms.stat.geoDmgBonus",
};

const ATTEMPT_SOURCE_LABEL_KEYS: Record<AttemptSource, string> = {
  domain: "terms.system.domain",
  strongbox: "terms.system.strongbox",
  transmuter: "terms.system.transmuter",
};

const PRESET_NAME_KEYS_BY_ID: Record<string, string> = {
  "crit-dps-cv30": "presets.critDpsCv30",
  "support-er-cv20": "presets.supportErCv20",
  "em-reaction-cv-irrelevant": "presets.emReactionCvIrrelevant",
  "goblet-elemental-hard": "presets.gobletElementalHard",
  "circlet-crit-focus": "presets.circletCritFocus",
};

const formSchema = z
  .object({
    targetSet: z.enum(TARGET_SETS),
    slot: z.nativeEnum(Slot),
    main: z.nativeEnum(MainStat),
    desiredSubs: z.array(z.nativeEnum(SubStat)),
    ruleMode: z.enum(RULE_MODES),
    atLeastN: z.number().int().min(0),
    runMode: z.enum(RUN_MODES),
    runs: z.number().int().min(1),
    resin: z.number().int().min(20),
    targetProb: z.number().min(0.01).max(0.99),
    upgradeEnabled: z.boolean(),
    upgradePreset: z.enum(UPGRADE_PRESETS),
    upgradeCustomGroup: z.array(z.nativeEnum(SubStat)),
    upgradeK: z.number().int().min(0).max(5),
    farmStrategy: z.enum(FARM_STRATEGIES),
    recycleRatePct: z.number().min(0).max(100),
    transmuterEnabled: z.boolean(),
    transmuterElixirs: z.number().int().min(0),
    transmuterMaxCrafts: z.number().int().min(0),
    transmuterFixedSubs: z.array(z.nativeEnum(SubStat)),
    cvEnabled: z.boolean(),
    cvThreshold: z.number().min(0).max(200),
    cvAttemptSource: z.enum(CV_ATTEMPT_SOURCES),
    optimizerEnabled: z.boolean(),
    optimizerObjective: z.enum(OPTIMIZER_OBJECTIVES),
  })
  .superRefine((value, ctx) => {
    if (value.ruleMode === "atLeast" && value.atLeastN > value.desiredSubs.length) {
      ctx.addIssue({
        code: "custom",
        path: ["atLeastN"],
        message: "N must be less than or equal to selected substats.",
      });
    }

    if (value.transmuterEnabled && value.transmuterFixedSubs.length !== 2) {
      ctx.addIssue({
        code: "custom",
        path: ["transmuterFixedSubs"],
        message: "Select exactly 2 fixed substats for Transmuter.",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  targetSet: "A",
  slot: Slot.Sands,
  main: MainStat.AtkPercent,
  desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
  ruleMode: "all",
  atLeastN: 1,
  runMode: "runs",
  runs: 100,
  resin: 2000,
  targetProb: 0.9,
  upgradeEnabled: false,
  upgradePreset: "crit",
  upgradeCustomGroup: [SubStat.CritRate, SubStat.CritDmg],
  upgradeK: 3,
  farmStrategy: "domainsOnly",
  recycleRatePct: 100,
  transmuterEnabled: false,
  transmuterElixirs: 0,
  transmuterMaxCrafts: 2,
  transmuterFixedSubs: [SubStat.CritRate, SubStat.CritDmg],
  cvEnabled: false,
  cvThreshold: 30,
  cvAttemptSource: "domain",
  optimizerEnabled: false,
  optimizerObjective: "constraints",
};

interface ArtifactCalculatorProps {
  appName: string;
  appVersion: string;
}

interface EfficiencyChartPoint {
  day: number;
  resin: number;
  runs: number;
  domainsOnlyPower: number;
  domainsStrongboxPower: number;
  transmuterOnlyPower: number;
  combinedPower: number;
}

type MainTab = "plan" | "details" | "advanced";

export function ArtifactCalculator({ appName, appVersion }: ArtifactCalculatorProps) {
  const { locale, setLocale } = useLocale();
  const { setTheme, theme, resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(PRESET_NONE);
  const [mounted, setMounted] = useState(false);
  const [showEfficiencyCurve, setShowEfficiencyCurve] = useState(false);
  const [efficiencyDaysInput, setEfficiencyDaysInput] = useState(60);
  const [efficiencyResinInput, setEfficiencyResinInput] = useState(180);
  const [showStopPointRecommendation, setShowStopPointRecommendation] = useState(true);
  const [stopPointThresholdPctInput, setStopPointThresholdPctInput] = useState(0.2);
  const [stopPointConsecutiveDaysInput, setStopPointConsecutiveDaysInput] = useState(3);
  const [analysisProfileId, setAnalysisProfileId] = useState<BuildProfileId>("critDps");
  const [includeGlobalEfficiency, setIncludeGlobalEfficiency] = useState(true);
  const [globalFlexSlot, setGlobalFlexSlot] = useState<Slot>(Slot.Goblet);
  const [globalStrategyScope, setGlobalStrategyScope] = useState<FocusGlobalStrategyScope>("domainsStrongbox");
  const [activeMainTab, setActiveMainTab] = useState<MainTab>("plan");
  const [damageIndexScalingStat, setDamageIndexScalingStat] = useState<DamageIndexScalingStat>("atk");
  const [damageIndexDamageType, setDamageIndexDamageType] = useState<DamageIndexType>("physical");
  const [damageIndexUseCrit, setDamageIndexUseCrit] = useState(true);
  const [damageIndexMultiplier, setDamageIndexMultiplier] = useState(1);
  const [damageIndexFlat, setDamageIndexFlat] = useState(0);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<FormValues>({
    defaultValues,
    mode: "onChange",
    resolver: zodResolver(formSchema),
  });
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const activeEnka = useActiveEnkaCharacter(locale);
  const gameDataLite = useMemo(() => loadGameDataLite(), []);
  const selectedTheme: ShareTheme = isShareTheme(theme) ? theme : "system";
  const debugThemeValue = mounted ? resolvedTheme ?? theme ?? "system" : "\u2014";
  const debugLocaleValue = mounted ? locale : "\u2014";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const cfg = new URLSearchParams(window.location.search).get("cfg");
    if (!cfg) {
      return;
    }

    const decodedPayload = decodeArtifactCalculatorSharePayload(cfg, defaultValues);
    if (!decodedPayload) {
      return;
    }

    if (decodedPayload.lang) {
      setLocale(decodedPayload.lang);
    }
    if (decodedPayload.theme) {
      setTheme(decodedPayload.theme);
    }
    form.reset(decodedPayload.state);
    setSelectedPresetId(PRESET_NONE);
  }, [form, setLocale, setTheme]);

  const slot = form.watch("slot");
  const main = form.watch("main");
  const targetSet = form.watch("targetSet");
  const desiredSubs = form.watch("desiredSubs");
  const ruleMode = form.watch("ruleMode");
  const atLeastN = form.watch("atLeastN");
  const runMode = form.watch("runMode");
  const runsInput = form.watch("runs");
  const resinInput = form.watch("resin");
  const targetProbInput = form.watch("targetProb");
  const upgradeEnabled = form.watch("upgradeEnabled");
  const upgradePreset = form.watch("upgradePreset");
  const upgradeCustomGroup = form.watch("upgradeCustomGroup");
  const upgradeKInput = form.watch("upgradeK");
  const farmStrategy = form.watch("farmStrategy");
  const recycleRatePctInput = form.watch("recycleRatePct");
  const transmuterEnabled = form.watch("transmuterEnabled");
  const transmuterElixirs = form.watch("transmuterElixirs");
  const transmuterMaxCrafts = form.watch("transmuterMaxCrafts");
  const transmuterFixedSubs = form.watch("transmuterFixedSubs");
  const cvEnabled = form.watch("cvEnabled");
  const cvThresholdInput = form.watch("cvThreshold");
  const cvAttemptSource = form.watch("cvAttemptSource");
  const optimizerEnabled = form.watch("optimizerEnabled");
  const optimizerObjective = form.watch("optimizerObjective");

  useEffect(() => {
    const fixedMain = normalizeMainForSlot(slot, main);
    if (fixedMain !== main) {
      form.setValue("main", fixedMain, { shouldValidate: true });
      return;
    }

    const allowed = MAIN_OPTIONS_BY_SLOT[slot];
    if (allowed.includes(main)) {
      return;
    }

    const preferredFallback = PREFERRED_MAIN_BY_SLOT[slot];
    const nextMain = allowed.includes(preferredFallback) ? preferredFallback : allowed[0];
    form.setValue("main", nextMain, { shouldValidate: true });
  }, [slot, main, form]);

  const effectiveMain = normalizeMainForSlot(slot, main);
  const excludedSub = excludedSubStatForMain(effectiveMain);

  useEffect(() => {
    if (!excludedSub || !desiredSubs.includes(excludedSub)) {
      return;
    }
    form.setValue(
      "desiredSubs",
      desiredSubs.filter((sub) => sub !== excludedSub),
      { shouldValidate: true },
    );
  }, [desiredSubs, excludedSub, form]);

  useEffect(() => {
    if (!excludedSub || !upgradeCustomGroup.includes(excludedSub)) {
      return;
    }
    form.setValue(
      "upgradeCustomGroup",
      upgradeCustomGroup.filter((sub) => sub !== excludedSub),
      { shouldValidate: true },
    );
  }, [excludedSub, form, upgradeCustomGroup]);

  useEffect(() => {
    if (!excludedSub || !transmuterFixedSubs.includes(excludedSub)) {
      return;
    }
    form.setValue(
      "transmuterFixedSubs",
      transmuterFixedSubs.filter((sub) => sub !== excludedSub),
      { shouldValidate: true },
    );
  }, [excludedSub, form, transmuterFixedSubs]);

  const selectedCount = desiredSubs.length;
  const clampedAtLeastN = clampInteger(atLeastN, 0, selectedCount);

  useEffect(() => {
    if (ruleMode === "atLeast" && clampedAtLeastN !== atLeastN) {
      form.setValue("atLeastN", clampedAtLeastN, { shouldValidate: true });
    }
  }, [ruleMode, clampedAtLeastN, atLeastN, form]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
      if (shareCopiedTimerRef.current) {
        clearTimeout(shareCopiedTimerRef.current);
      }
    };
  }, []);

  const applyPreset = (preset: ArtifactPreset) => {
    const presetMain = resolveMainForSlot(preset.slot, preset.main);
    const excludedForPreset = excludedSubStatForMain(presetMain);
    const presetDesiredSubs = uniqueSubStats(preset.desiredSubs, excludedForPreset);
    const presetUpgradeGroup = uniqueSubStats(preset.upgradeRequirement.group, excludedForPreset);
    const presetTransmuterFixedSubs = uniqueSubStats(preset.transmuter.fixedSubs, excludedForPreset, 2);
    const presetRuleMode = preset.subsRule.mode === "atLeast" ? "atLeast" : "all";
    const presetAtLeastN =
      preset.subsRule.mode === "atLeast"
        ? clampInteger(preset.subsRule.n, 0, presetDesiredSubs.length)
        : 0;
    const transmuterEnabled = preset.transmuter.enabled && presetTransmuterFixedSubs.length === 2;

    form.setValue("slot", preset.slot, { shouldValidate: true });
    form.setValue("main", presetMain, { shouldValidate: true });
    form.setValue("desiredSubs", presetDesiredSubs, { shouldValidate: true });
    form.setValue("ruleMode", presetRuleMode, { shouldValidate: true });
    form.setValue("atLeastN", presetAtLeastN, { shouldValidate: true });
    form.setValue("upgradeEnabled", preset.upgradeRequirement.enabled, { shouldValidate: true });
    form.setValue("upgradeCustomGroup", presetUpgradeGroup, { shouldValidate: true });
    form.setValue("upgradePreset", inferUpgradePreset(presetUpgradeGroup), { shouldValidate: true });
    form.setValue("upgradeK", clampInteger(preset.upgradeRequirement.k, 0, 5), { shouldValidate: true });
    form.setValue("farmStrategy", mapPresetFarmStrategy(preset.farmStrategy), { shouldValidate: true });
    form.setValue("recycleRatePct", clampNumber(preset.strongbox.recycleRate * 100, 0, 100), {
      shouldValidate: true,
    });
    form.setValue("transmuterEnabled", transmuterEnabled, { shouldValidate: true });
    form.setValue("transmuterElixirs", clampInteger(preset.transmuter.elixirsAvailable, 0, Number.MAX_SAFE_INTEGER), {
      shouldValidate: true,
    });
    form.setValue(
      "transmuterMaxCrafts",
      clampInteger(preset.transmuter.maxCraftsPerPeriod, 0, Number.MAX_SAFE_INTEGER),
      { shouldValidate: true },
    );
    form.setValue("transmuterFixedSubs", presetTransmuterFixedSubs, { shouldValidate: true });
    form.setValue("cvEnabled", preset.cvAnalysis.enabled, { shouldValidate: true });
    form.setValue("cvThreshold", clampNumber(preset.cvAnalysis.threshold, 0, 200), { shouldValidate: true });
    form.setValue("cvAttemptSource", preset.cvAnalysis.source, { shouldValidate: true });
  };

  const runs =
    runMode === "resin"
      ? Math.max(1, Math.floor(clampInteger(resinInput, 20, Number.MAX_SAFE_INTEGER) / 20))
      : clampInteger(runsInput, 1, Number.MAX_SAFE_INTEGER);
  const targetProb = clampNumber(targetProbInput, 0.01, 0.99);
  const upgradeK = clampInteger(upgradeKInput, 0, 5);
  const recycleRate = clampNumber(recycleRatePctInput, 0, 100) / 100;
  const transmuterCraftCap = clampInteger(transmuterMaxCrafts, 0, Number.MAX_SAFE_INTEGER);
  const cvThreshold = clampNumber(cvThresholdInput, 0, 200);
  const efficiencyDays = clampInteger(efficiencyDaysInput, 1, 365);
  const efficiencyResinPerDay = clampInteger(efficiencyResinInput, 60, 400);
  const stopPointThresholdPerDay = clampNumber(stopPointThresholdPctInput, 0, 100) / 100;
  const stopPointConsecutiveDays = clampInteger(stopPointConsecutiveDaysInput, 1, 30);

  const effectiveRule =
    selectedCount === 0
      ? ({ mode: "all" } as const)
      : ruleMode === "all"
        ? ({ mode: "all" } as const)
        : ({ mode: "atLeast", n: clampedAtLeastN } as const);

  const upgradeTargetGroup = useMemo((): SubStat[] => {
    switch (upgradePreset) {
      case "crit":
        return [SubStat.CritRate, SubStat.CritDmg];
      case "er":
        return [SubStat.EnergyRecharge];
      case "em":
        return [SubStat.ElementalMastery];
      case "custom":
      default:
        return Array.from(new Set(upgradeCustomGroup));
    }
  }, [upgradeCustomGroup, upgradePreset]);

  const params = useMemo(
    () => ({
      slot,
      main: effectiveMain,
      requiredSubs: desiredSubs,
      subsRule: effectiveRule,
    }),
    [desiredSubs, effectiveMain, effectiveRule, slot],
  );

  const upgradeRequirement = useMemo(
    () =>
      upgradeEnabled
        ? {
            enabled: true as const,
            targetGroup: upgradeTargetGroup,
            k: upgradeK,
          }
        : undefined,
    [upgradeEnabled, upgradeK, upgradeTargetGroup],
  );

  const transmuterConfig = useMemo(
    () => ({
      enabled: transmuterEnabled,
      elixirsAvailable: clampInteger(transmuterElixirs, 0, Number.MAX_SAFE_INTEGER),
      slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
      maxCraftsPerPeriod: transmuterCraftCap,
    }),
    [transmuterCraftCap, transmuterElixirs, transmuterEnabled],
  );

  const transmuterChoice = useMemo(
    () => ({
      fixedMain: effectiveMain,
      fixedSubs: Array.from(new Set(transmuterFixedSubs)),
    }),
    [effectiveMain, transmuterFixedSubs],
  );

  const cvTransmuterSourceInvalid =
    (cvAttemptSource as AttemptSource) === "transmuter" && (!transmuterEnabled || transmuterFixedSubs.length !== 2);
  const showCvControls = cvEnabled || (optimizerEnabled && optimizerObjective === "cv");

  const calculations = useMemo(() => {
    try {
      const success = probSuccessPerAttempt(params, upgradeRequirement);

      const pRunCandidate = probPerRunFromAttempt(success.pAttemptCandidate);
      const pRunSuccess = probSuccessPerRunFromAttemptSuccess(success.pAttemptSuccess);
      const period = probSuccessAfterPeriodCombined(
        params,
        upgradeRequirement,
        runs,
        recycleRate,
        transmuterConfig,
        transmuterChoice,
      );

      const pSuccessInRuns =
        farmStrategy === "domainsOnly"
          ? period.domainsOnlySuccess
          : farmStrategy === "strongbox"
            ? period.domainsPlusStrongboxSuccess
            : farmStrategy === "transmuterOnly"
              ? period.transmuterOnlySuccess
              : period.combinedSuccess;

      const runs50 =
        farmStrategy === "domainsOnly"
          ? runsForTargetChance(pRunSuccess, 0.5)
          : farmStrategy === "strongbox"
            ? runsForTargetChanceWithStrongbox(params, upgradeRequirement, 0.5, recycleRate)
            : farmStrategy === "transmuterOnly"
              ? period.transmuterOnlySuccess >= 0.5
                ? 0
                : Number.POSITIVE_INFINITY
              : runsForTargetChanceWithStrongbox(params, upgradeRequirement, 0.5, recycleRate);
      const runs90 =
        farmStrategy === "domainsOnly"
          ? runsForTargetChance(pRunSuccess, 0.9)
          : farmStrategy === "strongbox"
            ? runsForTargetChanceWithStrongbox(params, upgradeRequirement, 0.9, recycleRate)
            : farmStrategy === "transmuterOnly"
              ? period.transmuterOnlySuccess >= 0.9
                ? 0
                : Number.POSITIVE_INFINITY
              : runsForTargetChanceWithStrongbox(params, upgradeRequirement, 0.9, recycleRate);
      const runsTarget =
        farmStrategy === "domainsOnly"
          ? runsForTargetChance(pRunSuccess, targetProb)
          : farmStrategy === "strongbox"
            ? runsForTargetChanceWithStrongbox(params, upgradeRequirement, targetProb, recycleRate)
            : farmStrategy === "transmuterOnly"
              ? period.transmuterOnlySuccess >= targetProb
                ? 0
                : Number.POSITIVE_INFINITY
              : runsForTargetChanceWithStrongbox(params, upgradeRequirement, targetProb, recycleRate);

      const expected = expectedRuns(pRunSuccess);

      return {
        breakdown: success.breakdown,
        pAttemptCandidate: success.pAttemptCandidate,
        pAttemptSuccess: success.pAttemptSuccess,
        pRunCandidate,
        pRunSuccess,
        pSuccessInRuns,
        runs50,
        runs90,
        runsTarget,
        expected,
        period,
        error: null as string | null,
      };
    } catch (error) {
      return {
        breakdown: { pSet: 0, pSlot: 0, pMain: 0, pSubs: 0, pUpgradeCond: 0 },
        pAttemptCandidate: 0,
        pAttemptSuccess: 0,
        pRunCandidate: 0,
        pRunSuccess: 0,
        pSuccessInRuns: 0,
        runs50: Number.POSITIVE_INFINITY,
        runs90: Number.POSITIVE_INFINITY,
        runsTarget: Number.POSITIVE_INFINITY,
        expected: Number.POSITIVE_INFINITY,
        period: {
          domainsOnlySuccess: 0,
          domainsPlusStrongboxSuccess: 0,
          transmuterOnlySuccess: 0,
          combinedSuccess: 0,
          transmuterCrafts: 0,
          transmuterAttemptSuccess: 0,
        },
        error: error instanceof Error ? error.message : "Failed to calculate probabilities.",
      };
    }
  }, [
    farmStrategy,
    params,
    recycleRate,
    runs,
    targetProb,
    transmuterChoice,
    transmuterConfig,
    upgradeRequirement,
  ]);

  const cvResults = useMemo(() => {
    if (!cvEnabled || cvTransmuterSourceInvalid) {
      return {
        stats: null as
          | {
              pCandidateAttempt: number;
              expectedCvGivenCandidate: number;
              pCvAtLeastGivenCandidate: number;
              pCvAtLeastPerAttempt: number;
            }
          | null,
        error: null as string | null,
      };
    }

    try {
      const stats = critValueStats(
        params,
        cvAttemptSource,
        upgradeRequirement,
        transmuterConfig,
        transmuterChoice,
        cvThreshold,
      );

      return {
        stats,
        error: null as string | null,
      };
    } catch (error) {
      return {
        stats: null,
        error: error instanceof Error ? error.message : "Failed to calculate CV stats.",
      };
    }
  }, [
    cvAttemptSource,
    cvEnabled,
    cvThreshold,
    cvTransmuterSourceInvalid,
    params,
    transmuterChoice,
    transmuterConfig,
    upgradeRequirement,
  ]);

  const optimizerBaseInput = useMemo(
    () => ({
      objective: optimizerObjective,
      params,
      upgrade: upgradeRequirement,
      recycleRate,
      transmuterConfig,
      transmuterChoice,
      cvThreshold,
    }),
    [
      cvThreshold,
      optimizerObjective,
      params,
      recycleRate,
      transmuterChoice,
      transmuterConfig,
      upgradeRequirement,
    ],
  );

  const optimizerResults = useMemo(() => {
    if (!optimizerEnabled) {
      return {
        all: [] as Array<{
          name: string;
          objective: "constraints" | "cv";
          pSuccess: number;
          details?: { runs: number; recycleRate: number; crafts: number; note?: string };
        }>,
        best: null as
          | {
              name: string;
              objective: "constraints" | "cv";
              pSuccess: number;
              details?: { runs: number; recycleRate: number; crafts: number; note?: string };
            }
          | null,
        error: null as string | null,
      };
    }

    try {
      const all = evaluateStrategies({ ...optimizerBaseInput, runs });
      return {
        all,
        best: bestStrategy(all),
        error: null as string | null,
      };
    } catch (error) {
      return {
        all: [],
        best: null,
        error: error instanceof Error ? error.message : "Failed to evaluate strategies.",
      };
    }
  }, [optimizerBaseInput, optimizerEnabled, runs]);

  const optimizerRunTargets = useMemo(() => {
    if (!optimizerEnabled) {
      return [] as Array<{
        name: string;
        runs50: number;
        runs90: number;
        runsTarget: number;
      }>;
    }

    const input = {
      ...optimizerBaseInput,
      runs,
    } as const;

    const strategyNames = [
      "Domains only",
      "Domains + Strongbox",
      "Transmuter only (period)",
      "Combined (Domains+Strongbox + Transmuter)",
    ] as const;

    return strategyNames.map((name) => ({
      name,
      runs50: runsForTargetChanceStrategy(input, name, 0.5),
      runs90: runsForTargetChanceStrategy(input, name, 0.9),
      runsTarget: runsForTargetChanceStrategy(input, name, targetProb),
    }));
  }, [optimizerBaseInput, optimizerEnabled, runs, targetProb]);

  const efficiencyCurveResults = useMemo(() => {
    if (!showEfficiencyCurve) {
      return {
        curve: null as ReturnType<typeof generateEfficiencyCurve> | null,
        chartData: [] as EfficiencyChartPoint[],
        error: null as string | null,
      };
    }

    try {
      const curve = generateEfficiencyCurve({
        baseInput: optimizerBaseInput,
        resinPerDay: efficiencyResinPerDay,
        daysMax: efficiencyDays,
        stepDays: 1,
      });

      const chartData = curve.series.map((point) => ({
        day: point.day,
        resin: point.resin,
        runs: point.runs,
        domainsOnlyPower: point.domainsOnly * 100,
        domainsStrongboxPower: point.domainsStrongbox * 100,
        transmuterOnlyPower: point.transmuterOnly * 100,
        combinedPower: point.combined * 100,
      }));

      return {
        curve,
        chartData,
        error: null as string | null,
      };
    } catch (error) {
      return {
        curve: null,
        chartData: [],
        error: error instanceof Error ? error.message : "Failed to generate efficiency curve.",
      };
    }
  }, [efficiencyDays, efficiencyResinPerDay, optimizerBaseInput, showEfficiencyCurve]);

  const stopPointStrategyKey = useMemo<
    "domainsOnly" | "domainsStrongbox" | "combined"
  >(() => {
    if (farmStrategy === "combined") {
      return "combined";
    }
    if (globalStrategyScope === "domainsOnly") {
      return "domainsOnly";
    }
    return "domainsStrongbox";
  }, [farmStrategy, globalStrategyScope]);

  const stopPointStrategyLabel = useMemo(() => {
    if (stopPointStrategyKey === "domainsOnly") {
      return tr("results.strategyDomainsOnly");
    }
    if (stopPointStrategyKey === "domainsStrongbox") {
      return tr("results.strategyDomainsStrongbox");
    }
    return tr("results.strategyCombined");
  }, [stopPointStrategyKey, tr]);

  const stopPointRecommendation = useMemo(() => {
    if (!showEfficiencyCurve || !showStopPointRecommendation || !efficiencyCurveResults.curve) {
      return null;
    }

    const series = efficiencyCurveResults.curve.series.map((point) => ({
      day: point.day,
      resin: point.resin,
      runs: point.runs,
      value:
        stopPointStrategyKey === "domainsOnly"
          ? point.domainsOnly
          : stopPointStrategyKey === "domainsStrongbox"
            ? point.domainsStrongbox
            : point.combined,
    }));

    try {
      return findStopPoint({
        series,
        thresholdPerDay: stopPointThresholdPerDay,
        consecutiveDays: stopPointConsecutiveDays,
        minDay: 7,
        fallbackDay: efficiencyDays,
      });
    } catch {
      return null;
    }
  }, [
    efficiencyCurveResults.curve,
    efficiencyDays,
    showEfficiencyCurve,
    showStopPointRecommendation,
    stopPointConsecutiveDays,
    stopPointStrategyKey,
    stopPointThresholdPerDay,
  ]);

  const cvThresholdLabel = Number.isFinite(cvThresholdInput)
    ? String(clampNumber(cvThresholdInput, 0, 200))
    : String(cvThreshold);

  const summary = useMemo(() => {
    const subsText =
      desiredSubs.length > 0
        ? desiredSubs.map((sub) => localizeSubStat(sub, locale)).join(", ")
        : tr("summary.noSubConstraint");
    const ruleText =
      desiredSubs.length === 0
        ? tr("summary.noSubConstraint")
        : effectiveRule.mode === "all"
          ? tr("inputs.ruleAll")
          : tr("summary.ruleAtLeast", { n: effectiveRule.n });

    const upgradeText = !upgradeEnabled
      ? tr("summary.upgradeDisabled")
      : `K>=${upgradeK} [${upgradeTargetGroup.map((sub) => localizeSubStat(sub, locale)).join(", ") || tr("summary.emptyGroup")}]`;

    const strategyText = strategyLabelFromFarmStrategy(farmStrategy, locale);

    return [
      tr("summary.targetSet", { value: targetSet }),
      tr("summary.slot", { value: localizeSlot(slot, locale) }),
      tr("summary.main", { value: localizeMainStat(effectiveMain, locale) }),
      tr("summary.subs", { value: subsText }),
      tr("summary.rule", { value: ruleText }),
      tr("summary.upgrade", { value: upgradeText }),
      tr("summary.strategy", { value: strategyText }),
      tr("summary.transmuterCrafts", { value: calculations.period.transmuterCrafts }),
      tr("summary.successRuns", { runs, value: formatPct(calculations.pSuccessInRuns) }),
      tr("summary.runs50", { value: formatRuns(calculations.runs50) }),
      tr("summary.runs90", { value: formatRuns(calculations.runs90) }),
      tr("summary.expectedRuns", { value: formatExpectedRuns(calculations.expected) }),
    ].join("\n");
  }, [calculations.expected, calculations.pSuccessInRuns, calculations.period.transmuterCrafts, calculations.runs50, calculations.runs90, desiredSubs, effectiveMain, effectiveRule, farmStrategy, locale, runs, slot, targetSet, tr, upgradeEnabled, upgradeK, upgradeTargetGroup]);

  const copySummary = async () => {
    if (!navigator.clipboard || calculations.error) {
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      // Ignore clipboard write failures to keep interaction lightweight.
    }
  };

  const copyShareLink = async () => {
    if (typeof window === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      const safeState = sanitizeArtifactCalculatorShareState(
        form.getValues() as ArtifactCalculatorShareState,
        defaultValues,
      );
      const cfg = encodeArtifactCalculatorShareState(safeState, {
        lang: locale,
        theme: selectedTheme,
      });
      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.set("cfg", cfg);

      await navigator.clipboard.writeText(shareUrl.toString());
      setShareCopied(true);
      if (shareCopiedTimerRef.current) {
        clearTimeout(shareCopiedTimerRef.current);
      }
      shareCopiedTimerRef.current = setTimeout(() => setShareCopied(false), 1200);
    } catch {
      // Ignore clipboard write failures to keep interaction lightweight.
    }
  };

  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (presetId === PRESET_NONE) {
      return;
    }

    const preset = getArtifactPresetById(presetId);
    if (!preset) {
      return;
    }
    applyPreset(preset);
  };

  const suggestedPresetId = useMemo(
    () => suggestPresetFromCharacter(activeEnka.selectedCharacter),
    [activeEnka.selectedCharacter],
  );
  const suggestedPresetLabelKey = suggestedPresetId ? PRESET_NAME_KEYS_BY_ID[suggestedPresetId] : null;
  const damageIndexConfig = useMemo<ExpectedDamageSimpleObjectiveConfig>(
    () => ({
      id: "expected_damage_simple",
      scaling: {
        stat: damageIndexScalingStat,
        multiplier: damageIndexMultiplier,
        flat: damageIndexFlat,
      },
      damageType: damageIndexDamageType,
      useCrit: damageIndexUseCrit,
    }),
    [damageIndexDamageType, damageIndexFlat, damageIndexMultiplier, damageIndexScalingStat, damageIndexUseCrit],
  );
  const damageIndexResult = useMemo(
    () => computeDamageIndexFromEnka(activeEnka.selectedCharacter, damageIndexConfig),
    [activeEnka.selectedCharacter, damageIndexConfig],
  );
  const artifactPriorityReport = useMemo<ArtifactPriorityReport | null>(() => {
    if (!activeEnka.selectedCharacter) {
      return null;
    }
    return analyzeArtifactPriorities(activeEnka.selectedCharacter, analysisProfileId);
  }, [activeEnka.selectedCharacter, analysisProfileId]);
  const resinRecommendationReport = useMemo<ResinRecommendationReport | null>(() => {
    if (!artifactPriorityReport) {
      return null;
    }
    return computeResinRecommendations(
      artifactPriorityReport,
      optimizerBaseInput,
      efficiencyResinPerDay,
    );
  }, [artifactPriorityReport, efficiencyResinPerDay, optimizerBaseInput]);
  const focusGlobalEfficiencyReport = useMemo<FocusGlobalEfficiencyReport | null>(() => {
    if (!artifactPriorityReport) {
      return null;
    }
    return computeFocusGlobalEfficiency(
      artifactPriorityReport,
      slot,
      optimizerBaseInput,
      efficiencyResinPerDay,
      globalFlexSlot,
      globalStrategyScope,
    );
  }, [
    artifactPriorityReport,
    efficiencyResinPerDay,
    globalFlexSlot,
    globalStrategyScope,
    optimizerBaseInput,
    slot,
  ]);
  const focusGlobalEfficiencySummary = useMemo(() => {
    if (!focusGlobalEfficiencyReport) {
      return null;
    }

    const focusAttempt = focusGlobalEfficiencyReport.totals.expectedGainAttemptFocus;
    const collateralAttempt = includeGlobalEfficiency
      ? focusGlobalEfficiencyReport.totals.expectedGainAttemptCollateral
      : 0;
    const totalAttempt = focusAttempt + collateralAttempt;
    const expectedGainPerRun = 0.935 * totalAttempt + 0.065 * (2 * totalAttempt);
    const expectedGainPerDay = expectedGainPerRun * (focusGlobalEfficiencyReport.resinPerDay / 20);
    const focusSharePct = totalAttempt <= 0 ? 0 : (focusAttempt / totalAttempt) * 100;
    const collateralSharePct = totalAttempt <= 0 ? 0 : (collateralAttempt / totalAttempt) * 100;
    const topCollateralSlots = includeGlobalEfficiency
      ? [...focusGlobalEfficiencyReport.perSlot]
          .filter((item) => !item.isFocus)
          .sort((a, b) => b.expectedGainAttempt - a.expectedGainAttempt)
          .slice(0, 2)
      : [];

    const pAttemptAny = clampNumber(
      includeGlobalEfficiency
        ? focusGlobalEfficiencyReport.totals.pAttemptAny
        : focusGlobalEfficiencyReport.perSlot.find((item) => item.isFocus)?.pAttempt ?? 0,
      0,
      1,
    );

    return {
      expectedGainPerDay,
      focusSharePct,
      collateralSharePct,
      topCollateralSlots,
      pAttemptAny,
      focusAttempt,
      collateralAttempt,
      totalAttempt,
    };
  }, [focusGlobalEfficiencyReport, includeGlobalEfficiency]);

  const focusGlobalScopeStrategyName = useMemo(() => {
    return globalStrategyScope === "domainsStrongbox" ? "Domains + Strongbox" : "Domains only";
  }, [globalStrategyScope]);
  const compactArtifactChips = useMemo(() => {
    const bySlot = new Map<
      Slot,
      {
        mainLabel: string;
        setLabel: string | null;
        setIconUrl: string | null;
      }
    >();
    for (const artifact of activeEnka.selectedCharacter?.artifacts ?? []) {
      const artifactSlot = mapEnkaEquipTypeToSlot(artifact.equipType);
      if (!artifactSlot || bySlot.has(artifactSlot)) {
        continue;
      }

      const mainLabel = artifact.main?.key
        ? localizeMainStatFromEnkaKey(artifact.main.key, locale)
        : "\u2014";
      const resolvedSet = resolveArtifactSet(artifact.setId, gameDataLite);
      const setLabel =
        localizeGameDataName(resolvedSet?.raw, locale as "en" | "pt-BR") ??
        artifact.setName ??
        null;
      const setIconUrl = resolvedSet?.iconUrl ?? artifact.setIconUrl ?? null;
      bySlot.set(artifactSlot, { mainLabel, setLabel, setIconUrl });
    }

    return SLOT_OPTIONS.map((slotOption) => ({
      slot: slotOption,
      mainLabel: bySlot.get(slotOption)?.mainLabel ?? "\u2014",
      setLabel: bySlot.get(slotOption)?.setLabel ?? null,
      setIconUrl: bySlot.get(slotOption)?.setIconUrl ?? null,
    }));
  }, [activeEnka.selectedCharacter, gameDataLite, locale]);
  const selectedCharacterResolved = useMemo(
    () => resolveCharacter(activeEnka.selectedCharacter?.avatarId, gameDataLite),
    [activeEnka.selectedCharacter?.avatarId, gameDataLite],
  );
  const selectedWeaponResolved = useMemo(
    () => resolveWeapon(activeEnka.selectedCharacter?.weapon?.id, gameDataLite),
    [activeEnka.selectedCharacter?.weapon?.id, gameDataLite],
  );
  const selectedCharacterName = localizeGameDataName(selectedCharacterResolved?.raw, locale as "en" | "pt-BR");
  const selectedWeaponName = localizeGameDataName(selectedWeaponResolved?.raw, locale as "en" | "pt-BR");
  const recommendedPlanFocusSlot = artifactPriorityReport?.topPriorities[0] ?? slot;
  const recommendedPlanFocusReport = artifactPriorityReport?.slots.find(
    (slotReport) => slotReport.slot === recommendedPlanFocusSlot,
  );
  const recommendedPlanFocusSuggestion = recommendedPlanFocusReport?.suggestedFocus;
  const recommendedPlanStrategyLabel =
    optimizerEnabled && optimizerResults.best
      ? strategyLabel(optimizerResults.best.name, locale)
      : strategyLabel(focusGlobalScopeStrategyName, locale);
  const recommendedPlanExpectedGainLabel = focusGlobalEfficiencySummary
    ? formatPct(focusGlobalEfficiencySummary.expectedGainPerDay)
    : "\u2014";
  const recommendedPlanStopDayLabel = stopPointRecommendation
    ? formatRuns(stopPointRecommendation.stopDay)
    : "\u2014";
  const recommendedPlanStopThresholdLabel = `${stopPointThresholdPctInput.toFixed(2)}%/day`;
  const planImportErrorMessage = activeEnka.error
    ? activeEnka.error === "BAD_UID"
      ? tr("enkaActive.errorBadUid")
      : activeEnka.error === "RATE_LIMITED"
        ? tr("enkaActive.errorRateLimited")
        : activeEnka.error === "NETWORK_ERROR"
          ? tr("enkaActive.errorNetwork")
          : tr("enkaActive.errorGeneric")
    : null;

  const applySuggestedPreset = () => {
    if (!suggestedPresetId) {
      return;
    }
    handlePresetSelect(suggestedPresetId);
  };

  const applyAnalysisFocus = (focus: ArtifactPriorityReport["slots"][number]["suggestedFocus"] | undefined) => {
    if (!focus) {
      return;
    }

    setSelectedPresetId(PRESET_NONE);
    form.setValue("slot", focus.slot, { shouldValidate: true });

    const currentMain = form.getValues("main");
    const nextMain = resolveMainForSlot(focus.slot, focus.mainStat ?? currentMain);
    form.setValue("main", nextMain, { shouldValidate: true });

    const excludedForMain = excludedSubStatForMain(nextMain);
    const nextDesiredSubs = focus.desiredSubs
      ? uniqueSubStats(focus.desiredSubs, excludedForMain)
      : form.getValues("desiredSubs");
    form.setValue("desiredSubs", nextDesiredSubs, { shouldValidate: true });

    if (focus.subsRule) {
      if (focus.subsRule.mode === "atLeast") {
        form.setValue("ruleMode", "atLeast", { shouldValidate: true });
        form.setValue("atLeastN", clampInteger(focus.subsRule.n, 0, nextDesiredSubs.length), {
          shouldValidate: true,
        });
      } else {
        form.setValue("ruleMode", "all", { shouldValidate: true });
        form.setValue("atLeastN", 0, { shouldValidate: true });
      }
    }

    if (focus.objectiveMode === "cv") {
      form.setValue("optimizerEnabled", true, { shouldValidate: true });
      form.setValue("optimizerObjective", "cv", { shouldValidate: true });
      form.setValue("cvEnabled", true, { shouldValidate: true });
      if (focus.cvThreshold !== undefined) {
        form.setValue("cvThreshold", clampNumber(focus.cvThreshold, 0, 200), { shouldValidate: true });
      }
      return;
    }

    form.setValue("optimizerEnabled", true, { shouldValidate: true });
    form.setValue("optimizerObjective", "constraints", { shouldValidate: true });
  };
  const applyRecommendedPlanFocus = () => {
    if (!recommendedPlanFocusSuggestion) {
      return;
    }
    applyAnalysisFocus(recommendedPlanFocusSuggestion);
    setActiveMainTab("advanced");
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{tr("app.title")}</h1>
            <Badge variant="secondary">{tr("app.deterministic")}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{tr("locale.label")}</label>
              <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">{tr("locale.en")}</SelectItem>
                  <SelectItem value="pt-BR">{tr("locale.ptBR")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">{tr("theme.label")}</label>
              <Select
                value={selectedTheme}
                onValueChange={(value) => setTheme(value)}
                disabled={!mounted}
              >
                <SelectTrigger className="w-[165px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">
                    <span className="inline-flex items-center gap-2">
                      <Monitor className="size-4" />
                      {tr("theme.system")}
                    </span>
                  </SelectItem>
                  <SelectItem value="light">
                    <span className="inline-flex items-center gap-2">
                      <Sun className="size-4" />
                      {tr("theme.light")}
                    </span>
                  </SelectItem>
                  <SelectItem value="dark">
                    <span className="inline-flex items-center gap-2">
                      <Moon className="size-4" />
                      {tr("theme.dark")}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">{tr("app.assumptions")}</p>
      </header>

      <Tabs
        value={activeMainTab}
        onValueChange={(value) => setActiveMainTab(value as MainTab)}
        className="space-y-4"
      >
        <TabsList className="w-full justify-start">
          <TabsTrigger value="plan">{tr("tabs.plan")}</TabsTrigger>
          <TabsTrigger value="details">{tr("tabs.details")}</TabsTrigger>
          <TabsTrigger value="advanced">{tr("tabs.advanced")}</TabsTrigger>
        </TabsList>

        <TabsContent value="plan" className="space-y-4">
          {activeEnka.ref && (
            <Card>
              <CardHeader className="space-y-1 pb-3">
                <CardTitle>{tr("planImport.title")}</CardTitle>
                <CardDescription>{tr("planImport.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {activeEnka.isLoading && (
                  <div className="space-y-2">
                    <div className="h-4 w-56 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-64 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-72 animate-pulse rounded bg-muted" />
                  </div>
                )}

                {!activeEnka.isLoading && planImportErrorMessage && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                    {planImportErrorMessage}
                  </p>
                )}

                {!activeEnka.isLoading && !activeEnka.error && activeEnka.selectedCharacter && (
                  <>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <div className="flex items-center gap-2">
                        {selectedCharacterResolved?.iconUrl && (
                          <img
                            alt={selectedCharacterName ?? tr("enkaActive.unknown")}
                            className="h-10 w-10 rounded border object-cover"
                            src={selectedCharacterResolved.iconUrl}
                          />
                        )}
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {selectedCharacterName ??
                              tr("enkaActive.characterId", {
                                id: activeEnka.selectedCharacter.avatarId ?? tr("enkaActive.unknown"),
                              })}
                          </p>
                          {selectedCharacterName && (
                            <p className="text-muted-foreground text-xs">
                              {tr("enkaActive.characterId", {
                                id: activeEnka.selectedCharacter.avatarId ?? tr("enkaActive.unknown"),
                              })}
                            </p>
                          )}
                          <p className="text-muted-foreground text-xs">
                            {tr("enkaActive.level")}: {activeEnka.selectedCharacter.level ?? "\u2014"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-md border px-2 py-1">
                        {(selectedWeaponResolved?.iconUrl ?? activeEnka.selectedCharacter.weapon?.iconUrl) && (
                          <img
                            alt={tr("enkaActive.weapon")}
                            className="h-8 w-8 rounded border object-cover"
                            src={selectedWeaponResolved?.iconUrl ?? activeEnka.selectedCharacter.weapon?.iconUrl}
                          />
                        )}
                        <div className="text-xs">
                          <p className="font-medium">{selectedWeaponName ?? tr("enkaActive.weapon")}</p>
                          <p className="text-muted-foreground">
                            {tr("enkaActive.weaponLevel")}: {activeEnka.selectedCharacter.weapon?.level ?? "\u2014"}
                          </p>
                          <div className="flex items-center gap-2">
                            {selectedWeaponResolved?.rarity && (
                              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                {"★".repeat(selectedWeaponResolved.rarity)}
                              </Badge>
                            )}
                            {selectedWeaponResolved?.weaponType && (
                              <p className="text-muted-foreground">{selectedWeaponResolved.weaponType}</p>
                            )}
                          </div>
                          {activeEnka.selectedCharacter.weapon?.id && (
                            <p className="text-muted-foreground">ID: {activeEnka.selectedCharacter.weapon.id}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">{tr("planImport.artifacts")}</p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {compactArtifactChips.map((chip) => (
                          <div key={`plan-chip-${chip.slot}`} className="rounded-md border bg-muted/15 px-2 py-1.5 text-xs">
                            <p className="font-medium">{localizeSlot(chip.slot, locale)}: {chip.mainLabel}</p>
                            {chip.setLabel && (
                              <p className="mt-0.5 inline-flex items-center gap-1 text-muted-foreground">
                                {chip.setIconUrl && (
                                  <img
                                    alt={chip.setLabel}
                                    className="h-3.5 w-3.5 rounded border object-cover"
                                    src={chip.setIconUrl}
                                  />
                                )}
                                <span>{tr("enkaActive.set")}: {chip.setLabel}</span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {!activeEnka.isLoading && !activeEnka.error && !activeEnka.selectedCharacter && (
                  <p className="text-muted-foreground text-sm">{tr("planImport.noCharacter")}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" type="button" variant="outline">
                    <Link href="/import">{tr("enkaActive.changeCharacter")}</Link>
                  </Button>
                  <Button size="sm" type="button" variant="outline" onClick={activeEnka.refresh}>
                    {tr("enkaActive.refresh")}
                  </Button>
                  <Button size="sm" type="button" variant="destructive" onClick={activeEnka.clear}>
                    {tr("enkaActive.clearImport")}
                  </Button>
                  <Button size="sm" type="button" variant="ghost" onClick={() => setActiveMainTab("details")}>
                    {tr("planImport.viewFullDetails")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {artifactPriorityReport && (
            <>
              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-xl">{tr("recommendedPlan.title")}</CardTitle>
                  <CardDescription>{tr("recommendedPlan.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 rounded-md border p-4">
                    <p className="text-sm">
                      <span className="text-muted-foreground">{tr("recommendedPlan.farmStrategy")}: </span>
                      <span className="font-medium">{recommendedPlanStrategyLabel}</span>
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">{tr("recommendedPlan.focusSlot")}: </span>
                      <span className="font-medium">{localizeSlot(recommendedPlanFocusSlot, locale)}</span>
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">{tr("recommendedPlan.stopAround")}: </span>
                      <span className="font-medium">
                        {tr("recommendedPlan.stopWithThreshold", {
                          days: recommendedPlanStopDayLabel,
                          threshold: recommendedPlanStopThresholdLabel,
                        })}
                      </span>
                    </p>
                    {focusGlobalEfficiencySummary && (
                      <p className="text-muted-foreground text-xs">
                        {tr("recommendedPlan.expectedGainPerDay", { value: recommendedPlanExpectedGainLabel })}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      disabled={!recommendedPlanFocusSuggestion}
                      onClick={applyRecommendedPlanFocus}
                    >
                      {tr("recommendedPlan.applyFocus")}
                    </Button>
                    <Button size="sm" type="button" variant="ghost" onClick={() => setActiveMainTab("advanced")}>
                      {tr("recommendedPlan.advancedSettings")}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle>{tr("recommendedPlan.prioritiesTitle")}</CardTitle>
                  <CardDescription>{tr("recommendedPlan.prioritiesDescription")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    {artifactPriorityReport.topPriorities.slice(0, 2).map((slotName) => {
                      const slotReport = artifactPriorityReport.slots.find((item) => item.slot === slotName);
                      if (!slotReport) {
                        return null;
                      }

                      return (
                        <div key={`plan-priority-${slotName}`} className="space-y-2 rounded-md border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">{localizeSlot(slotName, locale)}</p>
                            <Badge variant={priorityBadgeVariant(slotReport.priority)}>
                              {tr(`analysis.priority.${slotReport.priority}`)}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground text-xs">
                            {tr("recommendedPlan.priorityScore", {
                              value: (slotReport.slotScore * 100).toFixed(1),
                            })}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {slotReport.reasons.length > 0
                              ? slotReport.reasons.map((reason) => tr(`analysis.reasons.${reason}`)).join(", ")
                              : tr("analysis.reasons.ok")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" type="button" variant="outline" onClick={() => setActiveMainTab("details")}>
                      {tr("recommendedPlan.viewAllDetails")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{tr("results.efficiencyCurve")}</CardTitle>
              <CardDescription>{tr("results.compareStrategies")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={showEfficiencyCurve}
                  onCheckedChange={(value) => setShowEfficiencyCurve(value === true)}
                />
                <label className="text-sm font-medium">{tr("results.showEfficiencyCurve")}</label>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,180px)_minmax(0,180px)_1fr]">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tr("results.daysHorizon")}</label>
                  <Input
                    max={365}
                    min={1}
                    type="number"
                    value={efficiencyDaysInput}
                    onChange={(event) => setEfficiencyDaysInput(clampInteger(Number(event.target.value), 1, 365))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tr("results.resinPerDay")}</label>
                  <Input
                    max={400}
                    min={60}
                    type="number"
                    value={efficiencyResinInput}
                    onChange={(event) => setEfficiencyResinInput(clampInteger(Number(event.target.value), 60, 400))}
                  />
                </div>
                <p className="text-muted-foreground text-xs md:self-end">{tr("results.naturalRegen")}</p>
              </div>

              {showEfficiencyCurve && efficiencyCurveResults.error && (
                <p className="text-destructive text-xs">{efficiencyCurveResults.error}</p>
              )}

              {showEfficiencyCurve && !efficiencyCurveResults.error && (
                <>
                  <div className="h-72 w-full">
                    <ResponsiveContainer height="100%" width="100%">
                      <LineChart data={efficiencyCurveResults.chartData} margin={{ top: 8, right: 20, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis allowDecimals={false} dataKey="day" />
                        <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={52} />
                        <Tooltip
                          formatter={(value, name) => [
                            `${(Number(value) || 0).toFixed(2)}%`,
                            name ?? "",
                          ]}
                          labelFormatter={(_, payload) => {
                            const point = payload?.[0]?.payload as EfficiencyChartPoint | undefined;
                            if (!point) {
                              return "";
                            }
                            return `${tr("results.day")}: ${point.day} | ${tr("results.resin")}: ${formatRuns(point.resin)} | ${tr("inputs.runs")}: ${formatRuns(point.runs)}`;
                          }}
                        />
                        <Line
                          dataKey="domainsOnlyPower"
                          dot={false}
                          name={tr("results.strategyDomainsOnly")}
                          stroke={EFFICIENCY_LINE_COLORS.domainsOnly}
                          strokeWidth={2}
                          type="monotone"
                        />
                        <Line
                          dataKey="domainsStrongboxPower"
                          dot={false}
                          name={tr("results.strategyDomainsStrongbox")}
                          stroke={EFFICIENCY_LINE_COLORS.domainsStrongbox}
                          strokeWidth={2}
                          type="monotone"
                        />
                        <Line
                          dataKey="transmuterOnlyPower"
                          dot={false}
                          name={tr("results.strategyTransmuterOnly")}
                          stroke={EFFICIENCY_LINE_COLORS.transmuterOnly}
                          strokeWidth={2}
                          type="monotone"
                        />
                        <Line
                          dataKey="combinedPower"
                          dot={false}
                          name={tr("results.strategyCombined")}
                          stroke={EFFICIENCY_LINE_COLORS.combined}
                          strokeWidth={2}
                          type="monotone"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {efficiencyCurveResults.curve && (
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm font-medium">{tr("results.milestones")}</p>
                        <p className="text-muted-foreground text-xs">{tr("results.daysToReach")}</p>
                      </div>
                      <div className="overflow-x-auto rounded-md border">
                        <table className="w-full min-w-[580px] text-xs">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="px-3 py-2 text-left">{tr("inputs.farmStrategy")}</th>
                              <th className="px-3 py-2 text-left">50%</th>
                              <th className="px-3 py-2 text-left">75%</th>
                              <th className="px-3 py-2 text-left">90%</th>
                              <th className="px-3 py-2 text-left">95%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              {
                                label: tr("results.strategyDomainsOnly"),
                                milestones: efficiencyCurveResults.curve.milestones.domainsOnly,
                              },
                              {
                                label: tr("results.strategyDomainsStrongbox"),
                                milestones: efficiencyCurveResults.curve.milestones.domainsStrongbox,
                              },
                              {
                                label: tr("results.strategyTransmuterOnly"),
                                milestones: efficiencyCurveResults.curve.milestones.transmuterOnly,
                              },
                              {
                                label: tr("results.strategyCombined"),
                                milestones: efficiencyCurveResults.curve.milestones.combined,
                              },
                            ].map((row) => (
                              <tr key={`milestone-plan-${row.label}`} className="border-t">
                                <td className="px-3 py-2 font-medium">{row.label}</td>
                                <td className="px-3 py-2">
                                  {formatDaysWithResin(row.milestones.p50, efficiencyResinPerDay)}
                                </td>
                                <td className="px-3 py-2">
                                  {formatDaysWithResin(row.milestones.p75, efficiencyResinPerDay)}
                                </td>
                                <td className="px-3 py-2">
                                  {formatDaysWithResin(row.milestones.p90, efficiencyResinPerDay)}
                                </td>
                                <td className="px-3 py-2">
                                  {formatDaysWithResin(row.milestones.p95, efficiencyResinPerDay)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{tr("results.stopPoint.title")}</CardTitle>
              <CardDescription>{tr("results.stopPoint.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={showStopPointRecommendation}
                  onCheckedChange={(value) => setShowStopPointRecommendation(value === true)}
                />
                <label className="text-sm font-medium">{tr("results.stopPoint.show")}</label>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,200px)_minmax(0,220px)_1fr]">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tr("results.stopPoint.threshold")}</label>
                  <Input
                    min={0}
                    step={0.05}
                    type="number"
                    value={stopPointThresholdPctInput}
                    onChange={(event) =>
                      setStopPointThresholdPctInput(
                        clampNumber(Number(event.target.value), 0, 100),
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tr("results.stopPoint.consecutiveDays")}</label>
                  <Input
                    min={1}
                    type="number"
                    value={stopPointConsecutiveDaysInput}
                    onChange={(event) =>
                      setStopPointConsecutiveDaysInput(
                        clampInteger(Number(event.target.value), 1, 30),
                      )
                    }
                  />
                </div>
                <div className="md:self-end">
                  <p className="text-muted-foreground text-xs">
                    {tr("results.stopPoint.strategy", { value: stopPointStrategyLabel })}
                  </p>
                </div>
              </div>

              {showStopPointRecommendation && !showEfficiencyCurve && (
                <p className="text-muted-foreground text-sm">{tr("results.stopPoint.enableCurve")}</p>
              )}

              {showStopPointRecommendation &&
                showEfficiencyCurve &&
                !efficiencyCurveResults.error &&
                stopPointRecommendation && (
                  <div className="space-y-2 rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      {tr("results.stopPoint.stopAround", { days: formatRuns(stopPointRecommendation.stopDay) })}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {tr("results.stopPoint.valueAtStop", {
                        value: formatPct(stopPointRecommendation.at.value),
                      })}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {tr("results.stopPoint.costAtStop", {
                        resin: formatRuns(stopPointRecommendation.at.resin),
                        runs: formatRuns(stopPointRecommendation.at.runs),
                      })}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {tr("results.stopPoint.marginalAtStop", {
                        value: formatPct(stopPointRecommendation.at.marginal),
                      })}
                    </p>
                    <p className="text-muted-foreground text-xs">{tr("results.stopPoint.explanation")}</p>
                  </div>
                )}
            </CardContent>
          </Card>

          {farmStrategy === "combined" && (
            <p className="text-muted-foreground text-xs">{tr("results.optimizerCombinedNote")}</p>
          )}
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
      {activeEnka.ref && (
        <div className="space-y-3">
          <EnkaActiveCard
            data={activeEnka.data}
            error={activeEnka.error}
            isLoading={activeEnka.isLoading}
            locale={locale}
            selectedCharacter={activeEnka.selectedCharacter}
            uid={activeEnka.ref.uid}
            onClear={activeEnka.clear}
            onRefresh={activeEnka.refresh}
          />
          {activeEnka.selectedCharacter && suggestedPresetLabelKey && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {tr("enkaActive.suggestedPreset")}: {tr(suggestedPresetLabelKey)}
              </Badge>
              <Button size="sm" type="button" variant="outline" onClick={applySuggestedPreset}>
                {tr("enkaActive.applySuggestedPreset")}
              </Button>
            </div>
          )}
          {activeEnka.selectedCharacter && (
            <Card className="shadow-none">
              <CardHeader className="space-y-1">
                <CardTitle>{tr("damageIndex.title")}</CardTitle>
                <CardDescription>{tr("damageIndex.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{tr("damageIndex.scalingStat")}</label>
                    <Select
                      value={damageIndexScalingStat}
                      onValueChange={(value) => setDamageIndexScalingStat(value as DamageIndexScalingStat)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAMAGE_INDEX_SCALING_OPTIONS.map((option) => (
                          <SelectItem key={`damage-index-scaling-${option}`} value={option}>
                            {tr(`damageIndex.scalingOptions.${option}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">{tr("damageIndex.damageType")}</label>
                    <Select
                      value={damageIndexDamageType}
                      onValueChange={(value) => setDamageIndexDamageType(value as DamageIndexType)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAMAGE_INDEX_DAMAGE_TYPES.map((option) => (
                          <SelectItem key={`damage-index-type-${option}`} value={option}>
                            {tr(`damageIndex.damageTypeOptions.${option}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={damageIndexUseCrit}
                    onCheckedChange={(value) => setDamageIndexUseCrit(value === true)}
                  />
                  <label className="text-sm font-medium">{tr("damageIndex.includeCrit")}</label>
                </div>

                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    {tr("damageIndex.advanced")}
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">{tr("damageIndex.multiplier")}</label>
                      <Input
                        step={0.1}
                        type="number"
                        value={damageIndexMultiplier}
                        onChange={(event) =>
                          setDamageIndexMultiplier(parseNumberOrFallback(event.target.value, 1))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">{tr("damageIndex.flat")}</label>
                      <Input
                        step={1}
                        type="number"
                        value={damageIndexFlat}
                        onChange={(event) => setDamageIndexFlat(parseNumberOrFallback(event.target.value, 0))}
                      />
                    </div>
                  </div>
                </details>

                <div className="rounded-md border bg-muted/20 p-4">
                  <p className="text-muted-foreground text-xs">{tr("damageIndex.score")}</p>
                  <p className="text-2xl font-semibold">
                    {formatDamageIndexNumber(damageIndexResult.score, locale)}
                  </p>
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">{tr("damageIndex.base")}</p>
                    <p className="font-semibold">
                      {formatDamageIndexNumber(damageIndexResult.breakdown.base, locale)}
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">{tr("damageIndex.dmgBonus")}</p>
                    <p className="font-semibold">
                      {formatDamageIndexPercent(damageIndexResult.breakdown.dmgBonus, locale)}
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">{tr("damageIndex.critMult")}</p>
                    <p className="font-semibold">
                      {formatDamageIndexMultiplier(damageIndexResult.breakdown.critMult, locale)}
                    </p>
                  </div>
                </div>

                <p className="text-muted-foreground text-xs">{tr("damageIndex.disclaimer")}</p>
              </CardContent>
            </Card>
          )}
          {activeEnka.selectedCharacter && artifactPriorityReport && (
            <>
              <Card>
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle>{tr("analysis.title")}</CardTitle>
                      <CardDescription>{tr("analysis.description")}</CardDescription>
                    </div>
                    <div className="min-w-[220px] space-y-1">
                      <label className="text-sm font-medium">{tr("analysis.profileLabel")}</label>
                      <Select
                        value={analysisProfileId}
                        onValueChange={(value) => setAnalysisProfileId(value as BuildProfileId)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUILD_PROFILE_OPTIONS.map((profileOption) => (
                            <SelectItem key={profileOption} value={profileOption}>
                              {tr(`analysis.profile.${profileOption}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{tr("analysis.currentPower")}</span>
                      <span className="text-sm">{(artifactPriorityReport.powerCurrent * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(artifactPriorityReport.powerCurrent * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">{tr("analysis.powerNote")}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">{tr("analysis.table.slot")}</th>
                          <th className="px-3 py-2 text-left font-medium">{tr("analysis.table.mainStat")}</th>
                          <th className="px-3 py-2 text-left font-medium">{tr("analysis.table.score")}</th>
                          <th className="px-3 py-2 text-left font-medium">{tr("analysis.table.priority")}</th>
                          <th className="px-3 py-2 text-left font-medium">{tr("analysis.table.reasons")}</th>
                          <th className="px-3 py-2 text-right font-medium">{tr("analysis.table.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {artifactPriorityReport.slots.map((slotReport) => (
                          <tr key={`analysis-${slotReport.slot}`} className="border-t">
                            <td className="px-3 py-2">{localizeSlot(slotReport.slot, locale)}</td>
                            <td className="px-3 py-2">
                              {slotReport.mainKey ? localizeEvalStatKey(slotReport.mainKey, locale) : tr("enkaActive.unknown")}
                            </td>
                            <td className="px-3 py-2">{(slotReport.slotScore * 100).toFixed(1)}%</td>
                            <td className="px-3 py-2">
                              <Badge variant={priorityBadgeVariant(slotReport.priority)}>
                                {tr(`analysis.priority.${slotReport.priority}`)}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {slotReport.reasons.length > 0
                                ? slotReport.reasons.map((reason) => tr(`analysis.reasons.${reason}`)).join(", ")
                                : tr("analysis.reasons.ok")}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                size="sm"
                                type="button"
                                variant="outline"
                                disabled={!slotReport.suggestedFocus}
                                onClick={() => applyAnalysisFocus(slotReport.suggestedFocus)}
                              >
                                {tr("analysis.focus")}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <p className="font-medium">
                      {tr("analysis.topPriorities", {
                        value: artifactPriorityReport.topPriorities.map((slotName) => localizeSlot(slotName, locale)).join(", "),
                      })}
                    </p>
                    <p className="text-muted-foreground text-xs">{tr("analysis.tip")}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-3">
                  <div className="space-y-1">
                    <CardTitle>{tr("analysis.focusGlobal.title")}</CardTitle>
                    <CardDescription>{tr("analysis.focusGlobal.description")}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={includeGlobalEfficiency}
                      onCheckedChange={(value) => setIncludeGlobalEfficiency(value === true)}
                    />
                    <label className="text-sm font-medium">
                      {tr("analysis.focusGlobal.includeIncidental")}
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">{tr("analysis.focusGlobal.flexSlot")}</label>
                      <Select
                        value={globalFlexSlot}
                        onValueChange={(value) => setGlobalFlexSlot(value as Slot)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SLOT_OPTIONS.map((slotOption) => (
                            <SelectItem key={`global-flex-${slotOption}`} value={slotOption}>
                              {localizeSlot(slotOption, locale)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">{tr("analysis.focusGlobal.strategyScope")}</label>
                      <Select
                        value={globalStrategyScope}
                        onValueChange={(value) => setGlobalStrategyScope(value as FocusGlobalStrategyScope)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GLOBAL_STRATEGY_SCOPE_OPTIONS.map((scopeOption) => (
                            <SelectItem key={`global-scope-${scopeOption}`} value={scopeOption}>
                              {tr(`analysis.focusGlobal.scope.${scopeOption}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {focusGlobalEfficiencySummary && (
                    <>
                      <div className="rounded-md border p-3 text-sm">
                        <p>
                          <span className="text-muted-foreground">{tr("analysis.focusGlobal.focusedSlot")}: </span>
                          {localizeSlot(slot, locale)}
                        </p>
                        <p>
                          <span className="text-muted-foreground">{tr("analysis.focusGlobal.activeScope")}: </span>
                          {strategyLabel(focusGlobalScopeStrategyName, locale)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {tr("analysis.focusGlobal.expectedGainPerDay", {
                            value: formatPct(focusGlobalEfficiencySummary.expectedGainPerDay),
                          })}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {tr("analysis.focusGlobal.pAttemptAny", {
                            value: formatPct(focusGlobalEfficiencySummary.pAttemptAny),
                          })}
                        </p>
                      </div>

                      <div className="rounded-md border p-3 text-sm">
                        <p className="font-medium">{tr("analysis.focusGlobal.breakdown")}</p>
                        <p className="text-muted-foreground mt-2 text-xs">
                          {tr("analysis.focusGlobal.focusShare", {
                            value: formatPct(focusGlobalEfficiencySummary.focusSharePct / 100),
                          })}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {tr("analysis.focusGlobal.collateralShare", {
                            value: formatPct(focusGlobalEfficiencySummary.collateralSharePct / 100),
                          })}
                        </p>
                      </div>

                      <div className="rounded-md border p-3 text-sm">
                        <p className="font-medium">{tr("analysis.focusGlobal.topCollateral")}</p>
                        <div className="mt-2 space-y-1">
                          {focusGlobalEfficiencySummary.topCollateralSlots.length === 0 && (
                            <p className="text-muted-foreground text-xs">{tr("analysis.focusGlobal.noCollateral")}</p>
                          )}
                          {focusGlobalEfficiencySummary.topCollateralSlots.map((item) => (
                            <p key={`global-contributor-${item.slot}`} className="text-muted-foreground text-xs">
                              {localizeSlot(item.slot, locale)}:{" "}
                              {formatPct(item.expectedGainAttempt)}
                            </p>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {resinRecommendationReport && (
                <Card>
                  <CardHeader className="space-y-1">
                    <CardTitle>{tr("analysis.resin.title")}</CardTitle>
                    <CardDescription>
                      {tr("analysis.resin.usingResinPerDay", { value: resinRecommendationReport.resinPerDay })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {resinRecommendationReport.items.map((item) => (
                      <div key={`resin-recommendation-${item.slot}`} className="space-y-2 rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{localizeSlot(item.slot, locale)}</p>
                          <Badge variant={priorityBadgeVariant(item.priority)}>{tr(`analysis.priority.${item.priority}`)}</Badge>
                        </div>
                        <p className="text-sm">
                          <span className="text-muted-foreground">{tr("analysis.resin.bestStrategy")}: </span>
                          {strategyLabel(item.bestStrategyName, locale)}
                        </p>
                        <p className="text-sm">
                          {tr("analysis.resin.timeEstimate", {
                            days50: formatRuns(item.days50),
                            days90: formatRuns(item.days90),
                          })}
                        </p>
                        {item.expectedNote.length > 0 && (
                          <p className="text-muted-foreground text-xs">
                            {item.expectedNote.map((note) => strategyNoteLabel(note, locale)).join(" | ")}
                          </p>
                        )}
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => applyAnalysisFocus(item.focus)}
                        >
                          {tr("analysis.resin.focusSlot")}
                        </Button>
                      </div>
                    ))}
                    {resinRecommendationReport.items.length === 0 && (
                      <p className="text-muted-foreground text-sm">{tr("analysis.resin.noData")}</p>
                    )}
                    <p className="text-muted-foreground text-xs">{tr("analysis.resin.disclaimer")}</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {optimizerEnabled && (
        <>
          <Card className="border-primary/50 bg-primary/5 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{tr("results.optimizerRecommended")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {optimizerResults.error && (
                <p className="text-destructive text-xs">{optimizerResults.error}</p>
              )}
              {!optimizerResults.error && optimizerResults.best && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{strategyLabel(optimizerResults.best.name, locale)}</p>
                    <Badge variant="secondary">{formatPct(optimizerResults.best.pSuccess)}</Badge>
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-xs">
                    <li>{explainWhyWin(optimizerResults.best.name, optimizerResults.best.objective, locale)}</li>
                    <li>
                      {tr("results.optimizerResources", {
                        runs: optimizerResults.best.details?.runs ?? runs,
                        recycle: Math.round((optimizerResults.best.details?.recycleRate ?? recycleRate) * 100),
                        crafts: optimizerResults.best.details?.crafts ?? 0,
                      })}
                    </li>
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{tr("results.optimizerAllStrategies")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {optimizerResults.all.map((result) => (
                <div
                  key={`optimizer-details-${result.name}`}
                  className="grid gap-2 rounded-md border px-3 py-2 text-xs md:grid-cols-[1.2fr_0.6fr_1fr]"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{strategyLabel(result.name, locale)}</span>
                      {requiresTransmuter(result.name) && (
                        <Badge variant="outline">{tr("results.optimizerRequiresTransmuter")}</Badge>
                      )}
                    </div>
                    {result.details?.note && (
                      <p className="text-muted-foreground">{strategyNoteLabel(result.details.note, locale)}</p>
                    )}
                  </div>
                  <div className="font-semibold">{formatPct(result.pSuccess)}</div>
                  <div className="text-muted-foreground">
                    {tr("results.optimizerListDetail", {
                      runs: result.details?.runs ?? runs,
                      recycle: Math.round((result.details?.recycleRate ?? recycleRate) * 100),
                      crafts: result.details?.crafts ?? 0,
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{tr("results.optimizerRunsNeeded")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {optimizerRunTargets.map((targetRow) => {
                const detail = optimizerResults.all.find((row) => row.name === targetRow.name)?.details;
                const transmuterOnly = targetRow.name === "Transmuter only (period)";
                const combined = targetRow.name === "Combined (Domains+Strongbox + Transmuter)";

                return (
                  <div key={`run-target-details-${targetRow.name}`} className="space-y-2 rounded-md border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-sm">{strategyLabel(targetRow.name, locale)}</span>
                      {transmuterOnly && <Badge variant="outline">{tr("results.optimizerFixedByCrafts")}</Badge>}
                      {combined && <Badge variant="outline">{tr("results.optimizerCraftsFixed")}</Badge>}
                    </div>
                    <div className="grid gap-2 text-xs sm:grid-cols-3">
                      <div>
                        <p className="text-muted-foreground">{tr("results.metricRuns50")}</p>
                        <p className="font-semibold">{formatRunsWithResin(targetRow.runs50, tr("inputs.resin"))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{tr("results.metricRuns90")}</p>
                        <p className="font-semibold">{formatRunsWithResin(targetRow.runs90, tr("inputs.resin"))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          {tr("results.optimizerRunsForTarget", { target: formatPct(targetProb) })}
                        </p>
                        <p className="font-semibold">
                          {formatRunsWithResin(targetRow.runsTarget, tr("inputs.resin"))}
                        </p>
                      </div>
                    </div>
                    {detail?.note && (
                      <p className="text-muted-foreground text-xs">{strategyNoteLabel(detail.note, locale)}</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{tr("inputs.title")}</CardTitle>
            <CardDescription>{tr("inputs.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium">{tr("inputs.presets")}</label>
                <Button type="button" variant="outline" onClick={copyShareLink}>
                  {shareCopied ? tr("inputs.linkCopied") : tr("inputs.copyShareLink")}
                </Button>
              </div>
              <Select onValueChange={handlePresetSelect} value={selectedPresetId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tr("inputs.choosePreset")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PRESET_NONE}>{tr("inputs.customCurrent")}</SelectItem>
                  {ARTIFACT_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {presetLabel(preset, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">{tr("inputs.presetsNote")}</p>
            </div>

            <Separator />

            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("inputs.targetSet")}</label>
              <Controller
                control={form.control}
                name="targetSet"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_SETS.map((setName) => (
                        <SelectItem key={setName} value={setName}>
                          {tr("inputs.setLabel", { set: setName })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("inputs.slot")}</label>
              <Controller
                control={form.control}
                name="slot"
                render={({ field }) => (
                  <Select onValueChange={(value: Slot) => field.onChange(value)} value={field.value}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLOT_OPTIONS.map((slotOption) => (
                        <SelectItem key={slotOption} value={slotOption}>
                          {localizeSlot(slotOption, locale)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("inputs.mainStat")}</label>
              {slot === Slot.Flower || slot === Slot.Plume ? (
                <p className="text-muted-foreground rounded-md border px-3 py-2 text-sm">
                  {localizeMainStat(effectiveMain, locale)} {tr("inputs.fixed")}
                </p>
              ) : (
                <Controller
                  control={form.control}
                  name="main"
                  render={({ field }) => (
                    <Select onValueChange={(value: MainStat) => field.onChange(value)} value={field.value}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAIN_OPTIONS_BY_SLOT[slot].map((mainOption) => (
                          <SelectItem key={mainOption} value={mainOption}>
                            {localizeMainStat(mainOption, locale)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <label className="text-sm font-medium">{tr("inputs.desiredSubstats")}</label>
              <Controller
                control={form.control}
                name="desiredSubs"
                render={({ field }) => (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {SUBSTAT_OPTIONS.map((sub) => {
                      const checked = field.value.includes(sub);
                      const disabled = excludedSub === sub;
                      return (
                        <label
                          key={sub}
                          className={`flex items-center gap-2 rounded-md border p-2 text-sm ${
                            disabled ? "bg-muted/50 text-muted-foreground" : ""
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(value) => {
                              if (disabled) {
                                return;
                              }
                              if (value === true && !checked) {
                                field.onChange([...field.value, sub]);
                                return;
                              }
                              if (value === false && checked) {
                                field.onChange(field.value.filter((item) => item !== sub));
                              }
                            }}
                          />
                          <span>{localizeSubStat(sub, locale)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              />
              {excludedSub && (
                <p className="text-muted-foreground text-xs">
                  {tr("inputs.excludedMain", { stat: localizeSubStat(excludedSub, locale) })}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">{tr("inputs.rule")}</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    className="size-4"
                    type="radio"
                    value="all"
                    {...form.register("ruleMode")}
                    checked={ruleMode === "all"}
                  />
                  {tr("inputs.ruleAll")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    className="size-4"
                    type="radio"
                    value="atLeast"
                    {...form.register("ruleMode")}
                    checked={ruleMode === "atLeast"}
                  />
                  {tr("inputs.ruleAtLeast")}
                </label>
              </div>
              {ruleMode === "atLeast" && (
                <div className="space-y-1">
                  <Input
                    max={Math.max(selectedCount, 0)}
                    min={0}
                    type="number"
                    {...form.register("atLeastN", { valueAsNumber: true })}
                  />
                  {form.formState.errors.atLeastN && (
                    <p className="text-destructive text-xs">{tr("inputs.errorAtLeastN")}</p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Controller
                  control={form.control}
                  name="upgradeEnabled"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(value) => field.onChange(value === true)}
                    />
                  )}
                />
                <label className="text-sm font-medium">{tr("inputs.upgradeRequirement")}</label>
              </div>

              {upgradeEnabled && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{tr("inputs.targetGroup")}</label>
                    <Controller
                      control={form.control}
                      name="upgradePreset"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="crit">{tr("inputs.targetGroupCrit")}</SelectItem>
                            <SelectItem value="er">{tr("inputs.targetGroupEr")}</SelectItem>
                            <SelectItem value="em">{tr("inputs.targetGroupEm")}</SelectItem>
                            <SelectItem value="custom">{tr("inputs.targetGroupCustom")}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  {upgradePreset === "custom" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{tr("inputs.customGroupSubstats")}</label>
                      <Controller
                        control={form.control}
                        name="upgradeCustomGroup"
                        render={({ field }) => (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {SUBSTAT_OPTIONS.map((sub) => {
                              const checked = field.value.includes(sub);
                              const disabled = excludedSub === sub;
                              return (
                                <label
                                  key={`upgrade-${sub}`}
                                  className={`flex items-center gap-2 rounded-md border p-2 text-sm ${
                                    disabled ? "bg-muted/50 text-muted-foreground" : ""
                                  }`}
                                >
                                  <Checkbox
                                    checked={checked}
                                    disabled={disabled}
                                    onCheckedChange={(value) => {
                                      if (disabled) {
                                        return;
                                      }
                                      if (value === true && !checked) {
                                        field.onChange([...field.value, sub]);
                                        return;
                                      }
                                      if (value === false && checked) {
                                        field.onChange(field.value.filter((item) => item !== sub));
                                      }
                                    }}
                                  />
                                  <span>{localizeSubStat(sub, locale)}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{tr("inputs.upgradeK")}</label>
                    <Input min={0} max={5} type="number" {...form.register("upgradeK", { valueAsNumber: true })} />
                    <p className="text-muted-foreground text-xs">
                      {tr("inputs.upgradeKNote")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Controller
                  control={form.control}
                  name="transmuterEnabled"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(value) => field.onChange(value === true)}
                    />
                  )}
                />
                <label className="text-sm font-medium">{tr("inputs.transmuterTitle")}</label>
              </div>

              {transmuterEnabled && (
                <div className="space-y-4 rounded-md border p-3">
                  <p className="text-muted-foreground text-xs">{tr("inputs.transmuterInfo")}</p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">{tr("inputs.elixirsAvailable")}</label>
                      <Input
                        min={0}
                        type="number"
                        {...form.register("transmuterElixirs", { valueAsNumber: true })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">{tr("inputs.maxCraftsPerPeriod")}</label>
                      <Input
                        min={0}
                        type="number"
                        {...form.register("transmuterMaxCrafts", { valueAsNumber: true })}
                      />
                    </div>
                  </div>

                  <p className="text-muted-foreground text-xs">
                    {DEFAULT_TRANSMUTER_SLOT_COST[slot] > 1
                      ? tr("inputs.slotCostPlural", {
                          slot: localizeSlot(slot, locale),
                          cost: DEFAULT_TRANSMUTER_SLOT_COST[slot],
                        })
                      : tr("inputs.slotCost", {
                          slot: localizeSlot(slot, locale),
                          cost: DEFAULT_TRANSMUTER_SLOT_COST[slot],
                        })}
                  </p>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{tr("inputs.fixedSubstats")}</label>
                    <Controller
                      control={form.control}
                      name="transmuterFixedSubs"
                      render={({ field }) => (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {SUBSTAT_OPTIONS.map((sub) => {
                            const checked = field.value.includes(sub);
                            const disabledBecauseMain = excludedSub === sub;
                            const disabledBecauseMax = !checked && field.value.length >= 2;
                            const disabled = disabledBecauseMain || disabledBecauseMax;

                            return (
                              <label
                                key={`transmuter-${sub}`}
                                className={`flex items-center gap-2 rounded-md border p-2 text-sm ${
                                  disabled ? "bg-muted/50 text-muted-foreground" : ""
                                }`}
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={disabled}
                                  onCheckedChange={(value) => {
                                    if (value === true && !checked && field.value.length < 2) {
                                      field.onChange([...field.value, sub]);
                                      return;
                                    }
                                    if (value === false && checked) {
                                      field.onChange(field.value.filter((item) => item !== sub));
                                    }
                                  }}
                                />
                                <span>{localizeSubStat(sub, locale)}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    />
                    <p className="text-muted-foreground text-xs">
                      {tr("inputs.selectedFixed", { count: transmuterFixedSubs.length })}
                    </p>
                    {form.formState.errors.transmuterFixedSubs && (
                      <p className="text-destructive text-xs">
                        {tr("inputs.errorFixedSubstats")}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <label className="text-sm font-medium">{tr("inputs.farmStrategy")}</label>
              <Controller
                control={form.control}
                name="farmStrategy"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domainsOnly">{tr("inputs.strategyDomainsOnly")}</SelectItem>
                      <SelectItem value="strongbox">{tr("inputs.strategyStrongbox")}</SelectItem>
                      <SelectItem value="transmuterOnly">{tr("inputs.strategyTransmuterOnly")}</SelectItem>
                      <SelectItem value="combined">{tr("inputs.strategyCombined")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />

              {(farmStrategy === "strongbox" || farmStrategy === "combined") && (
                <div className="space-y-2 rounded-md border p-3">
                  <label className="text-sm font-medium">{tr("inputs.recycleStrongbox")}</label>
                  <Input
                    min={0}
                    max={100}
                    step={1}
                    type="number"
                    {...form.register("recycleRatePct", { valueAsNumber: true })}
                  />
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <label className="text-sm font-medium">{tr("inputs.farmingHorizon")}</label>
              <Tabs
                value={runMode}
                onValueChange={(value) => form.setValue("runMode", value as FormValues["runMode"])}
              >
                <TabsList>
                  <TabsTrigger value="runs">{tr("inputs.runs")}</TabsTrigger>
                  <TabsTrigger value="resin">{tr("inputs.resin")}</TabsTrigger>
                </TabsList>
                <TabsContent value="runs" className="space-y-2">
                  <Input min={1} type="number" {...form.register("runs", { valueAsNumber: true })} />
                  <p className="text-muted-foreground text-xs">{tr("inputs.runsClamp")}</p>
                </TabsContent>
                <TabsContent value="resin" className="space-y-2">
                  <Input min={20} step={20} type="number" {...form.register("resin", { valueAsNumber: true })} />
                  <p className="text-muted-foreground text-xs">
                    {tr("inputs.resinToRuns", {
                      resin: clampInteger(resinInput, 20, Number.MAX_SAFE_INTEGER),
                      runs,
                    })}
                  </p>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("inputs.targetProbability")}</label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => form.setValue("targetProb", 0.5, { shouldValidate: true })}
                >
                  50%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => form.setValue("targetProb", 0.9, { shouldValidate: true })}
                >
                  90%
                </Button>
              </div>
              <Input
                max={0.99}
                min={0.01}
                step={0.01}
                type="number"
                {...form.register("targetProb", { valueAsNumber: true })}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Controller
                  control={form.control}
                  name="cvEnabled"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(value) => field.onChange(value === true)}
                    />
                  )}
                />
                <label className="text-sm font-medium">{tr("inputs.cvEnabled")}</label>
              </div>

              {showCvControls && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{tr("inputs.cvThreshold")}</label>
                    <Input
                      min={0}
                      max={200}
                      step={0.1}
                      type="number"
                      {...form.register("cvThreshold", { valueAsNumber: true })}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">{tr("inputs.cvAttemptSource")}</label>
                    <Controller
                      control={form.control}
                      name="cvAttemptSource"
                      render={({ field }) => (
                        <Select onValueChange={(value: AttemptSource) => field.onChange(value)} value={field.value}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="domain">{localizeAttemptSource("domain", locale)}</SelectItem>
                            <SelectItem value="strongbox">{localizeAttemptSource("strongbox", locale)}</SelectItem>
                            <SelectItem value="transmuter">{localizeAttemptSource("transmuter", locale)}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <p className="text-muted-foreground text-xs">{tr("inputs.cvNote")}</p>
                  {!cvEnabled && optimizerEnabled && optimizerObjective === "cv" && (
                    <p className="text-muted-foreground text-xs">{tr("inputs.cvFromOptimizer")}</p>
                  )}

                  {cvTransmuterSourceInvalid && (
                    <p className="text-destructive text-xs">
                      {tr("inputs.cvTransmuterInvalid")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Controller
                  control={form.control}
                  name="optimizerEnabled"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(value) => field.onChange(value === true)}
                    />
                  )}
                />
                <label className="text-sm font-medium">{tr("inputs.showRecommendation")}</label>
              </div>

              {optimizerEnabled && (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{tr("inputs.objective")}</label>
                    <Controller
                      control={form.control}
                      name="optimizerObjective"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="constraints">{tr("inputs.objectiveConstraints")}</SelectItem>
                            <SelectItem value="cv">{tr("inputs.objectiveCv")}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  {optimizerObjective === "cv" && (
                    <p className="text-muted-foreground text-xs">
                      {tr("inputs.objectiveCvUsing", { value: cvThresholdLabel })}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {tr("inputs.objectiveTargetProb", { value: formatPct(targetProb) })}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>{tr("results.title")}</CardTitle>
              <CardDescription>{tr("results.description")}</CardDescription>
            </div>
            <Button disabled={Boolean(calculations.error)} type="button" variant="outline" onClick={copySummary}>
              {copied ? tr("results.copied") : tr("results.copySummary")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {(farmStrategy === "strongbox" || farmStrategy === "combined") && (
              <Badge>{tr("results.strongboxGuaranteed")}</Badge>
            )}
            {calculations.error && <p className="text-destructive text-sm">{calculations.error}</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label={tr("results.metricPSet")} value={formatPct(calculations.breakdown.pSet)} />
              <MetricCard label={tr("results.metricPSlot")} value={formatPct(calculations.breakdown.pSlot)} />
              <MetricCard label={tr("results.metricPMain")} value={formatPct(calculations.breakdown.pMain)} />
              <MetricCard label={tr("results.metricPSubs")} value={formatPct(calculations.breakdown.pSubs)} />
              <MetricCard
                label={tr("results.metricPAttemptCandidate")}
                value={formatPct(calculations.pAttemptCandidate)}
              />
              <MetricCard label={tr("results.metricPRunCandidate")} value={formatPct(calculations.pRunCandidate)} />
              {upgradeEnabled && (
                <>
                  <MetricCard
                    label={tr("results.metricPUpgradeGivenCandidate")}
                    value={formatPct(calculations.breakdown.pUpgradeCond)}
                  />
                  <MetricCard
                    label={tr("results.metricPSuccessAttempt")}
                    value={formatPct(calculations.pAttemptSuccess)}
                  />
                  <MetricCard label={tr("results.metricPSuccessRun")} value={formatPct(calculations.pRunSuccess)} />
                </>
              )}
              {transmuterEnabled && (
                <>
                  <MetricCard
                    label={tr("results.metricTransmuterCraftsPossible")}
                    value={formatRuns(calculations.period.transmuterCrafts)}
                  />
                  <MetricCard
                    label={tr("results.metricPSuccessFromTransmuter")}
                    value={formatPct(calculations.period.transmuterOnlySuccess)}
                  />
                </>
              )}
              <MetricCard
                label={tr("results.metricPSuccessInRuns", { runs })}
                value={formatPct(calculations.pSuccessInRuns)}
              />
              <MetricCard
                label={tr("results.metricRunsForTarget", { target: formatPct(targetProb) })}
                value={formatRuns(calculations.runsTarget)}
              />
              <MetricCard label={tr("results.metricRuns50")} value={formatRuns(calculations.runs50)} />
              <MetricCard label={tr("results.metricRuns90")} value={formatRuns(calculations.runs90)} />
              <MetricCard
                label={
                  farmStrategy === "combined"
                    ? tr("results.metricExpectedRunsDomain")
                    : tr("results.metricExpectedRuns")
                }
                value={formatExpectedRuns(calculations.expected)}
              />
            </div>

            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{tr("results.cvTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {!cvEnabled && (
                  <p className="text-muted-foreground text-sm">
                    {tr("results.cvEnableNote")}
                  </p>
                )}
                {cvEnabled && cvTransmuterSourceInvalid && (
                  <p className="text-destructive text-xs">
                    {tr("inputs.cvTransmuterInvalid")}
                  </p>
                )}
                {cvEnabled && !cvTransmuterSourceInvalid && cvResults.error && (
                  <p className="text-destructive text-xs">{cvResults.error}</p>
                )}

                <div className="space-y-2 text-sm">
                  <CvMetricRow
                    label={tr("results.cvExpectedGivenCandidate")}
                    value={
                      cvEnabled && !cvTransmuterSourceInvalid && cvResults.stats
                        ? formatCv(cvResults.stats.expectedCvGivenCandidate)
                        : "\u2014"
                    }
                  />
                  <CvMetricRow
                    label={tr("results.cvAtLeastGivenCandidate", { threshold: cvThresholdLabel })}
                    value={
                      cvEnabled && !cvTransmuterSourceInvalid && cvResults.stats
                        ? formatPct(cvResults.stats.pCvAtLeastGivenCandidate)
                        : "\u2014"
                    }
                  />
                  <CvMetricRow
                    label={tr("results.cvAtLeastPerAttempt", { threshold: cvThresholdLabel })}
                    value={
                      cvEnabled && !cvTransmuterSourceInvalid && cvResults.stats
                        ? formatPct(cvResults.stats.pCvAtLeastPerAttempt)
                        : "\u2014"
                    }
                  />
                </div>
              </CardContent>
            </Card>

          </CardContent>
        </Card>
      </div>
        </TabsContent>
      </Tabs>

      <footer className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground sm:text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            {appName} v{appVersion}
          </span>
          <span>locale: {debugLocaleValue}</span>
          <span>theme: {debugThemeValue}</span>
        </div>
      </footer>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}

function CvMetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <Badge className="font-normal" variant="secondary">
        {label}
      </Badge>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function requiresTransmuter(strategyName: string): boolean {
  return (
    strategyName === "Transmuter only (period)" ||
    strategyName === "Combined (Domains+Strongbox + Transmuter)"
  );
}

function explainWhyWin(strategyName: string, objective: "constraints" | "cv", locale: Locale): string {
  const translate = (key: string) => t(locale, key);
  if (strategyName === "Domains only") {
    return objective === "cv"
      ? translate("strategy.whyDomainsCv")
      : translate("strategy.whyDomainsConstraints");
  }
  if (strategyName === "Domains + Strongbox") {
    return objective === "cv"
      ? translate("strategy.whyStrongboxCv")
      : translate("strategy.whyStrongboxConstraints");
  }
  if (strategyName === "Transmuter only (period)") {
    return objective === "cv"
      ? translate("strategy.whyTransmuterCv")
      : translate("strategy.whyTransmuterConstraints");
  }
  return objective === "cv"
    ? translate("strategy.whyCombinedCv")
    : translate("strategy.whyCombinedConstraints");
}

function strategyLabel(strategyName: string, locale: Locale): string {
  if (strategyName === "Domains only") {
    return t(locale, "strategy.domainsOnly");
  }
  if (strategyName === "Domains + Strongbox") {
    return t(locale, "strategy.domainsStrongbox");
  }
  if (strategyName === "Transmuter only (period)") {
    return t(locale, "strategy.transmuterOnly");
  }
  return t(locale, "strategy.combined");
}

function strategyLabelFromFarmStrategy(strategy: FormValues["farmStrategy"], locale: Locale): string {
  if (strategy === "domainsOnly") {
    return t(locale, "strategy.domainsOnly");
  }
  if (strategy === "strongbox") {
    return t(locale, "strategy.domainsStrongbox");
  }
  if (strategy === "transmuterOnly") {
    return t(locale, "strategy.transmuterOnly");
  }
  return t(locale, "strategy.combined");
}

function strategyNoteLabel(note: string, locale: Locale): string {
  if (note === "Transmuter is disabled.") {
    return t(locale, "strategy.noteDisabled");
  }
  if (note === "No transmuter crafts available this period.") {
    return t(locale, "strategy.noteNoCrafts");
  }
  return note;
}

function presetLabel(preset: ArtifactPreset, locale: Locale): string {
  const key = PRESET_NAME_KEYS_BY_ID[preset.id];
  return key ? t(locale, key) : preset.name;
}

function localizeSlot(slot: Slot, locale: Locale): string {
  return t(locale, SLOT_LABEL_KEYS[slot]);
}

function localizeMainStat(main: MainStat, locale: Locale): string {
  return t(locale, MAIN_STAT_LABEL_KEYS[main]);
}

function localizeSubStat(sub: SubStat, locale: Locale): string {
  return t(locale, SUBSTAT_LABEL_KEYS[sub]);
}

function localizeEvalStatKey(statKey: StatKey, locale: Locale): string {
  return t(locale, STAT_KEY_LABEL_KEYS[statKey]);
}

function localizeMainStatFromEnkaKey(mainKey: string, locale: Locale): string {
  const mapped = mapEnkaStatToStatKey(mainKey);
  if (mapped) {
    return localizeEvalStatKey(mapped, locale);
  }
  return mainKey;
}

function localizeAttemptSource(source: AttemptSource, locale: Locale): string {
  return t(locale, ATTEMPT_SOURCE_LABEL_KEYS[source]);
}

function priorityBadgeVariant(priority: "high" | "medium" | "low"): "destructive" | "secondary" | "outline" {
  if (priority === "high") {
    return "destructive";
  }
  if (priority === "medium") {
    return "secondary";
  }
  return "outline";
}

function isShareTheme(value: unknown): value is ShareTheme {
  return value === "system" || value === "light" || value === "dark";
}

function mapPresetFarmStrategy(strategy: ArtifactPreset["farmStrategy"]): FormValues["farmStrategy"] {
  if (strategy === "domain") {
    return "domainsOnly";
  }
  if (strategy === "strongbox") {
    return "strongbox";
  }
  if (strategy === "transmuter") {
    return "transmuterOnly";
  }
  return "combined";
}

function inferUpgradePreset(group: SubStat[]): FormValues["upgradePreset"] {
  if (group.length === 1 && group[0] === SubStat.EnergyRecharge) {
    return "er";
  }
  if (group.length === 1 && group[0] === SubStat.ElementalMastery) {
    return "em";
  }
  if (group.length === 2 && group.includes(SubStat.CritRate) && group.includes(SubStat.CritDmg)) {
    return "crit";
  }
  return "custom";
}

function normalizeMainForSlot(slot: Slot, main: MainStat): MainStat {
  if (slot === Slot.Flower) {
    return MainStat.FlatHp;
  }
  if (slot === Slot.Plume) {
    return MainStat.FlatAtk;
  }
  return main;
}

function resolveMainForSlot(slot: Slot, main: MainStat | undefined): MainStat {
  if (!main) {
    const preferredMain = PREFERRED_MAIN_BY_SLOT[slot];
    const allowed = MAIN_OPTIONS_BY_SLOT[slot];
    return allowed.includes(preferredMain) ? preferredMain : allowed[0];
  }

  const normalizedMain = normalizeMainForSlot(slot, main);
  const allowed = MAIN_OPTIONS_BY_SLOT[slot];
  if (allowed.includes(normalizedMain)) {
    return normalizedMain;
  }

  const preferredMain = PREFERRED_MAIN_BY_SLOT[slot];
  return allowed.includes(preferredMain) ? preferredMain : allowed[0];
}

function uniqueSubStats(subs: SubStat[], excludedSub: SubStat | null, maxLength = SUBSTAT_OPTIONS.length): SubStat[] {
  const unique: SubStat[] = [];
  for (const sub of subs) {
    if (excludedSub && sub === excludedSub) {
      continue;
    }
    if (!SUBSTAT_OPTIONS.includes(sub)) {
      continue;
    }
    if (!unique.includes(sub)) {
      unique.push(sub);
    }
    if (unique.length >= maxLength) {
      break;
    }
  }
  return unique;
}

function suggestPresetFromCharacter(
  character: EnkaCharacterSummary | null,
): "em-reaction-cv-irrelevant" | "crit-dps-cv30" | null {
  if (!character) {
    return null;
  }

  let emSubCount = 0;
  let critSubCount = 0;

  for (const artifact of character.artifacts) {
    for (const sub of artifact.subs ?? []) {
      const key = (sub.key ?? "").toUpperCase();
      if (key.includes("MASTERY")) {
        emSubCount += 1;
      } else if (key.includes("CRITICAL")) {
        critSubCount += 1;
      }
    }
  }

  return emSubCount > critSubCount ? "em-reaction-cv-irrelevant" : "crit-dps-cv30";
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function formatPct(value: number): string {
  return `${(clampNumber(value, 0, 1) * 100).toFixed(2)}%`;
}

function formatDamageIndexNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDamageIndexPercent(value: number, locale: Locale): string {
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)}%`;
}

function formatDamageIndexMultiplier(value: number, locale: Locale): string {
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 3,
  }).format(Number.isFinite(value) ? value : 0)}x`;
}

function parseNumberOrFallback(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatRuns(value: number): string {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)).toLocaleString() : "\u221E";
}

function formatExpectedRuns(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "\u221E";
}

function formatCv(value: number): string {
  return `${value.toFixed(1)}`;
}

function formatDaysWithResin(days: number, resinPerDay: number): string {
  if (!Number.isFinite(days)) {
    return "\u221E";
  }

  const safeDays = Math.max(0, Math.round(days));
  return `${formatRuns(safeDays)} (${formatRuns(safeDays * resinPerDay)})`;
}

function formatRunsWithResin(runs: number, resinLabel: string): string {
  if (!Number.isFinite(runs)) {
    return "\u221E";
  }
  const resin = resinForRuns(runs);
  return `${formatRuns(runs)} (${formatRuns(resin)} ${resinLabel.toLowerCase()})`;
}


