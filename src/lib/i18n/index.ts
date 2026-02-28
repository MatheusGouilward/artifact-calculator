import dictEn from "./dict.en";
import dictPtBR from "./dict.ptBR";
import { type Locale } from "./locales";

export const dictionaries = {
  en: dictEn,
  "pt-BR": dictPtBR,
} as const;

type Dictionary = typeof dictEn;

export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale] ?? dictionaries.en;
  const fallback = resolveKey(dictionaries.en, key);
  const template = resolveKey(dict, key) ?? fallback ?? key;

  if (!vars) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (full, token: string) => {
    const value = vars[token];
    return value === undefined ? full : String(value);
  });
}

function resolveKey(dict: Dictionary, key: string): string | null {
  const parts = key.split(".");
  let current: unknown = dict;

  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in (current as Record<string, unknown>))) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : null;
}

export type { Locale };
