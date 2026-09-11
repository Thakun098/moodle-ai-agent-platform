import type {
  NormalizedAssessmentEvidence,
  NormalizedCompetencyEvidence,
  NormalizedSubmissionEvidence,
  StudentNormalizedRiskEvidence,
  StudentRiskResult,
} from './types.js';
import {
  emptyDistribution,
  incrementDistribution,
  studentRef,
  type ActivityIssue,
  type CommonCompetencyGap,
  type CourseActionCandidate,
  type CourseRiskAggregate,
  type CourseRiskAggregateInput,
  type IssueAssociation,
} from './course-risk-types.js';

type StudentScoped<T> = { student: StudentNormalizedRiskEvidence; item: T };

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function activityIssueId(activityId: number, issueType: ActivityIssue['issue_type']): string {
  return `activity-issue:${activityId}:${issueType}`;
}

function competencyGapId(competencyId: number): string {
  return `competency-gap:${competencyId}`;
}

function assertAggregateInput(input: CourseRiskAggregateInput): {
  courseId: number;
  dataAsOf: number;
  riskModelVersion: 'risk-profile.v0.1';
} {
  if (input.normalized_students.length === 0) {
    if (!Number.isInteger(input.course_id) || (input.course_id ?? 0) <= 0) {
      throw new Error('CourseRiskAggregator requires course_id when aggregating zero students.');
    }
    if (!Number.isFinite(input.data_as_of) || (input.data_as_of ?? 0) <= 0) {
      throw new Error('CourseRiskAggregator requires data_as_of when aggregating zero students.');
    }
    if (input.student_results.length !== 0) {
      throw new Error('Zero-student aggregate cannot contain StudentRiskResults.');
    }
    return {
      courseId: input.course_id!,
      dataAsOf: input.data_as_of!,
      riskModelVersion: 'risk-profile.v0.1',
    };
  }

  const courseId = input.normalized_students[0]!.course_id;
  const dataAsOf = input.normalized_students[0]!.data_as_of;
  const normalizedIds = new Set<number>();

  for (const student of input.normalized_students) {
    if (student.course_id !== courseId) throw new Error('Cannot aggregate students from different courses.');
    if (student.data_as_of !== dataAsOf) throw new Error('Cannot aggregate mixed data_as_of values.');
    if (normalizedIds.has(student.student_id)) throw new Error(`Duplicate normalized student ${student.student_id}.`);
    normalizedIds.add(student.student_id);
  }

  const resultIds = new Set<number>();
  for (const result of input.student_results) {
    if (result.course_id !== courseId) throw new Error('Cannot aggregate StudentRiskResults from a different course.');
    if (result.data_as_of !== dataAsOf) throw new Error('Cannot aggregate mixed StudentRiskResult data_as_of values.');
    if (result.risk_model_version !== 'risk-profile.v0.1') throw new Error('Unsupported or mixed risk model version.');
    if (!normalizedIds.has(result.student_id)) throw new Error(`StudentRiskResult ${result.student_id} has no normalized student.`);
    if (resultIds.has(result.student_id)) throw new Error(`Duplicate StudentRiskResult ${result.student_id}.`);
    resultIds.add(result.student_id);
  }

  if (resultIds.size !== normalizedIds.size) {
    throw new Error('Every normalized student must have exactly one StudentRiskResult.');
  }

  return { courseId, dataAsOf, riskModelVersion: 'risk-profile.v0.1' };
}

function groupByActivity<T extends { activity_id: number }>(
  students: StudentNormalizedRiskEvidence[],
  selector: (student: StudentNormalizedRiskEvidence) => T[]
): Map<number, Array<StudentScoped<T>>> {
  const grouped = new Map<number, Array<StudentScoped<T>>>();
  for (const student of students) {
    for (const item of selector(student)) {
      const bucket = grouped.get(item.activity_id) ?? [];
      bucket.push({ student, item });
      grouped.set(item.activity_id, bucket);
    }
  }
  return grouped;
}

