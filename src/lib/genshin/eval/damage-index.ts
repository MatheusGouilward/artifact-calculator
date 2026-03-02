import type { EnkaCharacterSummary } from "@/lib/enka/types";

import { extractCombatTotals } from "./enka-fightprops";
import { type ExpectedDamageSimpleObjectiveConfig, scoreObjective } from "./objectives";
import { emptyStatBlock } from "./stat-block";

export interface DamageIndexBreakdown {
  base: number;
  dmgBonus: number;
  critMult: number;
  expectedDamage: number;
}

export interface DamageIndexResult {
  score: number;
  breakdown: DamageIndexBreakdown;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function computeDamageIndexFromEnka(
  selectedCharacter: EnkaCharacterSummary | null,
  config: ExpectedDamageSimpleObjectiveConfig,
): DamageIndexResult {
  const combat = extractCombatTotals(selectedCharacter?.fightProps);
  const scored = scoreObjective(emptyStatBlock(), config, { combat });

  return {
    score: toNumber(scored.score),
    breakdown: {
      base: toNumber(scored.breakdown.base),
      dmgBonus: toNumber(scored.breakdown.dmgBonus),
      critMult: toNumber(scored.breakdown.critMult),
      expectedDamage: toNumber(scored.breakdown.expectedDamage),
    },
  };
}
