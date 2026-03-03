import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadGameDataCore } from "./load";

const generatedDataPath = path.resolve(
  process.cwd(),
  "src/lib/genshin/game-data-core/generated/game-data-core.json",
);
const GENERATED_CORE_TIMEOUT_MS = 20000;

describe("game-data-core hit catalog", () => {
  const testIfGenerated = existsSync(generatedDataPath) ? it : it.skip;

  testIfGenerated("has unique ids and non-empty entries when talents exist", () => {
    const data = loadGameDataCore();
    const sample = Object.entries(data.talents).find(([, talent]) => {
      return (
        Object.keys(talent.normals).length > 0 ||
        Object.keys(talent.skill).length > 0 ||
        Object.keys(talent.burst).length > 0
      );
    });

    expect(sample).toBeDefined();
    if (!sample) {
      return;
    }

    const characterId = Number(sample[0]);
    const catalog = data.hitCatalog[characterId];
    expect(catalog).toBeDefined();
    if (!catalog) {
      return;
    }

    for (const kind of ["normal", "skill", "burst"] as const) {
      const entries = catalog[kind];
      const ids = entries.map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
      const prefixPattern = kind === "normal" ? /^na_/ : kind === "skill" ? /^skill_/ : /^burst_/;
      for (const entry of entries) {
        expect(prefixPattern.test(entry.id)).toBe(true);
        expect(entry.sourceKey.length).toBeGreaterThan(0);
      }
    }

    const hasTalentByKind = {
      normal: Object.keys(sample[1].normals).length > 0,
      skill: Object.keys(sample[1].skill).length > 0,
      burst: Object.keys(sample[1].burst).length > 0,
    };

    if (hasTalentByKind.normal) {
      expect(catalog.normal.length).toBeGreaterThan(0);
    }
    if (hasTalentByKind.skill) {
      expect(catalog.skill.length).toBeGreaterThan(0);
    }
    if (hasTalentByKind.burst) {
      expect(catalog.burst.length).toBeGreaterThan(0);
    }
  }, GENERATED_CORE_TIMEOUT_MS);
});
