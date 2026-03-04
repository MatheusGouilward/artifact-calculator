"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DamageTableSection } from "@/components/damage-table-section";
import { useLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EnkaCharacterSummary } from "@/lib/enka/types";
import { useActiveEnkaCharacter } from "@/lib/enka/use-active-character";
import {
  buildDamageTable,
  characterStateFromEnka,
  computeSuggestionRankings,
  type AttackKind,
  type CharacterState,
  type DamageType,
  type EnemyModel,
} from "@/lib/genshin/damage";
import { BUFF_LIST, BUFFS, type BuffId, type BuffState, type SwirlElement } from "@/lib/genshin/damage/buffs";
import { extractCombatTotals } from "@/lib/genshin/eval";
import { loadGameDataCore } from "@/lib/genshin/game-data-core";
import { loadGameDataLite, localizeGameDataName, resolveCharacter } from "@/lib/genshin/game-data";
import { t, type Locale } from "@/lib/i18n";
import { formatDamage, formatNumber, formatPctPoints, formatStatInt } from "@/lib/ui/format";

type SetupMode = "enka" | "manual";
type ElementDamageType = Exclude<DamageType, "physical">;
type SetupKey = "A" | "B";
type BuffPanelTab = "buff" | "debuff";

interface SetupCombatTotals {
  hp: number;
  atk: number;
  def: number;
  em: number;
  erPct: number;
  critRatePct: number;
  critDmgPct: number;
  dmgBonusPhysicalPct: number;
  dmgBonusByElementPct: Record<DamageType, number>;
}

interface DamageSetup {
  mode: SetupMode;
  label: string;
  characterId: number;
  talentLevels: {
    normal: number;
    skill: number;
    burst: number;
  };
  combatTotals: SetupCombatTotals;
  damageTypeOverride?: DamageType | null;
  selectedElementBonus: ElementDamageType;
  buffStates: BuffState[];
}

interface PersistedDamageLabState {
  compareEnabled?: boolean;
  includeCrit?: boolean;
  activeSetup?: SetupKey;
  setupA?: DamageSetup;
  setupB?: DamageSetup;
  enemy?: EnemyModel;
}

const STORAGE_KEY_V1 = "genshin_calc_damage_setups_v1";
const STORAGE_KEY_V2 = "genshin_calc_damage_setups_v2";
const SETUP_A_LABEL = "Setup A";
const SETUP_B_LABEL = "Setup B";
const DEFAULT_TARGET_LEVEL = 90;
const DEFAULT_TARGET_RESISTANCE = 10;
const MAX_ACTIVE_BUFF_CHIPS = 4;

const DAMAGE_TYPES: readonly DamageType[] = [
  "physical",
  "pyro",
  "hydro",
  "electro",
  "cryo",
  "dendro",
  "anemo",
  "geo",
];

const ELEMENT_TYPES: readonly ElementDamageType[] = [
  "pyro",
  "hydro",
  "electro",
  "cryo",
  "dendro",
  "anemo",
  "geo",
];
const SWIRLABLE_ELEMENTS: readonly SwirlElement[] = ["pyro", "hydro", "electro", "cryo"];

const SECTION_ORDER: readonly AttackKind[] = ["normal", "skill", "burst"];

