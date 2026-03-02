import { describe, expect, it } from "vitest";

import type { EnkaCharacterSummary } from "@/lib/enka/types";

import { computeDamageIndexFromEnka } from "./damage-index";

describe("computeDamageIndexFromEnka", () => {
  it("computes expected_damage_simple using selected character fightProps", () => {
    const character: EnkaCharacterSummary = {
      avatarId: 10000002,
      level: 90,
      artifacts: [],
      fightProps: {
        "2001": 2000,
        "20": 50,
        "22": 100,
        "40": 46.6,
      },
    };

    const result = computeDamageIndexFromEnka(character, {
      id: "expected_damage_simple",
      scaling: { stat: "atk", multiplier: 1 },
      damageType: "pyro",
      useCrit: true,
    });

    const expected = 2000 * (1 + 46.6 / 100) * (1 + 0.5 * 1);
    expect(result.score).toBeCloseTo(expected, 12);
    expect(result.breakdown.expectedDamage).toBeCloseTo(expected, 12);
    expect(result.breakdown.base).toBe(2000);
    expect(result.breakdown.dmgBonus).toBeCloseTo(46.6, 12);
    expect(result.breakdown.critMult).toBeCloseTo(1.5, 12);
  });
});
