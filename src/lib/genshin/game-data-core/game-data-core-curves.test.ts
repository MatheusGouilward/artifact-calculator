import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadGameDataCore } from "./load";

const generatedDataPath = path.resolve(
  process.cwd(),
  "src/lib/genshin/game-data-core/generated/game-data-core.json",
);
const generatedReportPath = path.resolve(
  process.cwd(),
  "src/lib/genshin/game-data-core/generated/game-data-report.json",
);
const GENERATED_CORE_TIMEOUT_MS = 20000;

describe("game-data-core curves + talents", () => {
  const testIfGenerated =
    existsSync(generatedDataPath) && existsSync(generatedReportPath) ? it : it.skip;

  testIfGenerated("meets minimum curve/talent coverage", () => {
    const raw = readFileSync(generatedReportPath, "utf8");
    const report = JSON.parse(raw) as {
      summary?: {
        characterCurveCoverageRate?: number;
        talentCoverageRate?: number;
      };
    };

    expect(report.summary?.characterCurveCoverageRate ?? 0).toBeGreaterThanOrEqual(0.95);
    expect(report.summary?.talentCoverageRate ?? 0).toBeGreaterThanOrEqual(0.95);
  });

  testIfGenerated("includes talent arrays with 10 levels for a sample character", () => {
    const data = loadGameDataCore();
    const sample = Object.values(data.talents).find((entry) => {
      const sections = [entry.normals, entry.skill, entry.burst];
      return sections.every((section) => Object.values(section).some((values) => values.length >= 10));
    });

    expect(sample).toBeDefined();
    if (!sample) {
      return;
    }

    for (const section of [sample.normals, sample.skill, sample.burst]) {
      const first = Object.values(section)[0];
      expect(first).toBeDefined();
      expect(first?.length).toBe(10);
    }
  }, GENERATED_CORE_TIMEOUT_MS);

  testIfGenerated("character curve tables include expected level keys", () => {
    const data = loadGameDataCore();
    const sample = Object.values(data.characterCurves).find(
      (entry) => Object.keys(entry.levels).length >= 90,
    );

    expect(sample).toBeDefined();
    if (!sample) {
      return;
    }

    const levels = Object.keys(sample.levels)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value))
      .sort((a, b) => a - b);

    expect(levels).toContain(1);
    expect(levels).toContain(90);
    expect(levels.length).toBeGreaterThanOrEqual(90);
  }, GENERATED_CORE_TIMEOUT_MS);
});
