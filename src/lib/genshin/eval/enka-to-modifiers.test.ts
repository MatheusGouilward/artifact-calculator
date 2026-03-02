import { describe, expect, it } from "vitest";

import type { EnkaCharacterSummary } from "@/lib/enka/types";
import { Slot } from "@/lib/genshin/artifacts/types";

import { enkaToModifiers } from "./enka-to-modifiers";
import { mapEnkaStatToStatKey } from "./stat-mapping";

describe("mapEnkaStatToStatKey", () => {
  it("maps EN and PT-BR labels to canonical keys", () => {
    expect(mapEnkaStatToStatKey("Vida")).toBe("hp_flat");
    expect(mapEnkaStatToStatKey("Vida%")).toBe("hp_pct");
    expect(mapEnkaStatToStatKey("ATQ%")).toBe("atk_pct");
    expect(mapEnkaStatToStatKey("Energy Recharge")).toBe("er_pct");
    expect(mapEnkaStatToStatKey("Recarga de Energia")).toBe("er_pct");
    expect(mapEnkaStatToStatKey("CRIT Rate")).toBe("crit_rate_pct");
    expect(mapEnkaStatToStatKey("Dano Crítico")).toBe("crit_dmg_pct");
  });

  it("maps elemental bonus variants", () => {
    expect(mapEnkaStatToStatKey("Bônus de Dano Pyro")).toBe("dmg_bonus_pyro_pct");
    expect(mapEnkaStatToStatKey("Physical DMG Bonus")).toBe("dmg_bonus_physical_pct");
  });

  it("returns null for unknown labels", () => {
    expect(mapEnkaStatToStatKey("Foo Stat")).toBeNull();
  });
});

describe("enkaToModifiers", () => {
  it("maps artifact main/sub stats into canonical modifier stats", () => {
    const character: EnkaCharacterSummary = {
      avatarId: 10000002,
      level: 90,
      artifacts: [
        {
          kind: "artifact",
          equipType: "Circlet",
          main: { key: "Taxa Crítica", value: 31.1 },
          subs: [{ key: "Dano Crítico", value: 14 }],
        },
      ],
    };

    const result = enkaToModifiers(character);
    const circletMods = result.bySlot[Slot.Circlet];

    expect(circletMods.length).toBe(1);
    expect(circletMods[0].stats.crit_rate_pct).toBeCloseTo(31.1, 12);
    expect(circletMods[0].stats.crit_dmg_pct).toBe(14);
  });

  it("ignores unknown labels without crashing", () => {
    const character: EnkaCharacterSummary = {
      avatarId: 10000003,
      level: 80,
      artifacts: [
        {
          kind: "artifact",
          equipType: "Flower",
          main: { key: "Unknown Main", value: 100 },
          subs: [{ key: "Another Unknown", value: 20 }],
        },
      ],
    };

    const result = enkaToModifiers(character);
    const flowerMods = result.bySlot[Slot.Flower];

    expect(flowerMods.length).toBe(1);
    expect(Object.keys(flowerMods[0].stats)).toEqual([]);
  });
});
