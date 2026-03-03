import { describe, expect, it } from "vitest";

import { loadGameDataCore } from "@/lib/genshin/game-data-core";
import type { GameDataCore } from "@/lib/genshin/game-data-core";

import { computeHitDamage } from "./engine";
import { getTalentMultiplier } from "./multipliers";
import type { CharacterState } from "./types";

const GENERATED_CORE_TIMEOUT_MS = 20000;

function makeMockCore(): GameDataCore {
  const tenLevelsPercent = [120, 130, 140, 150, 160, 170, 180, 190, 200, 210];
  return {
    version: "test",
    generatedAt: "2026-03-02T00:00:00.000Z",
    characters: {
      999001: {
        id: 999001,
        name: "Unit Test Character",
      },
      999002: {
        id: 999002,
        name: "HP Scaler Test Character",
      },
    },
    characterCurves: {},
    weaponCurves: {},
    talents: {
      999001: {
        characterId: 999001,
        normals: {
          "Slash 1%": tenLevelsPercent,
          "Slash 2%": tenLevelsPercent,
        },
        skill: {
          "Skill Hit%": tenLevelsPercent,
        },
        burst: {
          "Burst Hit%": tenLevelsPercent,
        },
      },
      999002: {
        characterId: 999002,
        normals: {
          "Normal Hit%": tenLevelsPercent,
        },
        skill: {
          "Skill Hit%": tenLevelsPercent,
        },
        burst: {
          "Burst Hit%": tenLevelsPercent,
        },
      },
    },
    characterProfiles: {
      999001: {
        characterId: 999001,
        scalingStatByKind: {
          normal: "atk",
          skill: "atk",
          burst: "atk",
        },
        defaultDamageTypeByKind: {
          normal: "physical",
          skill: "physical",
          burst: "physical",
        },
      },
      999002: {
        characterId: 999002,
        scalingStatByKind: {
          normal: "hp",
          skill: "hp",
          burst: "hp",
        },
        defaultDamageTypeByKind: {
          normal: "pyro",
          skill: "pyro",
          burst: "pyro",
        },
      },
    },
    hitCatalog: {
      999001: {
        normal: [
          { id: "na_aaa1111111", kind: "normal", sourceKey: "Slash 1%", labelEn: "Slash 1%" },
          { id: "na_bbb2222222", kind: "normal", sourceKey: "Slash 2%", labelEn: "Slash 2%" },
        ],
        skill: [
          { id: "skill_ccc3333333", kind: "skill", sourceKey: "Skill Hit%", labelEn: "Skill Hit%" },
        ],
        burst: [
          { id: "burst_ddd4444444", kind: "burst", sourceKey: "Burst Hit%", labelEn: "Burst Hit%" },
        ],
      },
      999002: {
        normal: [
          { id: "na_eee5555555", kind: "normal", sourceKey: "Normal Hit%", labelEn: "Normal Hit%" },
        ],
        skill: [
          { id: "skill_fff6666666", kind: "skill", sourceKey: "Skill Hit%", labelEn: "Skill Hit%" },
        ],
        burst: [
          { id: "burst_ggg7777777", kind: "burst", sourceKey: "Burst Hit%", labelEn: "Burst Hit%" },
        ],
      },
    },
  };
}

describe("damage multiplier lookup", () => {
  it("resolves a valid hit key and clamps talent levels to 1..10", () => {
    const core = makeMockCore();

    const highLevel = getTalentMultiplier(core, 999001, "normal", "Slash 1%", 99);
    expect(highLevel.talentLevel).toBe(10);
    expect(highLevel.multiplier).toBeCloseTo(2.1, 12);
    expect(highLevel.notes.some((note) => note.startsWith("clamped_talent_level"))).toBe(true);

    const lowLevel = getTalentMultiplier(core, 999001, "normal", "Slash 1%", 0);
    expect(lowLevel.talentLevel).toBe(1);
    expect(lowLevel.multiplier).toBeCloseTo(1.2, 12);
    expect(lowLevel.notes.some((note) => note.startsWith("clamped_talent_level"))).toBe(true);
  });

  it("falls back when hit key is missing and reports a note", () => {
    const core = makeMockCore();
    const result = getTalentMultiplier(core, 999001, "normal", "non-existent-hit", 1);

    expect(result.hitKey).toBe("Slash 1%");
    expect(result.multiplier).toBeCloseTo(1.2, 12);
    expect(result.notes.some((note) => note.startsWith("fallback_first_hit_key"))).toBe(true);
  });
});

