export interface QaLatencySample {
  modelMs?: number;
  toolMs?: number;
  totalMs: number;
}

export interface QaTrialObservation {
  trialId: string;
  fixtureId: string;
  model: string;
  toolSchemaCalls: number;
  toolSchemaValidCalls: number;
  toolCalls: number;
  toolSuccesses: number;
  verificationAttempted: boolean;
  verificationPassed: boolean | null;
  latency: QaLatencySample;
  notes?: string[];
}

export interface TechnicalMetrics {
  trials: number;
  toolSchemaValidityRate: number | null;
  toolExecutionSuccessRate: number | null;
  endToEndVerificationPassRate: number | null;
  latencyMs: {
    model: MetricSummary | null;
    tool: MetricSummary | null;
    total: MetricSummary;
  };
}

export interface MetricSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
}

export interface QualityRubricDimension {
  id: string;
  label: string;
  description: string;
  weight: number;
  anchors: Record<1 | 2 | 3 | 4 | 5, string>;
}

export interface HumanQualityScore {
  evaluator: string;
  fixtureId: string;
  trialId: string;
  scores: Record<string, number>;
  comments?: string;
}

export type AiQualityResult =
  | { status: "not_evaluated"; reason: string }
  | {
      status: "evaluated";
      evaluations: number;
      weightedMeanScore: number;
      dimensionMeans: Record<string, number>;
    };

export interface QaRunReport {
  config: FrozenQaConfig;
  technical: TechnicalMetrics;
  aiQuality: AiQualityResult;
  trials: QaTrialObservation[];
}

export interface FrozenQaConfig {
  fixtureIds: string[];
  model: string;
  repetitions: number;
  temperature?: number;
  seed?: number;
  notes?: string;
}
