"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Controller, useForm } from "react-hook-form";
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
const PRESET_NONE = "__none__";

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

export function ArtifactCalculator({ appName, appVersion }: ArtifactCalculatorProps) {
  const { locale, setLocale } = useLocale();
  const { setTheme, theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState(PRESET_NONE);
  const [themeMounted, setThemeMounted] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<FormValues>({
    defaultValues,
    mode: "onChange",
    resolver: zodResolver(formSchema),
  });
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const selectedTheme: ShareTheme = isShareTheme(theme) ? theme : "system";

  useEffect(() => {
    setThemeMounted(true);
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
    const allowed = MAIN_OPTIONS_BY_SLOT[slot];
    if (!allowed.includes(main)) {
      form.setValue("main", allowed[0], { shouldValidate: true });
    }
  }, [slot, main, form]);

  const effectiveMain = slot === Slot.Flower ? MainStat.FlatHp : slot === Slot.Plume ? MainStat.FlatAtk : main;
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
      const all = evaluateStrategies({
        objective: optimizerObjective,
        params,
        upgrade: upgradeRequirement,
        runs,
        recycleRate,
        transmuterConfig,
        transmuterChoice,
        cvThreshold,
      });
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
  }, [
    cvThreshold,
    optimizerEnabled,
    optimizerObjective,
    params,
    recycleRate,
    runs,
    transmuterChoice,
    transmuterConfig,
    upgradeRequirement,
  ]);

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
      objective: optimizerObjective,
      params,
      upgrade: upgradeRequirement,
      runs,
      recycleRate,
      transmuterConfig,
      transmuterChoice,
      cvThreshold,
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
  }, [
    cvThreshold,
    optimizerEnabled,
    optimizerObjective,
    params,
    recycleRate,
    runs,
    targetProb,
    transmuterChoice,
    transmuterConfig,
    upgradeRequirement,
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
                disabled={!themeMounted}
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

            {optimizerEnabled && (
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
            )}

            {optimizerEnabled && (
              <Card className="shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{tr("results.optimizerAllStrategies")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {optimizerResults.all.map((result) => (
                    <div
                      key={`optimizer-${result.name}`}
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
            )}

            {optimizerEnabled && (
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
                      <div key={`run-target-${targetRow.name}`} className="space-y-2 rounded-md border px-3 py-2">
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
            )}
            {farmStrategy === "combined" && (
              <p className="text-muted-foreground text-xs">{tr("results.optimizerCombinedNote")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <footer className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground sm:text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            {appName} v{appVersion}
          </span>
          <span>locale: {locale}</span>
          <span>theme: {selectedTheme}</span>
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

function localizeAttemptSource(source: AttemptSource, locale: Locale): string {
  return t(locale, ATTEMPT_SOURCE_LABEL_KEYS[source]);
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

function resolveMainForSlot(slot: Slot, main: MainStat | undefined): MainStat {
  const allowed = MAIN_OPTIONS_BY_SLOT[slot];
  if (main && allowed.includes(main)) {
    return main;
  }
  return allowed[0];
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

function formatRuns(value: number): string {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)).toLocaleString() : "\u221E";
}

function formatExpectedRuns(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "\u221E";
}

function formatCv(value: number): string {
  return `${value.toFixed(1)}`;
}

function formatRunsWithResin(runs: number, resinLabel: string): string {
  if (!Number.isFinite(runs)) {
    return "\u221E";
  }
  const resin = resinForRuns(runs);
  return `${formatRuns(runs)} (${formatRuns(resin)} ${resinLabel.toLowerCase()})`;
}


