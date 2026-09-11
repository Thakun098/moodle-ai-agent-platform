export type RiskEvidenceDatasetName =
  | "enrolments"
  | "timeline"
  | "completion"
  | "quizzes"
  | "assignments"
  | "competencies";

export type RiskEvidenceDatasetStatus = "OK" | "PARTIAL" | "UNAVAILABLE" | "ERROR";

export interface RiskEvidenceDatasetState {
  dataset: RiskEvidenceDatasetName;
  status: RiskEvidenceDatasetStatus;
  observed_at: number;
  message?: string;
}

export interface MoodleRiskSourceReference {
  source: "moodle";
  component: string;
  entity_type: string;
  entity_id: string;
  course_id: number;
  activity_id?: number;
  student_id?: number;
}

export interface CourseRiskEvidenceCourse {
  course_id: number;
  fullname: string;
  shortname: string;
  format: string;
  start_at: number | null;
  end_at: number | null;
}

export interface CourseRiskEvidenceEnrolment {
  student_id: number;
  active: boolean;
  enrolled_at: number | null;
  source_ref: MoodleRiskSourceReference;
}

export type RiskCompletionTracking = "NONE" | "MANUAL" | "AUTOMATIC";

export interface CourseRiskEvidenceActivity {
  activity_id: number;
  instance_id: number;
  module_name: string;
  section_id: number;
  section_num: number;
  name: string;
  visible: boolean;
  completion_tracking: RiskCompletionTracking;
  completion_expected_at: number | null;
  available_from: number | null;
  available_until: number | null;
  due_at: number | null;
  source_ref: MoodleRiskSourceReference;
}

export type RiskCompletionState =
  | "INCOMPLETE"
  | "COMPLETE"
  | "COMPLETE_PASS"
  | "COMPLETE_FAIL"
  | "UNKNOWN";

export interface CourseRiskEvidenceCompletion {
  student_id: number;
  activity_id: number;
  state: RiskCompletionState;
  completed_at: number | null;
  source_ref: MoodleRiskSourceReference;
}

export interface CourseRiskEvidenceGradeToPass {
  configured: boolean;
  value: number | null;
  source_ref: MoodleRiskSourceReference | null;
}

export type RiskAcademicGradeState =
  | "AVAILABLE"
  | "PENDING"
  | "NOT_ATTEMPTED"
  | "NOT_APPLICABLE"
  | "UNAVAILABLE";

export interface CourseRiskEvidenceQuizAttempt {
  attempt_id: number;
  attempt_no: number;
  state: string;
  started_at: number | null;
  finished_at: number | null;
  raw_score: number | null;
  source_ref: MoodleRiskSourceReference;
}

export interface CourseRiskEvidenceQuizStudent {
  student_id: number;
  final_grade_state: RiskAcademicGradeState;
  final_grade: number | null;
  attempts: CourseRiskEvidenceQuizAttempt[];
  source_ref: MoodleRiskSourceReference;
}

export interface CourseRiskEvidenceQuiz {
  activity_id: number;
  quiz_id: number;
  time_open: number | null;
  time_close: number | null;
  attempts_allowed: number | null;
  raw_score_max: number | null;
  grade_max: number | null;
  grade_to_pass: CourseRiskEvidenceGradeToPass;
  students: CourseRiskEvidenceQuizStudent[];
  source_ref: MoodleRiskSourceReference;
}

export type RiskAssignmentSubmissionState = "NOT_ATTEMPTED" | "DRAFT" | "SUBMITTED" | "UNKNOWN";

export interface CourseRiskEvidenceAssignmentStudent {
  student_id: number;
  submission_state: RiskAssignmentSubmissionState;
  submitted_at: number | null;
  modified_at: number | null;
  attempt_no: number | null;
  grade_state: RiskAcademicGradeState;
  grade: number | null;
  graded_at: number | null;
  source_ref: MoodleRiskSourceReference;
}

export interface CourseRiskEvidenceAssignment {
  activity_id: number;
  assignment_id: number;
  due_at: number | null;
  cutoff_at: number | null;
  grade_max: number | null;
  grade_to_pass: CourseRiskEvidenceGradeToPass;
  students: CourseRiskEvidenceAssignmentStudent[];
  source_ref: MoodleRiskSourceReference;
}

export interface CourseRiskEvidenceCompetency {
  competency_id: number;
  shortname: string;
  idnumber: string;
  scale_id: number;
  source_ref: MoodleRiskSourceReference;
}

export interface CourseRiskEvidenceCompetencyActivityLink {
  activity_id: number;
  competency_id: number;
  rule_outcome: number | null;
  source_ref: MoodleRiskSourceReference;
}

export type RiskCompetencyReviewState =
  | "IDLE"
  | "WAITING_FOR_REVIEW"
  | "IN_REVIEW"
  | "NOT_AVAILABLE";

export interface CourseRiskEvidenceCompetencyEvidenceItem {
  evidence_id: number;
  action: number;
  created_at: number;
  source_ref: MoodleRiskSourceReference;
}

export interface CourseRiskEvidenceCompetencyRating {
  student_id: number;
  competency_id: number;
  grade: number | null;
  proficiency: boolean | null;
  rated_at: number | null;
  review_state: RiskCompetencyReviewState;
  evidence: CourseRiskEvidenceCompetencyEvidenceItem[];
  source_ref: MoodleRiskSourceReference;
}

export interface CourseRiskEvidenceCompetencyDataset {
  course_competencies: CourseRiskEvidenceCompetency[];
  activity_links: CourseRiskEvidenceCompetencyActivityLink[];
  ratings: CourseRiskEvidenceCompetencyRating[];
}

export interface CourseRiskEvidence {
  schema_version: "0.1";
  observed_at: number;
  course: CourseRiskEvidenceCourse;
  dataset_status: RiskEvidenceDatasetState[];
  enrolments: CourseRiskEvidenceEnrolment[];
  activities: CourseRiskEvidenceActivity[];
  completion: CourseRiskEvidenceCompletion[];
  quizzes: CourseRiskEvidenceQuiz[];
  assignments: CourseRiskEvidenceAssignment[];
  competencies: CourseRiskEvidenceCompetencyDataset;
}
