export {
  EXECUTION_REQUEST_SCHEMA_ID,
  PLAN_ENVELOPE_SCHEMA_ID,
  PLANNING_CONTRACTS_SCHEMA_ID,
  SOURCE_REFERENCE_SCHEMA_ID,
  UnknownPlanningSchemaError,
  isPlanEnvelope,
  isExecutionRequest,
  isPlanningContract,
  isSourceReference,
  listPlanningSchemaIds,
  validateAgainstPlanningSchema,
  validateExecutionRequest,
  validatePlanEnvelope,
  validatePlanningContract,
  validateSourceReference,
} from "./validation/planning-contract-validator.js";

export {
  VERIFICATION_RESULT_SCHEMA_ID,
  isVerificationResult,
  validateVerificationResult,
} from "./validation/verification-result-validator.js";

export {
  NORMALIZED_SYLLABUS_SCHEMA_ID,
  isNormalizedSyllabus,
  validateNormalizedSyllabus,
} from "./validation/syllabus-validator.js";

export {
  STUDENT_RISK_RESULT_SCHEMA_ID,
  isStudentRiskResultV01,
  validateStudentRiskResult,
} from "./validation/student-risk-result-validator.js";

export {
  COURSE_RISK_EVIDENCE_SCHEMA_ID,
  isCourseRiskEvidence,
  validateCourseRiskEvidence,
} from "./validation/course-risk-evidence-validator.js";

export type {
  ContractValidationError,
  ContractValidationResult,
} from "./validation/planning-contract-validator.js";

export type {
  ActivityPlan,
  AnyPlanEnvelope,
  AssignmentPlan,
  AssignmentPlanEnvelope,
  AtLeastTwo,
  ChoicePlan,
  CourseDefinition,
  CoursePlanContent,
  CoursePlanEnvelope,
  EssayQuestionPlan,
  ExecutionRequest,
  FileResourcePlan,
  ExecutionTarget,
  ExistingSectionTarget,
  AssignmentUpdateTarget,
  CourseCreateTarget,
  MultipleChoiceQuestionPlan,
  NonEmptyArray,
  PlanEnvelope,
  PlanOperation,
  PlanningContract,
  PlanType,
  QuestionPlan,
  QuizCreatePlanEnvelope,
  QuizPlan,
  QuizUpdateContent,
  QuizUpdatePlanEnvelope,
  QuizUpdateTarget,
  SectionPlan,
  ShortAnswerQuestionPlan,
  SourceReference,
  TrueFalseQuestionPlan,
} from "./planning/contracts.js";

export type {
  VerificationFailedResult,
  VerificationIssue,
  VerificationIssueKind,
  VerificationPassedResult,
  VerificationResult,
} from "./verification/contracts.js";

export { compareQuestionReadback, type ObservedQuestion } from "./verification/question-comparison.js";

export type {
  NormalizedSyllabus,
  SyllabusMetadata,
  SyllabusScheduleItem,
  SyllabusSourceLocation,
} from "./syllabus/contracts.js";

export type {
  CourseRiskEvidence,
  CourseRiskEvidenceActivity,
  CourseRiskEvidenceAssignment,
  CourseRiskEvidenceAssignmentStudent,
  CourseRiskEvidenceCompetency,
  CourseRiskEvidenceCompetencyActivityLink,
  CourseRiskEvidenceCompetencyDataset,
  CourseRiskEvidenceCompetencyEvidenceItem,
  CourseRiskEvidenceCompetencyRating,
  CourseRiskEvidenceCompletion,
  CourseRiskEvidenceCourse,
  CourseRiskEvidenceEnrolment,
  CourseRiskEvidenceGradeToPass,
  CourseRiskEvidenceQuiz,
  CourseRiskEvidenceQuizAttempt,
  CourseRiskEvidenceQuizStudent,
  MoodleRiskSourceReference,
  RiskAcademicGradeState,
  RiskAssignmentSubmissionState,
  RiskCompetencyReviewState,
  RiskCompletionState,
  RiskCompletionTracking,
  RiskEvidenceDatasetName,
  RiskEvidenceDatasetState,
  RiskEvidenceDatasetStatus,
} from "./risk/contracts.js";

export type * from "./syllabus/core-course-design-context.js";
export type * from "./instructional-design/competency-candidates.js";

export { assertInitialCoreCourseDesignContext } from "./validation/core-course-design-context-validator.js";
