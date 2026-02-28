import { excludedSubStatForMain } from "./tables";
import { AttemptSource, MainStat, Slot, SubStat } from "./types";
import { LOCALES, type Locale } from "@/lib/i18n/locales";

export const SHARE_TARGET_SETS = ["A", "B"] as const;
export const SHARE_RULE_MODES = ["all", "atLeast"] as const;
export const SHARE_RUN_MODES = ["runs", "resin"] as const;
export const SHARE_UPGRADE_PRESETS = ["crit", "er", "em", "custom"] as const;
export const SHARE_FARM_STRATEGIES = ["domainsOnly", "strongbox", "transmuterOnly", "combined"] as const;
export const SHARE_OPTIMIZER_OBJECTIVES = ["constraints", "cv"] as const;
export const SHARE_THEMES = ["system", "light", "dark"] as const;

export type ShareTargetSet = (typeof SHARE_TARGET_SETS)[number];
export type ShareRuleMode = (typeof SHARE_RULE_MODES)[number];
export type ShareRunMode = (typeof SHARE_RUN_MODES)[number];
export type ShareUpgradePreset = (typeof SHARE_UPGRADE_PRESETS)[number];
export type ShareFarmStrategy = (typeof SHARE_FARM_STRATEGIES)[number];
export type ShareOptimizerObjective = (typeof SHARE_OPTIMIZER_OBJECTIVES)[number];
export type ShareTheme = (typeof SHARE_THEMES)[number];

export interface ArtifactCalculatorShareState {
  targetSet: ShareTargetSet;
  slot: Slot;
  main: MainStat;
  desiredSubs: SubStat[];
  ruleMode: ShareRuleMode;
  atLeastN: number;
  runMode: ShareRunMode;
  runs: number;
  resin: number;
  targetProb: number;
  upgradeEnabled: boolean;
  upgradePreset: ShareUpgradePreset;
  upgradeCustomGroup: SubStat[];
  upgradeK: number;
  farmStrategy: ShareFarmStrategy;
  recycleRatePct: number;
  transmuterEnabled: boolean;
  transmuterElixirs: number;
  transmuterMaxCrafts: number;
  transmuterFixedSubs: SubStat[];
  cvEnabled: boolean;
  cvThreshold: number;
  cvAttemptSource: AttemptSource;
  optimizerEnabled: boolean;
  optimizerObjective: ShareOptimizerObjective;
}

export interface ArtifactCalculatorSharePayload {
  state: ArtifactCalculatorShareState;
  lang?: Locale;
  theme?: ShareTheme;
}

interface CompactShareState {
  v: 1 | 2;
  t?: ShareTargetSet | ShareTheme;
  g?: ShareTargetSet;
  s: Slot;
  m: MainStat;
  d: SubStat[];
  rm: ShareRuleMode;
  n: number;
  hm: ShareRunMode;
  r: number;
  rs: number;
  p: number;
  ue: boolean;
  up: ShareUpgradePreset;
  ug: SubStat[];
  uk: number;
  fs: ShareFarmStrategy;
  rr: number;
  te: boolean;
  tl: number;
  tm: number;
  tf: SubStat[];
  ce: boolean;
  ct: number;
  cs: AttemptSource;
  oe: boolean;
  oo: ShareOptimizerObjective;
  l?: Locale;
}

const SLOT_VALUES = Object.values(Slot);
const MAIN_VALUES = Object.values(MainStat);
const SUBSTAT_VALUES = Object.values(SubStat);
const ATTEMPT_SOURCES: AttemptSource[] = ["domain", "strongbox", "transmuter"];

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

export function encodeArtifactCalculatorShareState(
  state: ArtifactCalculatorShareState,
  options?: { lang?: Locale; theme?: ShareTheme },
): string {
  const compact: CompactShareState = {
    v: 2,
    g: state.targetSet,
    t: options?.theme,
    s: state.slot,
    m: state.main,
    d: state.desiredSubs,
    rm: state.ruleMode,
    n: state.atLeastN,
    hm: state.runMode,
    r: state.runs,
    rs: state.resin,
    p: state.targetProb,
    ue: state.upgradeEnabled,
    up: state.upgradePreset,
    ug: state.upgradeCustomGroup,
    uk: state.upgradeK,
    fs: state.farmStrategy,
    rr: state.recycleRatePct,
    te: state.transmuterEnabled,
    tl: state.transmuterElixirs,
    tm: state.transmuterMaxCrafts,
    tf: state.transmuterFixedSubs,
    ce: state.cvEnabled,
    ct: state.cvThreshold,
    cs: state.cvAttemptSource,
    oe: state.optimizerEnabled,
    oo: state.optimizerObjective,
    l: options?.lang,
  };

  return encodeBase64Url(JSON.stringify(compact));
}

