export type NonEmptyArray<T> = [T, ...T[]];
export type AtLeastTwo<T> = [T, T, ...T[]];

export type PlanType = "course" | "assignment" | "quiz";
export type PlanOperation = "create" | "update";

export interface SourceReference {
  source: string;
  page?: number;
  section?: string;
  text?: string;
}

export interface CourseDefinition {
  title: string;
  course_code?: string;
  summary?: string;
}

export interface AssignmentPlan {
  ref: string;
  type: "assignment";
  title: string;
  description: string;
  instructions: NonEmptyArray<string>;
  learning_objectives: NonEmptyArray<string>;
  grade: number;
  source_refs: SourceReference[];
}

export interface ChoicePlan {
  ref: string;
  text: string;
}

export interface FileResourcePlan {
  ref: string;
  type: "resource";
  title: string;
  filename: string;
  moodle_material_id: string | number;
  source_run_id: string;
  source_structure_revision: number;
  source_section_ref: string;
  source_material_revision: number;
  source_refs: SourceReference[];
}

export interface MultipleChoiceQuestionPlan {
  ref: string;
  type: "multichoice";
  question: string;
  choices: AtLeastTwo<ChoicePlan>;
  correct_choice_refs: [string];
  feedback: string;
  default_mark: number;
  source_refs: SourceReference[];
}

export interface TrueFalseQuestionPlan {
  ref: string;
  type: "truefalse";
  question: string;
  correct_answer: boolean;
  feedback: string;
  default_mark: number;
  source_refs: SourceReference[];
}

export interface ShortAnswerQuestionPlan {
  ref: string;
  type: "shortanswer";
  question: string;
  accepted_answers: NonEmptyArray<string>;
  case_sensitive: boolean;
  default_mark: number;
  source_refs: SourceReference[];
}

export interface EssayQuestionPlan {
  ref: string;
  type: "essay";
  question: string;
  grading_guidance: NonEmptyArray<string>;
  default_mark: number;
  source_refs: SourceReference[];
}

export type QuestionPlan =
  | MultipleChoiceQuestionPlan
  | TrueFalseQuestionPlan
  | ShortAnswerQuestionPlan
  | EssayQuestionPlan;

export interface QuizPlan {
  ref: string;
  type: "quiz";
  title: string;
  description: string;
  source_refs: SourceReference[];
  questions: QuestionPlan[];
}

export interface QuizUpdateContent {
  title: string;
  description: string;
  source_refs: SourceReference[];
  questions_to_add: QuestionPlan[];
  questions_to_update: QuestionPlan[];
}

export type ActivityPlan = AssignmentPlan | QuizPlan;

export interface SectionPlan {
  ref: string;
  position: number;
  title: string;
  summary?: string;
  source_refs: SourceReference[];
  activities: ActivityPlan[];
  resources?: FileResourcePlan[];
}

export interface CoursePlanContent {
  course: CourseDefinition;
  sections: NonEmptyArray<SectionPlan>;
}

export interface PlanEnvelope<
  TPlanType extends PlanType,
  TOperation extends PlanOperation,
  TContent,
> {
  schema_version: "0.1";
  plan_id: string;
  revision: number;
  plan_type: TPlanType;
  operation: TOperation;
  title: string;
  summary: string;
  warnings: string[];
  assumptions: string[];
  content: TContent;
}

export type AnyPlanEnvelope = PlanEnvelope<
  PlanType,
  PlanOperation,
  Record<string, unknown>
>;

export type CoursePlanEnvelope = PlanEnvelope<
  "course",
  PlanOperation,
  CoursePlanContent
>;

export type AssignmentPlanEnvelope = PlanEnvelope<
  "assignment",
  PlanOperation,
  AssignmentPlan
>;

export type QuizCreatePlanEnvelope = PlanEnvelope<"quiz", "create", QuizPlan>;
export type QuizUpdatePlanEnvelope = PlanEnvelope<
  "quiz",
  "update",
  QuizUpdateContent
>;

export type PlanningContract =
  | CoursePlanEnvelope
  | AssignmentPlanEnvelope
  | QuizCreatePlanEnvelope
  | QuizUpdatePlanEnvelope;

export interface CourseCreateTarget {
  category_id: number;
}

export interface ExistingSectionTarget {
  course_id: number;
  section_id: number;
}

export interface AssignmentUpdateTarget extends ExistingSectionTarget {
  activity_id: number;
}

export interface QuizUpdateTarget extends ExistingSectionTarget {
  quiz_id: number;
}

export type ExecutionTarget =
  | CourseCreateTarget
  | ExistingSectionTarget
  | AssignmentUpdateTarget
  | QuizUpdateTarget;

export interface ExecutionRequest {
  plan_id: string;
  revision: number;
  target: ExecutionTarget;
}
