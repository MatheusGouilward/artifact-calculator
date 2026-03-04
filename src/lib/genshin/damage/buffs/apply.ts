import { BUFFS } from "./library";
import type {
  AppliedBuff,
  ApplyBuffStatesResult,
  BuffApplyContext,
  BuffId,
  BuffState,
  EnemyDelta,
  PlayerDelta,
  SwirlElement,
} from "./types";
import type { CharacterState, DamageType } from "../types";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function cloneCombatTotals(
  combatTotals: CharacterState["combatTotals"],
): CharacterState["combatTotals"] {
  return {
    ...combatTotals,
    dmgBonusByElementPct: { ...combatTotals.dmgBonusByElementPct },
  };
}

function emptyPlayerDelta(): PlayerDelta {
  return {
    atkPctPoints: 0,
    atkFlat: 0,
    critRatePctPoints: 0,
    critDmgPctPoints: 0,
    dmgBonusPctPointsByType: {},
  };
}

function emptyEnemyDelta(): EnemyDelta {
  return {
    resShredPctPointsByType: {},
  };
}

function readNumberParam(
  buffId: BuffId,
  state: BuffState,
  key: string,
  fallback: number,
  notes: string[],
): number {
  const raw = state.params?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  notes.push(`buff_param_default_used:${buffId}:${key}:${fallback}`);
  return fallback;
}

function addDamageBonus(
  delta: PlayerDelta,
  damageType: DamageType,
  valuePctPoints: number,
): void {
  delta.dmgBonusPctPointsByType[damageType] =
    (delta.dmgBonusPctPointsByType[damageType] ?? 0) + valuePctPoints;
}

function addResShred(
  delta: EnemyDelta,
  damageType: DamageType,
  valuePctPoints: number,
): void {
  delta.resShredPctPointsByType[damageType] =
    (delta.resShredPctPointsByType[damageType] ?? 0) + valuePctPoints;
}

function isSwirlElement(value: unknown): value is SwirlElement {
  return value === "pyro" || value === "hydro" || value === "electro" || value === "cryo";
}

function readSwirlElementParam(
  state: BuffState,
  fallback: SwirlElement,
  notes: string[],
): SwirlElement {
  const raw = state.params?.swirlElement;
  if (typeof raw === "string" && isSwirlElement(raw)) {
    return raw;
  }
  if (raw !== undefined) {
    notes.push(`buff_param_invalid_value:${state.id}:swirlElement:${String(raw)}`);
  }
  notes.push(`buff_param_default_used:${state.id}:swirlElement:${fallback}`);
  return fallback;
}

function buildBuffDelta(
  state: BuffState,
  ctx: BuffApplyContext,
): { playerDelta: PlayerDelta; enemyDelta: EnemyDelta; notes: string[] } {
  const notes: string[] = [];
  const playerDelta = emptyPlayerDelta();
  const enemyDelta = emptyEnemyDelta();

  switch (state.id) {
    case "artifact_noblesse_4p":
      playerDelta.atkPctPoints += 20;
      break;
    case "weapon_ttds_r5":
      playerDelta.atkPctPoints += 48;
      break;
    case "bennett_burst_flat_atk": {
      const defaultFlatAtkRaw = BUFFS.bennett_burst_flat_atk.defaults?.flatAtk;
      const defaultFlatAtk = typeof defaultFlatAtkRaw === "number" ? defaultFlatAtkRaw : 1000;
      const flatAtk = readNumberParam(state.id, state, "flatAtk", defaultFlatAtk, notes);
      playerDelta.atkFlat += flatAtk;
      break;
    }
    case "kazuha_a4_bonus": {
      if (ctx.mainDamageType === "physical") {
        notes.push("kazuha_a4_physical_skipped");
        break;
      }
      const defaultEmRaw = BUFFS.kazuha_a4_bonus.defaults?.em;
      const defaultEm = typeof defaultEmRaw === "number" ? defaultEmRaw : 800;
      const em = readNumberParam(state.id, state, "em", defaultEm, notes);
      addDamageBonus(playerDelta, ctx.mainDamageType, em * 0.04);
      break;
    }
    case "artifact_vv_4p": {
      const fallbackSwirl = isSwirlElement(ctx.selectedElement) ? ctx.selectedElement : "pyro";
      const swirlElement = readSwirlElementParam(state, fallbackSwirl, notes);
      addResShred(enemyDelta, swirlElement, 40);
      break;
    }
    case "custom_crit_rate_pct": {
      const defaultValueRaw = BUFFS.custom_crit_rate_pct.defaults?.valuePct;
      const defaultValue = typeof defaultValueRaw === "number" ? defaultValueRaw : 30;
      const valuePct = readNumberParam(state.id, state, "valuePct", defaultValue, notes);
      playerDelta.critRatePctPoints += valuePct;
      break;
    }
    default:
      notes.push(`unknown_buff_id_skipped:${String(state.id)}`);
      break;
  }

  return { playerDelta, enemyDelta, notes };
}

