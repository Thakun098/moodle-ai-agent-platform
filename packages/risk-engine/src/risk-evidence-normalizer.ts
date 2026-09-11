import { createHash } from 'node:crypto';
import type {
  CourseRiskEvidence,
  MoodleRiskSourceReference,
} from '@moodle-agent-poc/contracts';
import { RISK_PROFILE_V01, type RiskProfileV01 } from './profile.js';
import type {
  NormalizedAssessmentEvidence,
  NormalizedCompetencyEvidence,
  NormalizedRiskEvidenceRecord,
  NormalizedSubmissionEvidence,
  StudentNormalizedRiskEvidence,
} from './types.js';

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function evidenceId(kind: string, source: MoodleRiskSourceReference, studentId: number): string {
  return [
    'risk-evidence.v0.1',
    kind,
    source.component,
    source.entity_type,
    source.entity_id,
    `student:${studentId}`,
  ].join(':');
}

function addEvidence(
  target: NormalizedRiskEvidenceRecord[],
  params: {
    studentId: number;
    kind: string;
    state: string;
    value: number | string | boolean | null;
    observedAt: number;
    source: MoodleRiskSourceReference;
    activityId?: number;
    competencyId?: number;
  }
): string {
  const id = evidenceId(params.kind, params.source, params.studentId);
  const canonical = {
    evidence_id: id,
    student_id: params.studentId,
    kind: params.kind,
    observed_state: params.state,
    observed_value: params.value,
    observed_at: params.observedAt,
    source_ref: params.source,
    ...(params.activityId !== undefined ? { activity_id: params.activityId } : {}),
    ...(params.competencyId !== undefined ? { competency_id: params.competencyId } : {}),
  };
  target.push({ ...canonical, evidence_hash: stableHash(canonical) });
  return id;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function completionIsDone(state: string): boolean {
  return state === 'COMPLETE' || state === 'COMPLETE_PASS' || state === 'COMPLETE_FAIL';
}

function activityIsApplicable(activity: CourseRiskEvidence['activities'][number] | undefined): boolean {
  return !!activity && activity.visible;
}

function quizAttemptIsSubmitted(attempt: CourseRiskEvidence['quizzes'][number]['students'][number]['attempts'][number]): boolean {
  return attempt.state.toLowerCase() === 'finished' && attempt.finished_at !== null;
}

function expectedByCourseFallback(
  activitySection: number,
  sections: number[],
  now: number,
  startAt: number | null,
  endAt: number | null
): boolean {
  if (startAt === null || endAt === null || endAt <= startAt || sections.length === 0) return false;
  if (now >= endAt) return true;
  if (now < startAt) return false;
  const fraction = clamp01((now - startAt) / (endAt - startAt));
  const expectedSectionCount = Math.floor(fraction * sections.length);
  const index = sections.indexOf(activitySection);
  return index >= 0 && index < expectedSectionCount;
}

export class RiskEvidenceNormalizer {
  constructor(private readonly profile: RiskProfileV01 = RISK_PROFILE_V01) {}

  normalizeStudent(course: CourseRiskEvidence, studentId: number): StudentNormalizedRiskEvidence {
    const evidence: NormalizedRiskEvidenceRecord[] = [];
    const incompleteReasons: string[] = [];
    const failedDatasets = course.dataset_status.filter(
      (item) => item.status === 'ERROR' || item.status === 'UNAVAILABLE'
    );
    for (const dataset of failedDatasets) {
      incompleteReasons.push(`DATASET_${dataset.dataset}_${dataset.status}`);
    }

    const enrolment = course.enrolments.find((item) => item.student_id === studentId);
    if (!enrolment || !enrolment.active) incompleteReasons.push('STUDENT_NOT_ACTIVE_ENROLMENT');

    const activitiesById = new Map(course.activities.map((activity) => [activity.activity_id, activity]));
    const studentApplicableActivities = course.activities.filter((activity) => activityIsApplicable(activity));
    const applicableActivities = studentApplicableActivities.filter(
      (activity) => activity.completion_tracking !== 'NONE'
    );
    for (const activity of studentApplicableActivities) {
      if (activity.module_name === 'quiz' && !course.quizzes.some((quiz) => quiz.activity_id === activity.activity_id)) {
        incompleteReasons.push(`QUIZ_ACTIVITY_FACTS_MISSING:${activity.activity_id}`);
      }
      if (activity.module_name === 'assign' && !course.assignments.some((assignment) => assignment.activity_id === activity.activity_id)) {
        incompleteReasons.push(`ASSIGNMENT_ACTIVITY_FACTS_MISSING:${activity.activity_id}`);
      }
    }
    const sectionOrder = [...new Set(applicableActivities.map((activity) => activity.section_num))].sort(
      (a, b) => a - b
    );
    const completionByActivity = new Map(
      course.completion
        .filter((item) => item.student_id === studentId)
        .map((item) => [item.activity_id, item])
    );
    for (const activity of applicableActivities) {
      if (!completionByActivity.has(activity.activity_id)) {
        incompleteReasons.push(`COMPLETION_STUDENT_FACTS_MISSING:${activity.activity_id}`);
      }
    }

    const expectedActivities = applicableActivities.filter((activity) => {
      const deadline = activity.due_at ?? activity.completion_expected_at ?? activity.available_until;
      if (deadline !== null) return deadline <= course.observed_at;
      return expectedByCourseFallback(
        activity.section_num,
        sectionOrder,
        course.observed_at,
        course.course.start_at,
        course.course.end_at
      );
    });
    const completedActivities = applicableActivities.filter((activity) =>
      completionIsDone(completionByActivity.get(activity.activity_id)?.state ?? 'INCOMPLETE')
    );
    const completedExpected = expectedActivities.filter((activity) =>
      completionIsDone(completionByActivity.get(activity.activity_id)?.state ?? 'INCOMPLETE')
    );
    const progressEvidenceRefs: string[] = [];
    for (const activity of applicableActivities) {
      const completion = completionByActivity.get(activity.activity_id);
      const source = completion?.source_ref ?? activity.source_ref;
      progressEvidenceRefs.push(
        addEvidence(evidence, {
          studentId,
          kind: 'PROGRESS_ACTIVITY',
          state: completion?.state ?? 'INCOMPLETE',
          value: completionIsDone(completion?.state ?? 'INCOMPLETE'),
          observedAt: completion?.completed_at ?? course.observed_at,
          source,
          activityId: activity.activity_id,
        })
      );
    }
    const totalApplicable = applicableActivities.length;
    const expectedCount = expectedActivities.length;
    const completedCount = completedActivities.length;
    const completedExpectedCount = completedExpected.length;
    const expectedProgress = totalApplicable > 0 ? expectedCount / totalApplicable : 0;
    const actualProgress = totalApplicable > 0 ? completedCount / totalApplicable : 0;
    const timelineCompliance = expectedCount > 0 ? completedExpectedCount / expectedCount : null;

    const assessments: NormalizedAssessmentEvidence[] = [];
    for (const quiz of course.quizzes) {
      const activity = activitiesById.get(quiz.activity_id);
      if (!activityIsApplicable(activity)) continue;
      const student = quiz.students.find((item) => item.student_id === studentId);
      if (!student) {
        incompleteReasons.push(`QUIZ_STUDENT_FACTS_MISSING:${quiz.activity_id}`);
        continue;
      }
      const finalGrade = student.final_grade;
      const gradeMax = quiz.grade_max;
      const scoreRatio = finalGrade !== null && gradeMax !== null && gradeMax > 0 ? finalGrade / gradeMax : null;
      let academicStatus: NormalizedAssessmentEvidence['academic_status'] = 'NOT_ATTEMPTED';
      let performanceSignal: NormalizedAssessmentEvidence['performance_signal'] = 'NONE';
      if (student.final_grade_state === 'PENDING') {
        academicStatus = 'PENDING_GRADE';
      } else if (student.final_grade_state === 'AVAILABLE' && finalGrade !== null) {
        if (quiz.grade_to_pass.configured && quiz.grade_to_pass.value !== null) {
          academicStatus = finalGrade >= quiz.grade_to_pass.value ? 'PASS' : 'FAIL';
          performanceSignal = academicStatus === 'FAIL' ? 'FAIL' : 'NONE';
        } else {
          academicStatus = 'NO_PASS_CRITERION';
          performanceSignal = scoreRatio !== null && scoreRatio < this.profile.performance.low_score_ratio_threshold
            ? 'LOW_SCORE'
            : 'NONE';
        }
      }
      const observedCandidates = [
        ...student.attempts.map((attempt) => attempt.finished_at ?? attempt.started_at ?? 0),
        activity?.due_at ?? 0,
      ].filter((value) => value > 0);
      const observedAt = observedCandidates.length > 0 ? Math.max(...observedCandidates) : course.observed_at;
      const id = addEvidence(evidence, {
        studentId,
        kind: 'ASSESSMENT_RESULT',
        state: academicStatus,
        value: finalGrade,
        observedAt,
        source: student.source_ref,
        activityId: quiz.activity_id,
      });
      assessments.push({
        evidence_id: id,
        activity_id: quiz.activity_id,
        activity_type: 'quiz',
        observed_at: observedAt,
        due_at: quiz.time_close ?? activity?.due_at ?? null,
        academic_status: academicStatus,
        performance_signal: performanceSignal,
        final_grade: finalGrade,
        grade_max: gradeMax,
        grade_to_pass: quiz.grade_to_pass.configured ? quiz.grade_to_pass.value : null,
        score_ratio: scoreRatio,
        source_ref: student.source_ref,
      });
    }

    for (const assignment of course.assignments) {
      const activity = activitiesById.get(assignment.activity_id);
      if (!activityIsApplicable(activity)) continue;
      const student = assignment.students.find((item) => item.student_id === studentId);
      if (!student) {
        incompleteReasons.push(`ASSIGNMENT_STUDENT_FACTS_MISSING:${assignment.activity_id}`);
        continue;
      }
      const finalGrade = student.grade;
      const gradeMax = assignment.grade_max;
      const scoreRatio = finalGrade !== null && gradeMax !== null && gradeMax > 0 ? finalGrade / gradeMax : null;
      let academicStatus: NormalizedAssessmentEvidence['academic_status'] = 'NOT_ATTEMPTED';
      let performanceSignal: NormalizedAssessmentEvidence['performance_signal'] = 'NONE';
      if (student.grade_state === 'PENDING') {
        academicStatus = 'PENDING_GRADE';
      } else if (student.grade_state === 'AVAILABLE' && finalGrade !== null) {
        if (assignment.grade_to_pass.configured && assignment.grade_to_pass.value !== null) {
          academicStatus = finalGrade >= assignment.grade_to_pass.value ? 'PASS' : 'FAIL';
          performanceSignal = academicStatus === 'FAIL' ? 'FAIL' : 'NONE';
        } else {
          academicStatus = 'NO_PASS_CRITERION';
          performanceSignal = scoreRatio !== null && scoreRatio < this.profile.performance.low_score_ratio_threshold
            ? 'LOW_SCORE'
            : 'NONE';
        }
      }
      const observedAt = student.graded_at ?? student.modified_at ?? activity?.due_at ?? course.observed_at;
      const id = addEvidence(evidence, {
        studentId,
        kind: 'ASSESSMENT_RESULT',
        state: academicStatus,
        value: finalGrade,
        observedAt,
        source: student.source_ref,
        activityId: assignment.activity_id,
      });
      assessments.push({
        evidence_id: id,
        activity_id: assignment.activity_id,
        activity_type: 'assignment',
        observed_at: observedAt,
        due_at: assignment.due_at ?? activity?.due_at ?? null,
        academic_status: academicStatus,
        performance_signal: performanceSignal,
        final_grade: finalGrade,
        grade_max: gradeMax,
        grade_to_pass: assignment.grade_to_pass.configured ? assignment.grade_to_pass.value : null,
        score_ratio: scoreRatio,
        source_ref: student.source_ref,
      });
    }

    const submissions: NormalizedSubmissionEvidence[] = [];
    for (const quiz of course.quizzes) {
      const activity = activitiesById.get(quiz.activity_id);
      if (!activityIsApplicable(activity)) continue;
      const student = quiz.students.find((item) => item.student_id === studentId);
      if (!student) continue;
      const dueAt = quiz.time_close ?? activity?.due_at ?? null;
      const submittedAt = student.attempts.reduce<number | null>((latest, attempt) => {
        if (!quizAttemptIsSubmitted(attempt)) return latest;
        const candidate = attempt.finished_at!;
        return latest === null ? candidate : Math.max(latest, candidate);
      }, null);
      let state: NormalizedSubmissionEvidence['state'];
      if (submittedAt !== null) state = dueAt !== null && submittedAt > dueAt ? 'SUBMITTED_LATE' : 'ON_TIME';
      else if (dueAt !== null && dueAt <= course.observed_at) state = 'OVERDUE';
      else if (dueAt !== null) state = 'NOT_DUE';
      else state = 'NOT_ATTEMPTED';
      const id = addEvidence(evidence, {
        studentId,
        kind: 'SUBMISSION_STATE',
        state,
        value: submittedAt,
        observedAt: course.observed_at,
        source: student.source_ref,
        activityId: quiz.activity_id,
      });
      submissions.push({
        evidence_id: id,
        activity_id: quiz.activity_id,
        activity_type: 'quiz',
        state,
        due_at: dueAt,
        submitted_at: submittedAt,
        recovery_not_available: state === 'OVERDUE' && quiz.attempts_allowed === 1 && quiz.time_close !== null && quiz.time_close <= course.observed_at,
        source_ref: student.source_ref,
      });
    }

    for (const assignment of course.assignments) {
      const activity = activitiesById.get(assignment.activity_id);
      if (!activityIsApplicable(activity)) continue;
      const student = assignment.students.find((item) => item.student_id === studentId);
      if (!student) continue;
      const dueAt = assignment.due_at ?? activity?.due_at ?? null;
      const submittedAt = student.submission_state === 'SUBMITTED' ? student.submitted_at : null;
      let state: NormalizedSubmissionEvidence['state'];
      if (submittedAt !== null) state = dueAt !== null && submittedAt > dueAt ? 'SUBMITTED_LATE' : 'ON_TIME';
      else if (dueAt !== null && dueAt <= course.observed_at) state = 'OVERDUE';
      else if (dueAt !== null) state = 'NOT_DUE';
      else state = 'NOT_ATTEMPTED';
      const id = addEvidence(evidence, {
        studentId,
        kind: 'SUBMISSION_STATE',
        state,
        value: submittedAt,
        observedAt: course.observed_at,
        source: student.source_ref,
        activityId: assignment.activity_id,
      });
      submissions.push({
        evidence_id: id,
        activity_id: assignment.activity_id,
        activity_type: 'assignment',
        state,
        due_at: dueAt,
        submitted_at: submittedAt,
        recovery_not_available: false,
        source_ref: student.source_ref,
      });
    }

    const problemActivityIds = new Set<number>();
    for (const assessment of assessments) {
      if (assessment.performance_signal === 'FAIL' || assessment.performance_signal === 'LOW_SCORE') {
        problemActivityIds.add(assessment.activity_id);
      }
    }
    for (const submission of submissions) {
      if (submission.state === 'OVERDUE') problemActivityIds.add(submission.activity_id);
    }

    const competencies: NormalizedCompetencyEvidence[] = [];
    for (const competency of course.competencies.course_competencies) {
      const rating = course.competencies.ratings.find(
        (item) => item.student_id === studentId && item.competency_id === competency.competency_id
      );
      const relatedActivityIds = course.competencies.activity_links
        .filter((link) => link.competency_id === competency.competency_id)
        .map((link) => link.activity_id);
      const hasRelatedProblem = relatedActivityIds.some((activityId) => problemActivityIds.has(activityId));
      let state: NormalizedCompetencyEvidence['state'];
      if (rating?.proficiency === false) state = 'CONFIRMED_GAP';
      else if (rating?.proficiency === true) state = 'PROFICIENT';
      else if (hasRelatedProblem) state = 'COMPETENCY_CONCERN';
      else state = 'NOT_RATED';
      const source = rating?.source_ref ?? competency.source_ref;
      const id = addEvidence(evidence, {
        studentId,
        kind: 'COMPETENCY_STATE',
        state,
        value: rating?.grade ?? null,
        observedAt: rating?.rated_at ?? course.observed_at,
        source,
        competencyId: competency.competency_id,
      });
      competencies.push({
        evidence_id: id,
        competency_id: competency.competency_id,
        state,
        review_pending: rating?.review_state === 'WAITING_FOR_REVIEW' || rating?.review_state === 'IN_REVIEW',
        related_activity_ids: relatedActivityIds,
        source_ref: source,
      });
    }

    return {
      student_id: studentId,
      course_id: course.course.course_id,
      data_as_of: course.observed_at,
      evaluation_status: incompleteReasons.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
      incomplete_reasons: incompleteReasons,
      progress: {
        total_applicable: totalApplicable,
        expected_count: expectedCount,
        completed_count: completedCount,
        completed_expected_count: completedExpectedCount,
        expected_progress: expectedProgress,
        actual_progress: actualProgress,
        progress_gap_pp: totalApplicable > 0 ? Math.max(0, ((expectedCount - completedCount) * 100) / totalApplicable) : 0,
        timeline_compliance: timelineCompliance,
        evidence_refs: progressEvidenceRefs,
      },
      assessments,
      competencies,
      submissions,
      evidence,
    };
  }
}
