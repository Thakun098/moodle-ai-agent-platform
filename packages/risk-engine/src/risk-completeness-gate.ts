import type { CourseRiskEvidence } from '@moodle-agent-poc/contracts';

const REQUIRED_DATASETS = [
  'enrolments',
  'timeline',
  'completion',
  'quizzes',
  'assignments',
  'competencies',
] as const;

export class RiskCompletenessGateError extends Error {
  constructor(
    public readonly code: 'MISSING_DATASET_STATUS' | 'SOURCE_DATASET_FAILURE',
    message: string,
    public readonly details: string[]
  ) {
    super(message);
    this.name = 'RiskCompletenessGateError';
  }
}

/**
 * Rejects only source/system-level untrustworthy candidates.
 * PARTIAL remains publishable with explicit coverage; PENDING_GRADE is not a source failure.
 */
export class RiskCompletenessGate {
  assertPublishable(course: CourseRiskEvidence): void {
    const byDataset = new Map(course.dataset_status.map((item) => [item.dataset, item]));
    const missing = REQUIRED_DATASETS.filter((dataset) => !byDataset.has(dataset));
    if (missing.length > 0) {
      throw new RiskCompletenessGateError(
        'MISSING_DATASET_STATUS',
        `CourseRiskEvidence is missing required dataset status: ${missing.join(', ')}`,
        [...missing]
      );
    }

    const failed = REQUIRED_DATASETS
      .map((dataset) => byDataset.get(dataset)!)
      .filter((item) => item.status === 'ERROR' || item.status === 'UNAVAILABLE');
    if (failed.length > 0) {
      const details = failed.map((item) => `${item.dataset}:${item.status}${item.message ? `:${item.message}` : ''}`);
      throw new RiskCompletenessGateError(
        'SOURCE_DATASET_FAILURE',
        `CourseRiskEvidence failed the source Completeness Gate: ${details.join('; ')}`,
        details
      );
    }
  }
}
