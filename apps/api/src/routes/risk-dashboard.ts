import type {
  CourseRiskStateRecord,
  RiskSnapshotRecord,
  StudentRiskHistoryRecord,
} from '@moodle-agent-poc/agent-runtime';
import {
  RiskTrendEngine,
  scopeRiskHistoryToSnapshot,
  type RiskSnapshotPayloadV01,
} from '@moodle-agent-poc/risk-engine';
import type { FastifyPluginAsync } from 'fastify';
import { getDatabase, RiskSnapshotRepository } from '@moodle-agent-poc/agent-runtime';
import type { AppConfig } from '../config/config-loader.js';
import { requireRiskServiceRequest } from '../risk-service-auth.js';

export interface RiskDashboardRepository {
  getCourseState(courseId: number): Promise<CourseRiskStateRecord | null>;
  getSnapshot(snapshotId: string): Promise<RiskSnapshotRecord | null>;
  listStudentHistory(courseId: number, studentId: number): Promise<StudentRiskHistoryRecord[]>;
}

export interface RiskDashboardRoutesOptions {
  config: AppConfig;
  riskDashboardRepo?: RiskDashboardRepository | undefined;
}

function isRiskSnapshotPayload(value: unknown): value is RiskSnapshotPayloadV01 {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.schema_version === 'risk-snapshot.v0.1'
    && typeof item.course_id === 'number'
    && Array.isArray(item.normalized_students)
    && Array.isArray(item.student_results)
    && !!item.course_aggregate
    && typeof item.course_aggregate === 'object'
    && !!item.source_evidence
    && typeof item.source_evidence === 'object';
}

function insightEligibility(coverage: number | null): 'FULL' | 'LIMITED' | 'BLOCKED' {
  if (coverage !== null && coverage >= 0.8) return 'FULL';
  if (coverage !== null && coverage >= 0.5) return 'LIMITED';
  return 'BLOCKED';
}

const RISK_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

function navigationHint(sourceRef: any, payload: RiskSnapshotPayloadV01) {
  const activity = sourceRef.activity_id
    ? payload.source_evidence.activities.find((item) => item.activity_id === sourceRef.activity_id)
    : undefined;
  return {
    kind: 'MOODLE_CURRENT_SOURCE' as const,
    course_id: sourceRef.course_id,
    student_id: sourceRef.student_id ?? null,
    activity_id: sourceRef.activity_id ?? null,
    module_name: activity?.module_name ?? null,
    entity_type: sourceRef.entity_type,
    entity_id: sourceRef.entity_id,
  };
}

function mainDrivers(result: RiskSnapshotPayloadV01['student_results'][number]): string[] {
  if (!result.overall_risk) return [];
  return (['progress', 'performance', 'competency', 'submission'] as const)
    .filter((dimension) => result.dimensions[dimension].risk_level === result.overall_risk)
    .map((dimension) => dimension.toUpperCase());
}

function studentSummary(result: RiskSnapshotPayloadV01['student_results'][number]) {
  return {
    student_ref: `student:${result.student_id}`,
    student_id: result.student_id,
    evaluation_status: result.evaluation_status,
    overall_risk: result.overall_risk,
    main_drivers: mainDrivers(result),
    dimensions: {
      progress: result.dimensions.progress.risk_level,
      performance: result.dimensions.performance.risk_level,
      competency: result.dimensions.competency.risk_level,
      submission: result.dimensions.submission.risk_level,
    },
  };
}