function detectActivityIssues(students: StudentNormalizedRiskEvidence[]): ActivityIssue[] {
  const issues: ActivityIssue[] = [];
  const submissions = groupByActivity<NormalizedSubmissionEvidence>(students, (student) => student.submissions);

  for (const [activityId, rows] of submissions) {
    const expected = rows.filter(({ item, student }) =>
      item.due_at !== null && item.due_at <= student.data_as_of && item.state !== 'NOT_DUE'
    );
    const overdue = expected.filter(({ item }) => item.state === 'OVERDUE' || item.state === 'NOT_ATTEMPTED');
    const late = expected.filter(({ item }) => item.state === 'SUBMITTED_LATE');

    if (expected.length >= 5 && rate(overdue.length, expected.length)! >= 0.2) {
      issues.push({
        issue_id: activityIssueId(activityId, 'SUBMISSION_PROBLEM'),
        activity_id: activityId,
        issue_type: 'SUBMISSION_PROBLEM',
        affected: { numerator: overdue.length, denominator: expected.length, rate: rate(overdue.length, expected.length) },
        expected_students: expected.length,
        evaluable_count: null,
        performance_coverage: null,
        affected_student_refs: uniqueSorted(overdue.map(({ student }) => studentRef(student.student_id))),
        evidence_refs: uniqueSorted(overdue.map(({ item }) => item.evidence_id)),
      });
    }

    if (expected.length >= 5 && rate(late.length, expected.length)! >= 0.3) {
      issues.push({
        issue_id: activityIssueId(activityId, 'LATE_PATTERN'),
        activity_id: activityId,
        issue_type: 'LATE_PATTERN',
        affected: { numerator: late.length, denominator: expected.length, rate: rate(late.length, expected.length) },
        expected_students: expected.length,
        evaluable_count: null,
        performance_coverage: null,
        affected_student_refs: uniqueSorted(late.map(({ student }) => studentRef(student.student_id))),
        evidence_refs: uniqueSorted(late.map(({ item }) => item.evidence_id)),
      });
    }
  }

  const assessments = groupByActivity<NormalizedAssessmentEvidence>(students, (student) => student.assessments);
  for (const [activityId, rows] of assessments) {
    const expected = rows;
    const evaluable = rows.filter(({ item }) =>
      item.academic_status === 'PASS' || item.academic_status === 'FAIL' || item.academic_status === 'NO_PASS_CRITERION'
    );
    const failures = evaluable.filter(({ item }) => item.performance_signal === 'FAIL');
    const lowScores = evaluable.filter(({ item }) => item.performance_signal === 'LOW_SCORE');
    const coverage = rate(evaluable.length, expected.length);

    if (evaluable.length >= 5 && coverage !== null && coverage >= 0.5 && rate(failures.length, evaluable.length)! >= 0.3) {
      issues.push({
        issue_id: activityIssueId(activityId, 'PERFORMANCE_PROBLEM'),
        activity_id: activityId,
        issue_type: 'PERFORMANCE_PROBLEM',
        affected: {
          numerator: failures.length,
          denominator: evaluable.length,
          rate: rate(failures.length, evaluable.length),
        },
        expected_students: expected.length,
        evaluable_count: evaluable.length,
        performance_coverage: coverage,
        affected_student_refs: uniqueSorted(failures.map(({ student }) => studentRef(student.student_id))),
        evidence_refs: uniqueSorted(failures.map(({ item }) => item.evidence_id)),
      });
    }

    if (evaluable.length >= 5 && coverage !== null && coverage >= 0.5 && rate(lowScores.length, evaluable.length)! >= 0.4) {
      issues.push({
        issue_id: activityIssueId(activityId, 'PERFORMANCE_CONCERN'),
        activity_id: activityId,
        issue_type: 'PERFORMANCE_CONCERN',
        affected: {
          numerator: lowScores.length,
          denominator: evaluable.length,
          rate: rate(lowScores.length, evaluable.length),
        },
        expected_students: expected.length,
        evaluable_count: evaluable.length,
        performance_coverage: coverage,
        affected_student_refs: uniqueSorted(lowScores.map(({ student }) => studentRef(student.student_id))),
        evidence_refs: uniqueSorted(lowScores.map(({ item }) => item.evidence_id)),
      });
    }
  }

  return issues.sort((a, b) => a.activity_id - b.activity_id || a.issue_type.localeCompare(b.issue_type));
}

