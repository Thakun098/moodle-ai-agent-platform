import { describe, expect, it } from 'vitest';
import {
  CourseRiskAggregator,
  type RiskLevel,
  type StudentNormalizedRiskEvidence,
  type StudentRiskResult,
} from '../src/index.js';
import type {
  NormalizedAssessmentEvidence,
  NormalizedCompetencyEvidence,
  NormalizedSubmissionEvidence,
} from '../src/types.js';

const COURSE = 77;
const NOW = 1_789_030_000;

function source(studentId: number, entity: string, activityId?: number) {
  return {
    source: 'moodle' as const,
    component: 'fixture',
    entity_type: entity,
    entity_id: `${entity}:${studentId}:${activityId ?? 0}`,
    course_id: COURSE,
    ...(activityId !== undefined ? { activity_id: activityId } : {}),
    student_id: studentId,
  };
}

function submission(studentId: number, activityId: number, state: NormalizedSubmissionEvidence['state']): NormalizedSubmissionEvidence {
  return {
    evidence_id: `submission:${activityId}:${studentId}`,
    activity_id: activityId,
    activity_type: activityId >= 300 ? 'assignment' : 'quiz',
    state,
    due_at: NOW - 3600,
    submitted_at: state === 'ON_TIME' ? NOW - 7200 : state === 'SUBMITTED_LATE' ? NOW - 1800 : null,
    recovery_not_available: false,
    source_ref: source(studentId, 'submission', activityId),
  };
}

function assessment(
  studentId: number,
  activityId: number,
  signal: NormalizedAssessmentEvidence['performance_signal'],
  status: NormalizedAssessmentEvidence['academic_status'] = signal === 'FAIL' ? 'FAIL' : 'NO_PASS_CRITERION'
): NormalizedAssessmentEvidence {
  return {
    evidence_id: `assessment:${activityId}:${studentId}`,
    activity_id: activityId,
    activity_type: activityId >= 300 ? 'assignment' : 'quiz',
    observed_at: NOW - 100,
    due_at: NOW - 3600,
    academic_status: status,
    performance_signal: signal,
    final_grade: status === 'PENDING_GRADE' || status === 'NOT_ATTEMPTED' ? null : signal === 'FAIL' ? 40 : signal === 'LOW_SCORE' ? 50 : 90,
    grade_max: 100,
    grade_to_pass: status === 'PASS' || status === 'FAIL' ? 60 : null,
    score_ratio: status === 'PENDING_GRADE' || status === 'NOT_ATTEMPTED' ? null : signal === 'FAIL' ? 0.4 : signal === 'LOW_SCORE' ? 0.5 : 0.9,
    source_ref: source(studentId, 'assessment', activityId),
  };
}

function competency(
  studentId: number,
  competencyId: number,
  state: NormalizedCompetencyEvidence['state'],
  linkedActivities: number[] = []
): NormalizedCompetencyEvidence {
  return {
    evidence_id: `competency:${competencyId}:${studentId}`,
    competency_id: competencyId,
    state,
    review_pending: false,
    related_activity_ids: linkedActivities,
    source_ref: source(studentId, 'competency'),
  };
}

function normalizedStudent(
  studentId: number,
  params: {
    evaluationStatus?: 'COMPLETE' | 'INCOMPLETE';
    submissions?: NormalizedSubmissionEvidence[];
    assessments?: NormalizedAssessmentEvidence[];
    competencies?: NormalizedCompetencyEvidence[];
  } = {}
): StudentNormalizedRiskEvidence {
  return {
    student_id: studentId,
    course_id: COURSE,
    data_as_of: NOW,
    evaluation_status: params.evaluationStatus ?? 'COMPLETE',
    incomplete_reasons: params.evaluationStatus === 'INCOMPLETE' ? ['FIXTURE_INCOMPLETE'] : [],
    progress: {
      total_applicable: 0,
      expected_count: 0,
      completed_count: 0,
      completed_expected_count: 0,
      expected_progress: 0,
      actual_progress: 0,
      progress_gap_pp: 0,
      timeline_compliance: null,
      evidence_refs: [],
    },
    assessments: params.assessments ?? [],
    competencies: params.competencies ?? [],
    submissions: params.submissions ?? [],
    evidence: [],
  };
}

