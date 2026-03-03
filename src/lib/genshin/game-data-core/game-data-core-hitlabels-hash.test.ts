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

describe("game-data-core hit labels hash", () => {
  const testIfGenerated =
    existsSync(generatedDataPath) && existsSync(generatedReportPath) ? it : it.skip;

  testIfGenerated("includes labelHash on at least one real hit entry", () => {
    const data = loadGameDataCore();
    const hitWithHash = Object.values(data.hitCatalog)
      .flatMap((catalog) => [...catalog.normal, ...catalog.skill, ...catalog.burst])
      .find((entry) => typeof entry.labelHash === "string" && entry.labelHash.length > 0);

    expect(hitWithHash).toBeDefined();
  }, GENERATED_CORE_TIMEOUT_MS);

  testIfGenerated("pt-BR exact coverage is positive when pt-BR text map exists", () => {
    const rawData = readFileSync(generatedDataPath, "utf8");
    const data = JSON.parse(rawData) as { textMapPtBR?: Record<string, string> };
    const rawReport = readFileSync(generatedReportPath, "utf8");
    const report = JSON.parse(rawReport) as {
      summary?: { hitLabelExactPtBRCoverageRate?: number };
    };

    const hasPtMap = Boolean(data.textMapPtBR && Object.keys(data.textMapPtBR).length > 0);
    if (!hasPtMap) {
      expect(true).toBe(true);
      return;
    }

    const exactRate = report.summary?.hitLabelExactPtBRCoverageRate ?? 0;
    expect(exactRate).toBeGreaterThan(0);
    expect(exactRate).toBeLessThanOrEqual(1);
  }, GENERATED_CORE_TIMEOUT_MS);

  testIfGenerated("strips {paramX:...} placeholders from generated labels", () => {
    const data = loadGameDataCore();
    const textMapEn = data.textMapEn ?? {};

    const candidate = Object.entries(data.hitCatalog).flatMap(([characterId, catalog]) =>
      ["normal", "skill", "burst"].flatMap((kind) =>
        (catalog[kind as keyof typeof catalog] ?? []).map((entry) => ({
          characterId: Number(characterId),
          kind,
          entry,
          rawEn: entry.labelHash ? textMapEn[String(entry.labelHash)] : undefined,
        })),
      ),
    ).find((item) => typeof item.rawEn === "string" && /\{param\d+:[^}]+\}/g.test(item.rawEn));

    expect(candidate).toBeDefined();
    if (!candidate) {
      return;
    }

    expect(candidate.entry.labelEn ?? "").not.toContain("{param");
    expect(candidate.entry.labelPtBR ?? "").not.toContain("{param");
  }, GENERATED_CORE_TIMEOUT_MS);

  it("does not crash when only some entries provide labelHash", () => {
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
            p2_2_hit_dmg: [1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2],
          },
          skill: {
            p1_skill_dmg: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
          },
          burst: {
            p1_burst_dmg: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
          },
        },
      },
      hitLabelHashByKey: {
        10000002: {
          normals: {
            p1_1_hit_dmg: "100",
          },
          skill: {},
          burst: {},
        },
      },
      textMapEn: {
        "100": "1-Hit DMG",
      },
    };

    const result = buildGameDataCoreFromSources([dataset], {
      generatedAt: "2026-03-02T00:00:00.000Z",
      version: "test-hitlabels-hash-partial",
      thresholds: {
        maxConflicts: 10,
        maxMissingRequiredRate: 1,
        maxMissingCurveOrTalentRate: 1,
      },
    });

    const normalEntries = result.data.hitCatalog[10000002]?.normal ?? [];
    expect(normalEntries.length).toBeGreaterThan(1);
    const hashed = normalEntries.find((entry) => entry.sourceKey === "p1_1_hit_dmg");
    const unhashed = normalEntries.find((entry) => entry.sourceKey === "p2_2_hit_dmg");
    expect(hashed?.labelHash).toBe("100");
    expect(unhashed?.labelHash).toBeUndefined();
    expect((hashed?.labelEn ?? "")).toBeTruthy();
    expect((unhashed?.labelEn ?? "")).toBeTruthy();
  });
});
