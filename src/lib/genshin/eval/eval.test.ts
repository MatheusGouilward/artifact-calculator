import { describe, expect, it } from "vitest";

import { scoreObjective } from "./objectives";
import { addStatBlocks, clampCrit, emptyStatBlock, setStat, sumStatBlocks } from "./stat-block";
import { ALL_STAT_KEYS } from "./stat-keys";

describe("emptyStatBlock", () => {
  it("initializes all canonical stat keys to 0", () => {
    const block = emptyStatBlock();

    for (const key of ALL_STAT_KEYS) {
      expect(block[key]).toBe(0);
    }
  });
});

describe("stat-block arithmetic", () => {
  it("adds and sums stat blocks correctly", () => {
    const a = setStat(setStat(emptyStatBlock(), "atk_pct", 46.6), "crit_rate_pct", 5);
    const b = setStat(setStat(emptyStatBlock(), "atk_pct", 10), "er_pct", 20);
    const c = setStat(emptyStatBlock(), "atk_flat", 19);

    const added = addStatBlocks(a, b);
    const summed = sumStatBlocks([a, b, c]);

    expect(added.atk_pct).toBeCloseTo(56.6, 12);
    expect(added.crit_rate_pct).toBe(5);
    expect(added.er_pct).toBe(20);

    expect(summed.atk_pct).toBeCloseTo(56.6, 12);
    expect(summed.crit_rate_pct).toBe(5);
    expect(summed.er_pct).toBe(20);
    expect(summed.atk_flat).toBe(19);
  });
});

describe("clampCrit", () => {
  it("clamps crit rate to [0,100]", () => {
    const low = clampCrit(setStat(emptyStatBlock(), "crit_rate_pct", -8));
    const high = clampCrit(setStat(emptyStatBlock(), "crit_rate_pct", 124));
    const inside = clampCrit(setStat(emptyStatBlock(), "crit_rate_pct", 50));

    expect(low.crit_rate_pct).toBe(0);
    expect(high.crit_rate_pct).toBe(100);
    expect(inside.crit_rate_pct).toBe(50);
  });
});

describe("scoreObjective", () => {
  it("applies weights to produce score contributions", () => {
    const stats = setStat(setStat(emptyStatBlock(), "atk_pct", 100), "crit_rate_pct", 30);
    const scored = scoreObjective(stats, {
      id: "weighted_stats",
      weights: {
        atk_pct: 1,
        crit_rate_pct: 2,
      },
    });

    expect(scored.breakdown.atk_pct).toBe(100);
    expect(scored.breakdown.crit_rate_pct).toBe(60);
    expect(scored.score).toBe(160);
  });

  it("applies caps before weighting", () => {
    const stats = setStat(emptyStatBlock(), "atk_pct", 160);
    const scored = scoreObjective(stats, {
      id: "weighted_stats",
      weights: {
        atk_pct: 1.5,
      },
      caps: {
        atk_pct: 120,
      },
    });

    expect(scored.breakdown.atk_pct).toBe(180);
    expect(scored.score).toBe(180);
  });

  it("reports unmet hard minimums", () => {
    const stats = setStat(setStat(emptyStatBlock(), "crit_rate_pct", 40), "er_pct", 110);
    const scored = scoreObjective(stats, {
      id: "weighted_stats",
      weights: {
        crit_rate_pct: 1,
      },
      hardMinimums: {
        crit_rate_pct: 50,
        er_pct: 100,
      },
    });

    expect(scored.unmetMinimums).toEqual(["crit_rate_pct"]);
  });
});
