import { describe, expect, it } from "vitest";

import {
  ARTIFACT_PRESETS,
  decodeArtifactCalculatorSharePayload,
  decodeArtifactCalculatorShareState,
  encodeArtifactCalculatorShareState,
  type ArtifactCalculatorShareState,
} from "./index";
import { excludedSubStatForMain } from "./tables";
import { MainStat, Slot, SubStat } from "./types";

const MAIN_OPTIONS_BY_SLOT: Record<Slot, MainStat[]> = {
  [Slot.Flower]: [MainStat.FlatHp],
  [Slot.Plume]: [MainStat.FlatAtk],
  [Slot.Sands]: [
    MainStat.HpPercent,
    MainStat.AtkPercent,
    MainStat.DefPercent,
    MainStat.EnergyRecharge,
    MainStat.ElementalMastery,
  ],
  [Slot.Goblet]: [
    MainStat.HpPercent,
    MainStat.AtkPercent,
    MainStat.DefPercent,
    MainStat.PyroDmgBonus,
    MainStat.HydroDmgBonus,
    MainStat.ElectroDmgBonus,
    MainStat.CryoDmgBonus,
    MainStat.DendroDmgBonus,
    MainStat.AnemoDmgBonus,
    MainStat.GeoDmgBonus,
    MainStat.PhysicalDmgBonus,
    MainStat.ElementalMastery,
  ],
  [Slot.Circlet]: [
    MainStat.HpPercent,
    MainStat.AtkPercent,
    MainStat.DefPercent,
    MainStat.CritRate,
    MainStat.CritDmg,
    MainStat.HealingBonus,
    MainStat.ElementalMastery,
  ],
};

describe("artifact presets", () => {
  it("includes the expected generic preset names", () => {
    expect(ARTIFACT_PRESETS.map((preset) => preset.name)).toEqual(
      expect.arrayContaining([
        "Crit DPS (CV30+)",
        "Support ER (ER main, CV20+)",
        "EM Reaction (EM main, CV irrelevant)",
        "Goblet Elemental (hard mode)",
        "Circlet CR/CD focus",
      ]),
    );
  });

  it("uses valid slot/main/sub rules and transmuter constraints", () => {
    for (const preset of ARTIFACT_PRESETS) {
      const selectedMain = preset.main ?? MAIN_OPTIONS_BY_SLOT[preset.slot][0];
      expect(MAIN_OPTIONS_BY_SLOT[preset.slot]).toContain(selectedMain);

      const excludedSub = excludedSubStatForMain(selectedMain);

      if (preset.subsRule.mode === "atLeast") {
        expect(preset.subsRule.n).toBeLessThanOrEqual(preset.desiredSubs.length);
      }

      if (excludedSub) {
        expect(preset.desiredSubs).not.toContain(excludedSub);
        expect(preset.upgradeRequirement.group).not.toContain(excludedSub);
        expect(preset.transmuter.fixedSubs).not.toContain(excludedSub);
      }

      expect(preset.strongbox.recycleRate).toBeGreaterThanOrEqual(0);
      expect(preset.strongbox.recycleRate).toBeLessThanOrEqual(1);
      expect(preset.upgradeRequirement.k).toBeGreaterThanOrEqual(0);
      expect(preset.upgradeRequirement.k).toBeLessThanOrEqual(5);

      if (preset.transmuter.enabled) {
        expect(preset.transmuter.fixedSubs).toHaveLength(2);
      }
      expect(new Set(preset.transmuter.fixedSubs).size).toBe(preset.transmuter.fixedSubs.length);
    }
  });
});

