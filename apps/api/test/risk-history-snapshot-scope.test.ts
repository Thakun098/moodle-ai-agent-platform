import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  CourseRiskAggregator,
  RiskEvidenceNormalizer,
  StudentRiskEvaluator,
} from '@moodle-agent-poc/risk-engine';
import { riskDashboardRoutes } from '../src/routes/risk-dashboard.js';
import { addQuiz, baseEvidence, NOW, STUDENT } from '../../../packages/risk-engine/test/course-evidence-fixture.js';

const config = { riskServiceKey: 'test-risk-key' } as any;
const headers = {
  'x-agentpoc-service-key': 'test-risk-key',
  'x-agentpoc-actor-ref': 'moodle-user:7',
  'x-agentpoc-actor-type': 'teacher',
  'x-agentpoc-course-ref': 'course:77',
  'x-agentpoc-request-origin': 'MOODLE_BFF',
};

function selectedPayload() {
  const evidence = baseEvidence();
  addQuiz(evidence, { activityId: 70, grade: 40, gradeToPass: 50 });
  const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
  const result = new StudentRiskEvaluator().evaluate(normalized);
  const aggregate = new CourseRiskAggregator().aggregate({
    course_id: 77,
    data_as_of: evidence.observed_at,
    normalized_students: [normalized],
    student_results: [result],
  });
  return {
    schema_version: 'risk-snapshot.v0.1' as const,
    course_id: 77,
    source_evidence: evidence,
    normalized_students: [normalized],
    student_results: [result],
    course_aggregate: aggregate,
  };
}

describe('historical Student Risk snapshot scope', () => {
  it.each([false, true])('excludes newer current history and cross-policy points (policy change=%s)', async (policyChanged) => {
    const payload = selectedPayload();
    const history = [-1, 0, 1].map((offset, index) => ({
      snapshotId: offset === 0 ? 'selected' : `point-${index}`,
      dataAsOf: NOW + offset * 86400,
      createdAt: new Date((NOW + offset * 86400) * 1000).toISOString(),
      riskModelVersion: policyChanged && offset === 1 ? 'risk-profile.v0.2' : 'risk-profile.v0.1',
      evaluationStatus: 'COMPLETE',
      overallRisk: offset === 1 ? 'LOW' : offset === 0 ? 'MEDIUM' : 'HIGH',
      progressRisk: 'LOW',
      performanceRisk: offset === 1 ? 'LOW' : offset === 0 ? 'MEDIUM' : 'HIGH',
      competencyRisk: 'LOW',
      submissionRisk: 'LOW',
      dimensionMetrics: {},
    }));
    const app = Fastify({ logger: false });
    await app.register(riskDashboardRoutes, {
      config,
      riskDashboardRepo: {
        async getCourseState() { return { currentSnapshotId: 'point-2', previousSnapshotId: 'selected' } as any; },
        async getSnapshot() {
          return {
            snapshotId: 'selected',
            courseId: 77,
            dataAsOf: NOW,
            computedAt: new Date(NOW * 1000).toISOString(),
            riskModelVersion: 'risk-profile.v0.1',
            refreshOrigin: 'MANUAL',
            payload,
          } as any;
        },
        async listStudentHistory() { return history as any; },
      },
    });
    const response = await app.inject({
      method: 'GET',
      url: `/api/risk/courses/77/students/${STUDENT}?snapshot_id=selected`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.metadata.risk_model_version).toBe('risk-profile.v0.1');
    expect(body.trend.risk_model_version).toBe('risk-profile.v0.1');
    expect(body.trend.canonical_points.every((point: any) => point.dataAsOf <= NOW)).toBe(true);
    await app.close();
  });
});
