"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { writeActiveCharacterRef } from "@/lib/enka/use-active-character";
import { Slot } from "@/lib/genshin/artifacts";
import { mapEnkaEquipTypeToSlot, mapEnkaStatToStatKey, type StatKey } from "@/lib/genshin/eval";
import {
  enkaIconUrl,
  loadGameDataLite,
  localizeGameDataName,
  resolveArtifactSet,
  resolveCharacter,
  resolveWeapon,
} from "@/lib/genshin/game-data";
import type {
  EnkaArtifactSummary,
  EnkaCharacterSummary,
  EnkaNormalizedResponse,
} from "@/lib/enka/types";
import { t } from "@/lib/i18n";
const UID_PATTERN = /^\d{9}$/;

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

interface EnkaErrorPayload {
  code?: string;
  status?: number;
}

function formatStat(value?: number): string {
  return value === undefined ? "-" : String(value);
}

function resolveErrorMessage(
  payload: EnkaErrorPayload | undefined,
  responseStatus: number,
  tr: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (payload?.code === "BAD_UID" || responseStatus === 400) {
    return tr("import.errors.invalidUid");
  }
  if (responseStatus === 429) {
    return tr("import.errors.rateLimited");
  }
  return tr("import.errors.generic", { status: responseStatus });
}

function getSelectedCharacter(
  data: EnkaNormalizedResponse | null,
  avatarId: number | null,
): EnkaCharacterSummary | null {
  if (!data || avatarId === null) {
    return null;
  }

  return data.characters.find((item) => item.avatarId === avatarId) ?? null;
}

function getArtifactSlots(
  selectedCharacter: EnkaCharacterSummary | null,
): Array<EnkaArtifactSummary | undefined> {
  return Array.from({ length: 5 }, (_, index) => selectedCharacter?.artifacts[index]);
}

function localizeSlotLabel(
  equipType: string | undefined,
  tr: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const slot = mapEnkaEquipTypeToSlot(equipType);
  if (!slot) {
    return equipType ?? tr("import.characters.unknown");
  }
  return tr(SLOT_LABEL_KEYS[slot]);
}

function localizeMainStatLabel(
  key: string | undefined,
  tr: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (!key) {
    return "-";
  }
  const statKey = mapEnkaStatToStatKey(key);
  if (!statKey) {
    return key;
  }
  return tr(STAT_KEY_LABEL_KEYS[statKey]);
}