function pushContextNotes(ctx: BuffApplyContext, notes: string[]): void {
  if (!ctx.notes || notes.length === 0) {
    return;
  }
  ctx.notes.push(...notes);
}

function collectTotalDelta(applied: AppliedBuff[]): { player: PlayerDelta; enemy: EnemyDelta } {
  const player = emptyPlayerDelta();
  const enemy = emptyEnemyDelta();

  for (const entry of applied) {
    player.atkPctPoints += entry.playerDelta.atkPctPoints;
    player.atkFlat += entry.playerDelta.atkFlat;
    player.critRatePctPoints += entry.playerDelta.critRatePctPoints;
    player.critDmgPctPoints += entry.playerDelta.critDmgPctPoints;

    for (const [type, value] of Object.entries(entry.playerDelta.dmgBonusPctPointsByType)) {
      const damageType = type as DamageType;
      player.dmgBonusPctPointsByType[damageType] =
        (player.dmgBonusPctPointsByType[damageType] ?? 0) + value;
    }

    for (const [type, value] of Object.entries(entry.enemyDelta.resShredPctPointsByType)) {
      const damageType = type as DamageType;
      enemy.resShredPctPointsByType[damageType] =
        (enemy.resShredPctPointsByType[damageType] ?? 0) + value;
    }
  }

  return { player, enemy };
}

export function applyBuffStates(
  combatTotals: CharacterState["combatTotals"],
  buffStates: BuffState[] = [],
  ctx: BuffApplyContext,
): ApplyBuffStatesResult {
  const sortedEnabled = buffStates
    .map((state, index) => ({ state, index }))
    .filter((entry) => entry.state.enabled)
    .sort((a, b) => {
      if (a.state.id !== b.state.id) {
        return a.state.id.localeCompare(b.state.id);
      }
      return a.index - b.index;
    });

  const applied: AppliedBuff[] = [];

  for (const { state } of sortedEnabled) {
    const meta = BUFFS[state.id];
    if (!meta) {
      const notes = [`missing_buff_metadata:${state.id}`];
      applied.push({
        id: state.id,
        category: "buff",
        labelKey: "damageLab.buffs.unknown",
        playerDelta: emptyPlayerDelta(),
        enemyDelta: emptyEnemyDelta(),
        notes,
      });
      pushContextNotes(ctx, notes);
      continue;
    }

    const built = buildBuffDelta(state, ctx);
    const entry: AppliedBuff = {
      id: state.id,
      category: meta.category,
      labelKey: meta.labelKey,
      playerDelta: built.playerDelta,
      enemyDelta: built.enemyDelta,
      notes: built.notes,
    };
    applied.push(entry);
    pushContextNotes(ctx, built.notes);
  }

  const totals = collectTotalDelta(applied);
  const combatTotals2 = cloneCombatTotals(combatTotals);

  combatTotals2.atk = (combatTotals.atk * (1 + totals.player.atkPctPoints / 100)) + totals.player.atkFlat;
  combatTotals2.critRatePct = combatTotals.critRatePct + totals.player.critRatePctPoints;
  combatTotals2.critDmgPct = combatTotals.critDmgPct + totals.player.critDmgPctPoints;

  for (const [type, value] of Object.entries(totals.player.dmgBonusPctPointsByType)) {
    const damageType = type as DamageType;
    if (damageType === "physical") {
      combatTotals2.dmgBonusPhysicalPct += value;
      continue;
    }
    combatTotals2.dmgBonusByElementPct[damageType] =
      (combatTotals2.dmgBonusByElementPct[damageType] ?? 0) + value;
  }

  const critRateBeforeClamp = combatTotals2.critRatePct;
  combatTotals2.critRatePct = clamp(combatTotals2.critRatePct, 0, 100);
  if (combatTotals2.critRatePct !== critRateBeforeClamp) {
    const note = `clamped_crit_rate_pct:${critRateBeforeClamp}->${combatTotals2.critRatePct}`;
    pushContextNotes(ctx, [note]);
  }

  return {
    combatTotals2,
    enemyDelta: totals.enemy,
    applied,
  };
}
