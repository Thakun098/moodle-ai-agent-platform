import { describe, expect, it } from 'vitest';
import { RiskEvidenceNormalizer, StudentRiskEvaluator } from '../src/index.js';
import {
  NOW,
  STUDENT,
  addAssignment,
  addCompetency,
  addProgressActivities,
  addQuiz,
  baseEvidence,
} from './course-evidence-fixture.js';

function evaluate(evidence = baseEvidence()) {
  const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
  return { normalized, result: new StudentRiskEvaluator().evaluate(normalized) };
}

describe('Ticket 08 deterministic Student Risk vertical slice', () => {
  it('produces a repeatable all-LOW result with stable evidence hashes and no LLM dependency', () => {
    const fixture = baseEvidence();
    addProgressActivities(fixture, 10, 10);
    addQuiz(fixture, { activityId: 201, grade: 90, gradeToPass: 50 });
    addAssignment(fixture, { activityId: 301, submission: 'SUBMITTED', submittedOffsetHours: -2, grade: 90, gradeToPass: 50 });
    addCompetency(fixture, { competencyId: 401, proficiency: true, activityId: 201 });

    const first = evaluate(fixture);
    const second = evaluate(fixture);
    expect(first.result.overall_risk).toBe('LOW');
    expect(Object.values(first.result.dimensions).map((d) => d.risk_level)).toEqual(['LOW', 'LOW', 'LOW', 'LOW']);
    expect(first.result).toEqual(second.result);
    expect(first.result.evidence.every((item) => /^[a-f0-9]{64}$/.test(item.evidence_hash))).toBe(true);
  });

  it('honours exact Progress boundaries and the minimum-activity guard', () => {
    const medium = baseEvidence();
    addProgressActivities(medium, 10, 9);
    expect(evaluate(medium).result.dimensions.progress.risk_level).toBe('MEDIUM');

    const high = baseEvidence();
    addProgressActivities(high, 4, 3);
    expect(evaluate(high).result.dimensions.progress.risk_level).toBe('HIGH');

    const noneComplete = baseEvidence();
    addProgressActivities(noneComplete, 3, 0);
    const guarded = evaluate(noneComplete).result.dimensions.progress;
    expect(guarded.risk_level).toBe('HIGH');
    expect(guarded.rule_hits.map((x) => x.rule_id)).toContain('PROGRESS_NONE_COMPLETED_GUARD');
  });

  it('uses Moodle grade-to-pass for academic FAIL and keeps no-pass-criterion LOW_SCORE separate', () => {
    const fixture = baseEvidence();
    addQuiz(fixture, { activityId: 201, grade: 49, gradeToPass: 50 });
    addQuiz(fixture, { activityId: 202, grade: 50, gradeToPass: null });
    addQuiz(fixture, { activityId: 203, grade: 95, gradeToPass: 50 });
    const { normalized, result } = evaluate(fixture);
    expect(normalized.assessments.find((x) => x.activity_id === 201)).toMatchObject({
      academic_status: 'FAIL', performance_signal: 'FAIL',
    });
    expect(normalized.assessments.find((x) => x.activity_id === 202)).toMatchObject({
      academic_status: 'NO_PASS_CRITERION', performance_signal: 'LOW_SCORE',
    });
    expect(result.dimensions.performance.risk_level).toBe('MEDIUM');
  });

  it('keeps PENDING_GRADE out of PASS/FAIL and Performance counts', () => {
    const fixture = baseEvidence();
    addQuiz(fixture, { activityId: 201, grade: null, gradeToPass: 50, gradeState: 'PENDING' });
    const { normalized, result } = evaluate(fixture);
    expect(normalized.assessments[0]?.academic_status).toBe('PENDING_GRADE');
    expect(result.dimensions.performance.metrics.evaluable_count).toBe(0);
    expect(result.dimensions.performance.risk_level).toBe('LOW');
    expect(result.evaluation_status).toBe('COMPLETE');
  });

  it('applies recent 3 and persistent Performance rules without calculating an overall performance average', () => {
    const recentHigh = baseEvidence();
    addQuiz(recentHigh, { activityId: 201, grade: 20, gradeToPass: 50, dueOffsetDays: -1 });
    addQuiz(recentHigh, { activityId: 202, grade: 30, gradeToPass: 50, dueOffsetDays: -2 });
    addQuiz(recentHigh, { activityId: 203, grade: 90, gradeToPass: 50, dueOffsetDays: -3 });
    expect(evaluate(recentHigh).result.dimensions.performance.risk_level).toBe('HIGH');

    const persistent = baseEvidence();
    for (let i = 0; i < 5; i += 1) {
      addQuiz(persistent, { activityId: 210 + i, grade: i < 3 ? 40 : 90, gradeToPass: 50, dueOffsetDays: -(i + 1) });
    }
    const performance = evaluate(persistent).result.dimensions.performance;
    expect(performance.risk_level).toBe('HIGH');
    expect(performance.rule_hits.map((x) => x.rule_id)).toContain('PERFORMANCE_PERSISTENT_FAIL_HIGH');
    expect(performance.metrics).not.toHaveProperty('average');
  });

  it('treats NOT_RATED concern and REVIEW_PENDING as coverage/workflow, not confirmed Risk', () => {
    const fixture = baseEvidence();
    addQuiz(fixture, { activityId: 201, grade: 20, gradeToPass: 50 });
    addCompetency(fixture, { competencyId: 401, proficiency: null, activityId: 201, reviewState: 'WAITING_FOR_REVIEW' });
    const { normalized, result } = evaluate(fixture);
    expect(normalized.competencies[0]).toMatchObject({ state: 'COMPETENCY_CONCERN', review_pending: true });
    expect(result.dimensions.competency.risk_level).toBe('LOW');
    expect(result.dimensions.competency.metrics.review_pending_count).toBe(1);
  });

  it('uses only explicit Moodle not-proficient ratings for confirmed Competency gaps', () => {
    const medium = baseEvidence();
    addCompetency(medium, { competencyId: 401, proficiency: false });
    expect(evaluate(medium).result.dimensions.competency.risk_level).toBe('MEDIUM');

    const high = baseEvidence();
    for (let i = 0; i < 5; i += 1) addCompetency(high, { competencyId: 410 + i, proficiency: i < 3 ? false : true });
    const result = evaluate(high).result.dimensions.competency;
    expect(result.risk_level).toBe('HIGH');
    expect(result.metrics.confirmed_gap_rate).toBeCloseTo(0.6);
  });

  it('keeps one missed one-attempt Quiz MEDIUM at most and marks recovery unavailable', () => {
    const fixture = baseEvidence();
    addQuiz(fixture, {
      activityId: 201,
      grade: null,
      gradeToPass: 50,
      gradeState: 'NOT_ATTEMPTED',
      attempted: false,
      attemptsAllowed: 1,
      dueOffsetDays: -1,
    });
    const { normalized, result } = evaluate(fixture);
    expect(normalized.submissions[0]).toMatchObject({ state: 'OVERDUE', recovery_not_available: true });
    expect(result.dimensions.submission.risk_level).toBe('MEDIUM');
    expect(result.overall_risk).toBe('MEDIUM');
  });

  it('escalates MEDIUM Late + MEDIUM Overdue explicitly to HIGH', () => {
    const fixture = baseEvidence();
    addAssignment(fixture, { activityId: 301, submission: 'SUBMITTED', submittedOffsetHours: 2 });
    addAssignment(fixture, { activityId: 302, submission: 'SUBMITTED', submittedOffsetHours: 3 });
    addAssignment(fixture, { activityId: 303, submission: 'NOT_ATTEMPTED' });
    const submission = evaluate(fixture).result.dimensions.submission;
    expect(submission.metrics.late_count).toBe(2);
    expect(submission.metrics.overdue_count).toBe(1);
    expect(submission.risk_level).toBe('HIGH');
    expect(submission.rule_hits.map((x) => x.rule_id)).toContain('SUBMISSION_MEDIUM_COMBINATION_HIGH');
  });

  it('marks source-incomplete students INCOMPLETE with null overall Risk rather than LOW', () => {
    const fixture = baseEvidence();
    fixture.dataset_status = fixture.dataset_status.map((item) =>
      item.dataset === 'competencies' ? { ...item, status: 'ERROR', message: 'source failure' } : item
    );
    const result = evaluate(fixture).result;
    expect(result.evaluation_status).toBe('INCOMPLETE');
    expect(result.overall_risk).toBeNull();
    expect(result.incomplete_reasons).toContain('DATASET_competencies_ERROR');
  });

  it('emits rule hits linked only to known normalized evidence refs', () => {
    const fixture = baseEvidence();
    addProgressActivities(fixture, 3, 0);
    addCompetency(fixture, { competencyId: 401, proficiency: false });
    const result = evaluate(fixture).result;
    const known = new Set(result.evidence.map((item) => item.evidence_id));
    expect(result.rule_hits.flatMap((item) => item.evidence_refs).every((id) => known.has(id))).toBe(true);
    expect(result.data_as_of).toBe(NOW);
    expect(result.risk_model_version).toBe('risk-profile.v0.1');
  });
});
