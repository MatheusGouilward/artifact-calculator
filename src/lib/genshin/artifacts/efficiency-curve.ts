import { ArtifactEngineError } from "./engine";
import {
  EvaluateStrategiesInput,
  StrategyName,
  resinForRuns,
  runsForTargetChanceStrategy,
  strategySuccessAtRuns,
} from "./optimizer";

export interface EfficiencyCurveInput {
  baseInput: Omit<EvaluateStrategiesInput, "runs">;
  resinPerDay?: number;
  daysMax: number;
  stepDays?: number;
}

export interface EfficiencyCurveSeriesPoint {
  day: number;
  resin: number;
  runs: number;
  domainsOnly: number;
  domainsStrongbox: number;
  transmuterOnly: number;
  combined: number;
}

export interface EfficiencyCurveMilestone {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface EfficiencyCurveMarginalPoint {
  dayStart: number;
  dayEnd: number;
  domainsOnly: number;
  domainsStrongbox: number;
  transmuterOnly: number;
  combined: number;
}

export interface EfficiencyCurveOutput {
  meta: {
    resinPerDay: number;
    daysMax: number;
    stepDays: number;
  };
  series: EfficiencyCurveSeriesPoint[];
  milestones: {
    domainsOnly: EfficiencyCurveMilestone;
    domainsStrongbox: EfficiencyCurveMilestone;
    transmuterOnly: EfficiencyCurveMilestone;
    combined: EfficiencyCurveMilestone;
  };
  marginal: EfficiencyCurveMarginalPoint[];
}

const STRATEGY_BY_KEY = {
  domainsOnly: "Domains only",
  domainsStrongbox: "Domains + Strongbox",
  transmuterOnly: "Transmuter only (period)",
  combined: "Combined (Domains+Strongbox + Transmuter)",
} as const satisfies Record<
  "domainsOnly" | "domainsStrongbox" | "transmuterOnly" | "combined",
  StrategyName
>;

const MILESTONE_TARGETS = [
  { key: "p50", prob: 0.5 },
  { key: "p75", prob: 0.75 },
  { key: "p90", prob: 0.9 },
  { key: "p95", prob: 0.95 },
] as const;

export function generateEfficiencyCurve(input: EfficiencyCurveInput): EfficiencyCurveOutput {
  const resinPerDay = input.resinPerDay ?? 180;
  const stepDays = input.stepDays ?? 1;
  const daysMax = input.daysMax;

  assertFinitePositive("resinPerDay", resinPerDay);
  assertNonNegativeInteger("daysMax", daysMax);
  assertPositiveInteger("stepDays", stepDays);

  const series = buildSeries(input.baseInput, resinPerDay, daysMax, stepDays);
  const milestoneInput: EvaluateStrategiesInput = {
    ...input.baseInput,
    runs: 0,
  };

  return {
    meta: {
      resinPerDay,
      daysMax,
      stepDays,
    },
    series,
    milestones: {
      domainsOnly: buildMilestoneForStrategy(
        milestoneInput,
        STRATEGY_BY_KEY.domainsOnly,
        resinPerDay,
      ),
      domainsStrongbox: buildMilestoneForStrategy(
        milestoneInput,
        STRATEGY_BY_KEY.domainsStrongbox,
        resinPerDay,
      ),
      transmuterOnly: buildMilestoneForStrategy(
        milestoneInput,
        STRATEGY_BY_KEY.transmuterOnly,
        resinPerDay,
      ),
      combined: buildMilestoneForStrategy(
        milestoneInput,
        STRATEGY_BY_KEY.combined,
        resinPerDay,
      ),
    },
    marginal: buildMarginalSeries(series),
  };
}

function buildSeries(
  baseInput: Omit<EvaluateStrategiesInput, "runs">,
  resinPerDay: number,
  daysMax: number,
  stepDays: number,
): EfficiencyCurveSeriesPoint[] {
  const days = buildDaySteps(daysMax, stepDays);
  return days.map((day) => {
    const resin = day * resinPerDay;
    const runs = Math.floor(resin / 20);
    const atRuns: EvaluateStrategiesInput = {
      ...baseInput,
      runs,
    };

    return {
      day,
      resin,
      runs,
      domainsOnly: strategySuccessAtRuns(atRuns, STRATEGY_BY_KEY.domainsOnly, runs),
      domainsStrongbox: strategySuccessAtRuns(atRuns, STRATEGY_BY_KEY.domainsStrongbox, runs),
      transmuterOnly: strategySuccessAtRuns(atRuns, STRATEGY_BY_KEY.transmuterOnly, runs),
      combined: strategySuccessAtRuns(atRuns, STRATEGY_BY_KEY.combined, runs),
    };
  });
}

function buildMilestoneForStrategy(
  input: EvaluateStrategiesInput,
  strategy: StrategyName,
  resinPerDay: number,
): EfficiencyCurveMilestone {
  const result = {
    p50: Number.POSITIVE_INFINITY,
    p75: Number.POSITIVE_INFINITY,
    p90: Number.POSITIVE_INFINITY,
    p95: Number.POSITIVE_INFINITY,
  };

  for (const target of MILESTONE_TARGETS) {
    const runs = runsForTargetChanceStrategy(input, strategy, target.prob);
    result[target.key] = runsToDays(runs, resinPerDay);
  }

  return result;
}

function runsToDays(runs: number, resinPerDay: number): number {
  if (!Number.isFinite(runs)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.ceil(resinForRuns(runs) / resinPerDay);
}

function buildMarginalSeries(series: EfficiencyCurveSeriesPoint[]): EfficiencyCurveMarginalPoint[] {
  const marginal: EfficiencyCurveMarginalPoint[] = [];

  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    marginal.push({
      dayStart: previous.day,
      dayEnd: current.day,
      domainsOnly: current.domainsOnly - previous.domainsOnly,
      domainsStrongbox: current.domainsStrongbox - previous.domainsStrongbox,
      transmuterOnly: current.transmuterOnly - previous.transmuterOnly,
      combined: current.combined - previous.combined,
    });
  }

  return marginal;
}

function buildDaySteps(daysMax: number, stepDays: number): number[] {
  const days: number[] = [];
  for (let day = 0; day <= daysMax; day += stepDays) {
    days.push(day);
  }

  if (days.length === 0 || days[days.length - 1] !== daysMax) {
    days.push(daysMax);
  }

  return days;
}

function assertFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ArtifactEngineError("INVALID_PARAM", `${name} must be finite and > 0, got: ${value}`);
  }
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `${name} must be a positive integer, got: ${value}`,
    );
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ArtifactEngineError(
      "INVALID_PARAM",
      `${name} must be a non-negative integer, got: ${value}`,
    );
  }
}
