import { describe, expect, it } from "vitest";

import { DEFAULT_TRANSMUTER_SLOT_COST } from "./tables";
import { critValueStats, rollSumDist } from "./scoring";
import { MainStat, Slot, SubStat } from "./types";

describe("rollSumDist", () => {
  it("sums to 1 for multiple roll counts", () => {
    const mValues = [0, 1, 3, 6];
    for (const m of mValues) {
      const dist = rollSumDist(SubStat.CritRate, m);
      const total = Array.from(dist.values()).reduce((sum, p) => sum + p, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });
});

describe("critValueStats", () => {
  const baseParams = {
    slot: Slot.Sands,
    main: MainStat.AtkPercent,
    requiredSubs: [SubStat.CritRate, SubStat.CritDmg],
    subsRule: { mode: "all" as const },
  };

  it("is monotonic in threshold", () => {
    const lowThreshold = critValueStats(
      baseParams,
      "domain",
      undefined,
      undefined,
      undefined,
      20,
    );
    const highThreshold = critValueStats(
      baseParams,
      "domain",
      undefined,
      undefined,
      undefined,
      40,
    );

    expect(highThreshold.pCvAtLeastGivenCandidate).toBeLessThanOrEqual(
      lowThreshold.pCvAtLeastGivenCandidate + 1e-12,
    );
  });

  it("keeps probabilities within [0,1] for all attempt sources", () => {
    const domain = critValueStats(
      baseParams,
      "domain",
      undefined,
      undefined,
      undefined,
      35,
    );
    const strongbox = critValueStats(
      baseParams,
      "strongbox",
      undefined,
      undefined,
      undefined,
      35,
    );
    const transmuter = critValueStats(
      baseParams,
      "transmuter",
      undefined,
      {
        enabled: true,
        elixirsAvailable: 8,
        slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
        maxCraftsPerPeriod: 2,
      },
      {
        fixedMain: MainStat.AtkPercent,
        fixedSubs: [SubStat.CritRate, SubStat.CritDmg],
      },
      35,
    );

    const all = [domain, strongbox, transmuter];
    for (const stats of all) {
      expect(stats.pCandidateAttempt).toBeGreaterThanOrEqual(0);
      expect(stats.pCandidateAttempt).toBeLessThanOrEqual(1);
      expect(stats.pCvAtLeastGivenCandidate).toBeGreaterThanOrEqual(0);
      expect(stats.pCvAtLeastGivenCandidate).toBeLessThanOrEqual(1);
      expect(stats.pCvAtLeastPerAttempt).toBeGreaterThanOrEqual(0);
      expect(stats.pCvAtLeastPerAttempt).toBeLessThanOrEqual(1);
    }
  });

  it("expected CV stays within [0, maxPossibleCV] when both crit subs are required", () => {
    const stats = critValueStats(
      baseParams,
      "domain",
      undefined,
      undefined,
      undefined,
      0,
    );

    const maxPossibleCv = 93.3;
    expect(stats.expectedCvGivenCandidate).toBeGreaterThanOrEqual(0);
    expect(stats.expectedCvGivenCandidate).toBeLessThanOrEqual(maxPossibleCv + 1e-9);
  });
});
