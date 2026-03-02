import type { EnkaCharacterSummary } from "@/lib/enka/types";
import { Slot } from "@/lib/genshin/artifacts/types";

import type { Modifier } from "./modifiers";
import { emptyStatBlock, type StatBlock } from "./stat-block";
import { mapEnkaStatToStatKey, normalizeStatLabel } from "./stat-mapping";
import type { StatKey } from "./stat-keys";

interface LabelValueStat {
  label?: string;
  key?: string;
  value?: number;
}

export interface EnkaToModifiersResult {
  base: StatBlock;
  modifiers: Modifier[];
  bySlot: Record<Slot, Modifier[]>;
}

function emptyBySlotMap(): Record<Slot, Modifier[]> {
  return {
    [Slot.Flower]: [],
    [Slot.Plume]: [],
    [Slot.Sands]: [],
    [Slot.Goblet]: [],
    [Slot.Circlet]: [],
  };
}

function addToPartialStatBlock(
  target: Partial<StatBlock>,
  key: StatKey,
  value: number | undefined,
): void {
  if (value === undefined || !Number.isFinite(value)) {
    return;
  }
  target[key] = (target[key] ?? 0) + value;
}

export function mapEnkaEquipTypeToSlot(equipType: string | undefined): Slot | null {
  if (!equipType) {
    return null;
  }

  const normalized = normalizeStatLabel(equipType);
  const uppercase = equipType.trim().toUpperCase();

  if (
    uppercase === "EQUIP_BRACER" ||
    normalized.includes("flower") ||
    normalized.includes("flor")
  ) {
    return Slot.Flower;
  }

  if (
    uppercase === "EQUIP_NECKLACE" ||
    normalized.includes("plume") ||
    normalized.includes("pena")
  ) {
    return Slot.Plume;
  }

  if (
    uppercase === "EQUIP_SHOES" ||
    normalized.includes("sands") ||
    normalized.includes("areias") ||
    normalized.includes("ampulheta")
  ) {
    return Slot.Sands;
  }

  if (
    uppercase === "EQUIP_RING" ||
    normalized.includes("goblet") ||
    normalized.includes("calice")
  ) {
    return Slot.Goblet;
  }

  if (
    uppercase === "EQUIP_DRESS" ||
    normalized.includes("circlet") ||
    normalized.includes("tiara")
  ) {
    return Slot.Circlet;
  }

  return null;
}

function mapLabelValueStatsToPartial(entries: LabelValueStat[]): Partial<StatBlock> {
  const stats: Partial<StatBlock> = {};

  for (const entry of entries) {
    const candidateLabel = entry.label ?? entry.key;
    if (!candidateLabel) {
      continue;
    }

    const mapped = mapEnkaStatToStatKey(candidateLabel);
    if (!mapped) {
      continue;
    }

    addToPartialStatBlock(stats, mapped, entry.value);
  }

  return stats;
}

function getWeaponStatEntries(character: EnkaCharacterSummary): LabelValueStat[] {
  const weapon = character.weapon as unknown;
  if (!weapon || typeof weapon !== "object") {
    return [];
  }

  const weaponRecord = weapon as Record<string, unknown>;
  const entries: LabelValueStat[] = [];

  const pushFromArray = (source: unknown): void => {
    if (!Array.isArray(source)) {
      return;
    }

    for (const item of source) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const row = item as Record<string, unknown>;
      const labelCandidate = row.label ?? row.key ?? row.appendPropId;
      const valueCandidate = row.value ?? row.statValue;

      entries.push({
        label: typeof labelCandidate === "string" ? labelCandidate : undefined,
        value: typeof valueCandidate === "number" ? valueCandidate : undefined,
      });
    }
  };

  pushFromArray(weaponRecord.stats);
  pushFromArray(weaponRecord.weaponStats);
  pushFromArray(weaponRecord.substats);

  if (weaponRecord.main && typeof weaponRecord.main === "object") {
    const main = weaponRecord.main as Record<string, unknown>;
    entries.push({
      label: typeof main.key === "string" ? main.key : undefined,
      value: typeof main.value === "number" ? main.value : undefined,
    });
  }

  return entries;
}

export function enkaToModifiers(selectedCharacter: EnkaCharacterSummary | null): EnkaToModifiersResult {
  const base = emptyStatBlock();
  const bySlot = emptyBySlotMap();
  const modifiers: Modifier[] = [];

  if (!selectedCharacter) {
    modifiers.push({
      source: "weapon",
      label: "weapon",
      stats: {},
    });
    return { base, modifiers, bySlot };
  }

  for (const artifact of selectedCharacter.artifacts ?? []) {
    const slot = mapEnkaEquipTypeToSlot(artifact.equipType);
    if (!slot) {
      continue;
    }

    const mainEntry: LabelValueStat[] = artifact.main
      ? [{ key: artifact.main.key, value: artifact.main.value }]
      : [];

    const subEntries: LabelValueStat[] = (artifact.subs ?? []).map((sub) => ({
      key: sub.key,
      value: sub.value,
    }));

    const stats = mapLabelValueStatsToPartial([...mainEntry, ...subEntries]);
    const modifier: Modifier = {
      source: "artifact",
      label: artifact.equipType ?? slot,
      stats,
    };

    modifiers.push(modifier);
    bySlot[slot].push(modifier);
  }

  const weaponStats = mapLabelValueStatsToPartial(getWeaponStatEntries(selectedCharacter));
  modifiers.push({
    source: "weapon",
    label: "weapon",
    stats: weaponStats,
  });

  return {
    base,
    modifiers,
    bySlot,
  };
}