function snapshotMetadata(
  snapshot: RiskSnapshotRecord,
  state: CourseRiskStateRecord | null,
  payload: RiskSnapshotPayloadV01
) {
  const coverage = payload.course_aggregate.evaluation_coverage;
  return {
    snapshot_id: snapshot.snapshotId,
    data_as_of: snapshot.dataAsOf,
    computed_at: snapshot.computedAt,
    risk_model_version: snapshot.riskModelVersion,
    refresh_origin: snapshot.refreshOrigin,
    is_current: state?.currentSnapshotId === snapshot.snapshotId,
    current_snapshot_id: state?.currentSnapshotId ?? null,
    previous_snapshot_id: state?.previousSnapshotId ?? null,
    last_refresh_status: state?.lastRefreshStatus ?? null,
    last_successful_refresh_at: state?.lastSuccessfulRefreshAt ?? null,
    evaluation_coverage: coverage,
    insight: {
      eligibility: insightEligibility(coverage),
      status: 'NOT_GENERATED' as const,
    },
  };
}

async function resolveSnapshot(
  repo: RiskDashboardRepository,
  courseId: number,
  requestedSnapshotId?: string
): Promise<{ state: CourseRiskStateRecord | null; snapshot: RiskSnapshotRecord; payload: RiskSnapshotPayloadV01 } | null> {
  const state = await repo.getCourseState(courseId);
  const snapshotId = requestedSnapshotId ?? state?.currentSnapshotId ?? null;
  if (!snapshotId) return null;
  const snapshot = await repo.getSnapshot(snapshotId);
  if (!snapshot || snapshot.courseId !== courseId || !isRiskSnapshotPayload(snapshot.payload)) return null;
  return { state, snapshot, payload: snapshot.payload };
}

function evidenceWithNavigation(payload: RiskSnapshotPayloadV01, evidence: any[]) {
  return evidence.map((item) => ({
    ...item,
    current_source_navigation: navigationHint(item.source_ref, payload),
  }));
}

