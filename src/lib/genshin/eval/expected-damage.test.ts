import { describe, expect, it } from "vitest";

import { extractCombatTotals, toPctPoints } from "./enka-fightprops";
import { scoreObjective } from "./objectives";
import { emptyStatBlock } from "./stat-block";

describe("expected_damage_simple objective", () => {
  it("computes expected damage index using combat totals", () => {
    const combat = extractCombatTotals({
      "2001": 2000,
      "20": 50,
      "22": 100,
      "40": 46.6,
    });

    const scored = scoreObjective(
      emptyStatBlock(),
      {
        id: "expected_damage_simple",
        scaling: { stat: "atk", multiplier: 1 },
        damageType: "pyro",
      },
      { combat },
    );

    const expectedDamage = 2000 * (1 + 46.6 / 100) * (1 + 0.5 * 1);
    expect(scored.score).toBeCloseTo(expectedDamage, 12);
    expect(scored.breakdown.expectedDamage).toBeCloseTo(expectedDamage, 12);
  });

  it("converts ratio percentages into percentage points", () => {
    expect(toPctPoints(0.5)).toBe(50);

    const combat = extractCombatTotals({
      "20": 0.5,
    });

    expect(combat.critRatePct).toBe(50);
  });

  it("returns zero score when fightPropMap is missing", () => {
    const scored = scoreObjective(
      emptyStatBlock(),
      {
        id: "expected_damage_simple",
        scaling: { stat: "atk", multiplier: 1 },
        damageType: "pyro",
      },
      { combat: extractCombatTotals(undefined) },
    );

    expect(scored.score).toBe(0);
    expect(scored.breakdown.expectedDamage).toBe(0);
  });
});