function result(studentId: number, overall: RiskLevel | null, evaluationStatus: 'COMPLETE' | 'INCOMPLETE' = 'COMPLETE'): StudentRiskResult {
  const level = overall ?? 'LOW';
  const dim = (dimension: 'PROGRESS' | 'PERFORMANCE' | 'COMPETENCY' | 'SUBMISSION') => ({
    dimension,
    risk_level: level,
    rule_hits: [],
    metrics: {},
    evidence_refs: [],
  });
  return {
    student_id: studentId,
    course_id: COURSE,
    evaluation_status: evaluationStatus,
    overall_risk: evaluationStatus === 'INCOMPLETE' ? null : overall,
    dimensions: {
      progress: dim('PROGRESS'),
      performance: dim('PERFORMANCE'),
      competency: dim('COMPETENCY'),
      submission: dim('SUBMISSION'),
    },
    rule_hits: [],
    evidence: [],
    data_as_of: NOW,
    risk_model_version: 'risk-profile.v0.1',
    incomplete_reasons: evaluationStatus === 'INCOMPLETE' ? ['FIXTURE_INCOMPLETE'] : [],
  };
}

function aggregate(students: StudentNormalizedRiskEvidence[], results?: StudentRiskResult[]) {
  return new CourseRiskAggregator().aggregate({
    normalized_students: students,
    student_results: results ?? students.map((student) => result(student.student_id, 'LOW', student.evaluation_status)),
  });
}

