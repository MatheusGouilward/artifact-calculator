import type { EnkaArtifactSummary, EnkaCharacterSummary } from "@/lib/enka/types";
import { MainStat, Slot, SubStat, type SubsRule } from "@/lib/genshin/artifacts/types";

import { getBuildPlan, type BuildProfileId } from "./build-plans";
import { enkaToModifiers, mapEnkaEquipTypeToSlot } from "./enka-to-modifiers";
import { emptyStatBlock, type StatBlock } from "./stat-block";
import { mapEnkaStatToStatKey } from "./stat-mapping";
import { ALL_STAT_KEYS, type StatKey } from "./stat-keys";

const SLOT_ORDER: Slot[] = [Slot.Flower, Slot.Plume, Slot.Sands, Slot.Goblet, Slot.Circlet];

export interface ArtifactPriorityReport {
  profileId: BuildProfileId;
  powerCurrent: number;
  slots: Array<{
    slot: Slot;
    mainKey?: StatKey | null;
    mainOk: boolean;
    slotScore: number;
    priority: "high" | "medium" | "low";
    reasons: string[];
    suggestedFocus?: {
      slot: Slot;
      objectiveMode: "constraints" | "cv";
      mainStat?: MainStat;
      desiredSubs?: SubStat[];
      subsRule?: SubsRule;
      cvThreshold?: number;
    };
  }>;
  topPriorities: Slot[];
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function toSlotStatBlock(slotModifiers: Array<{ stats: Partial<StatBlock> }>): StatBlock {
  const block = emptyStatBlock();
  for (const modifier of slotModifiers) {
    for (const key of ALL_STAT_KEYS) {
      const value = modifier.stats[key];
      if (value !== undefined && Number.isFinite(value)) {
        block[key] += value;
      }
    }
  }
  return block;
}

function buildMainKeyBySlot(character: EnkaCharacterSummary | null): Partial<Record<Slot, StatKey | null>> {
  if (!character) {
    return {};
  }

  const bySlot: Partial<Record<Slot, EnkaArtifactSummary>> = {};
  for (const artifact of character.artifacts ?? []) {
    const slot = mapEnkaEquipTypeToSlot(artifact.equipType);
    if (!slot || bySlot[slot]) {
      continue;
    }
    bySlot[slot] = artifact;
  }

  const result: Partial<Record<Slot, StatKey | null>> = {};
  for (const slot of SLOT_ORDER) {
    const mainLabel = bySlot[slot]?.main?.key;
    result[slot] = mainLabel ? mapEnkaStatToStatKey(mainLabel) : null;
  }
  return result;
}

function slotPriorityFromScore(mainOk: boolean, slotScore: number): "high" | "medium" | "low" {
  if (!mainOk) {
    return "high";
  }

  const gap = 1 - slotScore;
  if (gap >= 0.55) {
    return "high";
  }
  if (gap >= 0.3) {
    return "medium";
  }
  return "low";
}

function scoreSlotNormalized(
  slotBlock: StatBlock,
  weights: Partial<Record<StatKey, number>>,
  caps: Partial<Record<StatKey, number>> | undefined,
  slotTargets: Partial<Record<StatKey, number>> | undefined,
): number {
  let numerator = 0;
  let denominator = 0;

  for (const key of ALL_STAT_KEYS) {
    const weight = weights[key];
    if (weight === undefined) {
      continue;
    }

    let value = slotBlock[key];
    const cap = caps?.[key];
    if (cap !== undefined) {
      value = Math.min(value, cap);
    }
    numerator += value * weight;

    const target = slotTargets?.[key];
    if (target !== undefined) {
      const boundedTarget = cap !== undefined ? Math.min(target, cap) : target;
      denominator += boundedTarget * weight;
    }
  }

  if (denominator <= 0) {
    return 0;
  }

  return clamp01(numerator / denominator);
}

function buildReasons(
  profileId: BuildProfileId,
  mainOk: boolean,
  slotScore: number,
  slotBlock: StatBlock,
  slotTargets: Partial<Record<StatKey, number>> | undefined,
): string[] {
  const reasons = new Set<string>();
  if (!mainOk) {
    reasons.add("main_wrong");
  }

  const gap = 1 - slotScore;
  if (gap >= 0.3) {
    reasons.add("low_score");
  }

  const critTotal = slotBlock.crit_rate_pct + slotBlock.crit_dmg_pct;
  if (profileId === "critDps" && critTotal < 24) {
    reasons.add("missing_crit");
  }

  if (profileId === "supportEr") {
    const erTarget = slotTargets?.er_pct ?? 12;
    if (slotBlock.er_pct < erTarget) {
      reasons.add("low_er");
    }
  }

  if (profileId === "emReaction") {
    const emTarget = slotTargets?.em ?? 80;
    if (slotBlock.em < emTarget) {
      reasons.add("low_em");
    }
  }

  return Array.from(reasons);
}

function normalizeSuggestedMainForSlot(slot: Slot, main: MainStat | undefined): MainStat | undefined {
  if (slot === Slot.Flower) {
    return MainStat.FlatHp;
  }
  if (slot === Slot.Plume) {
    return MainStat.FlatAtk;
  }
  return main;
}

export function analyzeArtifactPriorities(
  selectedCharacter: EnkaCharacterSummary | null,
  profileId: BuildProfileId,
): ArtifactPriorityReport {
  const plan = getBuildPlan(profileId);
  const mapped = enkaToModifiers(selectedCharacter);
  const mainBySlot = buildMainKeyBySlot(selectedCharacter);

  const slots = SLOT_ORDER.map((slot) => {
    const slotBlock = toSlotStatBlock(mapped.bySlot[slot]);
    const mainKey = mainBySlot[slot] ?? null;
    const acceptedMains = plan.acceptedMainsBySlot[slot];
    const mainOk = acceptedMains && mainKey ? acceptedMains.includes(mainKey) : true;

    const slotScore = scoreSlotNormalized(
      slotBlock,
      plan.objective.weights,
      plan.objective.caps,
      plan.slotTargets[slot],
    );

    const priority = slotPriorityFromScore(mainOk, slotScore);
    const reasons = buildReasons(profileId, mainOk, slotScore, slotBlock, plan.slotTargets[slot]);

    const focus = plan.focusDefaults[slot];
    const suggestedFocus = focus
      ? {
          slot,
          objectiveMode: focus.objectiveMode,
          mainStat: normalizeSuggestedMainForSlot(slot, focus.mainStatOverride),
          desiredSubs: focus.desiredSubs ? [...focus.desiredSubs] : undefined,
          subsRule: focus.subsRule,
          cvThreshold:
            focus.objectiveMode === "cv"
              ? Math.max(
                  focus.cvThresholdBase ?? 30,
                  slotBlock.crit_dmg_pct + 2 * slotBlock.crit_rate_pct + 6,
                )
              : undefined,
        }
      : undefined;

    return {
      slot,
      mainKey,
      mainOk,
      slotScore,
      priority,
      reasons,
      suggestedFocus,
    };
  });

  const powerCurrent = clamp01(
    slots.reduce((sum, slot) => sum + slot.slotScore, 0) / SLOT_ORDER.length,
  );

  const priorityRank: Record<"high" | "medium" | "low", number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  const topPriorities = [...slots]
    .sort((a, b) => {
      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.slotScore - b.slotScore;
    })
    .slice(0, 2)
    .map((entry) => entry.slot);

  return {
    profileId,
    powerCurrent,
    slots,
    topPriorities,
  };
}
