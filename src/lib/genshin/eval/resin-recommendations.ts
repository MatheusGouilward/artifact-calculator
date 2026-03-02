import {
  evaluateStrategies,
  resinForRuns,
  runsForTargetChanceStrategy,
  type EvaluateStrategiesInput,
  type StrategyName,
} from "@/lib/genshin/artifacts";
import { MainStat, Slot, type SubsRule } from "@/lib/genshin/artifacts/types";

import type { ArtifactPriorityReport } from "./artifact-priority";

type SuggestedFocus = NonNullable<ArtifactPriorityReport["slots"][number]["suggestedFocus"]>;

export type ResinRecommendationBaseInput = Omit<EvaluateStrategiesInput, "runs">;

export interface ResinRecommendationReport {
  resinPerDay: number;
  items: Array<{
    slot: SuggestedFocus["slot"];
    priority: "high" | "medium" | "low";
    focus: SuggestedFocus;
    bestStrategyName: StrategyName;
    days50: number;
    days90: number;
    expectedNote: string[];
  }>;
}

const STRATEGIES: StrategyName[] = [
  "Domains only",
  "Domains + Strongbox",
  "Transmuter only (period)",
  "Combined (Domains+Strongbox + Transmuter)",
];

const STRATEGY_COMPLEXITY: Record<StrategyName, number> = {
  "Domains only": 0,
  "Domains + Strongbox": 1,
  "Transmuter only (period)": 2,
  "Combined (Domains+Strongbox + Transmuter)": 3,
};

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

export function computeResinRecommendations(
  priorityReport: ArtifactPriorityReport,
  baseOptimizerInput: ResinRecommendationBaseInput,
  resinPerDay = 180,
): ResinRecommendationReport {
  const safeResinPerDay = Number.isFinite(resinPerDay) && resinPerDay > 0 ? resinPerDay : 180;
  const items: ResinRecommendationReport["items"] = [];

  for (const slot of priorityReport.topPriorities.slice(0, 2)) {
    const slotReport = priorityReport.slots.find((entry) => entry.slot === slot);
    const focus = slotReport?.suggestedFocus;
    if (!slotReport || !focus) {
      continue;
    }

    const slotInput = buildFocusedInput(baseOptimizerInput, focus);
    const noteByStrategy = new Map<StrategyName, string>();
    const snapshot = evaluateStrategies({ ...slotInput, runs: 0 });
    for (const result of snapshot) {
      if (result.details?.note) {
        noteByStrategy.set(result.name, result.details.note);
      }
    }

    const candidates = STRATEGIES.map((strategyName) => {
      const runs50 = runsForTargetChanceStrategy({ ...slotInput, runs: 0 }, strategyName, 0.5);
      const runs90 = runsForTargetChanceStrategy({ ...slotInput, runs: 0 }, strategyName, 0.9);
      return {
        strategyName,
        days50: runsToDays(runs50, safeResinPerDay),
        days90: runsToDays(runs90, safeResinPerDay),
      };
    });

    const best = chooseBestStrategyByDays(candidates);
    const expectedNote = noteByStrategy.get(best.strategyName) ? [noteByStrategy.get(best.strategyName)!] : [];

    items.push({
      slot,
      priority: slotReport.priority,
      focus,
      bestStrategyName: best.strategyName,
      days50: best.days50,
      days90: best.days90,
      expectedNote,
    });
  }

  return {
    resinPerDay: safeResinPerDay,
    items,
  };
}

function buildFocusedInput(
  baseOptimizerInput: ResinRecommendationBaseInput,
  focus: SuggestedFocus,
): ResinRecommendationBaseInput {
  const main = resolveMainForSlot(focus.slot, focus.mainStat ?? baseOptimizerInput.params.main);
  const requiredSubs = focus.desiredSubs
    ? Array.from(new Set(focus.desiredSubs))
    : baseOptimizerInput.params.requiredSubs;
  const subsRule = normalizeSubsRule(
    focus.subsRule ?? baseOptimizerInput.params.subsRule,
    requiredSubs.length,
  );

  return {
    ...baseOptimizerInput,
    objective: focus.objectiveMode === "cv" ? "cv" : "constraints",
    cvThreshold:
      focus.objectiveMode === "cv"
        ? (focus.cvThreshold ?? baseOptimizerInput.cvThreshold ?? 30)
        : undefined,
    params: {
      ...baseOptimizerInput.params,
      slot: focus.slot,
      main,
      requiredSubs,
      subsRule,
    },
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

function chooseBestStrategyByDays(
  candidates: Array<{ strategyName: StrategyName; days50: number; days90: number }>,
): { strategyName: StrategyName; days50: number; days90: number } {
  let best = candidates[0];

  for (let index = 1; index < candidates.length; index += 1) {
    const current = candidates[index];
    if (current.days50 < best.days50) {
      best = current;
      continue;
    }
    if (current.days50 === best.days50 && complexityOf(current.strategyName) < complexityOf(best.strategyName)) {
      best = current;
    }
  }

  return best;
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

function runsToDays(runs: number, resinPerDay: number): number {
  if (!Number.isFinite(runs)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.ceil(resinForRuns(runs) / resinPerDay);
}

function complexityOf(strategyName: StrategyName): number {
  return STRATEGY_COMPLEXITY[strategyName] ?? Number.MAX_SAFE_INTEGER;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}