const ELEMENT_COLOR_BY_TYPE: Record<string, string> = {
  pyro: "#ef4444",
  hydro: "#3b82f6",
  electro: "#a855f7",
  cryo: "#06b6d4",
  dendro: "#22c55e",
  anemo: "#14b8a6",
  geo: "#f59e0b",
  physical: "#94a3b8",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function parseInputNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function toPositiveInteger(value: unknown, fallback = 0): number {
  const parsed = toFiniteNumber(value, fallback);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function normalizeDamageType(value: unknown): DamageType | null {
  if (typeof value !== "string") {
    return null;
  }
  return DAMAGE_TYPES.includes(value as DamageType) ? (value as DamageType) : null;
}

function normalizeElementDamageType(value: unknown): ElementDamageType {
  if (typeof value === "string" && ELEMENT_TYPES.includes(value as ElementDamageType)) {
    return value as ElementDamageType;
  }
  return "pyro";
}

function isSwirlElement(value: unknown): value is SwirlElement {
  return SWIRLABLE_ELEMENTS.includes(value as SwirlElement);
}

function deserializeEnemyModel(raw: unknown): EnemyModel {
  if (!isRecord(raw)) {
    return createDefaultEnemyModel();
  }

  // Legacy migration: convert old per-type map to base RES if needed.
  const legacyResistanceRaw = isRecord(raw.resistanceByType) ? raw.resistanceByType : {};
  let legacyFallbackRes = DEFAULT_TARGET_RESISTANCE;
  for (const type of DAMAGE_TYPES) {
    const next = toFiniteNumber(legacyResistanceRaw[type], Number.NaN);
    if (Number.isFinite(next)) {
      legacyFallbackRes = next;
      break;
    }
  }

  const level = Math.floor(clamp(toFiniteNumber(raw.level, DEFAULT_TARGET_LEVEL), 1, 100));
  const baseResPctPoints = toFiniteNumber(raw.baseResPctPoints, legacyFallbackRes);
  const damageType = normalizeDamageType(raw.damageType) ?? "physical";
  return {
    level,
    baseResPctPoints,
    damageType,
  };
}

function createEmptyElementBonuses(): Record<DamageType, number> {
  return {
    physical: 0,
    pyro: 0,
    hydro: 0,
    electro: 0,
    cryo: 0,
    dendro: 0,
    anemo: 0,
    geo: 0,
  };
}

function createDefaultCombatTotals(): SetupCombatTotals {
  return {
    hp: 12000,
    atk: 800,
    def: 700,
    em: 0,
    erPct: 100,
    critRatePct: 5,
    critDmgPct: 50,
    dmgBonusPhysicalPct: 0,
    dmgBonusByElementPct: createEmptyElementBonuses(),
  };
}

function createDefaultEnemyModel(): EnemyModel {
  return {
    level: DEFAULT_TARGET_LEVEL,
    baseResPctPoints: DEFAULT_TARGET_RESISTANCE,
    damageType: "physical",
  };
}

function cloneBuffStates(buffStates: BuffState[]): BuffState[] {
  return buffStates.map((state) => ({
    id: state.id,
    enabled: state.enabled === true,
    ...(state.params ? { params: { ...state.params } } : {}),
  }));
}

function normalizeBuffParams(
  buffId: BuffId,
  rawParams: unknown,
  selectedElement?: DamageType | null,
): Record<string, number | string | boolean> | undefined {
  const meta = BUFFS[buffId];
  const requiredParams = meta.requiredParams ?? [];
  if (requiredParams.length === 0) {
    return undefined;
  }

  const source = isRecord(rawParams) ? rawParams : {};
  const normalized: Record<string, number | string | boolean> = {};
  for (const key of requiredParams) {
    if (buffId === "artifact_vv_4p" && key === "swirlElement") {
      const fallbackSwirl = isSwirlElement(selectedElement)
        ? selectedElement
        : (isSwirlElement(meta.defaults?.swirlElement) ? meta.defaults?.swirlElement : "pyro");
      const rawValue = source[key];
      normalized[key] = isSwirlElement(rawValue) ? rawValue : fallbackSwirl;
      continue;
    }

    const fallback = meta.defaults?.[key];
    const numericFallback = typeof fallback === "number" ? fallback : 0;
    normalized[key] = toFiniteNumber(source[key], numericFallback);
  }
  return normalized;
}

function createDefaultBuffStates(): BuffState[] {
  return BUFF_LIST.map((meta) => {
    return {
      id: meta.id,
      enabled: false,
    };
  });
}

function normalizeBuffStates(raw: unknown): BuffState[] {
  const rawList = Array.isArray(raw) ? raw : [];
  const parsedById = new Map<BuffId, BuffState>();

  for (const entry of rawList) {
    if (!isRecord(entry)) {
      continue;
    }
    const idRaw = entry.id;
    if (typeof idRaw !== "string" || !(idRaw in BUFFS)) {
      continue;
    }
    const id = idRaw as BuffId;
    const params = normalizeBuffParams(id, entry.params);
    parsedById.set(id, {
      id,
      enabled: entry.enabled === true,
      ...(params ? { params } : {}),
    });
  }

  return BUFF_LIST.map((meta) => {
    const parsed = parsedById.get(meta.id);
    const enabled = parsed?.enabled === true;
    if (!enabled) {
      return {
        id: meta.id,
        enabled: false,
        ...(parsed?.params ? { params: { ...parsed.params } } : {}),
      };
    }
    const params = normalizeBuffParams(meta.id, parsed?.params);
    return {
      id: meta.id,
      enabled: true,
      ...(params ? { params } : {}),
    };
  });
}

function createManualSetup(label: string): DamageSetup {
  return {
    mode: "manual",
    label,
    characterId: 0,
    talentLevels: {
      normal: 6,
      skill: 6,
      burst: 6,
    },
    combatTotals: createDefaultCombatTotals(),
    damageTypeOverride: null,
    selectedElementBonus: "pyro",
    buffStates: createDefaultBuffStates(),
  };
}

function cloneSetup(base: DamageSetup, label: string): DamageSetup {
  return {
    ...base,
    label,
    talentLevels: { ...base.talentLevels },
    combatTotals: {
      ...base.combatTotals,
      dmgBonusByElementPct: { ...base.combatTotals.dmgBonusByElementPct },
    },
    buffStates: cloneBuffStates(base.buffStates),
  };
}

function localizeDamageType(
  type: DamageType,
  tr: (key: string, vars?: Record<string, string | number>) => string,
): string {
  return tr(`damageLab.damageTypes.${type}`);
}

function getBuffParamLabelKey(buffId: BuffId, paramKey: string): string {
  if (buffId === "kazuha_a4_bonus" && paramKey === "em") {
    return "damageLab.buffParams.kazuhaA4Bonus.em";
  }
  if (buffId === "artifact_vv_4p" && paramKey === "swirlElement") {
    return "damageLab.buffParams.artifactVv4p.swirlElement";
  }
  if (buffId === "bennett_burst_flat_atk" && paramKey === "flatAtk") {
    return "damageLab.buffParams.bennettBurstFlatAtk.flatAtk";
  }
  if (buffId === "custom_crit_rate_pct" && paramKey === "valuePct") {
    return "damageLab.buffParams.customCritRatePct.valuePct";
  }
  return "damageLab.buffParams.genericValue";
}

function getVisibleChipLabels(labels: string[]): { visible: string[]; hidden: number } {
  const visible = labels.slice(0, MAX_ACTIVE_BUFF_CHIPS);
  return {
    visible,
    hidden: Math.max(0, labels.length - visible.length),
  };
}

function normalizeCharacterElementToDamageType(value: unknown): ElementDamageType {
  if (typeof value !== "string") {
    return "pyro";
  }
  const lower = value.trim().toLowerCase();
  if (ELEMENT_TYPES.includes(lower as ElementDamageType)) {
    return lower as ElementDamageType;
  }
  return "pyro";
}

function selectElementForCharacter(
  characterId: number,
  elementByCharacterId: Map<number, ElementDamageType>,
): ElementDamageType {
  return elementByCharacterId.get(characterId) ?? "pyro";
}

function buildSetupFromEnka(
  selectedCharacter: EnkaCharacterSummary,
  label: string,
  selectedElementBonus: ElementDamageType,
): DamageSetup | null {
  const baseState = characterStateFromEnka(selectedCharacter);
  if (baseState.characterId <= 0) {
    return null;
  }

  const totals = extractCombatTotals(selectedCharacter.fightProps);
  return {
    mode: "enka",
    label,
    characterId: baseState.characterId,
    talentLevels: baseState.talentLevels,
    combatTotals: {
      hp: baseState.combatTotals.hp,
      atk: baseState.combatTotals.atk,
      def: baseState.combatTotals.def,
      em: baseState.combatTotals.em,
      erPct: totals.erPct,
      critRatePct: baseState.combatTotals.critRatePct,
      critDmgPct: baseState.combatTotals.critDmgPct,
      dmgBonusPhysicalPct: baseState.combatTotals.dmgBonusPhysicalPct,
      dmgBonusByElementPct: { ...baseState.combatTotals.dmgBonusByElementPct },
    },
    damageTypeOverride: null,
    selectedElementBonus,
    buffStates: createDefaultBuffStates(),
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

function setupSignature(setup: DamageSetup): string {
  return JSON.stringify({
    mode: setup.mode,
    characterId: setup.characterId,
    talentLevels: setup.talentLevels,
    combatTotals: setup.combatTotals,
    damageTypeOverride: setup.damageTypeOverride ?? null,
    selectedElementBonus: setup.selectedElementBonus,
    buffStates: setup.buffStates,
  });
}

function resolveEffectiveDamageTypeForEnemyInput(setup: DamageSetup): DamageType {
  return setup.damageTypeOverride ?? setup.selectedElementBonus;
}

function deserializeSetup(raw: unknown, fallbackLabel: string): DamageSetup | null {
  if (!isRecord(raw)) {
    return null;
  }

  const mode = raw.mode === "enka" ? "enka" : "manual";
  const label = typeof raw.label === "string" && raw.label.trim().length > 0 ? raw.label : fallbackLabel;
  const characterId = toPositiveInteger(raw.characterId, 0);
  const talentLevelsRaw = isRecord(raw.talentLevels) ? raw.talentLevels : {};
  const combatTotalsRaw = isRecord(raw.combatTotals) ? raw.combatTotals : {};
  const dmgBonusByElementRaw = isRecord(combatTotalsRaw.dmgBonusByElementPct)
    ? combatTotalsRaw.dmgBonusByElementPct
    : {};
  const defaultTotals = createDefaultCombatTotals();
  const mappedByElement: Record<DamageType, number> = {
    ...defaultTotals.dmgBonusByElementPct,
  };
  for (const type of DAMAGE_TYPES) {
    mappedByElement[type] = toFiniteNumber(dmgBonusByElementRaw[type], mappedByElement[type]);
  }

  return {
    mode,
    label,
    characterId,
    talentLevels: {
      normal: toPositiveInteger(talentLevelsRaw.normal, 6),
      skill: toPositiveInteger(talentLevelsRaw.skill, 6),
      burst: toPositiveInteger(talentLevelsRaw.burst, 6),
    },
    combatTotals: {
      hp: toFiniteNumber(combatTotalsRaw.hp, defaultTotals.hp),
      atk: toFiniteNumber(combatTotalsRaw.atk, defaultTotals.atk),
      def: toFiniteNumber(combatTotalsRaw.def, defaultTotals.def),
      em: toFiniteNumber(combatTotalsRaw.em, defaultTotals.em),
      erPct: toFiniteNumber(combatTotalsRaw.erPct, defaultTotals.erPct),
      critRatePct: toFiniteNumber(combatTotalsRaw.critRatePct, defaultTotals.critRatePct),
      critDmgPct: toFiniteNumber(combatTotalsRaw.critDmgPct, defaultTotals.critDmgPct),
      dmgBonusPhysicalPct: toFiniteNumber(
        combatTotalsRaw.dmgBonusPhysicalPct,
        defaultTotals.dmgBonusPhysicalPct,
      ),
      dmgBonusByElementPct: mappedByElement,
    },
    damageTypeOverride: normalizeDamageType(raw.damageTypeOverride),
    selectedElementBonus: normalizeElementDamageType(raw.selectedElementBonus),
    buffStates: normalizeBuffStates(raw.buffStates),
  };
}

function CharacterElementDot({ element }: { element: string | undefined }) {
  if (!element) {
    return null;
  }
  const normalized = element.trim().toLowerCase();
  const color = ELEMENT_COLOR_BY_TYPE[normalized];
  if (!color) {
    return null;
  }
  return <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />;
}

export function DamageLab() {
  const { locale } = useLocale();
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const core = useMemo(() => loadGameDataCore(), []);
  const dataLite = useMemo(() => loadGameDataLite(), []);
  const activeEnka = useActiveEnkaCharacter(locale);

  const [setupA, setSetupA] = useState<DamageSetup>(() => createManualSetup(SETUP_A_LABEL));
  const [setupB, setSetupB] = useState<DamageSetup>(() => createManualSetup(SETUP_B_LABEL));
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [includeCrit, setIncludeCrit] = useState(true);
  const [activeSetupKey, setActiveSetupKey] = useState<SetupKey>("A");
  const [buffPanelTab, setBuffPanelTab] = useState<BuffPanelTab>("buff");
  const [enemy, setEnemy] = useState<EnemyModel>(() => createDefaultEnemyModel());
  const [hydrated, setHydrated] = useState(false);

  const characterOptions = useMemo(() => {
    const rows = Object.values(core.characters).map((character) => {
      const resolved = resolveCharacter(character.id, dataLite);
      const name = character.names?.[locale] ?? localizeGameDataName(resolved?.raw, locale) ?? character.name;
      const element = normalizeCharacterElementToDamageType(character.element);
      return {
        id: character.id,
        name,
        iconUrl: resolved?.iconUrl,
        element,
      };
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [core.characters, dataLite, locale]);

  const elementByCharacterId = useMemo(() => {
    const map = new Map<number, ElementDamageType>();
    for (const option of characterOptions) {
      map.set(option.id, option.element);
    }
    return map;
  }, [characterOptions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setHydrated(true);
      return;
    }

    const rawV2 = window.localStorage.getItem(STORAGE_KEY_V2);
    const rawV1 = window.localStorage.getItem(STORAGE_KEY_V1);
    const raw = rawV2 ?? rawV1;
    const migratedFromV1 = !rawV2 && Boolean(rawV1);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PersistedDamageLabState;
        const nextA = deserializeSetup(
          migratedFromV1 && isRecord(parsed.setupA)
            ? { ...parsed.setupA, buffStates: [] }
            : parsed.setupA,
          SETUP_A_LABEL,
        );
        const nextB = deserializeSetup(
          migratedFromV1 && isRecord(parsed.setupB)
            ? { ...parsed.setupB, buffStates: [] }
            : parsed.setupB,
          SETUP_B_LABEL,
        );
        if (nextA) {
          setSetupA(nextA);
        }
        if (nextB) {
          setSetupB(nextB);
        }
        if (typeof parsed.compareEnabled === "boolean") {
          setCompareEnabled(parsed.compareEnabled);
        }
        if (typeof parsed.includeCrit === "boolean") {
          setIncludeCrit(parsed.includeCrit);
        }
        if (parsed.activeSetup === "A" || parsed.activeSetup === "B") {
          setActiveSetupKey(parsed.activeSetup);
        }
        if (parsed.enemy) {
          setEnemy(deserializeEnemyModel(parsed.enemy));
        }
      } catch {
        // Ignore malformed local storage payload.
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }
    const payload: PersistedDamageLabState = {
      compareEnabled,
      includeCrit,
      activeSetup: activeSetupKey,
      setupA,
      setupB,
      enemy,
    };
    window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(payload));
  }, [
    activeSetupKey,
    compareEnabled,
    enemy,
    hydrated,
    includeCrit,
    setupA,
    setupB,
  ]);

  useEffect(() => {
    if (!hydrated || !activeEnka.selectedCharacter) {
      return;
    }
    const selectedElementBonus = selectElementForCharacter(
      toPositiveInteger(activeEnka.selectedCharacter.avatarId, 0),
      elementByCharacterId,
    );
    const importedA = buildSetupFromEnka(activeEnka.selectedCharacter, SETUP_A_LABEL, selectedElementBonus);
    if (!importedA) {
      return;
    }

    setSetupA((previous) => {
      const shouldAutoFill = previous.mode === "enka" || previous.characterId <= 0;
      if (!shouldAutoFill) {
        return previous;
      }
      const importedWithBuffs: DamageSetup = {
        ...importedA,
        buffStates: cloneBuffStates(previous.buffStates),
      };
      if (setupSignature(previous) === setupSignature(importedWithBuffs)) {
        return previous;
      }
      return importedWithBuffs;
    });

    setSetupB((previous) => {
      if (previous.mode !== "enka") {
        return previous;
      }
      const importedB: DamageSetup = {
        ...importedA,
        label: SETUP_B_LABEL,
        buffStates: cloneBuffStates(previous.buffStates),
      };
      if (setupSignature(previous) === setupSignature(importedB)) {
        return previous;
      }
      return importedB;
    });
  }, [activeEnka.selectedCharacter, elementByCharacterId, hydrated]);

  useEffect(() => {
    if (!compareEnabled) {
      setActiveSetupKey("A");
      return;
    }
    setSetupB((previous) => {
      if (previous.characterId > 0) {
        return previous;
      }
      return cloneSetup(setupA, SETUP_B_LABEL);
    });
  }, [compareEnabled]);

  const activeSetup = activeSetupKey === "A" ? setupA : setupB;
  const effectiveDamageTypeForEnemy = resolveEffectiveDamageTypeForEnemyInput(activeSetup);
  const effectiveResistancePct = enemy.baseResPctPoints;
  const enemyForSetup = (setup: DamageSetup): EnemyModel => ({
    level: enemy.level,
    baseResPctPoints: enemy.baseResPctPoints,
    damageType: resolveEffectiveDamageTypeForEnemyInput(setup),
  });
  const updateActiveSetup = (updater: (current: DamageSetup) => DamageSetup) => {
    if (activeSetupKey === "A") {
      setSetupA((current) => updater(current));
      return;
    }
    setSetupB((current) => updater(current));
  };

  const setActiveBuffEnabled = (buffId: BuffId, enabled: boolean) => {
    updateActiveSetup((current) => {
      const nextBuffStates = cloneBuffStates(current.buffStates);
      const index = nextBuffStates.findIndex((entry) => entry.id === buffId);
      const params = normalizeBuffParams(
        buffId,
        index >= 0 ? nextBuffStates[index]?.params : undefined,
        current.selectedElementBonus,
      );
      const nextState: BuffState = {
        id: buffId,
        enabled,
        ...(params ? { params } : {}),
      };
      if (index >= 0) {
        nextBuffStates[index] = nextState;
      } else {
        nextBuffStates.push(nextState);
      }
      return {
        ...current,
        buffStates: normalizeBuffStates(nextBuffStates),
      };
    });
  };

  const setActiveBuffParam = (
    buffId: BuffId,
    paramKey: string,
    value: number | string | boolean,
  ) => {
    updateActiveSetup((current) => {
      const nextBuffStates = cloneBuffStates(current.buffStates);
      const index = nextBuffStates.findIndex((entry) => entry.id === buffId);
      const baseParams = normalizeBuffParams(
        buffId,
        index >= 0 ? nextBuffStates[index]?.params : undefined,
        current.selectedElementBonus,
      ) ?? {};
      const nextState: BuffState = {
        id: buffId,
        enabled: index >= 0 ? nextBuffStates[index].enabled : true,
        params: {
          ...baseParams,
          [paramKey]: value,
        },
      };
      if (index >= 0) {
        nextBuffStates[index] = nextState;
      } else {
        nextBuffStates.push(nextState);
      }
      return {
        ...current,
        buffStates: normalizeBuffStates(nextBuffStates),
      };
    });
  };

  const setupBuffEntries = useMemo(() => {
    return BUFF_LIST.filter((entry) => entry.category === buffPanelTab);
  }, [buffPanelTab]);

  const activeBuffChips = useMemo(() => {
    const byId = new Map(activeSetup.buffStates.map((state) => [state.id, state]));
    const buffLabels: string[] = [];
    const debuffLabels: string[] = [];
    for (const meta of BUFF_LIST) {
      const state = byId.get(meta.id);
      if (!state?.enabled) {
        continue;
      }
      const label = t(locale, meta.labelKey);
      if (meta.category === "debuff") {
        debuffLabels.push(label);
      } else {
        buffLabels.push(label);
      }
    }
    return {
      buffs: getVisibleChipLabels(buffLabels),
      debuffs: getVisibleChipLabels(debuffLabels),
    };
  }, [activeSetup.buffStates, locale]);

  const setActiveSetupMode = (mode: SetupMode) => {
    if (mode === "enka" && activeEnka.selectedCharacter) {
      const selectedElementBonus = selectElementForCharacter(
        toPositiveInteger(activeEnka.selectedCharacter.avatarId, 0),
        elementByCharacterId,
      );
      const imported = buildSetupFromEnka(
        activeEnka.selectedCharacter,
        activeSetup.label,
        selectedElementBonus,
      );
      if (imported) {
        const importedWithBuffs: DamageSetup = {
          ...imported,
          buffStates: cloneBuffStates(activeSetup.buffStates),
        };
        updateActiveSetup(() => importedWithBuffs);
        return;
      }
    }
    updateActiveSetup((current) => ({ ...current, mode: "manual" }));
  };

  const setupATable = useMemo(() => {
    if (setupA.characterId <= 0) {
      return null;
    }
    return buildDamageTable(setupToCharacterState(setupA), {
      locale,
      includeCrit,
      damageTypeOverride: setupA.damageTypeOverride ?? null,
      selectedElement: setupA.selectedElementBonus,
      enemy: enemyForSetup(setupA),
      buffStates: setupA.buffStates,
    });
  }, [enemy, includeCrit, locale, setupA]);

  const setupBTable = useMemo(() => {
    if (!compareEnabled || setupB.characterId <= 0) {
      return null;
    }
    return buildDamageTable(setupToCharacterState(setupB), {
      locale,
      includeCrit,
      damageTypeOverride: setupB.damageTypeOverride ?? null,
      selectedElement: setupB.selectedElementBonus,
      enemy: enemyForSetup(setupB),
      buffStates: setupB.buffStates,
    });
  }, [compareEnabled, enemy, includeCrit, locale, setupB]);

  const setupASuggestions = useMemo(() => {
    if (setupA.characterId <= 0) {
      return [];
    }
    return computeSuggestionRankings(setupA, {
      includeCrit,
      topN: 5,
      enemy: enemyForSetup(setupA),
      buffStates: setupA.buffStates,
    });
  }, [enemy, includeCrit, setupA]);

  const currentCharacter = useMemo(() => {
    if (activeSetup.characterId <= 0) {
      return null;
    }
    return characterOptions.find((option) => option.id === activeSetup.characterId) ?? null;
  }, [activeSetup.characterId, characterOptions]);

  return (
    <main className="flex min-h-screen w-full flex-col gap-4 px-8 py-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="font-title text-3xl font-semibold tracking-tight">{tr("damageLab.title")}</h1>
              <Badge variant="secondary">beta</Badge>
            </div>
            <p className="text-muted-foreground text-sm">{tr("damageLab.betaNote")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/">{tr("import.backHome")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/import">{tr("home.importViaUid")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_380px_minmax(0,1fr)]">
        <div className="min-w-0">
          <Card className="h-fit min-w-0">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="font-title">{tr("damageLab.totals.title")}</CardTitle>
            <CardDescription>
              {activeSetup.mode === "enka" ? tr("damageLab.totals.readonly") : tr("damageLab.totals.editable")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <StatInputRow
              label={tr("damageLab.totals.hp")}
              value={activeSetup.combatTotals.hp}
              locale={locale}
              readOnly={activeSetup.mode === "enka"}
              onChange={(next) => updateActiveSetup((current) => ({
                ...current,
                combatTotals: { ...current.combatTotals, hp: next },
              }))}
            />
            <StatInputRow
              label={tr("damageLab.totals.atk")}
              value={activeSetup.combatTotals.atk}
              locale={locale}
              readOnly={activeSetup.mode === "enka"}
              onChange={(next) => updateActiveSetup((current) => ({
                ...current,
                combatTotals: { ...current.combatTotals, atk: next },
              }))}
            />
            <StatInputRow
              label={tr("damageLab.totals.def")}
              value={activeSetup.combatTotals.def}
              locale={locale}
              readOnly={activeSetup.mode === "enka"}
              onChange={(next) => updateActiveSetup((current) => ({
                ...current,
                combatTotals: { ...current.combatTotals, def: next },
              }))}
            />
            <StatInputRow
              label={tr("damageLab.totals.em")}
              value={activeSetup.combatTotals.em}
              locale={locale}
              readOnly={activeSetup.mode === "enka"}
              onChange={(next) => updateActiveSetup((current) => ({
                ...current,
                combatTotals: { ...current.combatTotals, em: next },
              }))}
            />
            <StatInputRow
              label={tr("damageLab.totals.cr")}
              value={activeSetup.combatTotals.critRatePct}
              locale={locale}
              formatReadOnlyValue={formatPctPoints}
              readOnly={activeSetup.mode === "enka"}
              onChange={(next) => updateActiveSetup((current) => ({
                ...current,
                combatTotals: { ...current.combatTotals, critRatePct: next },
              }))}
            />
            <StatInputRow
              label={tr("damageLab.totals.cd")}
              value={activeSetup.combatTotals.critDmgPct}
              locale={locale}
              formatReadOnlyValue={formatPctPoints}
              readOnly={activeSetup.mode === "enka"}
              onChange={(next) => updateActiveSetup((current) => ({
                ...current,
                combatTotals: { ...current.combatTotals, critDmgPct: next },
              }))}
            />
            <StatInputRow
              label={tr("damageLab.totals.er")}
              value={activeSetup.combatTotals.erPct}
              locale={locale}
              formatReadOnlyValue={formatPctPoints}
              readOnly={activeSetup.mode === "enka"}
              onChange={(next) => updateActiveSetup((current) => ({
                ...current,
                combatTotals: { ...current.combatTotals, erPct: next },
              }))}
            />
            <StatInputRow
              label={tr("damageLab.totals.physicalBonus")}
              value={activeSetup.combatTotals.dmgBonusPhysicalPct}
              locale={locale}
              formatReadOnlyValue={formatPctPoints}
              readOnly={activeSetup.mode === "enka"}
              onChange={(next) => updateActiveSetup((current) => ({
                ...current,
                combatTotals: { ...current.combatTotals, dmgBonusPhysicalPct: next },
              }))}
            />

            <div className="space-y-2 rounded-md border p-2.5">
              <label className="text-muted-foreground text-xs font-medium">{tr("damageLab.totals.selectedElementBonus")}</label>
              <Select
                value={activeSetup.selectedElementBonus}
                onValueChange={(value) => updateActiveSetup((current) => ({
                  ...current,
                  selectedElementBonus: normalizeElementDamageType(value),
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ELEMENT_TYPES.map((type) => (
                    <SelectItem key={`selected-bonus-${type}`} value={type}>
                      {localizeDamageType(type, tr)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <StatInputRow
                label={localizeDamageType(activeSetup.selectedElementBonus, tr)}
                value={activeSetup.combatTotals.dmgBonusByElementPct[activeSetup.selectedElementBonus]}
                locale={locale}
                formatReadOnlyValue={formatPctPoints}
                readOnly={activeSetup.mode === "enka"}
                onChange={(next) => updateActiveSetup((current) => ({
                  ...current,
                  combatTotals: {
                    ...current.combatTotals,
                    dmgBonusByElementPct: {
                      ...current.combatTotals.dmgBonusByElementPct,
                      [current.selectedElementBonus]: next,
                    },
                  },
                }))}
              />
            </div>

            <details className="rounded-md border p-2.5">
              <summary className="cursor-pointer text-sm font-medium">{tr("damageLab.totals.advanced")}</summary>
              <div className="mt-3 space-y-2">
                <p className="text-muted-foreground text-xs">{tr("damageLab.totals.allElementBonuses")}</p>
                {ELEMENT_TYPES.map((type) => (
                  <StatInputRow
                    key={`advanced-bonus-${type}`}
                    label={localizeDamageType(type, tr)}
                    value={activeSetup.combatTotals.dmgBonusByElementPct[type]}
                    locale={locale}
                    formatReadOnlyValue={formatPctPoints}
                    readOnly={activeSetup.mode === "enka"}
                    onChange={(next) => updateActiveSetup((current) => ({
                      ...current,
                      combatTotals: {
                        ...current.combatTotals,
                        dmgBonusByElementPct: {
                          ...current.combatTotals.dmgBonusByElementPct,
                          [type]: next,
                        },
                      },
                    }))}
                  />
                ))}
              </div>
            </details>
          </CardContent>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="h-fit min-w-0">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="font-title">{tr("damageLab.setup.title")}</CardTitle>
            <CardDescription>{tr("damageLab.setup.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={compareEnabled ? "default" : "outline"}
                onClick={() => setCompareEnabled((previous) => !previous)}
              >
                {compareEnabled ? tr("damageLab.compare.disable") : tr("damageLab.compare.enable")}
              </Button>
              {compareEnabled && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSetupB(cloneSetup(setupA, SETUP_B_LABEL));
                      setActiveSetupKey("B");
                    }}
                  >
                    {tr("damageLab.compare.duplicate")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSetupB(createManualSetup(SETUP_B_LABEL))}
                  >
                    {tr("damageLab.compare.resetB")}
                  </Button>
                </>
              )}
            </div>

            {compareEnabled && (
              <Tabs value={activeSetupKey} onValueChange={(value) => setActiveSetupKey(value as SetupKey)}>
                <TabsList className="w-full">
                  <TabsTrigger className="font-title" value="A">{tr("damageLab.compare.setupA")}</TabsTrigger>
                  <TabsTrigger className="font-title" value="B">{tr("damageLab.compare.setupB")}</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{tr("damageLab.compare.editing")}: {activeSetup.label}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("damageLab.setup.mode")}</label>
              <Select
                value={activeSetup.mode}
                onValueChange={(value) => setActiveSetupMode(value as SetupMode)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{tr("damageLab.setup.modeManual")}</SelectItem>
                  <SelectItem value="enka" disabled={!activeEnka.selectedCharacter}>
                    {tr("damageLab.setup.modeEnka")}
                  </SelectItem>
                </SelectContent>
              </Select>
              {activeSetup.mode === "enka" && (
                <p className="text-muted-foreground text-xs">
                  {activeEnka.selectedCharacter
                    ? tr("damageLab.setup.importedActive")
                    : tr("damageLab.setup.importedMissing")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("damageLab.setup.character")}</label>
              <Select
                value={activeSetup.characterId > 0 ? String(activeSetup.characterId) : "none"}
                onValueChange={(value) => {
                  if (value === "none") {
                    updateActiveSetup((current) => ({ ...current, characterId: 0 }));
                    return;
                  }
                  const nextId = toPositiveInteger(value, 0);
                  const nextElement = selectElementForCharacter(nextId, elementByCharacterId);
                  updateActiveSetup((current) => ({
                    ...current,
                    characterId: nextId,
                    selectedElementBonus: nextElement,
                  }));
                }}
                disabled={activeSetup.mode === "enka"}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tr("damageLab.setup.characterPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tr("damageLab.setup.characterPlaceholder")}</SelectItem>
                  {characterOptions.map((option) => (
                    <SelectItem key={`damage-character-${option.id}`} value={String(option.id)}>
                      <span className="inline-flex items-center gap-2">
                        <CharacterElementDot element={option.element} />
                        <span>{option.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeSetup.mode === "manual" && (
                <p className="text-muted-foreground text-xs">{tr("damageLab.setup.manualHelper")}</p>
              )}
              {currentCharacter?.iconUrl && (
                <div className="inline-flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                  <img alt={currentCharacter.name} className="h-6 w-6 rounded-md border object-cover" src={currentCharacter.iconUrl} />
                  <span>{currentCharacter.name}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("damageLab.setup.talents")}</label>
              <div className="grid gap-2 sm:grid-cols-3">
                <LabeledNumberInput
                  label={tr("damageLab.setup.talentNormal")}
                  value={activeSetup.talentLevels.normal}
                  min={1}
                  max={13}
                  onChange={(next) => updateActiveSetup((current) => ({
                    ...current,
                    talentLevels: { ...current.talentLevels, normal: Math.max(1, Math.floor(next)) },
                  }))}
                />
                <LabeledNumberInput
                  label={tr("damageLab.setup.talentSkill")}
                  value={activeSetup.talentLevels.skill}
                  min={1}
                  max={13}
                  onChange={(next) => updateActiveSetup((current) => ({
                    ...current,
                    talentLevels: { ...current.talentLevels, skill: Math.max(1, Math.floor(next)) },
                  }))}
                />
                <LabeledNumberInput
                  label={tr("damageLab.setup.talentBurst")}
                  value={activeSetup.talentLevels.burst}
                  min={1}
                  max={13}
                  onChange={(next) => updateActiveSetup((current) => ({
                    ...current,
                    talentLevels: { ...current.talentLevels, burst: Math.max(1, Math.floor(next)) },
                  }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tr("damageLab.setup.damageTypeOverride")}</label>
              <Select
                value={activeSetup.damageTypeOverride ?? "auto"}
                onValueChange={(value) => updateActiveSetup((current) => ({
                  ...current,
                  damageTypeOverride: value === "auto" ? null : normalizeDamageType(value),
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{tr("damageLab.setup.damageTypeAuto")}</SelectItem>
                  {DAMAGE_TYPES.map((type) => (
                    <SelectItem key={`override-${type}`} value={type}>
                      {localizeDamageType(type, tr)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{tr("damageLab.buffsPanel.title")}</p>
                <p className="text-muted-foreground text-xs">{tr("damageLab.buffsPanel.description")}</p>
              </div>

              <Tabs value={buffPanelTab} onValueChange={(value) => setBuffPanelTab(value as BuffPanelTab)}>
                <TabsList className="w-full">
                  <TabsTrigger value="buff">{tr("damageLab.buffsPanel.tabs.buffs")}</TabsTrigger>
                  <TabsTrigger value="debuff">{tr("damageLab.buffsPanel.tabs.debuffs")}</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="space-y-2">
                {setupBuffEntries.map((meta) => {
                  const state = activeSetup.buffStates.find((entry) => entry.id === meta.id);
                  const isEnabled = state?.enabled === true;
                  const requiredParams = meta.requiredParams ?? [];

                  return (
                    <div key={`buff-entry-${meta.id}`} className="space-y-2 rounded-md border p-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium" title={tr(meta.labelKey)}>
                            {tr(meta.labelKey)}
                          </p>
                          <p className="text-muted-foreground text-xs">{tr(meta.descriptionKey)}</p>
                        </div>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => setActiveBuffEnabled(meta.id, checked)}
                          aria-label={tr(meta.labelKey)}
                        />
                      </div>

                      {isEnabled && requiredParams.length > 0 && (
                        <div className="grid gap-2">
                          {requiredParams.map((paramKey) => {
                            const normalizedParams = normalizeBuffParams(
                              meta.id,
                              state?.params,
                              activeSetup.selectedElementBonus,
                            );
                            const rawValue = normalizedParams?.[paramKey];
                            if (meta.id === "artifact_vv_4p" && paramKey === "swirlElement") {
                              const swirlElement = isSwirlElement(rawValue) ? rawValue : "pyro";
                              return (
                                <div key={`buff-param-${meta.id}-${paramKey}`} className="space-y-1">
                                  <label className="text-muted-foreground text-xs font-medium">
                                    {tr(getBuffParamLabelKey(meta.id, paramKey))}
                                  </label>
                                  <Select
                                    value={swirlElement}
                                    onValueChange={(value) => setActiveBuffParam(meta.id, paramKey, value)}
                                  >
                                    <SelectTrigger className="w-full">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {SWIRLABLE_ELEMENTS.map((element) => (
                                        <SelectItem key={`vv-swirl-${element}`} value={element}>
                                          {localizeDamageType(element, tr)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            }

                            const value = toFiniteNumber(rawValue, 0);
                            return (
                              <LabeledNumberInput
                                key={`buff-param-${meta.id}-${paramKey}`}
                                label={tr(getBuffParamLabelKey(meta.id, paramKey))}
                                value={value}
                                onChange={(next) => setActiveBuffParam(meta.id, paramKey, next)}
                              />
                            );
                          })}
                          {meta.id === "artifact_vv_4p" && (
                            <p className="text-muted-foreground text-xs">
                              {tr("damageLab.buffs.artifactVv4pHelper")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {setupBuffEntries.length === 0 && (
                  <p className="text-muted-foreground text-xs">{tr("damageLab.buffsPanel.empty")}</p>
                )}
              </div>
            </div>

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">{tr("damageLab.setup.targetAdvanced")}</summary>
              <div className="mt-3 space-y-2">
                <LabeledNumberInput
                  label={tr("damageLab.setup.targetLevel")}
                  value={enemy.level}
                  min={1}
                  max={100}
                  onChange={(next) => setEnemy((current) => ({
                    ...current,
                    level: Math.floor(clamp(next, 1, 100)),
                  }))}
                />
                <LabeledNumberInput
                  label={tr("damageLab.setup.targetBaseRes")}
                  value={effectiveResistancePct}
                  onChange={(next) => setEnemy((current) => ({
                    ...current,
                    baseResPctPoints: next,
                  }))}
                />
                <p className="text-muted-foreground text-xs">
                  {tr("damageLab.setup.targetApplyTo", {
                    type: localizeDamageType(effectiveDamageTypeForEnemy, tr),
                  })}
                </p>
                <p className="text-muted-foreground text-xs">
                  {tr("damageLab.setup.targetResistanceHint", {
                    value: DEFAULT_TARGET_RESISTANCE,
                  })}
                </p>
              </div>
            </details>

            <div className="space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeCrit} onCheckedChange={(checked) => setIncludeCrit(checked === true)} />
                <span>{tr("damageLab.setup.includeCrit")}</span>
              </label>
            </div>
          </CardContent>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className="h-fit min-w-0">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="font-title">{tr("damageLab.results.title")}</CardTitle>
            <CardDescription>{tr("damageLab.results.description")}</CardDescription>
            {(activeBuffChips.buffs.visible.length > 0 || activeBuffChips.debuffs.visible.length > 0) && (
              <div className="space-y-1.5 pt-1">
                {activeBuffChips.buffs.visible.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-muted-foreground text-[11px] font-medium">
                      {tr("damageLab.results.activeBuffs")}
                    </span>
                    {activeBuffChips.buffs.visible.map((label, index) => (
                      <Badge key={`active-buff-${index}-${label}`} variant="secondary" className="text-[11px]">
                        {label}
                      </Badge>
                    ))}
                    {activeBuffChips.buffs.hidden > 0 && (
                      <Badge variant="secondary" className="text-[11px]">
                        +{activeBuffChips.buffs.hidden}
                      </Badge>
                    )}
                  </div>
                )}
                {activeBuffChips.debuffs.visible.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-muted-foreground text-[11px] font-medium">
                      {tr("damageLab.results.activeDebuffs")}
                    </span>
                    {activeBuffChips.debuffs.visible.map((label, index) => (
                      <Badge key={`active-debuff-${index}-${label}`} variant="outline" className="text-[11px]">
                        {label}
                      </Badge>
                    ))}
                    {activeBuffChips.debuffs.hidden > 0 && (
                      <Badge variant="outline" className="text-[11px]">
                        +{activeBuffChips.debuffs.hidden}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="min-w-0 space-y-3 pt-0">
            <div className="space-y-2 rounded-md border p-3">
              <p className="font-title text-sm font-medium">{tr("damageLab.suggestions.title")}</p>
              <p className="text-muted-foreground text-xs">{tr("damageLab.suggestions.analyzingSetupA")}</p>
              {setupASuggestions.length === 0 && (
                <p className="text-muted-foreground text-xs">{tr("damageLab.suggestions.empty")}</p>
              )}
              {setupASuggestions.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {setupASuggestions.map((item) => (
                    <li key={`damage-suggestion-${item.suggestionId}`} className="rounded-md border p-2">
                      <p className="font-medium">
                        {tr("damageLab.suggestions.impact", {
                          label: tr(`damageLab.suggestions.items.${item.suggestionId}`),
                          deltaPct: formatNumber(item.deltaPct, locale, 1),
                        })}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {tr("damageLab.suggestions.deltaAbs", {
                          value: formatDamage(item.deltaAbs, locale),
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!setupATable && <p className="text-muted-foreground text-sm">{tr("damageLab.results.noSetupA")}</p>}
            {compareEnabled && !setupBTable && (
              <p className="text-muted-foreground text-sm">{tr("damageLab.results.noSetupB")}</p>
            )}

            {setupATable && SECTION_ORDER.map((section) => {
              const rowsA = setupATable.sections[section];
              const rowsB = compareEnabled ? (setupBTable?.sections[section] ?? []) : [];
              const totalRows = compareEnabled ? Math.max(rowsA.length, rowsB.length) : rowsA.length;
              return (
                <DamageTableSection
                  key={`damage-table-section-${section}`}
                  title={tr(`damageLab.sections.${section}`)}
                  count={totalRows}
                  rowsA={rowsA}
                  rowsB={compareEnabled ? rowsB : undefined}
                  locale={locale}
                  labels={{
                    hit: tr("damageLab.results.hit"),
                    nonCrit: tr("damageLab.results.nonCrit"),
                    crit: tr("damageLab.results.crit"),
                    avg: tr("damageLab.results.avg"),
                    delta: tr("damageLab.results.delta"),
                    damageType: tr("damageLab.results.damageType"),
                    noRows: tr("damageLab.results.noRows"),
                  }}
                  localizeDamageType={(type) => localizeDamageType(type, tr)}
                />
              );
            })}
          </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function LabeledNumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-muted-foreground text-xs font-medium">{label}</label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(parseInputNumber(event.target.value, value))}
      />
    </div>
  );
}

function StatInputRow({
  label,
  value,
  locale,
  formatReadOnlyValue = formatStatInt,
  readOnly,
  onChange,
}: {
  label: string;
  value: number;
  locale: Locale;
  formatReadOnlyValue?: (value: number, locale?: Locale) => string;
  readOnly: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_130px] items-center gap-2 rounded-md border p-2.5">
      <label className="text-muted-foreground text-xs">{label}</label>
      {readOnly ? (
        <p className="text-right text-sm font-medium">{formatReadOnlyValue(value, locale)}</p>
      ) : (
        <Input
          type="number"
          value={value}
          onChange={(event) => onChange(parseInputNumber(event.target.value, value))}
          className="h-8 text-right"
        />
      )}
    </div>
  );
}
