import {
  critValueStats,
  expectedGainAfterRunsWithStrongboxGivenAttemptGains,
  probSuccessAfterRunsWithStrongboxGivenAttemptProbs,
  probSuccessPerAttempt,
  type EvaluateStrategiesInput,
} from "@/lib/genshin/artifacts";
import { MainStat, Slot, type ArtifactFarmParams, type SubsRule } from "@/lib/genshin/artifacts/types";

import type { ArtifactPriorityReport } from "./artifact-priority";

export type GlobalEfficiencyMode = "anyUpgradeProb" | "expectedGapGain";

interface SlotFocus {
  slot: Slot;
  objectiveMode: "constraints" | "cv";
  mainStat?: MainStat;
  desiredSubs?: EvaluateStrategiesInput["params"]["requiredSubs"];
  subsRule?: SubsRule;
  cvThreshold?: number;
}

export interface GlobalEfficiencyReport {
  flexSlot: Slot;
  mode: GlobalEfficiencyMode;
  perSlot: Array<{
    slot: Slot;
    gap: number;
    pDomain: number;
    pStrongbox: number;
    contributionDomain: number;
    contributionStrongbox: number;
  }>;
  totals: {
    pAttemptDomain: number;
    pAttemptStrongbox: number;
    pRunDomain: number;
    pRunStrongbox: number;
    gAttemptDomain?: number;
    gAttemptStrongbox?: number;
    gRunDomain?: number;
    gRunStrongbox?: number;
  };
}

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

export function computeGlobalEfficiency(
  priorityReport: ArtifactPriorityReport,
  baseOptimizerInput: Omit<EvaluateStrategiesInput, "runs">,
  mode: GlobalEfficiencyMode,
  resinPerDay = 180,
  flexSlot: Slot = Slot.Goblet,
): GlobalEfficiencyReport {
  void resinPerDay;

  const recycleRate = clamp01(baseOptimizerInput.recycleRate ?? 1);
  const perSlot = priorityReport.slots.map((slotReport) => {
    const focus = toEffectiveFocus(slotReport.slot, slotReport.suggestedFocus, baseOptimizerInput);
    const gap = clamp01(1 - slotReport.slotScore);
    const domainParams = buildParams(baseOptimizerInput.params, focus, flexSlot, "domain");
    const strongboxParams = buildParams(baseOptimizerInput.params, focus, flexSlot, "strongbox");

    let pDomain = 0;
    let pStrongbox = 0;

    if (focus.objectiveMode === "cv") {
      const threshold = focus.cvThreshold ?? baseOptimizerInput.cvThreshold ?? 30;
      pDomain = critValueStats(
        domainParams,
        "domain",
        baseOptimizerInput.upgrade,
        baseOptimizerInput.transmuterConfig,
        baseOptimizerInput.transmuterChoice,
        threshold,
      ).pCvAtLeastPerAttempt;
      pStrongbox = critValueStats(
        strongboxParams,
        "strongbox",
        baseOptimizerInput.upgrade,
        baseOptimizerInput.transmuterConfig,
        baseOptimizerInput.transmuterChoice,
        threshold,
      ).pCvAtLeastPerAttempt;
    } else {
      pDomain = probSuccessPerAttempt(domainParams, baseOptimizerInput.upgrade).pAttemptSuccess;
      pStrongbox = probSuccessPerAttempt(
        { ...strongboxParams, setProbOverride: 1 },
        baseOptimizerInput.upgrade,
      ).pAttemptSuccess;
    }

    const gDomain = pDomain * gap;
    const gStrongbox = pStrongbox * gap;

    return {
      slot: slotReport.slot,
      gap,
      pDomain,
      pStrongbox,
      contributionDomain: mode === "expectedGapGain" ? gDomain : pDomain,
      contributionStrongbox: mode === "expectedGapGain" ? gStrongbox : pStrongbox,
      gDomain,
      gStrongbox,
    };
  });

  const pAttemptDomain = clamp01(sumBy(perSlot, (item) => item.pDomain));
  const pAttemptStrongbox = clamp01(sumBy(perSlot, (item) => item.pStrongbox));
  const pRunDomain = perRunFromAttempt(pAttemptDomain);
  const pRunStrongbox = clamp01(
    probSuccessAfterRunsWithStrongboxGivenAttemptProbs(
      1,
      pAttemptDomain,
      pAttemptStrongbox,
      recycleRate,
    ),
  );

  if (mode === "expectedGapGain") {
    const gAttemptDomain = Math.max(0, sumBy(perSlot, (item) => item.gDomain));
    const gAttemptStrongbox = Math.max(0, sumBy(perSlot, (item) => item.gStrongbox));
    const gRunDomain = perRunFromAttemptExpected(gAttemptDomain);
    const gRunStrongbox = Math.max(
      0,
      expectedGainAfterRunsWithStrongboxGivenAttemptGains(
        1,
        gAttemptDomain,
        gAttemptStrongbox,
        recycleRate,
      ),
    );

    return {
      flexSlot,
      mode,
      perSlot: perSlot.map(({ gDomain, gStrongbox, ...item }) => item),
      totals: {
        pAttemptDomain,
        pAttemptStrongbox,
        pRunDomain,
        pRunStrongbox,
        gAttemptDomain,
        gAttemptStrongbox,
        gRunDomain,
        gRunStrongbox,
      },
    };
  }

  return {
    flexSlot,
    mode,
    perSlot: perSlot.map(({ gDomain, gStrongbox, ...item }) => item),
    totals: {
      pAttemptDomain,
      pAttemptStrongbox,
      pRunDomain,
      pRunStrongbox,
    },
  };
}