describe("share config encoding", () => {
  it("roundtrips state via compact cfg payload", () => {
    const baseState: ArtifactCalculatorShareState = {
      targetSet: "B",
      slot: Slot.Goblet,
      main: MainStat.HydroDmgBonus,
      desiredSubs: [SubStat.CritRate, SubStat.CritDmg, SubStat.AtkPercent],
      ruleMode: "atLeast",
      atLeastN: 2,
      runMode: "runs",
      runs: 245,
      resin: 4900,
      targetProb: 0.87,
      upgradeEnabled: true,
      upgradePreset: "custom",
      upgradeCustomGroup: [SubStat.CritRate, SubStat.CritDmg],
      upgradeK: 3,
      farmStrategy: "combined",
      recycleRatePct: 90,
      transmuterEnabled: true,
      transmuterElixirs: 6,
      transmuterMaxCrafts: 2,
      transmuterFixedSubs: [SubStat.CritRate, SubStat.CritDmg],
      cvEnabled: true,
      cvThreshold: 30,
      cvAttemptSource: "strongbox",
      optimizerEnabled: true,
      optimizerObjective: "cv",
    };

    const encoded = encodeArtifactCalculatorShareState(baseState);
    const decoded = decodeArtifactCalculatorShareState(encoded, baseState);

    expect(decoded).toEqual(baseState);
  });

  it("roundtrips lang/theme when provided and defaults safely when missing", () => {
    const baseState: ArtifactCalculatorShareState = {
      targetSet: "A",
      slot: Slot.Sands,
      main: MainStat.AtkPercent,
      desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
      ruleMode: "all",
      atLeastN: 1,
      runMode: "runs",
      runs: 100,
      resin: 2000,
      targetProb: 0.9,
      upgradeEnabled: false,
      upgradePreset: "crit",
      upgradeCustomGroup: [SubStat.CritRate, SubStat.CritDmg],
      upgradeK: 3,
      farmStrategy: "domainsOnly",
      recycleRatePct: 100,
      transmuterEnabled: false,
      transmuterElixirs: 0,
      transmuterMaxCrafts: 2,
      transmuterFixedSubs: [SubStat.CritRate, SubStat.CritDmg],
      cvEnabled: false,
      cvThreshold: 30,
      cvAttemptSource: "domain",
      optimizerEnabled: false,
      optimizerObjective: "constraints",
    };

    const encodedWithLangAndTheme = encodeArtifactCalculatorShareState(baseState, {
      lang: "pt-BR",
      theme: "dark",
    });
    const payloadWithLangAndTheme = decodeArtifactCalculatorSharePayload(encodedWithLangAndTheme, baseState);

    expect(payloadWithLangAndTheme).toEqual({
      state: baseState,
      lang: "pt-BR",
      theme: "dark",
    });

    const encodedWithoutLang = encodeArtifactCalculatorShareState(baseState);
    const payloadWithoutLang = decodeArtifactCalculatorSharePayload(encodedWithoutLang, baseState);

    expect(payloadWithoutLang).toEqual({
      state: baseState,
      lang: undefined,
      theme: undefined,
    });
  });

  it("decodes legacy payloads without lang/theme keys", () => {
    const fallback: ArtifactCalculatorShareState = {
      targetSet: "A",
      slot: Slot.Sands,
      main: MainStat.AtkPercent,
      desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
      ruleMode: "all",
      atLeastN: 1,
      runMode: "runs",
      runs: 100,
      resin: 2000,
      targetProb: 0.9,
      upgradeEnabled: false,
      upgradePreset: "crit",
      upgradeCustomGroup: [SubStat.CritRate, SubStat.CritDmg],
      upgradeK: 3,
      farmStrategy: "domainsOnly",
      recycleRatePct: 100,
      transmuterEnabled: false,
      transmuterElixirs: 0,
      transmuterMaxCrafts: 2,
      transmuterFixedSubs: [SubStat.CritRate, SubStat.CritDmg],
      cvEnabled: false,
      cvThreshold: 30,
      cvAttemptSource: "domain",
      optimizerEnabled: false,
      optimizerObjective: "constraints",
    };

    const legacyLike = {
      v: 1,
      t: "B",
      s: Slot.Circlet,
      m: MainStat.CritRate,
      d: [SubStat.CritDmg],
      rm: "all",
      n: 1,
      hm: "runs",
      r: 50,
      rs: 1000,
      p: 0.5,
      ue: false,
      up: "crit",
      ug: [SubStat.CritRate, SubStat.CritDmg],
      uk: 2,
      fs: "domainsOnly",
      rr: 100,
      te: false,
      tl: 0,
      tm: 0,
      tf: [SubStat.CritRate, SubStat.CritDmg],
      ce: false,
      ct: 30,
      cs: "domain",
      oe: false,
      oo: "constraints",
    };

    const encodedLegacyLike = Buffer.from(JSON.stringify(legacyLike), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const payload = decodeArtifactCalculatorSharePayload(encodedLegacyLike, fallback);

    expect(payload?.state.targetSet).toBe("B");
    expect(payload?.lang).toBeUndefined();
    expect(payload?.theme).toBeUndefined();
  });

  it("returns null for malformed cfg input", () => {
    const fallback: ArtifactCalculatorShareState = {
      targetSet: "A",
      slot: Slot.Sands,
      main: MainStat.AtkPercent,
      desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
      ruleMode: "all",
      atLeastN: 1,
      runMode: "runs",
      runs: 100,
      resin: 2000,
      targetProb: 0.9,
      upgradeEnabled: false,
      upgradePreset: "crit",
      upgradeCustomGroup: [SubStat.CritRate, SubStat.CritDmg],
      upgradeK: 3,
      farmStrategy: "domainsOnly",
      recycleRatePct: 100,
      transmuterEnabled: false,
      transmuterElixirs: 0,
      transmuterMaxCrafts: 2,
      transmuterFixedSubs: [SubStat.CritRate, SubStat.CritDmg],
      cvEnabled: false,
      cvThreshold: 30,
      cvAttemptSource: "domain",
      optimizerEnabled: false,
      optimizerObjective: "constraints",
    };

    expect(decodeArtifactCalculatorShareState("definitely-not-valid-base64", fallback)).toBeNull();
  });

  it("normalizes Flower main stat to Flat HP when decoding cfg", () => {
    const fallback: ArtifactCalculatorShareState = {
      targetSet: "A",
      slot: Slot.Sands,
      main: MainStat.AtkPercent,
      desiredSubs: [SubStat.CritRate, SubStat.CritDmg],
      ruleMode: "all",
      atLeastN: 1,
      runMode: "runs",
      runs: 100,
      resin: 2000,
      targetProb: 0.9,
      upgradeEnabled: false,
      upgradePreset: "crit",
      upgradeCustomGroup: [SubStat.CritRate, SubStat.CritDmg],
      upgradeK: 3,
      farmStrategy: "domainsOnly",
      recycleRatePct: 100,
      transmuterEnabled: false,
      transmuterElixirs: 0,
      transmuterMaxCrafts: 2,
      transmuterFixedSubs: [SubStat.CritRate, SubStat.CritDmg],
      cvEnabled: false,
      cvThreshold: 30,
      cvAttemptSource: "domain",
      optimizerEnabled: false,
      optimizerObjective: "constraints",
    };

    const invalidState: ArtifactCalculatorShareState = {
      ...fallback,
      slot: Slot.Flower,
      main: MainStat.AtkPercent,
    };
    const encoded = encodeArtifactCalculatorShareState(invalidState);
    const decoded = decodeArtifactCalculatorShareState(encoded, fallback);

    expect(decoded).not.toBeNull();
    expect(decoded?.slot).toBe(Slot.Flower);
    expect(decoded?.main).toBe(MainStat.FlatHp);
  });
});
