import type { MetricSummary, QaTrialObservation, TechnicalMetrics } from "./types.js";

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

export function summarizeMetric(values: number[]): MetricSummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: round(sum / sorted.length),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : round(numerator / denominator);
}

export function collectTechnicalMetrics(trials: readonly QaTrialObservation[]): TechnicalMetrics {
  const schemaCalls = trials.reduce((n, t) => n + t.toolSchemaCalls, 0);
  const schemaValid = trials.reduce((n, t) => n + t.toolSchemaValidCalls, 0);
  const toolCalls = trials.reduce((n, t) => n + t.toolCalls, 0);
  const toolSuccesses = trials.reduce((n, t) => n + t.toolSuccesses, 0);
  const verificationTrials = trials.filter((t) => t.verificationAttempted);
  const verificationPasses = verificationTrials.filter((t) => t.verificationPassed === true).length;

  return {
    trials: trials.length,
    toolSchemaValidityRate: rate(schemaValid, schemaCalls),
    toolExecutionSuccessRate: rate(toolSuccesses, toolCalls),
    endToEndVerificationPassRate: rate(verificationPasses, verificationTrials.length),
    latencyMs: {
      model: summarizeMetric(trials.flatMap((t) => t.latency.modelMs === undefined ? [] : [t.latency.modelMs])),
      tool: summarizeMetric(trials.flatMap((t) => t.latency.toolMs === undefined ? [] : [t.latency.toolMs])),
      total: summarizeMetric(trials.map((t) => t.latency.totalMs))!,
    },
  };
}