describe('Ticket 09 deterministic Course Risk aggregation', () => {
  it('produces the 10-student demo with exact denominators, issues, common gap and notable association', () => {
    const students: StudentNormalizedRiskEvidence[] = [];
    const results: StudentRiskResult[] = [];
    for (let id = 1; id <= 10; id += 1) {
      students.push(normalizedStudent(id, {
        evaluationStatus: id === 10 ? 'INCOMPLETE' : 'COMPLETE',
        submissions: [submission(id, 301, id <= 3 ? 'OVERDUE' : 'ON_TIME')],
        assessments: [assessment(id, 201, id <= 4 ? 'FAIL' : 'NONE', id <= 4 ? 'FAIL' : 'PASS')],
        competencies: [competency(id, 401, id <= 3 || id === 5 ? 'CONFIRMED_GAP' : id <= 8 ? 'PROFICIENT' : 'NOT_RATED', [201])],
      }));
      const risk: RiskLevel | null = id === 10 ? null : id <= 2 ? 'HIGH' : id <= 5 ? 'MEDIUM' : 'LOW';
      results.push(result(id, risk, id === 10 ? 'INCOMPLETE' : 'COMPLETE'));
    }

    const course = aggregate(students, results);
    expect(course.enrolled_count).toBe(10);
    expect(course.evaluated_count).toBe(9);
    expect(course.incomplete_count).toBe(1);
    expect(course.evaluation_coverage).toBe(0.9);
    expect(course.student_risk_distribution).toEqual({ denominator: 9, LOW: 4, MEDIUM: 3, HIGH: 2 });

    const submissionIssue = course.activity_issues.find((issue) => issue.activity_id === 301 && issue.issue_type === 'SUBMISSION_PROBLEM');
    expect(submissionIssue?.affected).toEqual({ numerator: 3, denominator: 10, rate: 0.3 });

    const performanceIssue = course.activity_issues.find((issue) => issue.activity_id === 201 && issue.issue_type === 'PERFORMANCE_PROBLEM');
    expect(performanceIssue?.affected).toEqual({ numerator: 4, denominator: 10, rate: 0.4 });
    expect(performanceIssue?.performance_coverage).toBe(1);

    const gap = course.common_competency_gaps[0];
    expect(gap).toMatchObject({
      competency_id: 401,
      confirmed_gap: { numerator: 4, denominator: 8, rate: 0.5 },
      expected_students: 10,
      rated_expected_count: 8,
      rating_coverage: 0.8,
    });

    const association = course.notable_associations.find((item) => item.activity_id === 201 && item.competency_id === 401);
    expect(association).toMatchObject({
      overlap_count: 3,
      activity_side_denominator: 4,
      activity_side_overlap_rate: 0.75,
      competency_side_denominator: 4,
      competency_side_overlap_rate: 0.75,
    });
    expect(course).not.toHaveProperty('course_risk');
    expect(course).not.toHaveProperty('course_risk_level');
  });

  it('applies submission threshold and expected-student guard exactly', () => {
    const exactBoundary = Array.from({ length: 5 }, (_, i) => normalizedStudent(i + 1, {
      submissions: [submission(i + 1, 301, i === 0 ? 'OVERDUE' : 'ON_TIME')],
    }));
    expect(aggregate(exactBoundary).activity_issues.map((x) => x.issue_type)).toContain('SUBMISSION_PROBLEM');

    const belowGuard = exactBoundary.slice(0, 4);
    expect(aggregate(belowGuard).activity_issues).toHaveLength(0);

    const lateBoundary = Array.from({ length: 10 }, (_, i) => normalizedStudent(i + 1, {
      submissions: [submission(i + 1, 302, i < 3 ? 'SUBMITTED_LATE' : 'ON_TIME')],
    }));
    expect(aggregate(lateBoundary).activity_issues.map((x) => x.issue_type)).toContain('LATE_PATTERN');
  });

  it('applies performance fail/low-score thresholds with evaluable and coverage guards', () => {
    const failBoundary = Array.from({ length: 10 }, (_, i) => normalizedStudent(i + 1, {
      assessments: [assessment(i + 1, 201, i < 3 ? 'FAIL' : 'NONE', i < 3 ? 'FAIL' : 'PASS')],
    }));
    expect(aggregate(failBoundary).activity_issues.map((x) => x.issue_type)).toContain('PERFORMANCE_PROBLEM');

    const lowScoreBoundary = Array.from({ length: 5 }, (_, i) => normalizedStudent(i + 1, {
      assessments: [assessment(i + 1, 202, i < 2 ? 'LOW_SCORE' : 'NONE')],
    }));
    expect(aggregate(lowScoreBoundary).activity_issues.map((x) => x.issue_type)).toContain('PERFORMANCE_CONCERN');

    const lowCoverage = Array.from({ length: 10 }, (_, i) => normalizedStudent(i + 1, {
      assessments: [assessment(i + 1, 203, i < 4 ? 'FAIL' : 'NONE', i < 4 ? 'FAIL' : 'PENDING_GRADE')],
    }));
    expect(aggregate(lowCoverage).activity_issues).toHaveLength(0);
  });

  it('keeps FAIL and LOW_SCORE separate rather than merging their numerators', () => {
    const students = Array.from({ length: 10 }, (_, i) => normalizedStudent(i + 1, {
      assessments: [assessment(i + 1, 201, i < 2 ? 'FAIL' : i < 5 ? 'LOW_SCORE' : 'NONE', i < 2 ? 'FAIL' : i < 5 ? 'NO_PASS_CRITERION' : 'PASS')],
    }));
    const course = aggregate(students);
    expect(course.activity_issues.find((x) => x.issue_type === 'PERFORMANCE_PROBLEM')).toBeUndefined();
    expect(course.activity_issues.find((x) => x.issue_type === 'PERFORMANCE_CONCERN')).toBeUndefined();
  });

  it('requires sufficient competency rating coverage before producing a Common Competency Gap', () => {
    const exactCoverage = Array.from({ length: 10 }, (_, i) => normalizedStudent(i + 1, {
      competencies: [competency(i + 1, 401, i < 3 ? 'CONFIRMED_GAP' : i < 6 ? 'PROFICIENT' : 'NOT_RATED')],
    }));
    expect(aggregate(exactCoverage).common_competency_gaps).toHaveLength(1);

    const belowCoverage = Array.from({ length: 11 }, (_, i) => normalizedStudent(i + 1, {
      competencies: [competency(i + 1, 401, i < 3 ? 'CONFIRMED_GAP' : i < 6 ? 'PROFICIENT' : 'NOT_RATED')],
    }));
    expect(aggregate(belowCoverage).common_competency_gaps).toHaveLength(0);
  });

  it('does not create a notable association without an official mapping or without both valid issue sides', () => {
    const noMapping = Array.from({ length: 10 }, (_, i) => normalizedStudent(i + 1, {
      assessments: [assessment(i + 1, 201, i < 4 ? 'FAIL' : 'NONE', i < 4 ? 'FAIL' : 'PASS')],
      competencies: [competency(i + 1, 401, i < 4 ? 'CONFIRMED_GAP' : 'PROFICIENT')],
    }));
    expect(aggregate(noMapping).notable_associations).toHaveLength(0);

    const mappedButNoActivityIssue = Array.from({ length: 10 }, (_, i) => normalizedStudent(i + 1, {
      assessments: [assessment(i + 1, 201, i < 2 ? 'FAIL' : 'NONE', i < 2 ? 'FAIL' : 'PASS')],
      competencies: [competency(i + 1, 401, i < 4 ? 'CONFIRMED_GAP' : 'PROFICIENT', [201])],
    }));
    expect(aggregate(mappedButNoActivityIssue).notable_associations).toHaveLength(0);
  });

  it('excludes incomplete students from LOW/MEDIUM/HIGH distributions but reports them explicitly', () => {
    const students = [
      normalizedStudent(1), normalizedStudent(2), normalizedStudent(3, { evaluationStatus: 'INCOMPLETE' }),
    ];
    const results = [result(1, 'LOW'), result(2, 'HIGH'), result(3, null, 'INCOMPLETE')];
    const course = aggregate(students, results);
    expect(course.evaluated_count).toBe(2);
    expect(course.incomplete_count).toBe(1);
    expect(course.student_risk_distribution).toEqual({ denominator: 2, LOW: 1, MEDIUM: 0, HIGH: 1 });
    expect(course.dimension_distributions.progress.denominator).toBe(2);
  });

  it('preserves issue, evidence, target and student references in deterministic action candidates', () => {
    const students = Array.from({ length: 5 }, (_, i) => normalizedStudent(i + 1, {
      submissions: [submission(i + 1, 301, i === 0 ? 'OVERDUE' : 'ON_TIME')],
    }));
    const results = students.map((student, i) => result(student.student_id, i === 0 ? 'HIGH' : 'LOW'));
    const course = aggregate(students, results);
    const issueAction = course.action_candidates.find((item) => item.target_ref === 'activity:301');
    expect(issueAction).toMatchObject({
      action_code: 'REVIEW_SUBMISSION_PATTERN',
      target_type: 'activity',
      issue_refs: ['activity-issue:301:SUBMISSION_PROBLEM'],
      affected_student_refs: ['student:1'],
    });
    expect(issueAction?.evidence_refs).toEqual(['submission:301:1']);
    expect(course.action_candidates.some((item) => item.action_code === 'REVIEW_AT_RISK_STUDENTS')).toBe(true);
  });

  it('rejects mixed data_as_of inputs so a Course aggregate cannot silently mix source moments', () => {
    const first = normalizedStudent(1);
    const second = { ...normalizedStudent(2), data_as_of: NOW + 1 };
    expect(() => aggregate([first, second])).toThrow(/mixed data_as_of/);
  });
});


describe('CourseRiskAggregator zero-enrolment empty state', () => {
  it('publishes a valid empty aggregate when Course identity is supplied explicitly', () => {
    const course = new CourseRiskAggregator().aggregate({
      normalized_students: [],
      student_results: [],
      course_id: COURSE,
      data_as_of: NOW,
    });

    expect(course).toMatchObject({
      course_id: COURSE,
      data_as_of: NOW,
      enrolled_count: 0,
      evaluated_count: 0,
      incomplete_count: 0,
      evaluation_coverage: null,
      student_risk_distribution: { denominator: 0, LOW: 0, MEDIUM: 0, HIGH: 0 },
      activity_issues: [],
      common_competency_gaps: [],
      notable_associations: [],
      action_candidates: [],
    });
    expect(course.dimension_distributions.progress.denominator).toBe(0);
    expect(course.dimension_distributions.performance.denominator).toBe(0);
    expect(course.dimension_distributions.competency.denominator).toBe(0);
    expect(course.dimension_distributions.submission.denominator).toBe(0);
  });
});
