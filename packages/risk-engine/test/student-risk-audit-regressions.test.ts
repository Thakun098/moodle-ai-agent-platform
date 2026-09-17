import { describe, expect, it, vi } from 'vitest';
import {
  CourseRiskAggregator,
  RiskCompletenessGate,
  RiskEvidenceNormalizer,
  RiskTrendEngine,
  StudentRiskEvaluator,
  buildStudentInsightContext,
  generateGovernedInsight,
  scopeRiskHistoryToSnapshot,
} from '../src/index.js';
import { addAssignment, addQuiz, baseEvidence, NOW, STUDENT } from './course-evidence-fixture.js';

function payload(evidence = baseEvidence()) {
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

function mediumContext() {
  const evidence = baseEvidence();
  addQuiz(evidence, { activityId: 70, grade: 40, gradeToPass: 50 });
  return buildStudentInsightContext(payload(evidence), 'selected', STUDENT, new RiskTrendEngine().calculate([]))!;
}

function model(responses: string[]) {
  return {
    chat: vi.fn(async () => {
      const rawText = responses.shift()!;
      return { rawText, message: { content: rawText, role: 'assistant' }, toolCalls: [] };
    }),
  } as any;
}

const baseOutput = { summary: 'Review the evidence.', coverage_qualification: null, findings: [], actions: [] };

describe('Student Risk scrutinize-audit regressions', () => {
  it.each(['inprogress', 'overdue', 'abandoned'])('treats unfinished Quiz attempt state %s as not submitted and overdue', (attemptState) => {
    const evidence = baseEvidence();
    addQuiz(evidence, { activityId: 70, grade: null, gradeState: 'PENDING', attemptsAllowed: 1 });
    Object.assign(evidence.quizzes[0]!.students[0]!.attempts[0]!, { state: attemptState, finished_at: null });
    const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
    expect(normalized.submissions[0]?.state).toBe('OVERDUE');
    expect(normalized.submissions[0]?.submitted_at).toBeNull();
  });

  it('keeps a prior finished Quiz submission when a later retake remains in progress', () => {
    const evidence = baseEvidence();
    addQuiz(evidence, { activityId: 70, grade: 40, gradeToPass: 50 });
    const quiz = evidence.quizzes[0]!;
    quiz.students[0]!.attempts.push({
      ...quiz.students[0]!.attempts[0]!,
      attempt_id: 99999,
      attempt_no: 2,
      state: 'inprogress',
      started_at: NOW,
      finished_at: null,
    });
    const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
    expect(normalized.submissions[0]?.state).toBe('ON_TIME');
    expect(normalized.submissions[0]?.submitted_at).not.toBeNull();
  });

  it('excludes hidden assessments/submissions from negative Risk evidence', () => {
    const evidence = baseEvidence();
    for (let i = 1; i <= 4; i += 1) addAssignment(evidence, { activityId: 70 + i, submission: 'NOT_ATTEMPTED' });
    evidence.activities.forEach((activity) => { activity.visible = false; });
    const result = payload(evidence).student_results[0]!;
    expect(result.overall_risk).toBe('LOW');
  });

  it('marks active learner INCOMPLETE when an applicable PARTIAL Quiz dataset omits the student row', () => {
    const evidence = baseEvidence();
    addQuiz(evidence, { activityId: 70, grade: 0, gradeToPass: 50 });
    evidence.quizzes[0]!.students = [];
    evidence.dataset_status.find((item) => item.dataset === 'quizzes')!.status = 'PARTIAL';
    new RiskCompletenessGate().assertPublishable(evidence);
    const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
    const result = new StudentRiskEvaluator().evaluate(normalized);
    expect(normalized.incomplete_reasons).toContain('QUIZ_STUDENT_FACTS_MISSING:70');
    expect(result).toMatchObject({ evaluation_status: 'INCOMPLETE', overall_risk: null });
  });

  it('marks active learner INCOMPLETE when an applicable Quiz dataset omits the entire activity object', () => {
    const evidence = baseEvidence();
    addQuiz(evidence, { activityId: 70, grade: 0, gradeToPass: 50 });
    evidence.quizzes = [];
    evidence.dataset_status.find((item) => item.dataset === 'quizzes')!.status = 'PARTIAL';
    new RiskCompletenessGate().assertPublishable(evidence);
    const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
    const result = new StudentRiskEvaluator().evaluate(normalized);
    expect(normalized.incomplete_reasons).toContain('QUIZ_ACTIVITY_FACTS_MISSING:70');
    expect(result).toMatchObject({ evaluation_status: 'INCOMPLETE', overall_risk: null });
  });

  it('scopes trend history to selected publication boundary and policy version', () => {
    const history = [-1, 0, 1].map((offset, index) => ({
      snapshotId: offset === 0 ? 'selected' : `point-${index}`,
      dataAsOf: NOW + offset * 86400,
      createdAt: new Date((NOW + offset * 86400) * 1000).toISOString(),
      riskModelVersion: offset === 1 ? 'risk-profile.v0.2' : 'risk-profile.v0.1',
      evaluationStatus: 'COMPLETE' as const,
      overallRisk: offset === 1 ? 'LOW' as const : offset === 0 ? 'MEDIUM' as const : 'HIGH' as const,
      progressRisk: 'LOW' as const,
      performanceRisk: 'LOW' as const,
      competencyRisk: 'LOW' as const,
      submissionRisk: 'LOW' as const,
      dimensionMetrics: {},
    }));
    const scoped = scopeRiskHistoryToSnapshot(history, 'selected', 'risk-profile.v0.1', NOW);
    expect(scoped.map((point) => point.snapshotId)).toEqual(['point-0', 'selected']);
    expect(scoped.every((point) => point.riskModelVersion === 'risk-profile.v0.1')).toBe(true);
  });

  it('rejects ungrounded material prose and never renders model free-text as authoritative narrative', async () => {
    const result = await generateGovernedInsight(model([JSON.stringify({
      ...baseOutput,
      summary: 'This student is HIGH risk because the teacher caused poor motivation.',
      findings: [{ text: 'The learner is lazy and will fail.', rule_refs: [], evidence_refs: [], risk_refs: ['overall'], trend_refs: [] }],
    })]), mediumContext());
    expect(result.status).toBe('FALLBACK');
  });

  it('uses one shared repair budget across parse and schema failures', async () => {
    const client = model(['not-json', '{}', JSON.stringify(baseOutput)]);
    const result = await generateGovernedInsight(client, mediumContext());
    expect(client.chat).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('FALLBACK');
  });

  it('keeps the complete deterministic action set ordered by priority regardless of model action subset', async () => {
    const context = mediumContext();
    const p4 = context.eligible_actions.find((action) => action.priority_band === 'P4')!;
    const p2 = context.eligible_actions.find((action) => action.priority_band === 'P2')!;
    const result = await generateGovernedInsight(model([JSON.stringify({
      ...baseOutput,
      actions: [p4, p2].map((action) => ({
        action_code: action.action_code,
        priority_band: action.priority_band,
        target_ref: action.target_ref,
        rationale: 'Review.',
      })),
    })]), context);
    expect(result.status).toBe('VALID');
    expect(result.payload.actions.map((action) => action.priority_band)).toEqual(context.eligible_actions.map((action) => action.priority_band));
    expect(result.payload.actions.map((action) => action.action_code)).toEqual(context.eligible_actions.map((action) => action.action_code));
  });
});
