import { beforeEach, describe, expect, it } from "vitest";

import {
  clearActiveCharacterRef,
  readActiveCharacterRef,
  writeActiveCharacterRef,
} from "./use-active-character";

const STORAGE_KEY = "genshin_calc_active_character";

describe("active character storage helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("writes and reads a valid active character reference", () => {
    writeActiveCharacterRef({
      uid: "800123456",
      avatarId: 10000089,
    });

    expect(readActiveCharacterRef()).toEqual({
      uid: "800123456",
      avatarId: 10000089,
    });
  });

  it("returns null for malformed payloads", () => {
    window.localStorage.setItem(STORAGE_KEY, "{bad-json");
    expect(readActiveCharacterRef()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ uid: "abc", avatarId: 1 }));
    expect(readActiveCharacterRef()).toBeNull();
  });

  it("clears saved reference", () => {
    writeActiveCharacterRef({
      uid: "800123456",
      avatarId: 10000089,
    });

    clearActiveCharacterRef();

    expect(readActiveCharacterRef()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
