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

const VALID_SCALING_STATS = new Set(["atk", "hp", "def", "em"]);
const VALID_DAMAGE_TYPES = new Set([
  "physical",
  "pyro",
  "hydro",
  "electro",
  "cryo",
  "dendro",
  "anemo",
  "geo",
]);

function normalizeElementToDamageType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!VALID_DAMAGE_TYPES.has(normalized) || normalized === "physical") {
    return null;
  }
  return normalized;
}

describe("game-data-core profiles", () => {
  const testIfGenerated =
    existsSync(generatedDataPath) && existsSync(generatedReportPath) ? it : it.skip;

  testIfGenerated("profiles coverage is 100%", () => {
    const raw = readFileSync(generatedReportPath, "utf8");
    const report = JSON.parse(raw) as {
      summary?: {
        characterProfileCoverageRate?: number;
      };
      coverage?: {
        missingCharacterProfileIds?: number[];
      };
    };

    expect(report.summary?.characterProfileCoverageRate ?? 0).toBe(1);
    expect(report.coverage?.missingCharacterProfileIds ?? []).toHaveLength(0);
  });

  testIfGenerated("profile defaults/overrides contain valid enums", () => {
    const data = loadGameDataCore();
    const entries = Object.values(data.characterProfiles);
    expect(entries.length).toBeGreaterThanOrEqual(Object.keys(data.characters).length);

    for (const profile of entries) {
      expect(VALID_SCALING_STATS.has(profile.scalingStatByKind.normal)).toBe(true);
      expect(VALID_SCALING_STATS.has(profile.scalingStatByKind.skill)).toBe(true);
      expect(VALID_SCALING_STATS.has(profile.scalingStatByKind.burst)).toBe(true);
      expect(VALID_DAMAGE_TYPES.has(profile.defaultDamageTypeByKind.normal)).toBe(true);
      expect(VALID_DAMAGE_TYPES.has(profile.defaultDamageTypeByKind.skill)).toBe(true);
      expect(VALID_DAMAGE_TYPES.has(profile.defaultDamageTypeByKind.burst)).toBe(true);
    }
  }, GENERATED_CORE_TIMEOUT_MS);

  testIfGenerated("uses smart damage type defaults for catalyst normal and elemental skill/burst", () => {
    const data = loadGameDataCore();
    const characters = Object.values(data.characters);

    const catalyst = characters.find((character) =>
      typeof character.weaponType === "string" &&
      character.weaponType.toLowerCase() === "catalyst" &&
      Boolean(normalizeElementToDamageType(character.element)),
    );
    expect(catalyst).toBeDefined();
    if (!catalyst) {
      return;
    }

    const catalystElement = normalizeElementToDamageType(catalyst.element);
    expect(catalystElement).not.toBeNull();
    const catalystProfile = data.characterProfiles[catalyst.id];
    expect(catalystProfile).toBeDefined();
    expect(catalystProfile.defaultDamageTypeByKind.normal).toBe(catalystElement);

    const elementalCharacter = characters.find((character) =>
      Boolean(normalizeElementToDamageType(character.element)),
    );
    expect(elementalCharacter).toBeDefined();
    if (!elementalCharacter) {
      return;
    }

    const element = normalizeElementToDamageType(elementalCharacter.element);
    expect(element).not.toBeNull();
    const profile = data.characterProfiles[elementalCharacter.id];
    expect(profile).toBeDefined();
    expect(profile.defaultDamageTypeByKind.skill).toBe(element);
    expect(profile.defaultDamageTypeByKind.burst).toBe(element);
  }, GENERATED_CORE_TIMEOUT_MS);
});
