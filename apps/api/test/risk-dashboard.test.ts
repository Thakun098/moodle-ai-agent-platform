import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/config-loader.js';
import { riskDashboardRoutes, type RiskDashboardRepository } from '../src/routes/risk-dashboard.js';

const config = loadConfig({
  DATABASE_URL: 'postgresql://dummy:dummy@localhost:5432/dummy',
  RISK_SERVICE_KEY: 'dashboard-test-key',
});
const headers = {
  'x-agentpoc-service-key': 'dashboard-test-key',
  'x-agentpoc-actor-ref': 'moodle-user:7',
  'x-agentpoc-actor-type': 'teacher',
  'x-agentpoc-course-ref': 'course:77',
  'x-agentpoc-request-origin': 'MOODLE_BFF',
};
const snapshotId = '11111111-1111-4111-8111-111111111111';

function dim(dimension: string, risk: 'LOW' | 'MEDIUM' | 'HIGH') {
  return { dimension, risk_level: risk, rule_hits: [], metrics: {}, evidence_refs: [] };
}

function result(studentId: number, overall: 'LOW' | 'MEDIUM' | 'HIGH') {
  return {
    student_id: studentId,
    course_id: 77,
    evaluation_status: 'COMPLETE',
    overall_risk: overall,
    dimensions: {
      progress: dim('PROGRESS', overall),
      performance: dim('PERFORMANCE', 'LOW'),
      competency: dim('COMPETENCY', 'LOW'),
      submission: dim('SUBMISSION', 'LOW'),
    },
    rule_hits: [],
    evidence: [],
    data_as_of: 1789034000,
    risk_model_version: 'risk-profile.v0.1',
    incomplete_reasons: [],
  };
}

function normalized(studentId: number) {
  return {
    student_id: studentId,
    course_id: 77,
    data_as_of: 1789034000,
    evaluation_status: 'COMPLETE',
    incomplete_reasons: [],
    progress: { total_applicable: 1, expected_count: 1, completed_count: studentId === 7 ? 0 : 1, completed_expected_count: studentId === 7 ? 0 : 1, expected_progress: 1, actual_progress: studentId === 7 ? 0 : 1, progress_gap_pp: studentId === 7 ? 100 : 0, timeline_compliance: studentId === 7 ? 0 : 1, evidence_refs: ['ev-progress'] },
    assessments: studentId === 7 ? [{ evidence_id: 'ev-assessment', activity_id: 201, activity_type: 'quiz', observed_at: 1789033000, due_at: 1789032000, academic_status: 'FAIL', performance_signal: 'FAIL', final_grade: 40, grade_max: 100, grade_to_pass: 50, score_ratio: 0.4, source_ref: { source: 'moodle', component: 'mod_quiz', entity_type: 'quiz_grade', entity_id: '201:7', course_id: 77, activity_id: 201, student_id: 7 } }] : [],
    competencies: [{ evidence_id: 'ev-comp', competency_id: 401, state: studentId === 7 ? 'CONFIRMED_GAP' : 'PROFICIENT', review_pending: false, related_activity_ids: [201], source_ref: { source: 'moodle', component: 'core_competency', entity_type: 'competency_usercompcourse', entity_id: `${studentId}:401`, course_id: 77, student_id: studentId } }],
    submissions: [{ evidence_id: 'ev-sub', activity_id: 201, activity_type: 'quiz', state: 'ON_TIME', due_at: 1789032000, submitted_at: 1789031000, recovery_not_available: false, source_ref: { source: 'moodle', component: 'mod_quiz', entity_type: 'quiz_attempt', entity_id: `${studentId}:201`, course_id: 77, activity_id: 201, student_id: studentId } }],
    evidence: [{ evidence_id: 'ev-assessment', student_id: studentId, kind: 'ASSESSMENT_RESULT', observed_state: studentId === 7 ? 'FAIL' : 'PASS', observed_value: studentId === 7 ? 40 : 90, observed_at: 1789033000, activity_id: 201, source_ref: { source: 'moodle', component: 'mod_quiz', entity_type: 'quiz_grade', entity_id: `201:${studentId}`, course_id: 77, activity_id: 201, student_id: studentId }, evidence_hash: 'a'.repeat(64) }],
  };
}

