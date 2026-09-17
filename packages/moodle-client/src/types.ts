/**
 * Types and interfaces for @moodle-agent-poc/moodle-client
 */

export interface MoodleClientConfig {
  /** Moodle root base URL, e.g. http://localhost:8000 (P8-D1). */
  baseUrl: string;
  /** Moodle Web Service token. */
  token: string;
  /** Request timeout in milliseconds (default: 30000) (R13). */
  timeoutMs?: number;
  /** Optional custom fetch implementation for dependency injection / testing. */
  fetch?: typeof fetch;
}

export type SupportedQuestionType = 'multichoice' | 'truefalse' | 'shortanswer' | 'essay';

export interface MultichoiceOptionChoice {
  text: string;
  fraction: 0 | 1;
  feedback?: string;
}

export interface MultichoiceQuestionOptions {
  choices: MultichoiceOptionChoice[];
  shuffleAnswers?: boolean;
  single?: boolean;
}

export interface TrueFalseQuestionOptions {
  correctAnswer: boolean;
  feedbackTrue?: string;
  feedbackFalse?: string;
}

export interface ShortAnswerQuestionOptions {
  acceptedAnswers: string[];
  caseSensitive?: boolean;
  feedback?: string;
}

export interface EssayQuestionOptions {
  gradingGuidance?: string;
  responseFormat?: string;
  minWordLimit?: number;
  maxWordLimit?: number;
}

export type QuestionOptions =
  | MultichoiceQuestionOptions
  | TrueFalseQuestionOptions
  | ShortAnswerQuestionOptions
  | EssayQuestionOptions;

export interface CreateCourseParams {
  categoryId: number;
  fullname: string;
  shortname: string;
  summary?: string;
  format?: string;
}

export interface CreateSectionParams {
  courseId: number;
  position: number;
  name: string;
  summary?: string;
}

export interface CreateCompetencyParams {
  frameworkId: number;
  idnumber: string;
  shortname: string;
  description: string;
}

export interface AddCompetencyToCourseParams { courseId: number; competencyId: number; }
export interface AddCompetencyToActivityParams { activityId: number; competencyId: number; ruleOutcome: 'none' | 'evidence'; }

export interface CreateResourceParams {
  courseId: number;
  sectionId: number;
  name: string;
  filename: string;
  moodleMaterialId: number;
  sourceRunId: string;
  sourceStructureRevision: number;
  sourceSectionRef: string;
  sourceMaterialRevision: number;
}

export interface CreateAssignmentParams {
  courseId: number;
  sectionId: number;
  name: string;
  intro: string;
  grade?: number;
}

export interface UpdateAssignmentParams {
  activityId: number;
  expectedCourseId?: number;
  expectedSectionId?: number;
  name?: string;
  intro?: string;
  grade?: number;
}

export interface CreateQuizParams {
  courseId: number;
  sectionId: number;
  name: string;
  intro?: string;
  grade?: number;
}

export interface UpdateQuizParams {
  activityId: number;
  name?: string;
  intro?: string;
}

export interface CreateQuizQuestionParamsBase {
  activityId: number;
  name: string;
  questionText: string;
  defaultMark?: number;
  generalFeedback?: string;
}

export interface CreateMultichoiceQuestionParams extends CreateQuizQuestionParamsBase {
  qtype: 'multichoice';
  options: MultichoiceQuestionOptions;
}

export interface CreateTrueFalseQuestionParams extends CreateQuizQuestionParamsBase {
  qtype: 'truefalse';
  options: TrueFalseQuestionOptions;
}

export interface CreateShortAnswerQuestionParams extends CreateQuizQuestionParamsBase {
  qtype: 'shortanswer';
  options: ShortAnswerQuestionOptions;
}

export interface CreateEssayQuestionParams extends CreateQuizQuestionParamsBase {
  qtype: 'essay';
  options?: EssayQuestionOptions;
}

export type CreateQuizQuestionParams =
  | CreateMultichoiceQuestionParams
  | CreateTrueFalseQuestionParams
  | CreateShortAnswerQuestionParams
  | CreateEssayQuestionParams;

export interface UpdateQuizQuestionParamsBase {
  questionBankEntryId: number;
  activityId?: number;
  maxMark?: number;
  expectedVersion?: number;
  name?: string;
  questionText?: string;
  defaultMark?: number;
  generalFeedback?: string;
}

export interface UpdateMultichoiceQuestionParams extends UpdateQuizQuestionParamsBase {
  qtype: 'multichoice';
  options: MultichoiceQuestionOptions;
}

export interface UpdateTrueFalseQuestionParams extends UpdateQuizQuestionParamsBase {
  qtype: 'truefalse';
  options: TrueFalseQuestionOptions;
}

export interface UpdateShortAnswerQuestionParams extends UpdateQuizQuestionParamsBase {
  qtype: 'shortanswer';
  options: ShortAnswerQuestionOptions;
}

export interface UpdateEssayQuestionParams extends UpdateQuizQuestionParamsBase {
  qtype: 'essay';
  options: EssayQuestionOptions;
}

