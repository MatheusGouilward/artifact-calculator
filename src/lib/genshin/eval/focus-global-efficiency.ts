import {
  critValueStats,
  expectedGainPerDomainAttemptWithStrongbox,
  probSuccessPerAttempt,
  type EvaluateStrategiesInput,
} from "@/lib/genshin/artifacts";
import { MainStat, Slot, type ArtifactFarmParams, type SubsRule } from "@/lib/genshin/artifacts/types";

import type { ArtifactPriorityReport } from "./artifact-priority";

export type FocusGlobalStrategyScope = "domainsOnly" | "domainsStrongbox";

interface SlotFocusDefinition {
  slot: Slot;
  objectiveMode: "constraints" | "cv";
  mainStat?: MainStat;
  desiredSubs?: EvaluateStrategiesInput["params"]["requiredSubs"];
  subsRule?: SubsRule;
  cvThreshold?: number;
}

export interface FocusGlobalEfficiencyReport {
  focusedSlot: Slot;
  flexSlot: Slot;
  resinPerDay: number;
  perSlot: Array<{
    slot: Slot;
    gap: number;
    pAttempt: number;
    expectedGainAttempt: number;
    isFocus: boolean;
    isFlex: boolean;
  }>;
  totals: {
    pAttemptAny: number;
    expectedGainAttemptTotal: number;
    expectedGainAttemptFocus: number;
    expectedGainAttemptCollateral: number;
    expectedGainPerDay: number;
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

export function computeFocusGlobalEfficiency(
  priorityReport: ArtifactPriorityReport,
  focusedSlot: Slot,
  optimizerBaseInput: Omit<EvaluateStrategiesInput, "runs">,
  resinPerDay = 180,
  flexSlot: Slot = Slot.Goblet,
  strategyScope: FocusGlobalStrategyScope = "domainsStrongbox",
): FocusGlobalEfficiencyReport {
  const safeResinPerDay = Number.isFinite(resinPerDay) && resinPerDay > 0 ? resinPerDay : 180;
  const recycleRate = clamp01(optimizerBaseInput.recycleRate ?? 1);

  const perSlot = priorityReport.slots.map((slotReport) => {
    const slotFocus = toEffectiveFocus(slotReport.slot, slotReport.suggestedFocus, optimizerBaseInput);
    const gap = clamp01(1 - slotReport.slotScore);
    const domainParams = buildParamsForAttemptSource(
      optimizerBaseInput.params,
      slotFocus,
      slotReport.slot === flexSlot ? 1 : undefined,
    );
    const strongboxParams = buildParamsForAttemptSource(optimizerBaseInput.params, slotFocus);

    const threshold = slotFocus.cvThreshold ?? optimizerBaseInput.cvThreshold ?? 30;
    const pDomain =
      slotFocus.objectiveMode === "cv"
        ? critValueStats(
            domainParams,
            "domain",
            optimizerBaseInput.upgrade,
            optimizerBaseInput.transmuterConfig,
            optimizerBaseInput.transmuterChoice,
            threshold,
          ).pCvAtLeastPerAttempt
        : probSuccessPerAttempt(domainParams, optimizerBaseInput.upgrade).pAttemptSuccess;

    const pStrongbox =
      slotFocus.objectiveMode === "cv"
        ? critValueStats(
            strongboxParams,
            "strongbox",
            optimizerBaseInput.upgrade,
            optimizerBaseInput.transmuterConfig,
            optimizerBaseInput.transmuterChoice,
            threshold,
          ).pCvAtLeastPerAttempt
        : probSuccessPerAttempt(
            { ...strongboxParams, setProbOverride: 1 },
            optimizerBaseInput.upgrade,
          ).pAttemptSuccess;

    const gDomain = pDomain * gap;
    const gStrongbox = pStrongbox * gap;
    const expectedGainAttempt =
      strategyScope === "domainsOnly"
        ? gDomain
        : expectedGainPerDomainAttemptWithStrongbox(gDomain, gStrongbox, recycleRate);
    const pAttempt = gap <= 0 ? 0 : clamp01(expectedGainAttempt / gap);

    return {
      slot: slotReport.slot,
      gap,
      pAttempt,
      expectedGainAttempt,
      isFocus: slotReport.slot === focusedSlot,
      isFlex: slotReport.slot === flexSlot,
    };
  });

  const pAttemptAny = clamp01(sumBy(perSlot, (item) => item.pAttempt));
  const expectedGainAttemptTotal = Math.max(0, sumBy(perSlot, (item) => item.expectedGainAttempt));
  const expectedGainAttemptFocus =
    perSlot.find((item) => item.slot === focusedSlot)?.expectedGainAttempt ?? 0;
  const expectedGainAttemptCollateral = Math.max(0, expectedGainAttemptTotal - expectedGainAttemptFocus);
  const expectedGainPerRun = 0.935 * expectedGainAttemptTotal + 0.065 * (2 * expectedGainAttemptTotal);
  const runsPerDay = safeResinPerDay / 20;
  const expectedGainPerDay = Math.max(0, expectedGainPerRun * runsPerDay);

  return {
    focusedSlot,
    flexSlot,
    resinPerDay: safeResinPerDay,
    perSlot,
    totals: {
      pAttemptAny,
      expectedGainAttemptTotal,
      expectedGainAttemptFocus,
      expectedGainAttemptCollateral,
      expectedGainPerDay,
    },
  };
}

function toEffectiveFocus(
  slot: Slot,
  suggestedFocus: ArtifactPriorityReport["slots"][number]["suggestedFocus"] | undefined,
  optimizerBaseInput: Omit<EvaluateStrategiesInput, "runs">,
): SlotFocusDefinition {
  if (suggestedFocus) {
    return {
      slot,
      objectiveMode: suggestedFocus.objectiveMode,
      mainStat: suggestedFocus.mainStat,
      desiredSubs: suggestedFocus.desiredSubs,
      subsRule: suggestedFocus.subsRule,
      cvThreshold: suggestedFocus.cvThreshold,
    };
  }

  return {
    slot,
    objectiveMode: optimizerBaseInput.objective === "cv" ? "cv" : "constraints",
    mainStat: optimizerBaseInput.params.main,
    desiredSubs: optimizerBaseInput.params.requiredSubs,
    subsRule: optimizerBaseInput.params.subsRule,
    cvThreshold: optimizerBaseInput.cvThreshold,
  };
}

function buildParamsForAttemptSource(
  baseParams: EvaluateStrategiesInput["params"],
  focus: SlotFocusDefinition,
  forcedSetProbability?: number,
): ArtifactFarmParams {
  const main = resolveMainForSlot(focus.slot, focus.mainStat ?? baseParams.main);
  const requiredSubs = focus.desiredSubs
    ? Array.from(new Set(focus.desiredSubs))
    : baseParams.requiredSubs;
  const subsRule = normalizeSubsRule(focus.subsRule ?? baseParams.subsRule, requiredSubs.length);

  return {
    ...baseParams,
    slot: focus.slot,
    main,
    requiredSubs,
    subsRule,
    setProbability: forcedSetProbability ?? baseParams.setProbability,
  };
}

function resolveMainForSlot(slot: Slot, main: MainStat): MainStat {
  const normalizedMain = normalizeMainForSlot(slot, main);
  const allowed = MAIN_OPTIONS_BY_SLOT[slot];
  if (allowed.includes(normalizedMain)) {
    return normalizedMain;
  }
  return allowed[0];
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

function normalizeSubsRule(rule: SubsRule, desiredSubsCount: number): SubsRule {
  if (rule.mode === "all") {
    return rule;
  }
  return {
    mode: "atLeast",
    n: clampInteger(rule.n, 0, desiredSubsCount),
  };
}

function sumBy<T>(values: T[], selector: (value: T) => number): number {
  return values.reduce((sum, value) => sum + selector(value), 0);
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