export function EnkaImport() {
  const { locale } = useLocale();
  const router = useRouter();
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const gameDataLite = useMemo(() => loadGameDataLite(), []);

  const [uidInput, setUidInput] = useState("");
  const [uidError, setUidError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [showcaseNotice, setShowcaseNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EnkaNormalizedResponse | null>(null);
  const [selectedAvatarId, setSelectedAvatarId] = useState<number | null>(null);

  const selectedCharacter = useMemo(
    () => getSelectedCharacter(data, selectedAvatarId),
    [data, selectedAvatarId],
  );
  const artifactSlots = useMemo(() => getArtifactSlots(selectedCharacter), [selectedCharacter]);
  const selectedCharacterResolved = useMemo(
    () => resolveCharacter(selectedCharacter?.avatarId, gameDataLite),
    [gameDataLite, selectedCharacter?.avatarId],
  );
  const selectedWeaponResolved = useMemo(
    () => resolveWeapon(selectedCharacter?.weapon?.id, gameDataLite),
    [gameDataLite, selectedCharacter?.weapon?.id],
  );
  const selectedCharacterName =
    localizeGameDataName(selectedCharacterResolved?.raw, locale as "en" | "pt-BR") ?? null;
  const selectedWeaponName =
    localizeGameDataName(selectedWeaponResolved?.raw, locale as "en" | "pt-BR") ?? null;

  const handleUidChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 9);
    setUidInput(digitsOnly);
    setUidError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestError(null);
    setShowcaseNotice(null);

    if (!UID_PATTERN.test(uidInput)) {
      setUidError(tr("import.errors.invalidUid"));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/enka/uid/${uidInput}?locale=${encodeURIComponent(locale)}`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as EnkaNormalizedResponse | EnkaErrorPayload;

      if (!response.ok) {
        setRequestError(resolveErrorMessage(payload as EnkaErrorPayload, response.status, tr));
        setData(null);
        setSelectedAvatarId(null);
        return;
      }

      const normalized = payload as EnkaNormalizedResponse;
      setData(normalized);
      setSelectedAvatarId(null);
      if (normalized.notes?.showcaseMissing) {
        setShowcaseNotice(tr("import.errors.showcaseMissing"));
      }
    } catch {
      setRequestError(tr("import.errors.network"));
      setData(null);
      setSelectedAvatarId(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUseCharacter = () => {
    if (!data || selectedAvatarId === null) {
      return;
    }

    writeActiveCharacterRef({
      uid: data.uid,
      avatarId: selectedAvatarId,
    });

    router.push("/?enka=1");
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{tr("import.title")}</h1>
            <p className="text-muted-foreground text-sm">{tr("import.subtitle")}</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/">{tr("import.backHome")}</Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{tr("import.form.title")}</CardTitle>
          <CardDescription>{tr("import.form.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
            <div className="w-full space-y-2">
              <label className="text-sm font-medium" htmlFor="enka-uid-input">
                {tr("import.form.uidLabel")}
              </label>
              <Input
                id="enka-uid-input"
                aria-invalid={uidError ? true : undefined}
                autoComplete="off"
                inputMode="numeric"
                maxLength={9}
                placeholder={tr("import.form.uidPlaceholder")}
                value={uidInput}
                onChange={(event) => handleUidChange(event.target.value)}
              />
              {uidError && <p className="text-destructive text-sm">{uidError}</p>}
            </div>
            <Button className="sm:min-w-28" disabled={loading} type="submit">
              {loading ? tr("import.form.importing") : tr("import.form.import")}
            </Button>
          </form>

          {requestError && <p className="text-destructive text-sm">{requestError}</p>}
          {showcaseNotice && <p className="text-sm text-amber-700 dark:text-amber-400">{showcaseNotice}</p>}
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>{tr("import.player.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">{tr("import.player.nickname")}</p>
              <p className="font-semibold">{data.player.nickname || "-"}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">{tr("import.player.arLevel")}</p>
              <p className="font-semibold">{formatStat(data.player.level)}</p>
            </div>
            {data.player.worldLevel !== undefined && (
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">{tr("import.player.worldLevel")}</p>
                <p className="font-semibold">{data.player.worldLevel}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle>{tr("import.characters.title")}</CardTitle>
              <CardDescription>
                {data.characters.length > 0
                  ? tr("import.characters.count", { count: data.characters.length })
                  : tr("import.characters.empty")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.characters.length === 0 && (
                <p className="text-muted-foreground text-sm">{tr("import.characters.empty")}</p>
              )}
              {data.characters.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {data.characters.map((character, index) => {
                    const isSelected =
                      character.avatarId !== undefined && character.avatarId === selectedAvatarId;
                    const resolved = resolveCharacter(character.avatarId, gameDataLite);
                    const characterName =
                      localizeGameDataName(resolved?.raw, locale as "en" | "pt-BR") ??
                      tr("import.characters.avatar", {
                        id: character.avatarId ?? tr("import.characters.unknown"),
                      });
                    const characterIcon = resolved?.iconUrl ?? null;

                    return (
                      <div
                        key={`${character.avatarId ?? "unknown"}-${index}`}
                        className={`space-y-3 rounded-lg border p-3 ${
                          isSelected ? "border-primary bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{characterName}</p>
                          {character.level !== undefined && (
                            <Badge variant="secondary">
                              {tr("import.characters.level", { level: character.level })}
                            </Badge>
                          )}
                        </div>

                        {character.avatarId !== undefined && (
                          <p className="text-muted-foreground text-xs">
                            {tr("import.characters.avatar", { id: character.avatarId })}
                          </p>
                        )}

                        <div className="flex items-center gap-2">
                          {characterIcon && (
                            <img
                              alt={characterName}
                              className="h-12 w-12 rounded-md border object-cover"
                              src={characterIcon}
                            />
                          )}
                          <div className="space-y-1 text-xs text-muted-foreground">
                            {resolved?.element && <p>{tr("import.characters.element")}: {resolved.element}</p>}
                            {resolved?.weaponType && <p>{tr("import.characters.weaponType")}: {resolved.weaponType}</p>}
                          </div>
                        </div>

                        <Button
                          disabled={character.avatarId === undefined}
                          size="sm"
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          onClick={() => setSelectedAvatarId(character.avatarId ?? null)}
                        >
                          {isSelected ? tr("import.characters.selected") : tr("import.characters.select")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tr("import.details.title")}</CardTitle>
              <CardDescription>{tr("import.details.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedCharacter && (
                <p className="text-muted-foreground text-sm">{tr("import.details.noneSelected")}</p>
              )}

              {selectedCharacter && (
                <>
                  <div className="flex items-center gap-2 rounded-lg border p-3">
                    {selectedCharacterResolved?.iconUrl && (
                      <img
                        alt={selectedCharacterName ?? tr("import.characters.unknown")}
                        className="h-10 w-10 rounded-md border object-cover"
                        src={selectedCharacterResolved.iconUrl}
                      />
                    )}
                    <div>
                      <p className="text-sm font-semibold">
                        {selectedCharacterName ??
                          tr("import.characters.avatar", {
                            id: selectedCharacter.avatarId ?? tr("import.characters.unknown"),
                          })}
                      </p>
                      {selectedCharacter.avatarId !== undefined && (
                        <p className="text-muted-foreground text-xs">
                          {tr("import.characters.avatar", { id: selectedCharacter.avatarId })}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border p-3">
                    <p className="text-sm font-semibold">{tr("import.details.weapon")}</p>
                    {selectedCharacter.weapon ? (
                      <div className="space-y-2">
                        {(selectedWeaponResolved?.iconUrl ?? enkaIconUrl(selectedCharacter.weapon.iconUrl)) && (
                          <img
                            alt={tr("import.details.weapon")}
                            className="h-12 w-12 rounded-md border object-cover"
                            src={selectedWeaponResolved?.iconUrl ?? enkaIconUrl(selectedCharacter.weapon.iconUrl) ?? undefined}
                          />
                        )}
                        <p className="text-sm font-medium">
                          {selectedWeaponName ?? tr("import.details.weapon")}
                        </p>
                        {selectedWeaponResolved?.weaponType && (
                          <p className="text-muted-foreground text-xs">{selectedWeaponResolved.weaponType}</p>
                        )}
                        <p className="text-sm">
                          {tr("import.details.weaponLevel")}: {formatStat(selectedCharacter.weapon.level)}
                        </p>
                        <p className="text-sm">
                          {tr("import.details.weaponRarity")}:{" "}
                          {selectedWeaponResolved?.rarity
                            ? "\u2605".repeat(selectedWeaponResolved.rarity)
                            : formatStat(selectedCharacter.weapon.rarity)}
                        </p>
                        <p className="text-sm">
                          {tr("import.details.weaponRefinement")}:{" "}
                          {formatStat(selectedCharacter.weapon.refinement)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">{tr("import.details.weaponMissing")}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold">{tr("import.details.artifacts")}</p>
                    <div className="grid gap-2">
                      {artifactSlots.map((artifact, index) => (
                        <div key={`artifact-slot-${index}`} className="space-y-2 rounded-lg border p-3">
                          {!artifact && (
                            <p className="text-muted-foreground text-xs">{tr("import.details.artifactEmpty")}</p>
                          )}
                          {artifact && (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">
                                  {localizeSlotLabel(artifact.equipType, tr)}
                                </p>
                                <Badge variant="outline">
                                  {tr("import.details.artifactLevel", {
                                    level: artifact.level ?? tr("import.characters.unknown"),
                                  })}
                                </Badge>
                              </div>
                              {artifact.iconUrl && (
                                <img
                                  alt={artifact.equipType ?? tr("import.characters.unknown")}
                                  className="h-10 w-10 rounded-md border object-cover"
                                  src={artifact.iconUrl}
                                />
                              )}
                              {(() => {
                                const resolvedSet = resolveArtifactSet(artifact.setId, gameDataLite);
                                const setName =
                                  localizeGameDataName(resolvedSet?.raw, locale as "en" | "pt-BR") ??
                                  artifact.setName;
                                const setIcon = resolvedSet?.iconUrl ?? enkaIconUrl(artifact.setIconUrl);
                                if (!setName) {
                                  return null;
                                }
                                return (
                                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    {setIcon && (
                                      <img
                                        alt={setName}
                                        className="h-3.5 w-3.5 rounded border object-cover"
                                        src={setIcon}
                                      />
                                    )}
                                    <span>
                                      {tr("import.details.set")}: {setName}
                                    </span>
                                  </p>
                                );
                              })()}
                              <p className="text-xs">
                                {tr("import.details.mainStat")}:{" "}
                                {artifact.main
                                  ? `${localizeMainStatLabel(artifact.main.key, tr)} (${formatStat(artifact.main.value)})`
                                  : "-"}
                              </p>
                              <div className="space-y-1">
                                <p className="text-xs font-medium">{tr("import.details.substats")}</p>
                                {(artifact.subs?.length ?? 0) === 0 && (
                                  <p className="text-muted-foreground text-xs">
                                    {tr("import.details.substatsEmpty")}
                                  </p>
                                )}
                                {(artifact.subs ?? []).map((sub, subIndex) => (
                                  <p key={`artifact-sub-${index}-${subIndex}`} className="text-xs">
                                    {sub.key ?? "-"} ({formatStat(sub.value)})
                                  </p>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-wrap gap-2">
                <Button disabled={!selectedCharacter} type="button" onClick={handleUseCharacter}>
                  {tr("import.details.useCharacter")}
                </Button>
                <Button
                  disabled={!selectedCharacter}
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedAvatarId(null)}
                >
                  {tr("import.details.clearSelection")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
