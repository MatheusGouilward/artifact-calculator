import { describe, expect, it } from "vitest";

import { generateEfficiencyCurve } from "./efficiency-curve";
import { DEFAULT_TRANSMUTER_SLOT_COST } from "./tables";
import { MainStat, Slot, SubStat } from "./types";

const curve = generateEfficiencyCurve({
  baseInput: {
    objective: "constraints",
    params: {
      slot: Slot.Sands,
      main: MainStat.AtkPercent,
      requiredSubs: [SubStat.CritRate, SubStat.CritDmg],
      subsRule: { mode: "all" },
    },
    recycleRate: 1,
    transmuterConfig: {
      enabled: true,
      elixirsAvailable: 10,
      slotCost: DEFAULT_TRANSMUTER_SLOT_COST,
      maxCraftsPerPeriod: 2,
    },
    transmuterChoice: {
      fixedMain: MainStat.AtkPercent,
      fixedSubs: [SubStat.CritRate, SubStat.EnergyRecharge],
    },
    cvThreshold: 30,
  },
  resinPerDay: 180,
  daysMax: 60,
  stepDays: 1,
});

describe("generateEfficiencyCurve", () => {
  it("series stays monotonic non-decreasing for each strategy", () => {
    for (let index = 1; index < curve.series.length; index += 1) {
      const previous = curve.series[index - 1];
      const current = curve.series[index];

      expect(current.domainsOnly).toBeGreaterThanOrEqual(previous.domainsOnly - 1e-12);
      expect(current.domainsStrongbox).toBeGreaterThanOrEqual(previous.domainsStrongbox - 1e-12);
      expect(current.transmuterOnly).toBeGreaterThanOrEqual(previous.transmuterOnly - 1e-12);
      expect(current.combined).toBeGreaterThanOrEqual(previous.combined - 1e-12);
    }
  });

  it("milestones respect 90% >= 50% days for each strategy", () => {
    expect(curve.milestones.domainsOnly.p90).toBeGreaterThanOrEqual(curve.milestones.domainsOnly.p50);
    expect(curve.milestones.domainsStrongbox.p90).toBeGreaterThanOrEqual(
      curve.milestones.domainsStrongbox.p50,
    );
    expect(curve.milestones.transmuterOnly.p90).toBeGreaterThanOrEqual(
      curve.milestones.transmuterOnly.p50,
    );
    expect(curve.milestones.combined.p90).toBeGreaterThanOrEqual(curve.milestones.combined.p50);
  });

  it("keeps all strategy probabilities within [0, 1]", () => {
    for (const point of curve.series) {
      expect(point.domainsOnly).toBeGreaterThanOrEqual(0);
      expect(point.domainsOnly).toBeLessThanOrEqual(1);
      expect(point.domainsStrongbox).toBeGreaterThanOrEqual(0);
      expect(point.domainsStrongbox).toBeLessThanOrEqual(1);
      expect(point.transmuterOnly).toBeGreaterThanOrEqual(0);
      expect(point.transmuterOnly).toBeLessThanOrEqual(1);
      expect(point.combined).toBeGreaterThanOrEqual(0);
      expect(point.combined).toBeLessThanOrEqual(1);
    }
  });

  it("keeps transmuter-only constant across days", () => {
    const initial = curve.series[0]?.transmuterOnly ?? 0;
    for (const point of curve.series) {
      expect(point.transmuterOnly).toBeCloseTo(initial, 12);
    }
  });
});