describe("computeHitDamage", () => {
  it("computes non-crit / crit / avg from state + multiplier", () => {
    const core = makeMockCore();
    const state: CharacterState = {
      characterId: 999001,
      talentLevels: {
        normal: 6,
        skill: 6,
        burst: 6,
      },
      combatTotals: {
        hp: 20000,
        atk: 2000,
        def: 800,
        em: 100,
        critRatePct: 50,
        critDmgPct: 100,
        dmgBonusPhysicalPct: 20,
        dmgBonusByElementPct: {
          physical: 20,
          pyro: 46.6,
          hydro: 0,
          electro: 0,
          cryo: 0,
          dendro: 0,
          anemo: 0,
          geo: 0,
        },
      },
    };

    const result = computeHitDamage(
      state,
      {
        kind: "skill",
        hitKey: "Skill Hit%",
        damageType: "pyro",
        useCrit: true,
        enemy: {
          level: 90,
          resistanceByType: { pyro: 0 },
          defMultiplierOverride: 1,
        },
      },
      core,
    );

    const expectedMultiplier = 1.7;
    const expectedBase = 2000 * expectedMultiplier;
    const expectedNonCrit = expectedBase * (1 + 46.6 / 100);
    const expectedCrit = expectedNonCrit * (1 + 1);
    const expectedAvg = expectedNonCrit * (1 + 0.5 * 1);

    expect(result.breakdown.multiplier).toBeCloseTo(expectedMultiplier, 12);
    expect(result.breakdown.base).toBeCloseTo(expectedBase, 12);
    expect(result.nonCrit).toBeCloseTo(expectedNonCrit, 12);
    expect(result.crit).toBeCloseTo(expectedCrit, 12);
    expect(result.avg).toBeCloseTo(expectedAvg, 12);
  });

  it("uses profile scaling stat and default damage type when spec omits damageType", () => {
    const core = makeMockCore();
    const state: CharacterState = {
      characterId: 999002,
      talentLevels: {
        normal: 6,
        skill: 6,
        burst: 6,
      },
      combatTotals: {
        hp: 30000,
        atk: 1200,
        def: 700,
        em: 80,
        critRatePct: 50,
        critDmgPct: 100,
        dmgBonusPhysicalPct: 10,
        dmgBonusByElementPct: {
          physical: 10,
          pyro: 50,
          hydro: 0,
          electro: 0,
          cryo: 0,
          dendro: 0,
          anemo: 0,
          geo: 0,
        },
      },
    };

    const result = computeHitDamage(
      state,
      {
        kind: "skill",
        hitId: "skill_fff6666666",
        useCrit: true,
        enemy: {
          level: 90,
          resistanceByType: { pyro: 0 },
          defMultiplierOverride: 1,
        },
      },
      core,
    );

    const expectedMultiplier = 1.7;
    const expectedBase = 30000 * expectedMultiplier;
    const expectedNonCrit = expectedBase * 1.5;
    const expectedCrit = expectedNonCrit * 2;
    const expectedAvg = expectedNonCrit * 1.5;

    expect(result.breakdown.scalingStatUsed).toBe("hp");
    expect(result.breakdown.damageTypeUsed).toBe("pyro");
    expect(result.breakdown.damageType).toBe("pyro");
    expect(result.breakdown.base).toBeCloseTo(expectedBase, 12);
    expect(result.nonCrit).toBeCloseTo(expectedNonCrit, 12);
    expect(result.crit).toBeCloseTo(expectedCrit, 12);
    expect(result.avg).toBeCloseTo(expectedAvg, 12);
  });

  it("computes the same result for hitId and legacy hitKey (real generated core)", () => {
    const core = loadGameDataCore();
    const sample = Object.entries(core.hitCatalog).find(([, catalog]) => catalog.normal.length > 0);
    expect(sample).toBeDefined();
    if (!sample) {
      return;
    }

    const characterId = Number(sample[0]);
    const firstHit = sample[1].normal[0];
    expect(firstHit).toBeDefined();
    if (!firstHit) {
      return;
    }

    const state: CharacterState = {
      characterId,
      talentLevels: {
        normal: 6,
        skill: 6,
        burst: 6,
      },
      combatTotals: {
        hp: 20000,
        atk: 1800,
        def: 900,
        em: 100,
        critRatePct: 50,
        critDmgPct: 100,
        dmgBonusPhysicalPct: 25,
        dmgBonusByElementPct: {
          physical: 25,
          pyro: 20,
          hydro: 20,
          electro: 20,
          cryo: 20,
          dendro: 20,
          anemo: 20,
          geo: 20,
        },
      },
    };

    const byHitId = computeHitDamage(
      state,
      {
        kind: "normal",
        hitId: firstHit.id,
      },
      core,
    );
    const byHitKey = computeHitDamage(
      state,
      {
        kind: "normal",
        hitKey: firstHit.sourceKey,
      },
      core,
    );

    expect(byHitId.nonCrit).toBeCloseTo(byHitKey.nonCrit, 12);
    expect(byHitId.crit).toBeCloseTo(byHitKey.crit, 12);
    expect(byHitId.avg).toBeCloseTo(byHitKey.avg, 12);
    expect(byHitId.breakdown.multiplier).toBeCloseTo(byHitKey.breakdown.multiplier, 12);
    expect(byHitId.breakdown.notes).toContain("hitId_used");
  }, GENERATED_CORE_TIMEOUT_MS);

  it("uses default enemy when omitted and applies resistance piecewise behavior", () => {
    const core = makeMockCore();
    const state: CharacterState = {
      characterId: 999001,
      talentLevels: {
        normal: 6,
        skill: 6,
        burst: 6,
      },
      combatTotals: {
        hp: 18000,
        atk: 1800,
        def: 900,
        em: 0,
        critRatePct: 50,
        critDmgPct: 100,
        dmgBonusPhysicalPct: 20,
        dmgBonusByElementPct: {
          physical: 20,
          pyro: 20,
          hydro: 20,
          electro: 20,
          cryo: 20,
          dendro: 20,
          anemo: 20,
          geo: 20,
        },
      },
    };

    const baseline = computeHitDamage(
      state,
      {
        kind: "normal",
        hitKey: "Slash 1%",
        damageType: "physical",
        enemy: {
          level: 90,
          resistanceByType: { physical: 0 },
          defMultiplierOverride: 1,
        },
      },
      core,
    );
    const defaultEnemy = computeHitDamage(
      state,
      {
        kind: "normal",
        hitKey: "Slash 1%",
        damageType: "physical",
      },
      core,
    );
    const highResistance = computeHitDamage(
      state,
      {
        kind: "normal",
        hitKey: "Slash 1%",
        damageType: "physical",
        enemy: {
          level: 90,
          resistanceByType: { physical: 80 },
          defMultiplierOverride: 1,
        },
      },
      core,
    );
    const mediumResistance = computeHitDamage(
      state,
      {
        kind: "normal",
        hitKey: "Slash 1%",
        damageType: "physical",
        enemy: {
          level: 90,
          resistanceByType: { physical: 10 },
          defMultiplierOverride: 1,
        },
      },
      core,
    );
    const negativeResistance = computeHitDamage(
      state,
      {
        kind: "normal",
        hitKey: "Slash 1%",
        damageType: "physical",
        enemy: {
          level: 90,
          resistanceByType: { physical: -20 },
          defMultiplierOverride: 1,
        },
      },
      core,
    );

    expect(defaultEnemy.breakdown.notes).toContain("enemy_default_used");
    expect(defaultEnemy.nonCrit).toBeLessThan(baseline.nonCrit);
    expect(mediumResistance.breakdown.resMultUsed).toBeCloseTo(0.9, 12);
    expect(highResistance.breakdown.resMultUsed).toBeCloseTo(1 / (4 * 0.8 + 1), 12);
    expect(negativeResistance.breakdown.resMultUsed).toBeCloseTo(1.1, 12);
    expect(highResistance.nonCrit).toBeLessThan(baseline.nonCrit);
    expect(negativeResistance.nonCrit).toBeGreaterThan(baseline.nonCrit);
  });
});
