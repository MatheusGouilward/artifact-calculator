"use client";

import { useMemo } from "react";
import Link from "next/link";

import { mapEnkaEquipTypeToSlot, mapEnkaStatToStatKey, type StatKey } from "@/lib/genshin/eval";
import {
  loadGameDataLite,
  localizeGameDataName,
  resolveArtifactSet,
  resolveCharacter,
  resolveWeapon,
} from "@/lib/genshin/game-data";
import { Slot } from "@/lib/genshin/artifacts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { EnkaCharacterSummary, EnkaNormalizedResponse } from "@/lib/enka/types";
import { t, type Locale } from "@/lib/i18n";

interface EnkaActiveCardProps {
  locale: Locale;
  uid?: string;
  data: EnkaNormalizedResponse | null;
  selectedCharacter: EnkaCharacterSummary | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClear: () => void;
}

function resolveErrorMessage(locale: Locale, error: string): string {
  if (error === "BAD_UID") {
    return t(locale, "enkaActive.errorBadUid");
  }
  if (error === "RATE_LIMITED") {
    return t(locale, "enkaActive.errorRateLimited");
  }
  if (error === "NETWORK_ERROR") {
    return t(locale, "enkaActive.errorNetwork");
  }
  return t(locale, "enkaActive.errorGeneric");
}

function valueOrDash(value: string | number | undefined): string {
  return value === undefined || value === "" ? "-" : String(value);
}

const SLOT_LABEL_KEYS: Record<Slot, string> = {
  [Slot.Flower]: "terms.slot.flower",
  [Slot.Plume]: "terms.slot.plume",
  [Slot.Sands]: "terms.slot.sands",
  [Slot.Goblet]: "terms.slot.goblet",
  [Slot.Circlet]: "terms.slot.circlet",
};

const STAT_KEY_LABEL_KEYS: Record<StatKey, string> = {
  hp_flat: "terms.stat.flatHp",
  hp_pct: "terms.stat.hpPercent",
  atk_flat: "terms.stat.flatAtk",
  atk_pct: "terms.stat.atkPercent",
  def_flat: "terms.stat.flatDef",
  def_pct: "terms.stat.defPercent",
  er_pct: "terms.stat.energyRecharge",
  em: "terms.stat.elementalMastery",
  crit_rate_pct: "terms.stat.critRate",
  crit_dmg_pct: "terms.stat.critDmg",
  healing_bonus_pct: "terms.stat.healingBonus",
  dmg_bonus_physical_pct: "terms.stat.physicalDmgBonus",
  dmg_bonus_pyro_pct: "terms.stat.pyroDmgBonus",
  dmg_bonus_hydro_pct: "terms.stat.hydroDmgBonus",
  dmg_bonus_electro_pct: "terms.stat.electroDmgBonus",
  dmg_bonus_cryo_pct: "terms.stat.cryoDmgBonus",
  dmg_bonus_dendro_pct: "terms.stat.dendroDmgBonus",
  dmg_bonus_anemo_pct: "terms.stat.anemoDmgBonus",
  dmg_bonus_geo_pct: "terms.stat.geoDmgBonus",
};

function localizeSlotLabel(equipType: string | undefined, locale: Locale): string {
  const slot = mapEnkaEquipTypeToSlot(equipType);
  if (!slot) {
    return equipType ?? t(locale, "enkaActive.unknown");
  }
  return t(locale, SLOT_LABEL_KEYS[slot]);
}

function localizeMainStat(mainKey: string | undefined, locale: Locale): string {
  if (!mainKey) {
    return "-";
  }
  const statKey = mapEnkaStatToStatKey(mainKey);
  if (!statKey) {
    return mainKey;
  }
  return t(locale, STAT_KEY_LABEL_KEYS[statKey]);
}

