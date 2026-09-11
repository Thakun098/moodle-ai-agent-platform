import { createHash, randomUUID } from 'node:crypto';
import type { RiskRefreshOrigin } from '@moodle-agent-poc/agent-runtime';
import { CourseRiskAggregator } from './course-risk-aggregator.js';
import { RiskCompletenessGate, RiskCompletenessGateError } from './risk-completeness-gate.js';
import { RiskEvidenceNormalizer } from './risk-evidence-normalizer.js';
import { RiskSnapshotComparator } from './risk-snapshot-comparator.js';
import type {
  RiskEvidenceProvider,
  RiskRefreshChangeOriginHint,
  RiskRefreshResult,
  RiskSnapshotPayloadV01,
  RiskSnapshotPersistence,
} from './risk-refresh-types.js';
import { RiskRefreshError } from './risk-refresh-types.js';
import { StudentRiskEvaluator } from './student-risk-evaluator.js';

export interface RiskRefreshServiceOptions {
  normalizer?: RiskEvidenceNormalizer;
  evaluator?: StudentRiskEvaluator;
  aggregator?: CourseRiskAggregator;
  completenessGate?: RiskCompletenessGate;
  comparator?: RiskSnapshotComparator;
  idFactory?: () => string;
  now?: () => Date;
}

function hashPayload(payload: RiskSnapshotPayloadV01): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function isRiskSnapshotPayloadV01(value: unknown): value is RiskSnapshotPayloadV01 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.schema_version === 'risk-snapshot.v0.1'
    && typeof candidate.course_id === 'number'
    && Array.isArray(candidate.normalized_students)
    && Array.isArray(candidate.student_results)
    && !!candidate.course_aggregate
    && typeof candidate.course_aggregate === 'object';
}