export function decodeArtifactCalculatorShareState(
  encoded: string,
  fallback: ArtifactCalculatorShareState,
): ArtifactCalculatorShareState | null {
  const payload = decodeArtifactCalculatorSharePayload(encoded, fallback);
  return payload?.state ?? null;
}

export function decodeArtifactCalculatorSharePayload(
  encoded: string,
  fallback: ArtifactCalculatorShareState,
): ArtifactCalculatorSharePayload | null {
  try {
    const json = decodeBase64Url(encoded);
    const parsed = JSON.parse(json) as Partial<CompactShareState> | null;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const targetSetFromNewKey = pickOneOf(parsed.g, SHARE_TARGET_SETS, undefined);
    const targetSetFromLegacyKey = pickOneOf(parsed.t, SHARE_TARGET_SETS, undefined);

    const fromShareState: Partial<ArtifactCalculatorShareState> = {
      targetSet: targetSetFromNewKey ?? targetSetFromLegacyKey,
      slot: parsed.s,
      main: parsed.m,
      desiredSubs: parsed.d,
      ruleMode: parsed.rm,
      atLeastN: parsed.n,
      runMode: parsed.hm,
      runs: parsed.r,
      resin: parsed.rs,
      targetProb: parsed.p,
      upgradeEnabled: parsed.ue,
      upgradePreset: parsed.up,
      upgradeCustomGroup: parsed.ug,
      upgradeK: parsed.uk,
      farmStrategy: parsed.fs,
      recycleRatePct: parsed.rr,
      transmuterEnabled: parsed.te,
      transmuterElixirs: parsed.tl,
      transmuterMaxCrafts: parsed.tm,
      transmuterFixedSubs: parsed.tf,
      cvEnabled: parsed.ce,
      cvThreshold: parsed.ct,
      cvAttemptSource: parsed.cs,
      optimizerEnabled: parsed.oe,
      optimizerObjective: parsed.oo,
    };

    return {
      state: sanitizeArtifactCalculatorShareState(fromShareState, fallback),
      lang: pickOneOf(parsed.l, LOCALES, undefined),
      theme: pickOneOf(parsed.t, SHARE_THEMES, undefined),
    };
  } catch {
    return null;
  }
}

