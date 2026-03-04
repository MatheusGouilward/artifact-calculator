import type { EnkaCharacterSummary } from "@/lib/enka/types";
import { loadGameDataCore } from "@/lib/genshin/game-data-core";

import { computeHitDamage } from "./engine";
import type { EnemyModel as ExplicitEnemyModel } from "./enemy";
import { characterStateFromEnka } from "./from-enka";
import { applyBuffStates, type BuffState } from "./buffs";
import type {
  AttackKind,
  CharacterState,
  DamageResult,
  DamageType,
} from "./types";

export interface DamageRow {
  hitId: string;
  label: string;
  damageType: DamageType;
  nonCrit: number;
  crit: number;
  avg: number;
  breakdown: DamageResult["breakdown"];
}

export interface DamageTable {
  characterId: number;
  locale: "en" | "pt-BR";
  sections: {
    normal: DamageRow[];
    skill: DamageRow[];
    burst: DamageRow[];
  };
  notes: string[];
}

export interface BuildDamageTableOptions {
  locale?: "en" | "pt-BR";
  includeCrit?: boolean;
  sectionFilter?: AttackKind[];
  damageTypeOverride?: DamageType | null;
  selectedElement?: DamageType | null;
  enemy?: ExplicitEnemyModel;
  buffStates?: BuffState[];
}

const SECTION_ORDER: readonly AttackKind[] = ["normal", "skill", "burst"];

function pickHitLabel(
  locale: "en" | "pt-BR",
  entry: { labelEn?: string; labelPtBR?: string; sourceKey: string },
): string {
  if (locale === "pt-BR") {
    return entry.labelPtBR ?? entry.labelEn ?? entry.sourceKey;
  }
  return entry.labelEn ?? entry.sourceKey;
}

function collectUniqueNotes(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function buildDamageTable(
  state: CharacterState,
  opts: BuildDamageTableOptions = {},
): DamageTable {
  const core = loadGameDataCore();
  const locale = opts.locale ?? "en";
  const includeCrit = opts.includeCrit !== false;
  const damageTypeOverride = opts.damageTypeOverride ?? null;
  const selectedElement = opts.selectedElement ?? null;
  const buffStates = opts.buffStates ?? [];
  const enemy = opts.enemy;
  const requestedSections = new Set<AttackKind>(opts.sectionFilter ?? SECTION_ORDER);
  const notes: string[] = [];
  const profile = state.profile ?? core.characterProfiles[state.characterId];
  const primaryScalingStat = profile?.scalingStatByKind.normal ?? "atk";
  const mainDamageType = damageTypeOverride ?? "physical";
  const buffResult = applyBuffStates(state.combatTotals, buffStates, {
    locale,
    mainDamageType,
    selectedElement,
    scalingStat: primaryScalingStat,
    notes,
  });
  const stateWithBuffs: CharacterState = {
    ...state,
    combatTotals: buffResult.combatTotals2,
  };
  for (const [type, value] of Object.entries(buffResult.enemyDelta.resShredPctPointsByType)) {
    notes.push(`buff_enemy_res_shred:${type}:${value}`);
  }
  for (const applied of buffResult.applied) {
    notes.push(`buff_applied:${applied.id}`);
    notes.push(...applied.notes.map((entry) => `buff_note:${applied.id}:${entry}`));
  }

  const sections: DamageTable["sections"] = {
    normal: [],
    skill: [],
    burst: [],
  };

  const catalog = core.hitCatalog[state.characterId];
  if (!catalog) {
    notes.push(`missing_hit_catalog:${state.characterId}`);
    return {
      characterId: state.characterId,
      locale,
      sections,
      notes: collectUniqueNotes(notes),
    };
  }

  for (const kind of SECTION_ORDER) {
    if (!requestedSections.has(kind)) {
      continue;
    }

    for (const entry of catalog[kind]) {
      const resolvedDamageType = (entry.damageType
        ?? damageTypeOverride
        ?? profile?.defaultDamageTypeByKind[kind]
        ?? "physical") as DamageType;
      const resShredPctPoints = buffResult.enemyDelta.resShredPctPointsByType[resolvedDamageType] ?? 0;
      const enemyForHit = enemy
        ? {
          ...enemy,
          damageType: resolvedDamageType,
        }
        : undefined;
      const result = computeHitDamage(
        stateWithBuffs,
        {
          kind,
          hitId: entry.id,
          ...((entry.damageType ?? damageTypeOverride ?? profile?.defaultDamageTypeByKind[kind])
            ? { damageType: resolvedDamageType }
            : {}),
          useCrit: includeCrit,
          ...(enemyForHit ? { enemy: enemyForHit } : {}),
          resShredPctPoints,
        },
        core,
      );
      notes.push(...result.breakdown.notes);
      sections[kind].push({
        hitId: entry.id,
        label: pickHitLabel(locale, entry),
        damageType: result.breakdown.damageTypeUsed,
        nonCrit: result.nonCrit,
        crit: result.crit,
        avg: result.avg,
        breakdown: result.breakdown,
      });
    }
  }

  return {
    characterId: state.characterId,
    locale,
    sections,
    notes: collectUniqueNotes(notes),
  };
}

export function buildDamageTableFromEnka(
  selectedCharacter: EnkaCharacterSummary | null,
  opts: BuildDamageTableOptions = {},
): DamageTable {
  const stateNotes: string[] = [];
  const state = characterStateFromEnka(selectedCharacter, stateNotes);
  const table = buildDamageTable(state, opts);
  return {
    ...table,
    notes: collectUniqueNotes([...stateNotes, ...table.notes]),
  };
}
