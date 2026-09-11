import type {
  CourseRiskEvidence,
  MoodleRiskSourceReference,
} from '@moodle-agent-poc/contracts';

export const NOW = 1_789_030_000;
export const STUDENT = 101;

export function ref(
  entityType: string,
  entityId: string | number,
  activityId?: number,
  studentId?: number
): MoodleRiskSourceReference {
  return {
    source: 'moodle',
    component: entityType.startsWith('competency') ? 'core_competency' : 'fixture',
    entity_type: entityType,
    entity_id: String(entityId),
    course_id: 77,
    ...(activityId !== undefined ? { activity_id: activityId } : {}),
    ...(studentId !== undefined ? { student_id: studentId } : {}),
  };
}

export function baseEvidence(): CourseRiskEvidence {
  return {
    schema_version: '0.1',
    observed_at: NOW,
    course: {
      course_id: 77,
      fullname: 'Risk Fixture',
      shortname: 'RISK-77',
      format: 'topics',
      start_at: NOW - 30 * 86400,
      end_at: NOW + 30 * 86400,
    },
    dataset_status: [
      'enrolments', 'timeline', 'completion', 'quizzes', 'assignments', 'competencies',
    ].map((dataset) => ({
      dataset: dataset as 'enrolments' | 'timeline' | 'completion' | 'quizzes' | 'assignments' | 'competencies',
      status: 'OK' as const,
      observed_at: NOW,
    })),
    enrolments: [{
      student_id: STUDENT,
      active: true,
      enrolled_at: NOW - 40 * 86400,
      source_ref: ref('user_enrolment', STUDENT, undefined, STUDENT),
    }],
    activities: [],
    completion: [],
    quizzes: [],
    assignments: [],
    competencies: {
      course_competencies: [],
      activity_links: [],
      ratings: [],
    },
  };
}

export function addProgressActivities(
  evidence: CourseRiskEvidence,
  count: number,
  completed: number,
  dueAt = NOW - 3600
): void {
  for (let index = 0; index < count; index += 1) {
    const activityId = 1000 + index;
    evidence.activities.push({
      activity_id: activityId,
      instance_id: activityId,
      module_name: 'page',
      section_id: 2000 + index,
      section_num: index + 1,
      name: `Progress ${index + 1}`,
      visible: true,
      completion_tracking: 'AUTOMATIC',
      completion_expected_at: dueAt,
      available_from: null,
      available_until: null,
      due_at: dueAt,
      source_ref: ref('course_module', activityId, activityId),
    });
    evidence.completion.push({
      student_id: STUDENT,
      activity_id: activityId,
      state: index < completed ? 'COMPLETE' : 'INCOMPLETE',
      completed_at: index < completed ? dueAt - 100 : null,
      source_ref: ref('course_modules_completion', `${activityId}:${STUDENT}`, activityId, STUDENT),
    });
  }
}

export function addQuiz(
  evidence: CourseRiskEvidence,
  params: {
    activityId: number;
    grade: number | null;
    gradeMax?: number;
    gradeToPass?: number | null;
    gradeState?: 'AVAILABLE' | 'PENDING' | 'NOT_ATTEMPTED';
    dueOffsetDays?: number;
    attemptsAllowed?: number | null;
    attempted?: boolean;
  }
): void {
  const gradeMax = params.gradeMax ?? 100;
  const dueAt = NOW + (params.dueOffsetDays ?? -1) * 86400;
  const attempted = params.attempted ?? params.gradeState !== 'NOT_ATTEMPTED';
  evidence.activities.push({
    activity_id: params.activityId,
    instance_id: params.activityId + 5000,
    module_name: 'quiz',
    section_id: 3,
    section_num: 1,
    name: `Quiz ${params.activityId}`,
    visible: true,
    completion_tracking: 'NONE',
    completion_expected_at: null,
    available_from: null,
    available_until: null,
    due_at: dueAt,
    source_ref: ref('course_module', params.activityId, params.activityId),
  });
  evidence.quizzes.push({
    activity_id: params.activityId,
    quiz_id: params.activityId + 5000,
    time_open: NOW - 10 * 86400,
    time_close: dueAt,
    attempts_allowed: params.attemptsAllowed ?? null,
    raw_score_max: gradeMax,
    grade_max: gradeMax,
    grade_to_pass: {
      configured: params.gradeToPass !== null && params.gradeToPass !== undefined,
      value: params.gradeToPass ?? null,
      source_ref: params.gradeToPass !== null && params.gradeToPass !== undefined
        ? ref('grade_item', params.activityId, params.activityId)
        : null,
    },
    students: [{
      student_id: STUDENT,
      final_grade_state: params.gradeState ?? (params.grade === null ? 'PENDING' : 'AVAILABLE'),
      final_grade: params.grade,
      attempts: attempted ? [{
        attempt_id: params.activityId + 9000,
        attempt_no: 1,
        state: params.grade === null ? 'finished' : 'finished',
        started_at: dueAt - 3600,
        finished_at: dueAt - 1800,
        raw_score: params.grade,
        source_ref: ref('quiz_attempt', params.activityId + 9000, params.activityId, STUDENT),
      }] : [],
      source_ref: ref('quiz_grade', `${params.activityId}:${STUDENT}`, params.activityId, STUDENT),
    }],
    source_ref: ref('quiz', params.activityId + 5000, params.activityId),
  });
}