export function sanitizeArtifactCalculatorShareState(
  candidate: Partial<ArtifactCalculatorShareState>,
  fallback: ArtifactCalculatorShareState,
): ArtifactCalculatorShareState {
  const slot = pickOneOf(candidate.slot, SLOT_VALUES, fallback.slot);
  const main = resolveMainForSlot(slot, pickOneOf(candidate.main, MAIN_VALUES, fallback.main));
  const excludedSub = excludedSubStatForMain(main);

  const desiredSubs = pickSubStats(candidate.desiredSubs, fallback.desiredSubs, excludedSub, SUBSTAT_VALUES.length);
  const ruleMode = pickOneOf(candidate.ruleMode, SHARE_RULE_MODES, fallback.ruleMode);
  const atLeastN = clampInteger(
    pickNumber(candidate.atLeastN, fallback.atLeastN),
    0,
    desiredSubs.length,
  );

  const upgradeCustomGroup = pickSubStats(
    candidate.upgradeCustomGroup,
    fallback.upgradeCustomGroup,
    excludedSub,
    SUBSTAT_VALUES.length,
  );
  const transmuterFixedSubs = pickSubStats(
    candidate.transmuterFixedSubs,
    fallback.transmuterFixedSubs,
    excludedSub,
    2,
  );

  let transmuterEnabled = pickBoolean(candidate.transmuterEnabled, fallback.transmuterEnabled);
  if (transmuterEnabled && transmuterFixedSubs.length !== 2) {
    transmuterEnabled = false;
  }

  return {
    targetSet: pickOneOf(candidate.targetSet, SHARE_TARGET_SETS, fallback.targetSet),
    slot,
    main,
    desiredSubs,
    ruleMode,
    atLeastN,
    runMode: pickOneOf(candidate.runMode, SHARE_RUN_MODES, fallback.runMode),
    runs: clampInteger(pickNumber(candidate.runs, fallback.runs), 1, Number.MAX_SAFE_INTEGER),
    resin: clampInteger(pickNumber(candidate.resin, fallback.resin), 20, Number.MAX_SAFE_INTEGER),
    targetProb: clampNumber(pickNumber(candidate.targetProb, fallback.targetProb), 0.01, 0.99),
    upgradeEnabled: pickBoolean(candidate.upgradeEnabled, fallback.upgradeEnabled),
    upgradePreset: pickOneOf(candidate.upgradePreset, SHARE_UPGRADE_PRESETS, fallback.upgradePreset),
    upgradeCustomGroup,
    upgradeK: clampInteger(pickNumber(candidate.upgradeK, fallback.upgradeK), 0, 5),
    farmStrategy: pickOneOf(candidate.farmStrategy, SHARE_FARM_STRATEGIES, fallback.farmStrategy),
    recycleRatePct: clampNumber(pickNumber(candidate.recycleRatePct, fallback.recycleRatePct), 0, 100),
    transmuterEnabled,
    transmuterElixirs: clampInteger(
      pickNumber(candidate.transmuterElixirs, fallback.transmuterElixirs),
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    transmuterMaxCrafts: clampInteger(
      pickNumber(candidate.transmuterMaxCrafts, fallback.transmuterMaxCrafts),
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    transmuterFixedSubs,
    cvEnabled: pickBoolean(candidate.cvEnabled, fallback.cvEnabled),
    cvThreshold: clampNumber(pickNumber(candidate.cvThreshold, fallback.cvThreshold), 0, 200),
    cvAttemptSource: pickOneOf(candidate.cvAttemptSource, ATTEMPT_SOURCES, fallback.cvAttemptSource),
    optimizerEnabled: pickBoolean(candidate.optimizerEnabled, fallback.optimizerEnabled),
    optimizerObjective: pickOneOf(
      candidate.optimizerObjective,
      SHARE_OPTIMIZER_OBJECTIVES,
      fallback.optimizerObjective,
    ),
  };
}

function resolveMainForSlot(slot: Slot, main: MainStat): MainStat {
  const allowed = MAIN_OPTIONS_BY_SLOT[slot];
  return allowed.includes(main) ? main : allowed[0];
}

function pickSubStats(
  value: unknown,
  fallback: SubStat[],
  excludedSub: SubStat | null,
  maxLength: number,
): SubStat[] {
  const normalized = normalizeSubStats(value, excludedSub, maxLength);
  if (normalized) {
    return normalized;
  }
  return normalizeSubStats(fallback, excludedSub, maxLength) ?? [];
}

function normalizeSubStats(
  value: unknown,
  excludedSub: SubStat | null,
  maxLength: number,
): SubStat[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const output: SubStat[] = [];
  for (const item of value) {
    if (!SUBSTAT_VALUES.includes(item as SubStat)) {
      continue;
    }
    const sub = item as SubStat;
    if (excludedSub && sub === excludedSub) {
      continue;
    }
    if (!output.includes(sub)) {
      output.push(sub);
    }
    if (output.length >= maxLength) {
      break;
    }
  }
  return output;
}

function pickOneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T;
function pickOneOf<T extends string>(value: unknown, options: readonly T[], fallback: undefined): T | undefined;
function pickOneOf<T extends string>(value: unknown, options: readonly T[], fallback: T | undefined): T | undefined {
  if (typeof value === "string" && options.includes(value as T)) {
    return value as T;
  }
  return fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function encodeBase64Url(value: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const btoaFn = globalThis.btoa;
  if (typeof btoaFn !== "function") {
    throw new Error("Base64 encoder is unavailable.");
  }

  return btoaFn(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  const atobFn = globalThis.atob;
  if (typeof atobFn !== "function") {
    throw new Error("Base64 decoder is unavailable.");
  }

  const binary = atobFn(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