/** Shared deterministic use case for both manual and nightly refresh. */
export class RiskRefreshService {
  private readonly normalizer: RiskEvidenceNormalizer;
  private readonly evaluator: StudentRiskEvaluator;
  private readonly aggregator: CourseRiskAggregator;
  private readonly completenessGate: RiskCompletenessGate;
  private readonly comparator: RiskSnapshotComparator;
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly evidenceProvider: RiskEvidenceProvider,
    private readonly persistence: RiskSnapshotPersistence,
    options: RiskRefreshServiceOptions = {}
  ) {
    this.normalizer = options.normalizer ?? new RiskEvidenceNormalizer();
    this.evaluator = options.evaluator ?? new StudentRiskEvaluator();
    this.aggregator = options.aggregator ?? new CourseRiskAggregator();
    this.completenessGate = options.completenessGate ?? new RiskCompletenessGate();
    this.comparator = options.comparator ?? new RiskSnapshotComparator();
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async refreshCourse(courseId: number, origin: RiskRefreshOrigin, changeOriginHint?: RiskRefreshChangeOriginHint): Promise<RiskRefreshResult> {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      throw new RiskRefreshError('INVALID_COURSE_ID', 'courseId must be a positive integer', courseId, 'not-started');
    }

    const attemptId = this.idFactory();
    const attemptedAt = this.now().toISOString();

    try {
      const sourceEvidence = await this.evidenceProvider.getCourseRiskEvidence(courseId);
      if (sourceEvidence.course.course_id !== courseId) {
        throw new RiskRefreshError(
          'COURSE_SCOPE_MISMATCH',
          `Requested Course ${courseId} but evidence belongs to Course ${sourceEvidence.course.course_id}.`,
          courseId,
          attemptId
        );
      }

      this.completenessGate.assertPublishable(sourceEvidence);

      const normalizedStudents = sourceEvidence.enrolments.map((enrolment) =>
        this.normalizer.normalizeStudent(sourceEvidence, enrolment.student_id)
      );
      const studentResults = normalizedStudents.map((student) => this.evaluator.evaluate(student));
      const courseAggregate = this.aggregator.aggregate({
        normalized_students: normalizedStudents,
        student_results: studentResults,
        course_id: courseId,
        data_as_of: sourceEvidence.observed_at,
      });

      const payload: RiskSnapshotPayloadV01 = {
        schema_version: 'risk-snapshot.v0.1',
        course_id: courseId,
        source_evidence: sourceEvidence,
        normalized_students: normalizedStudents,
        student_results: studentResults,
        course_aggregate: courseAggregate,
      };
      const evidenceHash = hashPayload(payload);
      const snapshotId = this.idFactory();
      const computedAt = this.now().toISOString();

      const previousRecord = this.persistence.getCurrentSnapshot
        ? await this.persistence.getCurrentSnapshot(courseId)
        : null;
      const previousPayload = previousRecord && isRiskSnapshotPayloadV01(previousRecord.payload)
        ? previousRecord.payload
        : null;
      const comparison = this.comparator.compare(previousPayload, payload, changeOriginHint ? { change_origin_hint: changeOriginHint } : {});

      const courseReasons = comparison.material && comparison.reasons.length === 0
        ? ['COURSE_STUDENT_MATERIAL_CHANGE']
        : comparison.reasons;
      const changeEvents = [
        {
          eventId: `${snapshotId}:course`,
          studentId: null,
          scope: 'COURSE' as const,
          material: comparison.material,
          changeOrigin: comparison.change_origin,
          reasons: courseReasons,
          sourceChanges: comparison.source_changes.map((change) => ({ ...change })),
        },
        ...comparison.student_changes
          .filter((change) => change.material || change.source_changes.length > 0)
          .map((change) => ({
            eventId: `${snapshotId}:student:${change.student_id}`,
            studentId: change.student_id,
            scope: 'STUDENT' as const,
            material: change.material,
            changeOrigin: comparison.change_origin,
            reasons: change.reasons,
            sourceChanges: change.source_changes.map((sourceChange) => ({ ...sourceChange })),
          })),
      ];

      const publication = await this.persistence.publishSnapshot({
        snapshotId,
        courseId,
        dataAsOf: sourceEvidence.observed_at,
        computedAt,
        riskModelVersion: 'risk-profile.v0.1',
        refreshOrigin: origin,
        evidenceHash,
        payload: payload as unknown as Record<string, unknown>,
        attemptId,
        history: studentResults.map((result) => ({
          studentId: result.student_id,
          evaluationStatus: result.evaluation_status,
          overallRisk: result.overall_risk,
          progressRisk: result.evaluation_status === 'COMPLETE' ? result.dimensions.progress.risk_level : null,
          performanceRisk: result.evaluation_status === 'COMPLETE' ? result.dimensions.performance.risk_level : null,
          competencyRisk: result.evaluation_status === 'COMPLETE' ? result.dimensions.competency.risk_level : null,
          submissionRisk: result.evaluation_status === 'COMPLETE' ? result.dimensions.submission.risk_level : null,
          dimensionMetrics: {
            progress: result.dimensions.progress.metrics,
            performance: result.dimensions.performance.metrics,
            competency: result.dimensions.competency.metrics,
            submission: result.dimensions.submission.metrics,
          },
        })),
        changeEvents,
      });

      return {
        status: 'PUBLISHED',
        course_id: courseId,
        snapshot_id: publication.currentSnapshotId,
        previous_snapshot_id: publication.previousSnapshotId,
        data_as_of: sourceEvidence.observed_at,
        computed_at: computedAt,
        risk_model_version: 'risk-profile.v0.1',
        refresh_origin: origin,
        evidence_hash: evidenceHash,
        evaluation_coverage: courseAggregate.evaluation_coverage,
        material_change: {
          material: comparison.material,
          reasons: courseReasons,
          change_origin: comparison.change_origin,
          source_change_count: comparison.source_changes.length,
          student_material_change_count: comparison.student_changes.filter((change) => change.material).length,
        },
      };
    } catch (error) {
      const code = error instanceof RiskRefreshError
        ? error.code
        : error instanceof RiskCompletenessGateError
          ? error.code
          : 'RISK_REFRESH_FAILED';
      const message = error instanceof Error ? error.message : String(error);
      try {
        await this.persistence.recordRefreshFailure({
          courseId,
          attemptedAt,
          refreshOrigin: origin,
          attemptId,
          error: `${code}: ${message}`,
        });
      } catch (recordFailureError) {
        throw new RiskRefreshError(
          'RISK_REFRESH_FAILURE_RECORD_FAILED',
          `Risk refresh failed and its failure state could not be persisted: ${message}`,
          courseId,
          attemptId,
          { refreshError: error, recordFailureError }
        );
      }

      if (error instanceof RiskRefreshError) throw error;
      throw new RiskRefreshError(code, message, courseId, attemptId, error);
    }
  }
}
