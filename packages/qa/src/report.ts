import { collectTechnicalMetrics } from "./metrics.js";
import { aggregateHumanQuality } from "./rubrics.js";
import type { FrozenQaConfig, HumanQualityScore, QaRunReport, QaTrialObservation } from "./types.js";

export function buildQaReport(params: {
  config: FrozenQaConfig;
  trials: QaTrialObservation[];
  humanScores?: HumanQualityScore[];
}): QaRunReport {
  if (params.config.repetitions <= 0 || !Number.isInteger(params.config.repetitions)) {
    throw new Error("QA repetitions must be a positive integer.");
  }
  const expectedTrials = params.config.fixtureIds.length * params.config.repetitions;
  if (params.trials.length !== expectedTrials) {
    throw new Error(`Expected ${expectedTrials} QA trial observations, received ${params.trials.length}.`);
  }
  for (const trial of params.trials) {
    if (!params.config.fixtureIds.includes(trial.fixtureId)) {
      throw new Error(`Trial ${trial.trialId} references fixture ${trial.fixtureId} outside frozen QA config.`);
    }
    if (trial.model !== params.config.model) {
      throw new Error(`Trial ${trial.trialId} used model ${trial.model}; frozen model is ${params.config.model}.`);
    }
    if (trial.toolSchemaValidCalls > trial.toolSchemaCalls) throw new Error(`Trial ${trial.trialId} has invalid schema-call counts.`);
    if (trial.toolSuccesses > trial.toolCalls) throw new Error(`Trial ${trial.trialId} has invalid tool-call counts.`);
    if (!trial.verificationAttempted && trial.verificationPassed !== null) {
      throw new Error(`Trial ${trial.trialId} cannot have a verification result when verification was not attempted.`);
    }
  }

  return {
    config: params.config,
    technical: collectTechnicalMetrics(params.trials),
    aiQuality: aggregateHumanQuality(params.humanScores ?? []),
    trials: params.trials,
  };
}
