import { buildDamageTable } from "./table";
import type { AttackKind, CharacterState, DamageType, EnemyModel } from "./types";

export type SetupMode = "enka" | "manual";

export interface DamageSetup {
  mode: SetupMode;
  label: string;
  characterId: number;
  talentLevels: {
    normal: number;
    skill: number;
    burst: number;
  };
  combatTotals: {
    hp: number;
    atk: number;
    def: number;
    em: number;
    erPct: number;
    critRatePct: number;
    critDmgPct: number;
    dmgBonusPhysicalPct: number;
    dmgBonusByElementPct: Record<DamageType, number>;
  };
  damageTypeOverride?: DamageType | null;
}

export interface SuggestionDelta {
  id: string;
  label: string;
  apply: (setup: DamageSetup) => DamageSetup;
  deltaType: "pct" | "flat";
  stat: "critRate" | "critDmg" | "atkPct" | "atkFlat" | "dmgBonusPct" | "emFlat";
  amount: number;
}

export interface SuggestionResult {
  suggestionId: string;
  stat: string;
  amount: number;
  avgBefore: number;
  avgAfter: number;
  deltaAbs: number;
  deltaPct: number;
  notes: string[];
}

interface MetricSnapshot {
  metric: number;
  notes: string[];
  effectiveDamageType: DamageType;
}

interface EvaluateContext {
  sectionFilter: AttackKind[];
  includeCrit: boolean;
  enemy?: EnemyModel;
}

export interface ComputeSuggestionOptions {
  sectionFilter?: AttackKind[];
  topN?: number;
  includeCrit?: boolean;
  includeEmSuggestion?: boolean;
  enemy?: EnemyModel;
  evaluateMetric?: (setup: DamageSetup, context: EvaluateContext) => MetricSnapshot;
}

const SECTION_ORDER: readonly AttackKind[] = ["normal", "skill", "burst"];
const SUGGESTION_LIMIT_DEFAULT = 5;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function cloneSetup(setup: DamageSetup): DamageSetup {
  return {
    ...setup,
    talentLevels: { ...setup.talentLevels },
    combatTotals: {
      ...setup.combatTotals,
      dmgBonusByElementPct: { ...setup.combatTotals.dmgBonusByElementPct },
    },
  };
}

function setupToCharacterState(setup: DamageSetup): CharacterState {
  return {
    characterId: setup.characterId,
    talentLevels: { ...setup.talentLevels },
    combatTotals: {
      hp: setup.combatTotals.hp,
      atk: setup.combatTotals.atk,
      def: setup.combatTotals.def,
      em: setup.combatTotals.em,
      critRatePct: setup.combatTotals.critRatePct,
      critDmgPct: setup.combatTotals.critDmgPct,
      dmgBonusPhysicalPct: setup.combatTotals.dmgBonusPhysicalPct,
      dmgBonusByElementPct: { ...setup.combatTotals.dmgBonusByElementPct },
    },
  };
}

function resolveSections(sectionFilter?: AttackKind[]): AttackKind[] {
  if (!sectionFilter || sectionFilter.length === 0) {
    return [...SECTION_ORDER];
  }
  const set = new Set<AttackKind>(sectionFilter);
  return SECTION_ORDER.filter((section) => set.has(section));
}

function evaluateSetupMetric(
  setup: DamageSetup,
  context: EvaluateContext,
): MetricSnapshot {
  const table = buildDamageTable(setupToCharacterState(setup), {
    sectionFilter: context.sectionFilter,
    includeCrit: context.includeCrit,
    damageTypeOverride: setup.damageTypeOverride ?? null,
    enemy: context.enemy,
  });
  let metric = 0;
  const byType: Partial<Record<DamageType, number>> = {};

  for (const section of context.sectionFilter) {
    for (const row of table.sections[section]) {
      metric += row.avg;
      byType[row.damageType] = (byType[row.damageType] ?? 0) + row.avg;
    }
  }

  let effectiveDamageType: DamageType = setup.damageTypeOverride ?? "physical";
  if (!setup.damageTypeOverride) {
    let bestType: DamageType = "physical";
    let bestValue = -1;
    for (const [key, value] of Object.entries(byType)) {
      if (typeof value === "number" && value > bestValue) {
        bestType = key as DamageType;
        bestValue = value;
      }
    }
    effectiveDamageType = bestType;
  }

  return {
    metric,
    notes: [
      ...table.notes,
      `metric_sections:${context.sectionFilter.join(",")}`,
      `effective_damage_type:${effectiveDamageType}`,
    ],
    effectiveDamageType,
  };
}