function toEffectiveFocus(
  slot: Slot,
  focus: ArtifactPriorityReport["slots"][number]["suggestedFocus"] | undefined,
  base: Omit<EvaluateStrategiesInput, "runs">,
): SlotFocus {
  if (focus) {
    return {
      slot,
      objectiveMode: focus.objectiveMode,
      mainStat: focus.mainStat,
      desiredSubs: focus.desiredSubs,
      subsRule: focus.subsRule,
      cvThreshold: focus.cvThreshold,
    };
  }

  return {
    slot,
    objectiveMode: base.objective === "cv" ? "cv" : "constraints",
    mainStat: base.params.main,
    desiredSubs: base.params.requiredSubs,
    subsRule: base.params.subsRule,
    cvThreshold: base.cvThreshold,
  };
}

function buildParams(
  baseParams: EvaluateStrategiesInput["params"],
  focus: SlotFocus,
  flexSlot: Slot,
  attemptSource: "domain" | "strongbox",
): ArtifactFarmParams {
  const main = resolveMainForSlot(focus.slot, focus.mainStat ?? baseParams.main);
  const requiredSubs = focus.desiredSubs ? Array.from(new Set(focus.desiredSubs)) : baseParams.requiredSubs;
  const subsRule = normalizeSubsRule(focus.subsRule ?? baseParams.subsRule, requiredSubs.length);

  return {
    ...baseParams,
    slot: focus.slot,
    main,
    requiredSubs,
    subsRule,
    setProbability:
      focus.slot === flexSlot &&
      (attemptSource === "domain" || attemptSource === "strongbox")
        ? 1
        : baseParams.setProbability,
    setProbOverride: baseParams.setProbOverride,
    slotProbability: baseParams.slotProbability,
  };
}

function perRunFromAttempt(pAttempt: number): number {
  return 0.935 * pAttempt + 0.065 * (1 - (1 - pAttempt) ** 2);
}

function perRunFromAttemptExpected(eAttempt: number): number {
  return 0.935 * eAttempt + 0.065 * (2 * eAttempt);
}

function normalizeSubsRule(rule: SubsRule, requiredSubsCount: number): SubsRule {
  if (rule.mode === "all") {
    return rule;
  }
  return {
    mode: "atLeast",
    n: clampInteger(rule.n, 0, requiredSubsCount),
  };
}

function resolveMainForSlot(slot: Slot, main: MainStat): MainStat {
  const allowed = MAIN_OPTIONS_BY_SLOT[slot];
  if (allowed.includes(main)) {
    return main;
  }
  return allowed[0];
}

function sumBy<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((sum, item) => sum + selector(item), 0);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}
