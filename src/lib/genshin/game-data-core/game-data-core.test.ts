import { describe, expect, it } from "vitest";

import { loadGameDataCore, resetGameDataCoreCacheForTests } from "./load";
import type { SourceDataset } from "./types";
import { buildGameDataCoreFromSources, validateGameDataCore } from "./validate";

const GENERATED_CORE_TIMEOUT_MS = 20000;

function makeDataset(
  source: SourceDataset["source"],
  characters: SourceDataset["characters"],
): SourceDataset {
  return {
    source,
    fetchedAt: "2026-03-02T00:00:00.000Z",
    characters,
  };
}

describe("game-data-core validateGameDataCore", () => {
  it("validates a well-formed payload", () => {
    const payload = {
      version: "2026-03-02-test",
      generatedAt: "2026-03-02T00:00:00.000Z",
      characters: {
        "10000003": {
          id: 10000003,
          name: "Jean",
          names: {
            en: "Jean",
          },
          rarity: 5,
          element: "Anemo",
          weaponType: "Sword",
        },
      },
    };

    const result = validateGameDataCore(payload);
    expect(result.characters[10000003]?.name).toBe("Jean");
    expect(result.characters[10000003]?.rarity).toBe(5);
  });

  it("throws on malformed payload", () => {
    expect(() =>
      validateGameDataCore({
        version: "x",
        generatedAt: "y",
        characters: {
          bad: {
            id: 1,
            name: "Invalid",
          },
        },
      }),
    ).toThrow();
  });
});

describe("game-data-core cross-check", () => {
  it("logs conflicts and keeps Enka as winner", () => {
    const enka = makeDataset("enka", {
      10000003: {
        id: 10000003,
        name: "Jean",
        rarity: 5,
        element: "Anemo",
        weaponType: "Sword",
      },
    });
    const anime = makeDataset("animegamedata", {
      10000003: {
        id: 10000003,
        name: "Jean Alt",
        rarity: 4,
        element: "Anemo",
        weaponType: "Sword",
      },
    });

    const built = buildGameDataCoreFromSources([enka, anime], {
      generatedAt: "2026-03-02T00:00:00.000Z",
      version: "test-conflict",
      thresholds: {
        maxConflicts: 10,
        maxMissingRequiredRate: 1,
        maxMissingCurveOrTalentRate: 1,
      },
    });

    expect(built.data.characters[10000003]?.rarity).toBe(5);
    expect(built.report.conflicts.some((entry) => entry.field === "rarity")).toBe(true);
    expect(built.report.conflicts.some((entry) => entry.field === "name")).toBe(true);
  });

  it("throws when thresholds are exceeded", () => {
    const enkaMissing = makeDataset("enka", {
      10000003: {
        id: 10000003,
        name: "Jean",
      },
    });

    expect(() =>
      buildGameDataCoreFromSources([enkaMissing], {
        generatedAt: "2026-03-02T00:00:00.000Z",
        version: "test-threshold",
        thresholds: {
          maxConflicts: 10,
          maxMissingRequiredRate: 0.05,
          maxMissingCurveOrTalentRate: 1,
        },
      }),
    ).toThrow(/Missing required threshold exceeded/);

    const enka = makeDataset("enka", {
      10000003: {
        id: 10000003,
        name: "Jean",
        rarity: 5,
      },
    });
    const anime = makeDataset("animegamedata", {
      10000003: {
        id: 10000003,
        name: "Jean Alt",
        rarity: 4,
      },
    });

    expect(() =>
      buildGameDataCoreFromSources([enka, anime], {
        generatedAt: "2026-03-02T00:00:00.000Z",
        version: "test-conflict-threshold",
        thresholds: {
          maxConflicts: 0,
          maxMissingRequiredRate: 1,
          maxMissingCurveOrTalentRate: 1,
        },
      }),
    ).toThrow(/Conflict threshold exceeded/);
  });
});

describe("game-data-core loader cache", () => {
  it("returns a cached object reference on repeated loads", () => {
    resetGameDataCoreCacheForTests();
    const first = loadGameDataCore();
    const second = loadGameDataCore();
    expect(first).toBe(second);
  }, GENERATED_CORE_TIMEOUT_MS);
});