function buildSuggestionDeltas(
  effectiveDamageType: DamageType,
  includeEmSuggestion: boolean,
): SuggestionDelta[] {
  const deltas: SuggestionDelta[] = [
    {
      id: "critRate5Pct",
      label: "damageLab.suggestions.items.critRate5Pct",
      deltaType: "pct",
      stat: "critRate",
      amount: 5,
      apply: (setup) => {
        const next = cloneSetup(setup);
        next.combatTotals.critRatePct = clamp(next.combatTotals.critRatePct + 5, 0, 100);
        return next;
      },
    },
    {
      id: "critDmg10Pct",
      label: "damageLab.suggestions.items.critDmg10Pct",
      deltaType: "pct",
      stat: "critDmg",
      amount: 10,
      apply: (setup) => {
        const next = cloneSetup(setup);
        next.combatTotals.critDmgPct = Math.max(0, next.combatTotals.critDmgPct + 10);
        return next;
      },
    },
    {
      id: "atkPct10",
      label: "damageLab.suggestions.items.atkPct10",
      deltaType: "pct",
      stat: "atkPct",
      amount: 10,
      apply: (setup) => {
        const next = cloneSetup(setup);
        const delta = next.combatTotals.atk * 0.1;
        next.combatTotals.atk += delta;
        return next;
      },
    },
    {
      id: "atkFlat100",
      label: "damageLab.suggestions.items.atkFlat100",
      deltaType: "flat",
      stat: "atkFlat",
      amount: 100,
      apply: (setup) => {
        const next = cloneSetup(setup);
        next.combatTotals.atk += 100;
        return next;
      },
    },
    {
      id: "dmgBonus10Pct",
      label: "damageLab.suggestions.items.dmgBonus10Pct",
      deltaType: "pct",
      stat: "dmgBonusPct",
      amount: 10,
      apply: (setup) => {
        const next = cloneSetup(setup);
        if (effectiveDamageType === "physical") {
          next.combatTotals.dmgBonusPhysicalPct += 10;
        } else {
          next.combatTotals.dmgBonusByElementPct[effectiveDamageType] =
            (next.combatTotals.dmgBonusByElementPct[effectiveDamageType] ?? 0) + 10;
        }
        return next;
      },
    },
  ];

  if (includeEmSuggestion) {
    deltas.push({
      id: "emFlat40",
      label: "damageLab.suggestions.items.emFlat40",
      deltaType: "flat",
      stat: "emFlat",
      amount: 40,
      apply: (setup) => {
        const next = cloneSetup(setup);
        next.combatTotals.em += 40;
        return next;
      },
    });
  }

  return deltas;
}

export function computeSuggestionRankings(
  setup: DamageSetup,
  opts: ComputeSuggestionOptions = {},
): SuggestionResult[] {
  const sectionFilter = resolveSections(opts.sectionFilter);
  const includeCrit = opts.includeCrit !== false;
  const topN = Math.max(1, Math.floor(opts.topN ?? SUGGESTION_LIMIT_DEFAULT));
  const includeEmSuggestion = opts.includeEmSuggestion ?? false;
  const evaluate = opts.evaluateMetric ?? evaluateSetupMetric;
  const context: EvaluateContext = { sectionFilter, includeCrit, enemy: opts.enemy };
  const baseline = evaluate(setup, context);
  const suggestionDeltas = buildSuggestionDeltas(baseline.effectiveDamageType, includeEmSuggestion);

  const ranked = suggestionDeltas.map((delta) => {
    const afterSetup = delta.apply(setup);
    const after = evaluate(afterSetup, context);
    const deltaAbs = after.metric - baseline.metric;
    const deltaPct = baseline.metric !== 0 ? (deltaAbs / baseline.metric) * 100 : 0;
    const notes = [...after.notes];
    if (delta.id === "critRate5Pct" && setup.combatTotals.critRatePct + 5 > 100) {
      notes.push("crit_rate_clamped");
    }
    if (baseline.metric === 0) {
      notes.push("baseline_metric_zero");
    }

    return {
      suggestionId: delta.id,
      stat: delta.stat,
      amount: delta.amount,
      avgBefore: baseline.metric,
      avgAfter: after.metric,
      deltaAbs,
      deltaPct,
      notes,
    } satisfies SuggestionResult;
  });

  ranked.sort((a, b) => {
    if (b.deltaPct !== a.deltaPct) {
      return b.deltaPct - a.deltaPct;
    }
    if (b.deltaAbs !== a.deltaAbs) {
      return b.deltaAbs - a.deltaAbs;
    }
    return a.suggestionId.localeCompare(b.suggestionId);
  });

  return ranked.slice(0, topN);
}