export function addAssignment(
  evidence: CourseRiskEvidence,
  params: {
    activityId: number;
    submission: 'NOT_ATTEMPTED' | 'DRAFT' | 'SUBMITTED';
    dueOffsetDays?: number;
    submittedOffsetHours?: number | null;
    grade?: number | null;
    gradeToPass?: number | null;
  }
): void {
  const dueAt = NOW + (params.dueOffsetDays ?? -1) * 86400;
  const submittedAt = params.submission === 'SUBMITTED'
    ? dueAt + (params.submittedOffsetHours ?? -1) * 3600
    : null;
  evidence.activities.push({
    activity_id: params.activityId,
    instance_id: params.activityId + 6000,
    module_name: 'assign',
    section_id: 4,
    section_num: 1,
    name: `Assignment ${params.activityId}`,
    visible: true,
    completion_tracking: 'NONE',
    completion_expected_at: null,
    available_from: null,
    available_until: null,
    due_at: dueAt,
    source_ref: ref('course_module', params.activityId, params.activityId),
  });
  const grade = params.grade ?? null;
  evidence.assignments.push({
    activity_id: params.activityId,
    assignment_id: params.activityId + 6000,
    due_at: dueAt,
    cutoff_at: null,
    grade_max: 100,
    grade_to_pass: {
      configured: params.gradeToPass !== null && params.gradeToPass !== undefined,
      value: params.gradeToPass ?? null,
      source_ref: params.gradeToPass !== null && params.gradeToPass !== undefined
        ? ref('grade_item', params.activityId, params.activityId)
        : null,
    },
    students: [{
      student_id: STUDENT,
      submission_state: params.submission,
      submitted_at: submittedAt,
      modified_at: submittedAt,
      attempt_no: params.submission === 'NOT_ATTEMPTED' ? null : 0,
      grade_state: grade !== null ? 'AVAILABLE' : params.submission === 'NOT_ATTEMPTED' ? 'NOT_ATTEMPTED' : 'PENDING',
      grade,
      graded_at: grade !== null ? NOW - 60 : null,
      source_ref: ref('assignment_submission', `${params.activityId}:${STUDENT}`, params.activityId, STUDENT),
    }],
    source_ref: ref('assign', params.activityId + 6000, params.activityId),
  });
}

export function addCompetency(
  evidence: CourseRiskEvidence,
  params: {
    competencyId: number;
    proficiency: boolean | null;
    activityId?: number;
    reviewState?: 'IDLE' | 'WAITING_FOR_REVIEW' | 'IN_REVIEW' | 'NOT_AVAILABLE';
  }
): void {
  evidence.competencies.course_competencies.push({
    competency_id: params.competencyId,
    shortname: `Competency ${params.competencyId}`,
    idnumber: `C-${params.competencyId}`,
    scale_id: 2,
    source_ref: ref('competency', params.competencyId),
  });
  if (params.activityId !== undefined) {
    evidence.competencies.activity_links.push({
      activity_id: params.activityId,
      competency_id: params.competencyId,
      rule_outcome: 1,
      source_ref: ref('competency_modulecomp', `${params.activityId}:${params.competencyId}`, params.activityId),
    });
  }
  evidence.competencies.ratings.push({
    student_id: STUDENT,
    competency_id: params.competencyId,
    grade: params.proficiency === null ? null : params.proficiency ? 2 : 1,
    proficiency: params.proficiency,
    rated_at: params.proficiency === null ? null : NOW - 30,
    review_state: params.reviewState ?? 'IDLE',
    evidence: [],
    source_ref: ref('competency_usercompcourse', `${STUDENT}:${params.competencyId}`, undefined, STUDENT),
  });
}
