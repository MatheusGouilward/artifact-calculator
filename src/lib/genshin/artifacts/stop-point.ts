import { ArtifactEngineError } from "./engine";

export interface StopPointSeriesPoint {
  day: number;
  resin: number;
  runs: number;
  value: number;
}

export interface FindStopPointParams {
  series: StopPointSeriesPoint[];
  thresholdPerDay: number;
  consecutiveDays?: number;
  minDay?: number;
  fallbackDay?: number;
}

export interface StopPointResult {
  stopDay: number;
  reason: "threshold" | "fallback";
  at: {
    day: number;
    resin: number;
    runs: number;
    value: number;
    marginal: number;
  };
}

export function findStopPoint(params: FindStopPointParams): StopPointResult {
  const series = [...params.series].sort((a, b) => a.day - b.day);
  if (series.length === 0) {
    throw new ArtifactEngineError("INVALID_PARAM", "series must be non-empty.");
  }

  const thresholdPerDay = params.thresholdPerDay;
  if (!Number.isFinite(thresholdPerDay) || thresholdPerDay < 0 || thresholdPerDay > 1) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `thresholdPerDay must be within [0, 1], received: ${thresholdPerDay}`,
    );
  }

  const consecutiveDays = params.consecutiveDays ?? 3;
  if (!Number.isInteger(consecutiveDays) || consecutiveDays < 1) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `consecutiveDays must be >= 1, received: ${consecutiveDays}`,
    );
  }

  const minDay = params.minDay ?? 7;
  if (!Number.isInteger(minDay) || minDay < 0) {
    throw new ArtifactEngineError("INVALID_PARAM", `minDay must be >= 0, received: ${minDay}`);
  }

  const fallbackDay = params.fallbackDay ?? series[series.length - 1].day;
  if (!Number.isInteger(fallbackDay) || fallbackDay < 0) {
    throw new ArtifactEngineError("INVALID_PARAM", `fallbackDay must be >= 0, received: ${fallbackDay}`);
  }

  const firstDay = Math.max(1, minDay);
  let streak = 0;

  for (let index = 1; index < series.length; index += 1) {
    const current = series[index];
    if (current.day < firstDay) {
      continue;
    }

    const previous = series[index - 1];
    const marginal = current.value - previous.value;

    if (marginal < thresholdPerDay) {
      streak += 1;
      if (streak >= consecutiveDays) {
        return {
          stopDay: current.day,
          reason: "threshold",
          at: {
            day: current.day,
            resin: current.resin,
            runs: current.runs,
            value: current.value,
            marginal,
          },
        };
      }
      continue;
    }

    streak = 0;
  }

  const fallbackPoint = pointAtOrBeforeDay(series, fallbackDay);
  const previous = pointAtOrBeforeDay(series, fallbackPoint.day - 1);
  return {
    stopDay: fallbackPoint.day,
    reason: "fallback",
    at: {
      day: fallbackPoint.day,
      resin: fallbackPoint.resin,
      runs: fallbackPoint.runs,
      value: fallbackPoint.value,
      marginal: fallbackPoint.value - previous.value,
    },
  };
}

function pointAtOrBeforeDay(series: StopPointSeriesPoint[], day: number): StopPointSeriesPoint {
  let best = series[0];
  for (const point of series) {
    if (point.day <= day && point.day >= best.day) {
      best = point;
    }
  }
  return best;
}