/** Metadata-only update without option changes. */
export interface UpdateQuizQuestionMetadataOnly extends UpdateQuizQuestionParamsBase {
  qtype?: never;
  options?: never;
}

export type UpdateQuizQuestionParams =
  | UpdateMultichoiceQuestionParams
  | UpdateTrueFalseQuestionParams
  | UpdateShortAnswerQuestionParams
  | UpdateEssayQuestionParams
  | UpdateQuizQuestionMetadataOnly;

export interface AddQuestionToQuizParams {
  activityId: number;
  questionBankEntryId: number;
  page?: number;
  maxMark?: number;
}

export interface MoodleCategory {
  id: number;
  name: string;
  idnumber: string;
  description: string;
  parent: number;
  coursecount: number;
  visible: number;
}

export interface MoodleCourseFormat {
  value: string;
  name: string;
}

export interface MoodleCreatedCourse {
  courseId: number;
  fullname: string;
  shortname: string;
  categoryId: number;
  visible: number;
  format: string;
}

export interface MoodleCreatedSection {
  sectionId: number;
  sectionNum: number;
  name: string;
  summary: string;
}

export interface MoodleCompetencyFramework { frameworkId: number; shortname: string; idnumber: string; visible: boolean; canManage: boolean; }
export interface MoodleCreatedCompetency { competencyId: number; frameworkId: number; idnumber: string; shortname: string; created: boolean; }
export interface MoodleCourseCompetencyLink { courseId: number; competencyId: number; linked: boolean; }
export interface MoodleActivityCompetencyLink { linkId: number; activityId: number; competencyId: number; ruleOutcome: number; }
export interface MoodleCourseCompetencyReadback {
  courseId: number;
  courseCompetencies: Array<{ courseLinkId: number; competencyId: number; frameworkId: number; idnumber: string; shortname: string }>;
  activityLinks: Array<{ linkId: number; activityId: number; competencyId: number; ruleOutcome: number }>;
}

export interface MoodleCreatedResource {
  activityId: number;
  resourceId: number;
  sectionId: number;
  name: string;
  filename: string;
  moodleMaterialId: number;
}

export interface MoodleCreatedAssignment {
  activityId: number;
  assignmentId: number;
  name: string;
  sectionId: number;
  grade: number;
}

export interface MoodleAssignmentDetails {
  activityId: number;
  assignmentId: number;
  courseId: number;
  sectionId: number;
  name: string;
  intro: string;
  introFormat: number;
  grade: number;
  dueDate: number;
  onlineTextEnabled: number;
  fileEnabled: number;
}

export interface MoodleUpdatedAssignment {
  activityId: number;
  assignmentId: number;
  name: string;
  intro: string;
  grade: number;
}

export interface MoodleCreatedQuiz {
  activityId: number;
  quizId: number;
  name: string;
  sectionId: number;
  grade: number;
}

export interface MoodleQuizDetails {
  activityId: number;
  quizId: number;
  courseId: number;
  name: string;
  intro: string;
  grade: number;
  preferredbehaviour: string;
  attempts: number;
  shuffleanswers: number;
  questionsCount: number;
  sumgrades: number;
}

export interface MoodleUpdatedQuiz {
  activityId: number;
  quizId: number;
  name: string;
  intro: string;
}

export interface MoodleQuizQuestionAnswer {
  id: number;
  text: string;
  fraction: number;
  feedback: string;
}

export interface MoodleQuizQuestionSlot {
  slotId: number;
  slotNumber: number;
  page: number;
  maxMark: number;
  questionBankEntryId: number;
  questionId: number;
  version: number;
  name: string;
  qtype: SupportedQuestionType;
  questionText: string;
  defaultMark: number;
  answers: MoodleQuizQuestionAnswer[];
  generalFeedback?: string;
  correctAnswer?: boolean;
  caseSensitive?: boolean;
  gradingGuidance?: string;
}

export interface MoodleCreatedQuestion {
  questionBankEntryId: number;
  questionId: number;
  version: number;
  name: string;
  qtype: SupportedQuestionType;
  defaultMark: number;
  categoryId: number;
}

export interface MoodleUpdatedQuestion {
  questionBankEntryId: number;
  previousQuestionId: number;
  questionId: number;
  version: number;
  name: string;
  qtype: SupportedQuestionType;
  defaultMark: number;
}

export interface MoodleAddedQuestionSlot {
  slotId: number;
  activityId: number;
  quizId: number;
  questionBankEntryId: number;
  questionId: number;
  slotNumber: number;
  page: number;
  maxMark: number;
}

export interface MoodleStructureActivity {
  activityId: number;
  instanceId: number;
  moduleName: string;
  name: string;
  intro: string;
  grade: number;
  files?: string[];
}

export interface MoodleStructureSection {
  sectionId: number;
  sectionNum: number;
  name: string;
  summary: string;
  activities: MoodleStructureActivity[];
}

export interface MoodleCourseStructure {
  course: {
    id: number;
    fullname: string;
    shortname: string;
    categoryId: number;
    visible: number;
    format?: string;
  };
  sections: MoodleStructureSection[];
}

export interface RawMoodleException {
  exception?: string;
  errorcode?: string;
  message?: string;
  debuginfo?: string;
}
