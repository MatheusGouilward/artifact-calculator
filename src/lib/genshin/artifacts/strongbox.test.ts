import { describe, expect, it } from "vitest";

import { MainStat, Slot, SubStat } from "./types";
import {
  probSuccessAfterRunsDomainsOnly,
  probSuccessAfterRunsWithStrongbox,
  runsForTargetChanceWithStrongbox,
} from "./strongbox";
import { probSuccessPerAttempt, probSuccessPerRunFromAttemptSuccess, runsForTargetChance } from "./engine";

const baseParams = {
  slot: Slot.Sands,
  main: MainStat.AtkPercent,
  requiredSubs: [SubStat.CritRate],
  subsRule: { mode: "all" as const },
};

describe("strongbox strategy", () => {
  it("matches domains-only when recycleRate is 0", () => {
    const runs = 180;
    const domainsOnly = probSuccessAfterRunsDomainsOnly(baseParams, undefined, runs);
    const withStrongboxNoRecycle = probSuccessAfterRunsWithStrongbox(baseParams, undefined, runs, 0);

    expect(withStrongboxNoRecycle).toBeCloseTo(domainsOnly, 12);
  });

  it("is never worse than domains-only for recycleRate=1", () => {
    const runs = 180;
    const domainsOnly = probSuccessAfterRunsDomainsOnly(baseParams, undefined, runs);
    const withStrongbox = probSuccessAfterRunsWithStrongbox(baseParams, undefined, runs, 1);

    expect(withStrongbox).toBeGreaterThanOrEqual(domainsOnly - 1e-12);
  });

  it("stays within [0,1]", () => {
    const value = probSuccessAfterRunsWithStrongbox(baseParams, undefined, 250, 0.75);

    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });

  it("finds finite runs for a reasonable target", () => {
    const pAttemptSuccess = probSuccessPerAttempt(baseParams, undefined).pAttemptSuccess;
    const pRunSuccess = probSuccessPerRunFromAttemptSuccess(pAttemptSuccess);
    const domainsFinite = runsForTargetChance(pRunSuccess, 0.5);
    const strongboxRuns = runsForTargetChanceWithStrongbox(baseParams, undefined, 0.5, 1, 5000);

    expect(Number.isFinite(domainsFinite)).toBe(true);
    expect(Number.isFinite(strongboxRuns)).toBe(true);
  });
});
