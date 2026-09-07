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

export interface CreateAssignmentParams {
  courseId: number;
  sectionId: number;
  name: string;
  intro: string;
  grade?: number;
}

export interface UpdateAssignmentParams {
  activityId: number;
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
  };
  sections: MoodleStructureSection[];
}

export interface RawMoodleException {
  exception?: string;
  errorcode?: string;
  message?: string;
  debuginfo?: string;
}
