"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Locale } from "@/lib/i18n";
import type { EnkaCharacterSummary, EnkaNormalizedResponse } from "@/lib/enka/types";

const ACTIVE_CHARACTER_STORAGE_KEY = "genshin_calc_active_character";
const UID_PATTERN = /^\d{9}$/;

export interface ActiveCharacterRef {
  uid: string;
  avatarId: number;
}

function isActiveCharacterRef(value: unknown): value is ActiveCharacterRef {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ActiveCharacterRef>;
  return (
    typeof candidate.uid === "string" &&
    UID_PATTERN.test(candidate.uid) &&
    typeof candidate.avatarId === "number" &&
    Number.isInteger(candidate.avatarId) &&
    candidate.avatarId > 0
  );
}

export function readActiveCharacterRef(): ActiveCharacterRef | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(ACTIVE_CHARACTER_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isActiveCharacterRef(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore malformed storage payloads.
  }

  window.localStorage.removeItem(ACTIVE_CHARACTER_STORAGE_KEY);
  return null;
}

export function writeActiveCharacterRef(ref: ActiveCharacterRef): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!isActiveCharacterRef(ref)) {
    return;
  }

  window.localStorage.setItem(ACTIVE_CHARACTER_STORAGE_KEY, JSON.stringify(ref));
}

export function clearActiveCharacterRef(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVE_CHARACTER_STORAGE_KEY);
}

function findSelectedCharacter(
  data: EnkaNormalizedResponse | null,
  ref: ActiveCharacterRef | null,
): EnkaCharacterSummary | null {
  if (!data || !ref) {
    return null;
  }

  return data.characters.find((item) => item.avatarId === ref.avatarId) ?? null;
}

function resolveErrorCode(status: number, code: unknown): string {
  if (typeof code === "string" && code.length > 0) {
    return code;
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }
  if (status === 400) {
    return "BAD_UID";
  }

  return "UPSTREAM_ERROR";
}

export function useActiveEnkaCharacter(locale: Locale) {
  const [ref, setRef] = useState<ActiveCharacterRef | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EnkaNormalizedResponse | null>(null);

  const loadFromStorage = useCallback(() => {
    setRef(readActiveCharacterRef());
  }, []);

  const refresh = useCallback(async () => {
    if (!ref) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/enka/uid/${ref.uid}?locale=${encodeURIComponent(locale)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const payload = (await response.json().catch(() => ({}))) as
        | EnkaNormalizedResponse
        | { code?: string };

      if (!response.ok) {
        setData(null);
        setError(resolveErrorCode(response.status, (payload as { code?: string }).code));
        return;
      }

      setData(payload as EnkaNormalizedResponse);
      setError(null);
    } catch {
      setData(null);
      setError("NETWORK_ERROR");
    } finally {
      setIsLoading(false);
    }
  }, [locale, ref]);

  const clear = useCallback(() => {
    clearActiveCharacterRef();
    setRef(null);
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_CHARACTER_STORAGE_KEY) {
        loadFromStorage();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadFromStorage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedCharacter = useMemo(() => findSelectedCharacter(data, ref), [data, ref]);

  return {
    ref,
    isLoading,
    error,
    data,
    selectedCharacter,
    refresh,
    clear,
  };
}
