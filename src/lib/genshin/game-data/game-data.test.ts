import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadGameDataLite } from "./load";

const generatedPath = path.resolve(process.cwd(), "src/lib/genshin/game-data/generated/game-data-lite.json");

describe("game-data-lite", () => {
  const testIfGenerated = existsSync(generatedPath) ? it : it.skip;

  testIfGenerated("loads required keys and has non-empty catalogs", () => {
    const data = loadGameDataLite();

    expect(data.version).toBeTruthy();
    expect(data.generatedAt).toBeTruthy();
    expect(data.characters).toBeDefined();
    expect(data.weapons).toBeDefined();
    expect(data.artifactSets).toBeDefined();

    expect(Object.keys(data.characters).length).toBeGreaterThan(0);
    expect(Object.keys(data.weapons).length).toBeGreaterThan(0);
    expect(Object.keys(data.artifactSets).length).toBeGreaterThan(0);
  });
});
