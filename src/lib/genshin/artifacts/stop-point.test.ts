import { describe, expect, it } from "vitest";

import { findStopPoint } from "./stop-point";

const baseSeries = [
  { day: 0, resin: 0, runs: 0, value: 0.0 },
  { day: 1, resin: 180, runs: 9, value: 0.2 },
  { day: 2, resin: 360, runs: 18, value: 0.35 },
  { day: 3, resin: 540, runs: 27, value: 0.45 },
  { day: 4, resin: 720, runs: 36, value: 0.52 },
  { day: 5, resin: 900, runs: 45, value: 0.57 },
  { day: 6, resin: 1080, runs: 54, value: 0.61 },
  { day: 7, resin: 1260, runs: 63, value: 0.629 },
  { day: 8, resin: 1440, runs: 72, value: 0.647 },
  { day: 9, resin: 1620, runs: 81, value: 0.664 },
  { day: 10, resin: 1800, runs: 90, value: 0.68 },
];

describe("findStopPoint", () => {
  it("finds threshold stop on crafted series", () => {
    const result = findStopPoint({
      series: baseSeries,
      thresholdPerDay: 0.02,
      consecutiveDays: 3,
      minDay: 7,
    });

    expect(result.reason).toBe("threshold");
    expect(result.stopDay).toBe(9);
    expect(result.at.day).toBe(9);
  });

  it("honors minDay and consecutiveDays", () => {
    const result = findStopPoint({
      series: baseSeries,
      thresholdPerDay: 0.02,
      consecutiveDays: 2,
      minDay: 8,
    });

    expect(result.reason).toBe("threshold");
    expect(result.stopDay).toBe(9);
  });

  it("falls back when threshold is never reached", () => {
    const result = findStopPoint({
      series: baseSeries,
      thresholdPerDay: 0.0001,
      consecutiveDays: 3,
      minDay: 1,
      fallbackDay: 10,
    });

    expect(result.reason).toBe("fallback");
    expect(result.stopDay).toBe(10);
    expect(result.at.day).toBe(10);
  });
});
