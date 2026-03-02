const FIGHT_PROP_ID_MAX_HP = 2000;
const FIGHT_PROP_ID_ATK = 2001;
const FIGHT_PROP_ID_DEF = 2002;

const FIGHT_PROP_ID_CRIT_RATE = 20;
const FIGHT_PROP_ID_CRIT_DMG = 22;
const FIGHT_PROP_ID_ENERGY_RECHARGE = 23;
const FIGHT_PROP_ID_ELEMENTAL_MASTERY = 28;

const FIGHT_PROP_ID_DMG_BONUS_PHYSICAL = 30;
const FIGHT_PROP_ID_DMG_BONUS_PYRO = 40;
const FIGHT_PROP_ID_DMG_BONUS_ELECTRO = 41;
const FIGHT_PROP_ID_DMG_BONUS_HYDRO = 42;
const FIGHT_PROP_ID_DMG_BONUS_DENDRO = 43;
const FIGHT_PROP_ID_DMG_BONUS_ANEMO = 44;
const FIGHT_PROP_ID_DMG_BONUS_GEO = 45;
const FIGHT_PROP_ID_DMG_BONUS_CRYO = 46;

export interface CombatTotals {
  hp: number;
  atk: number;
  def: number;
  critRatePct: number;
  critDmgPct: number;
  erPct: number;
  em: number;
  dmgBonusPhysicalPct: number;
  dmgBonusByElementPct: {
    pyro: number;
    electro: number;
    hydro: number;
    dendro: number;
    anemo: number;
    geo: number;
    cryo: number;
  };
}

export function parseFightPropNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }

  if (typeof v === "string" && v.trim().length > 0) {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function toPctPoints(x: number): number {
  if (!Number.isFinite(x)) {
    return 0;
  }

  return x <= 2 ? x * 100 : x;
}

function emptyCombatTotals(): CombatTotals {
  return {
    hp: 0,
    atk: 0,
    def: 0,
    critRatePct: 0,
    critDmgPct: 0,
    erPct: 0,
    em: 0,
    dmgBonusPhysicalPct: 0,
    dmgBonusByElementPct: {
      pyro: 0,
      electro: 0,
      hydro: 0,
      dendro: 0,
      anemo: 0,
      geo: 0,
      cryo: 0,
    },
  };
}

function getFightPropValue(fightPropMap: Record<string, unknown>, id: number): number {
  return parseFightPropNumber(fightPropMap[String(id)]);
}

export function extractCombatTotals(fightPropMap?: Record<string, unknown>): CombatTotals {
  if (!fightPropMap) {
    return emptyCombatTotals();
  }

  return {
    hp: getFightPropValue(fightPropMap, FIGHT_PROP_ID_MAX_HP),
    atk: getFightPropValue(fightPropMap, FIGHT_PROP_ID_ATK),
    def: getFightPropValue(fightPropMap, FIGHT_PROP_ID_DEF),
    critRatePct: toPctPoints(getFightPropValue(fightPropMap, FIGHT_PROP_ID_CRIT_RATE)),
    critDmgPct: toPctPoints(getFightPropValue(fightPropMap, FIGHT_PROP_ID_CRIT_DMG)),
    erPct: toPctPoints(getFightPropValue(fightPropMap, FIGHT_PROP_ID_ENERGY_RECHARGE)),
    em: getFightPropValue(fightPropMap, FIGHT_PROP_ID_ELEMENTAL_MASTERY),
    dmgBonusPhysicalPct: toPctPoints(
      getFightPropValue(fightPropMap, FIGHT_PROP_ID_DMG_BONUS_PHYSICAL),
    ),
    dmgBonusByElementPct: {
      pyro: toPctPoints(getFightPropValue(fightPropMap, FIGHT_PROP_ID_DMG_BONUS_PYRO)),
      electro: toPctPoints(getFightPropValue(fightPropMap, FIGHT_PROP_ID_DMG_BONUS_ELECTRO)),
      hydro: toPctPoints(getFightPropValue(fightPropMap, FIGHT_PROP_ID_DMG_BONUS_HYDRO)),
      dendro: toPctPoints(getFightPropValue(fightPropMap, FIGHT_PROP_ID_DMG_BONUS_DENDRO)),
      anemo: toPctPoints(getFightPropValue(fightPropMap, FIGHT_PROP_ID_DMG_BONUS_ANEMO)),
      geo: toPctPoints(getFightPropValue(fightPropMap, FIGHT_PROP_ID_DMG_BONUS_GEO)),
      cryo: toPctPoints(getFightPropValue(fightPropMap, FIGHT_PROP_ID_DMG_BONUS_CRYO)),
    },
  };
}