function detectCommonCompetencyGaps(students: StudentNormalizedRiskEvidence[]): CommonCompetencyGap[] {
  const grouped = new Map<number, Array<StudentScoped<NormalizedCompetencyEvidence>>>();
  for (const student of students) {
    for (const item of student.competencies) {
      const bucket = grouped.get(item.competency_id) ?? [];
      bucket.push({ student, item });
      grouped.set(item.competency_id, bucket);
    }
  }

  const gaps: CommonCompetencyGap[] = [];
  for (const [competencyId, rows] of grouped) {
    const rated = rows.filter(({ item }) => item.state === 'PROFICIENT' || item.state === 'CONFIRMED_GAP');
    const confirmed = rated.filter(({ item }) => item.state === 'CONFIRMED_GAP');
    const coverage = rate(rated.length, rows.length);
    const gapRate = rate(confirmed.length, rated.length);
    if (
      confirmed.length >= 3 &&
      gapRate !== null && gapRate >= 0.3 &&
      coverage !== null && coverage >= 0.6
    ) {
      gaps.push({
        gap_id: competencyGapId(competencyId),
        competency_id: competencyId,
        confirmed_gap: { numerator: confirmed.length, denominator: rated.length, rate: gapRate },
        expected_students: rows.length,
        rated_expected_count: rated.length,
        rating_coverage: coverage,
        affected_student_refs: uniqueSorted(confirmed.map(({ student }) => studentRef(student.student_id))),
        evidence_refs: uniqueSorted(confirmed.map(({ item }) => item.evidence_id)),
      });
    }
  }

  return gaps.sort((a, b) => a.competency_id - b.competency_id);
}

function detectAssociations(
  students: StudentNormalizedRiskEvidence[],
  activityIssues: ActivityIssue[],
  competencyGaps: CommonCompetencyGap[]
): IssueAssociation[] {
  const officialLinks = new Set<string>();
  const mappingEvidence = new Map<string, string[]>();
  for (const student of students) {
    for (const competency of student.competencies) {
      for (const activityId of competency.related_activity_ids) {
        const key = `${activityId}:${competency.competency_id}`;
        officialLinks.add(key);
        const refs = mappingEvidence.get(key) ?? [];
        refs.push(competency.evidence_id);
        mappingEvidence.set(key, refs);
      }
    }
  }

  const associations: IssueAssociation[] = [];
  for (const activityIssue of activityIssues) {
    const activityStudents = new Set(activityIssue.affected_student_refs);
    for (const gap of competencyGaps) {
      const key = `${activityIssue.activity_id}:${gap.competency_id}`;
      if (!officialLinks.has(key)) continue;
      const competencyStudents = new Set(gap.affected_student_refs);
      const overlap = [...activityStudents].filter((student) => competencyStudents.has(student)).sort();
      const activityRate = rate(overlap.length, activityStudents.size);
      const competencyRate = rate(overlap.length, competencyStudents.size);
      if (
        overlap.length < 3 ||
        !((activityRate !== null && activityRate >= 0.3) || (competencyRate !== null && competencyRate >= 0.3))
      ) continue;

      associations.push({
        association_id: `association:${activityIssue.issue_id}:${gap.gap_id}`,
        association_type: 'NOTABLE_ASSOCIATION',
        activity_id: activityIssue.activity_id,
        competency_id: gap.competency_id,
        activity_issue_id: activityIssue.issue_id,
        competency_gap_id: gap.gap_id,
        overlap_count: overlap.length,
        activity_side_denominator: activityStudents.size,
        activity_side_overlap_rate: activityRate,
        competency_side_denominator: competencyStudents.size,
        competency_side_overlap_rate: competencyRate,
        affected_student_refs: overlap,
        evidence_refs: uniqueSorted([
          ...activityIssue.evidence_refs,
          ...gap.evidence_refs,
          ...(mappingEvidence.get(key) ?? []),
        ]),
      });
    }
  }

  return associations.sort((a, b) => a.activity_id - b.activity_id || a.competency_id - b.competency_id || a.activity_issue_id.localeCompare(b.activity_issue_id));
}

