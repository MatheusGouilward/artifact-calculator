import { describe, expect, it } from "vitest";

import { applyBuffStates } from "./buffs";
import type { CharacterState } from "./types";

function makeCombatTotals(overrides: Partial<CharacterState["combatTotals"]> = {}): CharacterState["combatTotals"] {
  return {
    hp: 15000,
    atk: 1000,
    def: 700,
    em: 0,
    critRatePct: 50,
    critDmgPct: 100,
    dmgBonusPhysicalPct: 0,
    dmgBonusByElementPct: {
      physical: 0,
      pyro: 0,
      hydro: 0,
      electro: 0,
      cryo: 0,
      dendro: 0,
      anemo: 0,
      geo: 0,
    },
    ...overrides,
  };
}

describe("damage buffs engine (BUFF-01)", () => {
  it("Noblesse increases ATK by 20% on total ATK", () => {
    const result = applyBuffStates(
      makeCombatTotals({ atk: 1000 }),
      [{ id: "artifact_noblesse_4p", enabled: true }],
      { locale: "en", mainDamageType: "pyro", scalingStat: "atk" },
    );

    expect(result.combatTotals2.atk).toBeCloseTo(1200, 12);
  });

  it("TTDS increases ATK by 48% on total ATK", () => {
    const result = applyBuffStates(
      makeCombatTotals({ atk: 1000 }),
      [{ id: "weapon_ttds_r5", enabled: true }],
      { locale: "en", mainDamageType: "pyro", scalingStat: "atk" },
    );

    expect(result.combatTotals2.atk).toBeCloseTo(1480, 12);
  });

  it("Kazuha A4 with EM=800 adds 32% elemental dmg bonus", () => {
    const result = applyBuffStates(
      makeCombatTotals(),
      [{ id: "kazuha_a4_bonus", enabled: true, params: { em: 800 } }],
      { locale: "en", mainDamageType: "pyro", scalingStat: "atk" },
    );

    expect(result.combatTotals2.dmgBonusByElementPct.pyro).toBeCloseTo(32, 12);
  });

  it("VV with swirlElement=pyro shreds only pyro RES", () => {
    const result = applyBuffStates(
      makeCombatTotals(),
      [{ id: "artifact_vv_4p", enabled: true, params: { swirlElement: "pyro" } }],
      { locale: "en", mainDamageType: "anemo", selectedElement: "pyro", scalingStat: "atk" },
    );

    expect(result.enemyDelta.resShredPctPointsByType.pyro).toBeCloseTo(40, 12);
    expect(result.enemyDelta.resShredPctPointsByType.anemo).toBeUndefined();
    expect(result.enemyDelta.resShredPctPointsByType.hydro).toBeUndefined();
    expect(result.enemyDelta.resShredPctPointsByType.electro).toBeUndefined();
    expect(result.enemyDelta.resShredPctPointsByType.cryo).toBeUndefined();
  });

  it("clamps crit rate at 100 when buff would exceed cap", () => {
    const notes: string[] = [];
    const result = applyBuffStates(
      makeCombatTotals({ critRatePct: 90 }),
      [{ id: "custom_crit_rate_pct", enabled: true, params: { valuePct: 30 } }],
      { locale: "en", mainDamageType: "pyro", scalingStat: "atk", notes },
    );

    expect(result.combatTotals2.critRatePct).toBe(100);
    expect(notes.some((entry) => entry.startsWith("clamped_crit_rate_pct:"))).toBe(true);
  });
});
