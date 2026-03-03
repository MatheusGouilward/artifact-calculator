import { describe, expect, it } from "vitest";

import { loadGameDataCore } from "@/lib/genshin/game-data-core";

import { buildDamageTable } from "./table";
import type { CharacterState } from "./types";

function buildBaselineState(characterId: number): CharacterState {
  return {
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
}

describe("damage table v1", () => {
  it("builds a finite multi-section table from real generated core data", () => {
    const core = loadGameDataCore();
    const sample = Object.entries(core.hitCatalog).find(([, catalog]) => {
      return catalog.normal.length > 0 && catalog.skill.length > 0 && catalog.burst.length > 0;
    });

    expect(sample).toBeDefined();
    if (!sample) {
      return;
    }

    const characterId = Number(sample[0]);
    const table = buildDamageTable(buildBaselineState(characterId), { locale: "en" });
    expect(table.characterId).toBe(characterId);
    expect(table.sections.normal.length).toBeGreaterThan(0);
    expect(table.sections.skill.length).toBeGreaterThan(0);
    expect(table.sections.burst.length).toBeGreaterThan(0);

    const allRows = [
      ...table.sections.normal,
      ...table.sections.skill,
      ...table.sections.burst,
    ];
    for (const row of allRows) {
      expect(Number.isFinite(row.nonCrit)).toBe(true);
      expect(Number.isFinite(row.crit)).toBe(true);
      expect(Number.isFinite(row.avg)).toBe(true);
      expect(row.nonCrit).toBeGreaterThanOrEqual(0);
      expect(row.crit).toBeGreaterThanOrEqual(0);
      expect(row.avg).toBeGreaterThanOrEqual(0);
      expect(row.label.length).toBeGreaterThan(0);
    }
  }, 20000);

  it("uses pt-BR hit label when requested and available", () => {
    const core = loadGameDataCore();
    const sample = Object.entries(core.hitCatalog).find(([, catalog]) => {
      const all = [...catalog.normal, ...catalog.skill, ...catalog.burst];
      return all.some((entry) => {
        const pt = (entry.labelPtBR ?? "").trim();
        const en = (entry.labelEn ?? "").trim();
        return pt.length > 0 && en.length > 0 && pt !== en;
      });
    });

    expect(sample).toBeDefined();
    if (!sample) {
      return;
    }

    const characterId = Number(sample[0]);
    const catalog = sample[1];
    const entry = [...catalog.normal, ...catalog.skill, ...catalog.burst].find((hit) => {
      const pt = (hit.labelPtBR ?? "").trim();
      const en = (hit.labelEn ?? "").trim();
      return pt.length > 0 && en.length > 0 && pt !== en;
    });
    expect(entry).toBeDefined();
    if (!entry) {
      return;
    }

    const table = buildDamageTable(buildBaselineState(characterId), { locale: "pt-BR" });
    const matching = [
      ...table.sections.normal,
      ...table.sections.skill,
      ...table.sections.burst,
    ].find((row) => row.hitId === entry.id);

    expect(matching).toBeDefined();
    expect(matching?.label).toBe(entry.labelPtBR);
  }, 20000);

  it("disables crit expectation when includeCrit is false", () => {
    const core = loadGameDataCore();
    const sample = Object.entries(core.hitCatalog).find(([, catalog]) => {
      return catalog.normal.length > 0 || catalog.skill.length > 0 || catalog.burst.length > 0;
    });
    expect(sample).toBeDefined();
    if (!sample) {
      return;
    }

    const table = buildDamageTable(buildBaselineState(Number(sample[0])), {
      includeCrit: false,
    });
    const allRows = [
      ...table.sections.normal,
      ...table.sections.skill,
      ...table.sections.burst,
    ];
    expect(allRows.length).toBeGreaterThan(0);
    for (const row of allRows) {
      expect(row.avg).toBeCloseTo(row.nonCrit, 12);
      expect(row.crit).toBeCloseTo(row.nonCrit, 12);
    }
  }, 20000);
});