function buildActionCandidates(
  results: StudentRiskResult[],
  activityIssues: ActivityIssue[],
  gaps: CommonCompetencyGap[]
): CourseActionCandidate[] {
  const candidates: CourseActionCandidate[] = [];

  for (const issue of activityIssues) {
    const submission = issue.issue_type === 'SUBMISSION_PROBLEM' || issue.issue_type === 'LATE_PATTERN';
    candidates.push({
      candidate_id: `action:${issue.issue_id}`,
      action_code: submission ? 'REVIEW_SUBMISSION_PATTERN' : 'REVIEW_PROBLEMATIC_ACTIVITY',
      priority_band: issue.issue_type === 'PERFORMANCE_PROBLEM' || issue.issue_type === 'SUBMISSION_PROBLEM' ? 'P1' : 'P2',
      target_type: 'activity',
      target_ref: `activity:${issue.activity_id}`,
      issue_refs: [issue.issue_id],
      evidence_refs: issue.evidence_refs,
      affected_student_refs: issue.affected_student_refs,
    });
  }

  for (const gap of gaps) {
    candidates.push({
      candidate_id: `action:${gap.gap_id}`,
      action_code: 'REVIEW_COMMON_COMPETENCY_GAP',
      priority_band: 'P2',
      target_type: 'competency',
      target_ref: `competency:${gap.competency_id}`,
      issue_refs: [gap.gap_id],
      evidence_refs: gap.evidence_refs,
      affected_student_refs: gap.affected_student_refs,
    });
  }

  const highRisk = results.filter((result) => result.evaluation_status === 'COMPLETE' && result.overall_risk === 'HIGH');
  if (highRisk.length > 0) {
    candidates.push({
      candidate_id: 'action:course:high-risk-students',
      action_code: 'REVIEW_AT_RISK_STUDENTS',
      priority_band: 'P1',
      target_type: 'course',
      target_ref: `course:${highRisk[0]!.course_id}`,
      issue_refs: uniqueSorted(highRisk.flatMap((result) => result.rule_hits.map((hit) => hit.rule_id))),
      evidence_refs: uniqueSorted(highRisk.flatMap((result) => result.rule_hits.flatMap((hit) => hit.evidence_refs))),
      affected_student_refs: uniqueSorted(highRisk.map((result) => studentRef(result.student_id))),
    });
  }

  return candidates.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
}

export class CourseRiskAggregator {
  aggregate(input: CourseRiskAggregateInput): CourseRiskAggregate {
    const identity = assertAggregateInput(input);
    const evaluatedResults = input.student_results.filter(
      (result) => result.evaluation_status === 'COMPLETE' && result.overall_risk !== null
    );
    const incompleteCount = input.student_results.length - evaluatedResults.length;

    const studentRiskDistribution = emptyDistribution();
    const dimensionDistributions = {
      progress: emptyDistribution(),
      performance: emptyDistribution(),
      competency: emptyDistribution(),
      submission: emptyDistribution(),
    };

    for (const result of evaluatedResults) {
      incrementDistribution(studentRiskDistribution, result.overall_risk!);
      incrementDistribution(dimensionDistributions.progress, result.dimensions.progress.risk_level);
      incrementDistribution(dimensionDistributions.performance, result.dimensions.performance.risk_level);
      incrementDistribution(dimensionDistributions.competency, result.dimensions.competency.risk_level);
      incrementDistribution(dimensionDistributions.submission, result.dimensions.submission.risk_level);
    }

    const activityIssues = detectActivityIssues(input.normalized_students);
    const commonCompetencyGaps = detectCommonCompetencyGaps(input.normalized_students);
    const notableAssociations = detectAssociations(input.normalized_students, activityIssues, commonCompetencyGaps);
    const actionCandidates = buildActionCandidates(input.student_results, activityIssues, commonCompetencyGaps);

    return {
      course_id: identity.courseId,
      data_as_of: identity.dataAsOf,
      risk_model_version: identity.riskModelVersion,
      enrolled_count: input.normalized_students.length,
      evaluated_count: evaluatedResults.length,
      incomplete_count: incompleteCount,
      evaluation_coverage: rate(evaluatedResults.length, input.normalized_students.length),
      student_risk_distribution: studentRiskDistribution,
      dimension_distributions: dimensionDistributions,
      activity_issues: activityIssues,
      common_competency_gaps: commonCompetencyGaps,
      notable_associations: notableAssociations,
      action_candidates: actionCandidates,
    };
  }
}