const payload: any = {
  schema_version: 'risk-snapshot.v0.1',
  course_id: 77,
  source_evidence: {
    schema_version: '0.1',
    observed_at: 1789034000,
    course: { course_id: 77, fullname: 'Risk Course', shortname: 'RISK77', format: 'topics', start_at: null, end_at: null },
    dataset_status: [],
    enrolments: [],
    activities: [{ activity_id: 201, instance_id: 501, module_name: 'quiz', section_id: 2, section_num: 1, name: 'Quiz 1', visible: true, completion_tracking: 'AUTOMATIC', completion_expected_at: 1789032000, available_from: null, available_until: null, due_at: 1789032000, source_ref: { source: 'moodle', component: 'course', entity_type: 'course_module', entity_id: '201', course_id: 77, activity_id: 201 } }],
    completion: [], quizzes: [], assignments: [],
    competencies: {
      course_competencies: [{ competency_id: 401, shortname: 'Python Basics', idnumber: 'PY-1', scale_id: 2, source_ref: { source: 'moodle', component: 'core_competency', entity_type: 'competency', entity_id: '401', course_id: 77 } }],
      activity_links: [{ activity_id: 201, competency_id: 401, rule_outcome: 1, source_ref: { source: 'moodle', component: 'core_competency', entity_type: 'competency_modulecomp', entity_id: '201:401', course_id: 77, activity_id: 201 } }],
      ratings: [],
    },
  },
  normalized_students: [normalized(7), normalized(8)],
  student_results: [result(7, 'HIGH'), result(8, 'LOW')],
  course_aggregate: {
    course_id: 77,
    data_as_of: 1789034000,
    risk_model_version: 'risk-profile.v0.1',
    enrolled_count: 2, evaluated_count: 2, incomplete_count: 0, evaluation_coverage: 1,
    student_risk_distribution: { denominator: 2, LOW: 1, MEDIUM: 0, HIGH: 1 },
    dimension_distributions: {
      progress: { denominator: 2, LOW: 1, MEDIUM: 0, HIGH: 1 },
      performance: { denominator: 2, LOW: 2, MEDIUM: 0, HIGH: 0 },
      competency: { denominator: 2, LOW: 2, MEDIUM: 0, HIGH: 0 },
      submission: { denominator: 2, LOW: 2, MEDIUM: 0, HIGH: 0 },
    },
    activity_issues: [{ issue_id: 'activity-issue:201:PERFORMANCE_PROBLEM', activity_id: 201, issue_type: 'PERFORMANCE_PROBLEM', affected: { numerator: 1, denominator: 2, rate: 0.5 }, expected_students: 2, evaluable_count: 2, performance_coverage: 1, affected_student_refs: ['student:7'], evidence_refs: ['ev-assessment'] }],
    common_competency_gaps: [{ gap_id: 'competency-gap:401', competency_id: 401, confirmed_gap: { numerator: 1, denominator: 2, rate: 0.5 }, expected_students: 2, rated_expected_count: 2, rating_coverage: 1, affected_student_refs: ['student:7'], evidence_refs: ['ev-comp'] }],
    notable_associations: [{ association_id: 'assoc-1', association_type: 'NOTABLE_ASSOCIATION', activity_id: 201, competency_id: 401, activity_issue_id: 'activity-issue:201:PERFORMANCE_PROBLEM', competency_gap_id: 'competency-gap:401', overlap_count: 1, activity_side_denominator: 1, activity_side_overlap_rate: 1, competency_side_denominator: 1, competency_side_overlap_rate: 1, affected_student_refs: ['student:7'], evidence_refs: ['ev-assessment', 'ev-comp'] }],
    action_candidates: [],
  },
};

function repo(): RiskDashboardRepository {
  return {
    async getCourseState() {
      return { courseId: 77, currentSnapshotId: snapshotId, previousSnapshotId: null, lastSuccessfulRefreshAt: '2026-09-10T10:00:00.000Z', lastRefreshAttemptAt: '2026-09-10T10:00:00.000Z', lastRefreshStatus: 'SUCCESS', lastRefreshOrigin: 'MANUAL', lastRefreshAttemptId: 'attempt-1', lastRefreshError: null, updatedAt: '2026-09-10T10:00:00.000Z' } as any;
    },
    async getSnapshot(id) {
      if (id !== snapshotId) return null;
      return { snapshotId, courseId: 77, snapshotVersion: 1, dataAsOf: 1789034000, computedAt: '2026-09-10T10:00:00.000Z', riskModelVersion: 'risk-profile.v0.1', refreshOrigin: 'MANUAL', publicationStatus: 'PUBLISHED', evidenceHash: 'a'.repeat(64), payload, createdAt: '2026-09-10T10:00:00.000Z' } as any;
    },
    async listStudentHistory(_courseId, studentId) {
      return [{ historyId: 'h1', courseId: 77, studentId, snapshotId, dataAsOf: 1789034000, riskModelVersion: 'risk-profile.v0.1', evaluationStatus: 'COMPLETE', overallRisk: studentId === 7 ? 'HIGH' : 'LOW', progressRisk: studentId === 7 ? 'HIGH' : 'LOW', performanceRisk: 'LOW', competencyRisk: 'LOW', submissionRisk: 'LOW', dimensionMetrics: { progress: { progress_gap_pp: studentId === 7 ? 100 : 0 }, performance: {}, competency: {}, submission: {} }, createdAt: '2026-09-10T10:00:00.000Z' }] as any;
    },
  };
}