export function EnkaActiveCard({
  locale,
  uid,
  data,
  selectedCharacter,
  isLoading,
  error,
  onRefresh,
  onClear,
}: EnkaActiveCardProps) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const gameDataLite = useMemo(() => loadGameDataLite(), []);
  const resolvedCharacter = useMemo(
    () => resolveCharacter(selectedCharacter?.avatarId, gameDataLite),
    [gameDataLite, selectedCharacter?.avatarId],
  );
  const resolvedWeapon = useMemo(
    () => resolveWeapon(selectedCharacter?.weapon?.id, gameDataLite),
    [gameDataLite, selectedCharacter?.weapon?.id],
  );
  const characterName =
    localizeGameDataName(resolvedCharacter?.raw, locale as "en" | "pt-BR") ?? null;
  const weaponName =
    localizeGameDataName(resolvedWeapon?.raw, locale as "en" | "pt-BR") ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{tr("enkaActive.title")}</CardTitle>
            <CardDescription>
              {tr("enkaActive.uid")}: {data?.uid ?? uid ?? "-"}
            </CardDescription>
          </div>
          <Badge variant="outline">{tr("enkaActive.ttlNote")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="space-y-2">
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
            <div className="h-3 w-72 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted" />
          </div>
        )}

        {!isLoading && error && (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">{resolveErrorMessage(locale, error)}</p>
            <Button size="sm" type="button" variant="outline" onClick={onRefresh}>
              {tr("enkaActive.tryAgain")}
            </Button>
          </div>
        )}

        {!isLoading && !error && data && (
          <>
            {data.notes?.showcaseMissing && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
                {tr("enkaActive.showcaseMissing")}
              </p>
            )}

            {!selectedCharacter && !data.notes?.showcaseMissing && (
              <p className="rounded-md border p-2 text-sm">
                {tr("enkaActive.characterMissing")}{" "}
                <Link className="underline underline-offset-4" href="/import">
                  {tr("enkaActive.changeCharacter")}
                </Link>
              </p>
            )}

            {selectedCharacter && (
              <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    {resolvedCharacter?.iconUrl && (
                      <img
                        alt={characterName ?? tr("enkaActive.unknown")}
                        className="h-12 w-12 rounded-md border object-cover"
                        src={resolvedCharacter.iconUrl}
                      />
                    )}
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {characterName ??
                          tr("enkaActive.characterId", {
                            id: selectedCharacter.avatarId ?? tr("enkaActive.unknown"),
                          })}
                      </p>
                      {characterName && (
                        <p className="text-muted-foreground text-xs">
                          {tr("enkaActive.characterId", {
                            id: selectedCharacter.avatarId ?? tr("enkaActive.unknown"),
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm">
                    {tr("enkaActive.level")}: {valueOrDash(selectedCharacter.level)}
                  </p>
                  <p className="text-sm text-muted-foreground">{tr("enkaActive.weapon")}</p>
                  {(resolvedWeapon?.iconUrl ?? selectedCharacter.weapon?.iconUrl) && (
                    <img
                      alt={tr("enkaActive.weapon")}
                      className="h-12 w-12 rounded-md border object-cover"
                      src={resolvedWeapon?.iconUrl ?? selectedCharacter.weapon?.iconUrl}
                    />
                  )}
                  <p className="text-sm font-medium">{weaponName ?? tr("enkaActive.weapon")}</p>
                  {resolvedWeapon?.weaponType && (
                    <p className="text-muted-foreground text-xs">{resolvedWeapon.weaponType}</p>
                  )}
                  <p className="text-xs">
                    {tr("enkaActive.weaponLevel")}: {valueOrDash(selectedCharacter.weapon?.level)}
                  </p>
                  <p className="text-xs">
                    {tr("enkaActive.rarity")}:{" "}
                    {resolvedWeapon?.rarity
                      ? "\u2605".repeat(resolvedWeapon.rarity)
                      : valueOrDash(selectedCharacter.weapon?.rarity)}
                  </p>
                  <p className="text-xs">
                    {tr("enkaActive.weaponRefinement")}:{" "}
                    {valueOrDash(selectedCharacter.weapon?.refinement)}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{tr("enkaActive.artifacts")}</p>
                  {(selectedCharacter.artifacts.length === 0 || !selectedCharacter.artifacts) && (
                    <p className="text-muted-foreground text-xs">{tr("enkaActive.artifactsEmpty")}</p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {selectedCharacter.artifacts.slice(0, 5).map((artifact, index) => (
                      <div key={`active-artifact-${index}`} className="space-y-1 rounded-md border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span>{localizeSlotLabel(artifact.equipType, locale)}</span>
                          <span>+{valueOrDash(artifact.level)}</span>
                        </div>
                        {artifact.iconUrl && (
                          <img
                            alt={artifact.equipType ?? tr("enkaActive.unknown")}
                            className="h-8 w-8 rounded border object-cover"
                            src={artifact.iconUrl}
                          />
                        )}
                        {(() => {
                          const resolvedSet = resolveArtifactSet(artifact.setId, gameDataLite);
                          const setName =
                            localizeGameDataName(resolvedSet?.raw, locale as "en" | "pt-BR") ??
                            artifact.setName;
                          const setIconUrl = resolvedSet?.iconUrl ?? artifact.setIconUrl;
                          if (!setName) {
                            return null;
                          }
                          return (
                            <p className="inline-flex items-center gap-1 text-muted-foreground">
                              {setIconUrl && (
                                <img
                                  alt={setName}
                                  className="h-3.5 w-3.5 rounded border object-cover"
                                  src={setIconUrl}
                                />
                              )}
                              <span>
                                {tr("enkaActive.set")}: {setName}
                              </span>
                            </p>
                          );
                        })()}
                        <p className="truncate">
                          {tr("enkaActive.main")}:{" "}
                          {artifact.main
                            ? `${localizeMainStat(artifact.main.key, locale)} (${valueOrDash(artifact.main.value)})`
                            : "-"}
                        </p>
                        {(artifact.subs ?? []).slice(0, 4).map((sub, subIndex) => (
                          <p key={`active-artifact-${index}-sub-${subIndex}`} className="truncate text-muted-foreground">
                            {sub.key ?? "-"} ({valueOrDash(sub.value)})
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" type="button" variant="outline">
            <Link href="/import">{tr("enkaActive.changeCharacter")}</Link>
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={onRefresh}>
            {tr("enkaActive.refresh")}
          </Button>
          <Button size="sm" type="button" variant="destructive" onClick={onClear}>
            {tr("enkaActive.clearImport")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
