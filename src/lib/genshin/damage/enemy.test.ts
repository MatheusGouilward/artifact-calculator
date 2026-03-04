import { describe, expect, it } from "vitest";

import { buildDamageTable } from "./table";
import { resMultiplierFromPctPoints } from "./enemy";
import type { CharacterState } from "./types";
import { loadGameDataCore } from "@/lib/genshin/game-data-core";

function buildBaselineState(characterId: number): CharacterState {
  return {
    characterId,
    talentLevels: {
      normal: 6,
      skill: 6,
      burst: 6,
    },
    combatTotals: {
      hp: 18000,
      atk: 1800,
      def: 900,
      em: 100,
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
}

describe("enemy model", () => {
  it("res=10% gives 0.9 multiplier", () => {
    expect(resMultiplierFromPctPoints(10)).toBeCloseTo(0.9, 12);
  });

  it("res=-20% gives 1.1 multiplier", () => {
    expect(resMultiplierFromPctPoints(-20)).toBeCloseTo(1.1, 12);
  });

  it("res=80% uses high-res branch", () => {
    expect(resMultiplierFromPctPoints(80)).toBeCloseTo(1 / (4 * 0.8 + 1), 12);
  });

  it("VV shreds only the swirled element in table pipeline", () => {
    const core = loadGameDataCore();
    const sample = Object.entries(core.hitCatalog).find(([, catalog]) => {
      const allHits = [...catalog.normal, ...catalog.skill, ...catalog.burst];
      return allHits.some((entry) => !entry.damageType);
    });

    expect(sample).toBeDefined();
    if (!sample) {
      return;
    }

    const characterId = Number(sample[0]);
    const state = buildBaselineState(characterId);
    const baseEnemy = {
      level: 90,
      baseResPctPoints: 10,
      damageType: "pyro" as const,
    };

    const baselineAnemo = buildDamageTable(state, {
      locale: "en",
      damageTypeOverride: "anemo",
      enemy: { ...baseEnemy, damageType: "anemo" },
    });
    const withVvAnemo = buildDamageTable(state, {
      locale: "en",
      damageTypeOverride: "anemo",
      enemy: { ...baseEnemy, damageType: "anemo" },
      buffStates: [{ id: "artifact_vv_4p", enabled: true, params: { swirlElement: "pyro" } }],
    });
    const baselinePyro = buildDamageTable(state, {
      locale: "en",
      damageTypeOverride: "pyro",
      enemy: { ...baseEnemy, damageType: "pyro" },
    });
    const withVvPyro = buildDamageTable(state, {
      locale: "en",
      damageTypeOverride: "pyro",
      enemy: { ...baseEnemy, damageType: "pyro" },
      buffStates: [{ id: "artifact_vv_4p", enabled: true, params: { swirlElement: "pyro" } }],
    });

    const baselineAnemoRows = [
      ...baselineAnemo.sections.normal,
      ...baselineAnemo.sections.skill,
      ...baselineAnemo.sections.burst,
    ].filter((row) => row.damageType === "anemo");
    const withVvAnemoRows = [
      ...withVvAnemo.sections.normal,
      ...withVvAnemo.sections.skill,
      ...withVvAnemo.sections.burst,
    ].filter((row) => row.damageType === "anemo");
    const baselinePyroRows = [
      ...baselinePyro.sections.normal,
      ...baselinePyro.sections.skill,
      ...baselinePyro.sections.burst,
    ].filter((row) => row.damageType === "pyro");
    const withVvPyroRows = [
      ...withVvPyro.sections.normal,
      ...withVvPyro.sections.skill,
      ...withVvPyro.sections.burst,
    ].filter((row) => row.damageType === "pyro");

    expect(baselineAnemoRows.length).toBeGreaterThan(0);
    expect(withVvAnemoRows.length).toBeGreaterThan(0);
    expect(baselinePyroRows.length).toBeGreaterThan(0);
    expect(withVvPyroRows.length).toBeGreaterThan(0);

    const baselineAnemoAvgSum = baselineAnemoRows.reduce((sum, row) => sum + row.avg, 0);
    const withVvAnemoAvgSum = withVvAnemoRows.reduce((sum, row) => sum + row.avg, 0);
    const baselinePyroAvgSum = baselinePyroRows.reduce((sum, row) => sum + row.avg, 0);
    const withVvPyroAvgSum = withVvPyroRows.reduce((sum, row) => sum + row.avg, 0);

    expect(withVvAnemoAvgSum).toBeCloseTo(baselineAnemoAvgSum, 9);
    expect(withVvPyroAvgSum).toBeGreaterThan(baselinePyroAvgSum);
  }, 20000);
});