async function app() {
  const server = Fastify({ logger: false });
  await server.register(riskDashboardRoutes, { config, riskDashboardRepo: repo() });
  return server;
}

describe('Ticket 12 snapshot-scoped Risk Dashboard API', () => {
  it('returns one explicit snapshot with overview, attention issues and HIGH/MEDIUM triage', async () => {
    const server = await app();
    const response = await server.inject({ method: 'GET', url: '/api/risk/courses/77/dashboard', headers });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.metadata.snapshot_id).toBe(snapshotId);
    expect(body.overview.student_risk_distribution).toEqual({ denominator: 2, LOW: 1, MEDIUM: 0, HIGH: 1 });
    expect(body.what_needs_attention.activity_issues[0].activity.name).toBe('Quiz 1');
    expect(body.what_needs_attention.common_competency_gaps[0].competency.shortname).toBe('Python Basics');
    expect(body.students.attention.map((item: any) => item.student_id)).toEqual([7]);
    expect(response.body).not.toContain('dashboard-test-key');
    await server.close();
  });

  it('requires the shared service credential and trusted actor course context', async () => {
    const server = await app();
    const unauthorized = await server.inject({ method: 'GET', url: '/api/risk/courses/77/dashboard', headers: { ...headers, 'x-agentpoc-service-key': 'wrong' } });
    expect(unauthorized.statusCode).toBe(401);
    const mismatch = await server.inject({ method: 'GET', url: '/api/risk/courses/77/dashboard', headers: { ...headers, 'x-agentpoc-course-ref': 'course:88' } });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ error: { code: 'RISK_ACTOR_COURSE_MISMATCH' } });
    await server.close();
  });

  it('pins Student drill-down to the requested snapshot and returns snapshot-first evidence navigation plus trend', async () => {
    const server = await app();
    const missing = await server.inject({ method: 'GET', url: '/api/risk/courses/77/students/7', headers });
    expect(missing.statusCode).toBe(400);
    const response = await server.inject({ method: 'GET', url: `/api/risk/courses/77/students/7?snapshot_id=${snapshotId}`, headers });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.metadata.snapshot_id).toBe(snapshotId);
    expect(body.student).toMatchObject({ student_id: 7, overall_risk: 'HIGH' });
    expect(body.evidence_journey.evidence[0].current_source_navigation).toMatchObject({ course_id: 77, activity_id: 201, module_name: 'quiz' });
    expect(body.trend.overall).toBe('INSUFFICIENT_HISTORY');
    await server.close();
  });

  it('serves Activity and Competency drill-downs from the same explicit snapshot', async () => {
    const server = await app();
    const activity = await server.inject({ method: 'GET', url: `/api/risk/courses/77/activities/201?snapshot_id=${snapshotId}`, headers });
    const competency = await server.inject({ method: 'GET', url: `/api/risk/courses/77/competencies/401?snapshot_id=${snapshotId}`, headers });
    expect(activity.statusCode).toBe(200);
    expect(activity.json()).toMatchObject({ metadata: { snapshot_id: snapshotId }, activity: { activity_id: 201, name: 'Quiz 1' } });
    expect(competency.statusCode).toBe(200);
    expect(competency.json()).toMatchObject({ metadata: { snapshot_id: snapshotId }, competency: { competency_id: 401, shortname: 'Python Basics' } });
    await server.close();
  });

  it('does not silently fall forward when a requested historical snapshot is unavailable', async () => {
    const server = await app();
    const response = await server.inject({ method: 'GET', url: '/api/risk/courses/77/students/7?snapshot_id=99999999-9999-4999-8999-999999999999', headers });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'RISK_SNAPSHOT_NOT_FOUND' } });
    await server.close();
  });
});
