import { describe, expect, it } from "vitest";

import dictEn from "./dict.en";
import dictPtBR from "./dict.ptBR";

describe("i18n dictionaries", () => {
  it("keeps matching key structure between en and pt-BR", () => {
    const enKeys = flattenKeys(dictEn).sort();
    const ptKeys = flattenKeys(dictPtBR).sort();
    expect(ptKeys).toEqual(enKeys);
  });
});

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") {
    return [prefix];
  }

  const keys: string[] = [];
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(...flattenKeys((value as Record<string, unknown>)[key], fullKey));
  }
  return keys;
}