export const riskDashboardRoutes: FastifyPluginAsync<RiskDashboardRoutesOptions> = async (fastify, options) => {
  const repo = options.riskDashboardRepo ?? new RiskSnapshotRepository(getDatabase());

  fastify.get<{ Params: { courseId: string }; Querystring: { snapshot_id?: string } }>(
    '/api/risk/courses/:courseId/dashboard',
    async (request, reply) => {
      const courseId = Number(request.params.courseId);
      if (!Number.isInteger(courseId) || courseId <= 0) {
        return reply.status(400).send({ status: 'FAILED', error: { code: 'INVALID_COURSE_ID', message: 'courseId must be a positive integer' } });
      }
      if (!requireRiskServiceRequest(request, reply, options.config, courseId)) return;

      const resolved = await resolveSnapshot(repo, courseId, request.query.snapshot_id);
      if (!resolved) {
        return reply.status(404).send({ status: 'FAILED', error: { code: 'RISK_SNAPSHOT_NOT_FOUND', message: 'Requested Risk snapshot is not available for this Course.' } });
      }
      const { state, snapshot, payload } = resolved;
      const aggregate = payload.course_aggregate;
      const results = [...payload.student_results].sort((a, b) => {
        const ar = a.overall_risk ? RISK_RANK[a.overall_risk] : 0;
        const br = b.overall_risk ? RISK_RANK[b.overall_risk] : 0;
        return br - ar || a.student_id - b.student_id;
      });
      const activities = new Map(payload.source_evidence.activities.map((item) => [item.activity_id, item]));
      const competencies = new Map(payload.source_evidence.competencies.course_competencies.map((item) => [item.competency_id, item]));

      return reply.status(200).send({
        status: 'OK',
        course_id: courseId,
        course: payload.source_evidence.course,
        metadata: snapshotMetadata(snapshot, state, payload),
        overview: {
          enrolled_count: aggregate.enrolled_count,
          evaluated_count: aggregate.evaluated_count,
          incomplete_count: aggregate.incomplete_count,
          evaluation_coverage: aggregate.evaluation_coverage,
          student_risk_distribution: aggregate.student_risk_distribution,
          dimension_distributions: aggregate.dimension_distributions,
        },
        what_needs_attention: {
          activity_issues: aggregate.activity_issues.map((issue) => ({
            ...issue,
            activity: activities.get(issue.activity_id) ?? null,
          })),
          common_competency_gaps: aggregate.common_competency_gaps.map((gap) => ({
            ...gap,
            competency: competencies.get(gap.competency_id) ?? null,
          })),
          notable_associations: aggregate.notable_associations,
          action_candidates: aggregate.action_candidates,
        },
        students: {
          default_filter: 'HIGH_MEDIUM',
          all: results.map(studentSummary),
          attention: results.filter((result) => result.overall_risk === 'HIGH' || result.overall_risk === 'MEDIUM').map(studentSummary),
        },
      });
    }
  );

  fastify.get<{ Params: { courseId: string; studentId: string }; Querystring: { snapshot_id: string } }>(
    '/api/risk/courses/:courseId/students/:studentId',
    async (request, reply) => {
      const courseId = Number(request.params.courseId);
      const studentId = Number(request.params.studentId);
      if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(studentId) || studentId <= 0) {
        return reply.status(400).send({ status: 'FAILED', error: { code: 'INVALID_RISK_DRILLDOWN_ID', message: 'Course and Student ids must be positive integers.' } });
      }
      if (!requireRiskServiceRequest(request, reply, options.config, courseId)) return;
      if (!request.query.snapshot_id) {
        return reply.status(400).send({ status: 'FAILED', error: { code: 'SNAPSHOT_ID_REQUIRED', message: 'snapshot_id is required for drill-down.' } });
      }

      const resolved = await resolveSnapshot(repo, courseId, request.query.snapshot_id);
      if (!resolved) return reply.status(404).send({ status: 'FAILED', error: { code: 'RISK_SNAPSHOT_NOT_FOUND', message: 'Requested Risk snapshot is not available for this Course.' } });
      const { state, snapshot, payload } = resolved;
      const result = payload.student_results.find((item) => item.student_id === studentId);
      const normalized = payload.normalized_students.find((item) => item.student_id === studentId);
      if (!result || !normalized) {
        return reply.status(404).send({ status: 'FAILED', error: { code: 'STUDENT_NOT_IN_SNAPSHOT', message: 'Student is not present in the requested Course snapshot.' } });
      }

      const history = await repo.listStudentHistory(courseId, studentId);
      const scopedHistory = scopeRiskHistoryToSnapshot(history, snapshot.snapshotId, snapshot.riskModelVersion, snapshot.dataAsOf);
      const trend = new RiskTrendEngine().calculate(scopedHistory);
      return reply.status(200).send({
        status: 'OK',
        course_id: courseId,
        metadata: snapshotMetadata(snapshot, state, payload),
        student: studentSummary(result),
        dimensions: result.dimensions,
        rule_hits: result.rule_hits,
        evidence_journey: {
          progress: normalized.progress,
          assessments: normalized.assessments,
          competencies: normalized.competencies,
          submissions: normalized.submissions,
          evidence: evidenceWithNavigation(payload, normalized.evidence),
        },
        trend,
      });
    }
  );

  fastify.get<{ Params: { courseId: string; activityId: string }; Querystring: { snapshot_id: string } }>(
    '/api/risk/courses/:courseId/activities/:activityId',
    async (request, reply) => {
      const courseId = Number(request.params.courseId);
      const activityId = Number(request.params.activityId);
      if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(activityId) || activityId <= 0) {
        return reply.status(400).send({ status: 'FAILED', error: { code: 'INVALID_RISK_DRILLDOWN_ID', message: 'Course and Activity ids must be positive integers.' } });
      }
      if (!requireRiskServiceRequest(request, reply, options.config, courseId)) return;
      if (!request.query.snapshot_id) return reply.status(400).send({ status: 'FAILED', error: { code: 'SNAPSHOT_ID_REQUIRED', message: 'snapshot_id is required for drill-down.' } });

      const resolved = await resolveSnapshot(repo, courseId, request.query.snapshot_id);
      if (!resolved) return reply.status(404).send({ status: 'FAILED', error: { code: 'RISK_SNAPSHOT_NOT_FOUND', message: 'Requested Risk snapshot is not available for this Course.' } });
      const { state, snapshot, payload } = resolved;
      const activity = payload.source_evidence.activities.find((item) => item.activity_id === activityId);
      if (!activity) return reply.status(404).send({ status: 'FAILED', error: { code: 'ACTIVITY_NOT_IN_SNAPSHOT', message: 'Activity is not present in the requested Course snapshot.' } });

      const affected = payload.normalized_students.map((student) => ({
        student_ref: `student:${student.student_id}`,
        student_id: student.student_id,
        assessment: student.assessments.find((item) => item.activity_id === activityId) ?? null,
        submission: student.submissions.find((item) => item.activity_id === activityId) ?? null,
        overall_risk: payload.student_results.find((item) => item.student_id === student.student_id)?.overall_risk ?? null,
      })).filter((row) => row.assessment || row.submission);

      return reply.status(200).send({
        status: 'OK',
        course_id: courseId,
        metadata: snapshotMetadata(snapshot, state, payload),
        activity: {
          ...activity,
          current_source_navigation: navigationHint(activity.source_ref, payload),
        },
        issues: payload.course_aggregate.activity_issues.filter((item) => item.activity_id === activityId),
        competency_links: payload.source_evidence.competencies.activity_links.filter((item) => item.activity_id === activityId),
        associations: payload.course_aggregate.notable_associations.filter((item) => item.activity_id === activityId),
        students: affected,
      });
    }
  );

  fastify.get<{ Params: { courseId: string; competencyId: string }; Querystring: { snapshot_id: string } }>(
    '/api/risk/courses/:courseId/competencies/:competencyId',
    async (request, reply) => {
      const courseId = Number(request.params.courseId);
      const competencyId = Number(request.params.competencyId);
      if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(competencyId) || competencyId <= 0) {
        return reply.status(400).send({ status: 'FAILED', error: { code: 'INVALID_RISK_DRILLDOWN_ID', message: 'Course and Competency ids must be positive integers.' } });
      }
      if (!requireRiskServiceRequest(request, reply, options.config, courseId)) return;
      if (!request.query.snapshot_id) return reply.status(400).send({ status: 'FAILED', error: { code: 'SNAPSHOT_ID_REQUIRED', message: 'snapshot_id is required for drill-down.' } });

      const resolved = await resolveSnapshot(repo, courseId, request.query.snapshot_id);
      if (!resolved) return reply.status(404).send({ status: 'FAILED', error: { code: 'RISK_SNAPSHOT_NOT_FOUND', message: 'Requested Risk snapshot is not available for this Course.' } });
      const { state, snapshot, payload } = resolved;
      const competency = payload.source_evidence.competencies.course_competencies.find((item) => item.competency_id === competencyId);
      if (!competency) return reply.status(404).send({ status: 'FAILED', error: { code: 'COMPETENCY_NOT_IN_SNAPSHOT', message: 'Competency is not present in the requested Course snapshot.' } });

      const students = payload.normalized_students.map((student) => ({
        student_ref: `student:${student.student_id}`,
        student_id: student.student_id,
        competency: student.competencies.find((item) => item.competency_id === competencyId) ?? null,
        overall_risk: payload.student_results.find((item) => item.student_id === student.student_id)?.overall_risk ?? null,
      })).filter((row) => row.competency !== null);

      return reply.status(200).send({
        status: 'OK',
        course_id: courseId,
        metadata: snapshotMetadata(snapshot, state, payload),
        competency: {
          ...competency,
          current_source_navigation: navigationHint(competency.source_ref, payload),
        },
        common_gap: payload.course_aggregate.common_competency_gaps.find((item) => item.competency_id === competencyId) ?? null,
        activity_links: payload.source_evidence.competencies.activity_links.filter((item) => item.competency_id === competencyId),
        associations: payload.course_aggregate.notable_associations.filter((item) => item.competency_id === competencyId),
        students,
      });
    }
  );
};
