import { afterEach, describe, expect, it, vi } from "vitest";

import { getCachedValue, getOrCreateInFlight, resetEnkaCacheForTests, setCachedValue } from "./cache";

describe("enka cache TTL", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetEnkaCacheForTests();
  });

  it("returns cached value before expiry and clears it after expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    setCachedValue("uid:1", { value: 123 }, 2);

    expect(getCachedValue<{ value: number }>("uid:1")).toEqual({ value: 123 });

    vi.advanceTimersByTime(1999);
    expect(getCachedValue<{ value: number }>("uid:1")).toEqual({ value: 123 });

    vi.advanceTimersByTime(2);
    expect(getCachedValue<{ value: number }>("uid:1")).toBeUndefined();
  });
});

describe("enka in-flight dedupe", () => {
  afterEach(() => {
    resetEnkaCacheForTests();
  });

  it("dedupes concurrent requests by key", async () => {
    let resolveFactory: ((value: string) => void) | undefined;
    const factory = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFactory = resolve;
        }),
    );

    const first = getOrCreateInFlight("uid:2", factory);
    const second = getOrCreateInFlight("uid:2", factory);

    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);

    resolveFactory?.("ok");
    await expect(Promise.all([first, second])).resolves.toEqual(["ok", "ok"]);
  });

  it("allows a new request after the previous one settles", async () => {
    const factory = vi.fn(async () => "done");

    await getOrCreateInFlight("uid:3", factory);
    await getOrCreateInFlight("uid:3", factory);

    expect(factory).toHaveBeenCalledTimes(2);
  });
});
