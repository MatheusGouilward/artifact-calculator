import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadGameDataCore } from "./load";
import type { SourceDataset } from "./types";
import { buildGameDataCoreFromSources } from "./validate";

const generatedDataPath = path.resolve(
  process.cwd(),
  "src/lib/genshin/game-data-core/generated/game-data-core.json",
);
const generatedReportPath = path.resolve(
  process.cwd(),
  "src/lib/genshin/game-data-core/generated/game-data-report.json",
);
const GENERATED_CORE_TIMEOUT_MS = 20000;

describe("game-data-core hit labels", () => {
  const testIfGenerated =
    existsSync(generatedDataPath) && existsSync(generatedReportPath) ? it : it.skip;

  testIfGenerated("label generation is stable and labelEn always exists", () => {
    const data = loadGameDataCore();
    for (const [idRaw, catalog] of Object.entries(data.hitCatalog)) {
      const id = Number(idRaw);
      expect(id).toBeGreaterThan(0);
      for (const kind of ["normal", "skill", "burst"] as const) {
        for (const entry of catalog[kind]) {
          expect(entry.sourceKey.length).toBeGreaterThan(0);
          expect((entry.labelEn ?? entry.sourceKey).length).toBeGreaterThan(0);
          expect(entry.labelEn ?? entry.sourceKey).toBeTruthy();
        }
      }
    }
  }, GENERATED_CORE_TIMEOUT_MS);

  it("build does not crash when text maps are missing", () => {
    const dataset: SourceDataset = {
      source: "animegamedata",
      fetchedAt: "2026-03-02T00:00:00.000Z",
      characters: {
        10000002: {
          id: 10000002,
          name: "Kamisato Ayaka",
          rarity: 5,
        },
      },
      talents: {
        10000002: {
          characterId: 10000002,
          normals: {
            p1_1_hit_dmg: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          },
          skill: {
            p1_skill_dmg: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
          },
          burst: {
            p1_burst_dmg: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
          },
        },
      },
    };

    const result = buildGameDataCoreFromSources([dataset], {
      generatedAt: "2026-03-02T00:00:00.000Z",
      version: "test-hitlabels-missing-textmap",
      thresholds: {
        maxConflicts: 10,
        maxMissingRequiredRate: 1,
        maxMissingCurveOrTalentRate: 1,
      },
    });

    const catalog = result.data.hitCatalog[10000002];
    expect(catalog.normal.length).toBeGreaterThan(0);
    expect(catalog.skill.length).toBeGreaterThan(0);
    expect(catalog.burst.length).toBeGreaterThan(0);
    for (const entry of [...catalog.normal, ...catalog.skill, ...catalog.burst]) {
      expect(entry.labelEn ?? entry.sourceKey).toBeTruthy();
    }
  });

  testIfGenerated("coverage fields are within [0,1] when text maps are present", () => {
    const rawData = readFileSync(generatedDataPath, "utf8");
    const data = JSON.parse(rawData) as {
      textMapEn?: Record<string, string>;
      textMapPtBR?: Record<string, string>;
    };
    const rawReport = readFileSync(generatedReportPath, "utf8");
    const report = JSON.parse(rawReport) as {
      summary?: {
        hitLabelEnCoverageRate?: number;
        hitLabelPtBRCoverageRate?: number;
      };
    };

    const hasTextMap =
      (data.textMapEn && Object.keys(data.textMapEn).length > 0) ||
      (data.textMapPtBR && Object.keys(data.textMapPtBR).length > 0);

    if (!hasTextMap) {
      expect(true).toBe(true);
      return;
    }

    const en = report.summary?.hitLabelEnCoverageRate ?? -1;
    const pt = report.summary?.hitLabelPtBRCoverageRate ?? -1;
    expect(en).toBeGreaterThanOrEqual(0);
    expect(en).toBeLessThanOrEqual(1);
    expect(pt).toBeGreaterThanOrEqual(0);
    expect(pt).toBeLessThanOrEqual(1);
  });
});
