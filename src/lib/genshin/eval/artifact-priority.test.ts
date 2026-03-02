import { describe, expect, it } from "vitest";

import type { EnkaCharacterSummary } from "@/lib/enka/types";
import { MainStat, Slot } from "@/lib/genshin/artifacts/types";

import { analyzeArtifactPriorities } from "./artifact-priority";

describe("analyzeArtifactPriorities", () => {
  it("marks slot as high priority when main stat is wrong for profile", () => {
    const character: EnkaCharacterSummary = {
      avatarId: 10000002,
      level: 90,
      artifacts: [
        {
          kind: "artifact",
          equipType: "Circlet",
          main: { key: "FIGHT_PROP_HP_PERCENT", value: 46.6 },
          subs: [{ key: "FIGHT_PROP_CRITICAL", value: 10 }],
        },
      ],
    };

    const report = analyzeArtifactPriorities(character, "critDps");
    const circlet = report.slots.find((item) => item.slot === Slot.Circlet);

    expect(circlet?.mainOk).toBe(false);
    expect(circlet?.priority).toBe("high");
    expect(circlet?.reasons).toContain("main_wrong");
  });

  it("gives higher slot score when stats are closer to slot target", () => {
    const baseCharacter: Omit<EnkaCharacterSummary, "artifacts"> = {
      avatarId: 10000003,
      level: 90,
    };

    const lowStatsCharacter: EnkaCharacterSummary = {
      ...baseCharacter,
      artifacts: [
        {
          kind: "artifact",
          equipType: "Flower",
          main: { key: "FIGHT_PROP_HP", value: 4780 },
          subs: [
            { key: "FIGHT_PROP_CRITICAL", value: 2.7 },
            { key: "FIGHT_PROP_CRITICAL_HURT", value: 5.4 },
          ],
        },
      ],
    };

    const highStatsCharacter: EnkaCharacterSummary = {
      ...baseCharacter,
      artifacts: [
        {
          kind: "artifact",
          equipType: "Flower",
          main: { key: "FIGHT_PROP_HP", value: 4780 },
          subs: [
            { key: "FIGHT_PROP_CRITICAL", value: 10.5 },
            { key: "FIGHT_PROP_CRITICAL_HURT", value: 21.0 },
            { key: "FIGHT_PROP_ATTACK_PERCENT", value: 10.5 },
          ],
        },
      ],
    };

    const lowReport = analyzeArtifactPriorities(lowStatsCharacter, "critDps");
    const highReport = analyzeArtifactPriorities(highStatsCharacter, "critDps");
    const lowFlowerScore = lowReport.slots.find((item) => item.slot === Slot.Flower)?.slotScore ?? 0;
    const highFlowerScore = highReport.slots.find((item) => item.slot === Slot.Flower)?.slotScore ?? 0;

    expect(highFlowerScore).toBeGreaterThan(lowFlowerScore);
  });

  it("computes cvThreshold relative to current CV when using cv focus mode", () => {
    const character: EnkaCharacterSummary = {
      avatarId: 10000004,
      level: 90,
      artifacts: [
        {
          kind: "artifact",
          equipType: "Plume",
          main: { key: "FIGHT_PROP_ATTACK", value: 311 },
          subs: [
            { key: "FIGHT_PROP_CRITICAL", value: 20 },
            { key: "FIGHT_PROP_CRITICAL_HURT", value: 40 },
          ],
        },
      ],
    };

    const report = analyzeArtifactPriorities(character, "critDps");
    const plume = report.slots.find((item) => item.slot === Slot.Plume);

    expect(plume?.suggestedFocus?.objectiveMode).toBe("cv");
    expect(plume?.suggestedFocus?.cvThreshold).toBe(86);
  });

  it("keeps powerCurrent inside [0,1]", () => {
    const character: EnkaCharacterSummary = {
      avatarId: 10000005,
      level: 80,
      artifacts: [
        {
          kind: "artifact",
          equipType: "Flower",
          main: { key: "FIGHT_PROP_HP", value: 4780 },
          subs: [{ key: "FIGHT_PROP_CRITICAL", value: 3.1 }],
        },
        {
          kind: "artifact",
          equipType: "Sands",
          main: { key: "FIGHT_PROP_ATTACK_PERCENT", value: 46.6 },
          subs: [{ key: "FIGHT_PROP_CHARGE_EFFICIENCY", value: 5.2 }],
        },
      ],
    };

    const report = analyzeArtifactPriorities(character, "critDps");
    expect(report.powerCurrent).toBeGreaterThanOrEqual(0);
    expect(report.powerCurrent).toBeLessThanOrEqual(1);
  });

  it("emits fixed-slot suggested main stat for Flower and Plume", () => {
    const character: EnkaCharacterSummary = {
      avatarId: 10000006,
      level: 90,
      artifacts: [],
    };

    for (const profileId of ["critDps", "supportEr", "emReaction"] as const) {
      const report = analyzeArtifactPriorities(character, profileId);
      const flower = report.slots.find((item) => item.slot === Slot.Flower);
      const plume = report.slots.find((item) => item.slot === Slot.Plume);

      expect(flower?.suggestedFocus?.mainStat).toBe(MainStat.FlatHp);
      expect(plume?.suggestedFocus?.mainStat).toBe(MainStat.FlatAtk);
    }
  });
});
