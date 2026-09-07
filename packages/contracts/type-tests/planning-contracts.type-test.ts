import type {
  AssignmentPlan,
  CourseDefinition,
  CoursePlanEnvelope,
  ExecutionRequest,
  ExecutionTarget,
  EssayQuestionPlan,
  MultipleChoiceQuestionPlan,
  PlanningContract,
  QuestionPlan,
  QuizCreatePlanEnvelope,
  QuizUpdateContent,
  QuizUpdatePlanEnvelope,
  SectionPlan,
  ShortAnswerQuestionPlan,
  SourceReference,
  TrueFalseQuestionPlan,
} from "../src/index.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Assert<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;
type IsAssignable<A, B> = [A] extends [B] ? true : false;

type _SourceRequired = Assert<Equal<Required<Pick<SourceReference, "source">>, { source: string }>>;
type _CourseTitleRequired = Assert<Equal<Required<Pick<CourseDefinition, "title">>, { title: string }>>;
type _SectionSummaryOptional = Assert<Equal<Pick<SectionPlan, "summary">, { summary?: string }>>;
type _OneCorrectChoice = Assert<Equal<MultipleChoiceQuestionPlan["correct_choice_refs"], [string]>>;
type _ShortAnswerNonEmpty = Assert<IsAssignable<[string], ShortAnswerQuestionPlan["accepted_answers"]>>;
type _EssayGuidanceNonEmpty = Assert<IsAssignable<[string], EssayQuestionPlan["grading_guidance"]>>;
type _QuizUpdateHasNoQuestions = Assert<Not<"questions" extends keyof QuizUpdateContent ? true : false>>;
type _QuizCreateNotUpdate = Assert<Not<IsAssignable<QuizCreatePlanEnvelope, QuizUpdatePlanEnvelope>>>;
type _ExecutionRequestDoesNotDuplicatePlanType = Assert<
  Not<"plan_type" extends keyof ExecutionRequest ? true : false>
>;
type _ExecutionRequestDoesNotDuplicateOperation = Assert<
  Not<"operation" extends keyof ExecutionRequest ? true : false>
>;
type _QuestionUnion = Assert<
  Equal<
    QuestionPlan,
    | MultipleChoiceQuestionPlan
    | TrueFalseQuestionPlan
    | ShortAnswerQuestionPlan
    | EssayQuestionPlan
  >
>;

const assignment: AssignmentPlan = {
  ref: "assignment-01",
  type: "assignment",
  title: "Practical AI",
  description: "Apply AI concepts.",
  instructions: ["Choose one scenario."],
  learning_objectives: ["Apply an AI concept."],
  grade: 100,
  source_refs: [],
};

const coursePlan = {
  schema_version: "0.1",
  plan_id: "33333333-3333-4333-8333-333333333333",
  revision: 1,
  plan_type: "course",
  operation: "create",
  title: "Create AI course",
  summary: "Create the desired course.",
  warnings: [],
  assumptions: [],
  content: {
    course: { title: "Introduction to AI" },
    sections: [
      {
        ref: "section-01",
        position: 1,
        title: "Foundations",
        source_refs: [],
        activities: [assignment],
      },
    ],
  },
} satisfies CoursePlanEnvelope;

const quizUpdate = {
  schema_version: "0.1",
  plan_id: "55555555-5555-4555-8555-555555555555",
  revision: 2,
  plan_type: "quiz",
  operation: "update",
  title: "Update quiz",
  summary: "Apply explicit question mutations.",
  warnings: [],
  assumptions: [],
  content: {
    title: "AI Quiz",
    description: "Updated quiz.",
    source_refs: [],
    questions_to_add: [],
    questions_to_update: [],
  },
} satisfies QuizUpdatePlanEnvelope;

const executionRequest = {
  plan_id: "55555555-5555-4555-8555-555555555555",
  revision: 2,
  target: {
    course_id: 100,
    section_id: 14,
    quiz_id: 772,
  },
} satisfies ExecutionRequest;

function assertExecutionTargetNarrowing(target: ExecutionTarget): number {
  if ("category_id" in target) {
    return target.category_id;
  }

  if ("activity_id" in target) {
    return target.activity_id;
  }

  if ("quiz_id" in target) {
    return target.quiz_id;
  }

  return target.section_id;
}

function assertDiscriminatedNarrowing(plan: PlanningContract): void {
  if (plan.plan_type === "quiz" && plan.operation === "update") {
    plan.content.questions_to_add;
    plan.content.questions_to_update;
    return;
  }

  if (plan.plan_type === "quiz") {
    plan.content.questions;
    return;
  }

  if (plan.plan_type === "course") {
    plan.content.course;
    plan.content.sections;
    return;
  }

  plan.content.instructions;
  plan.content.learning_objectives;
}

assertDiscriminatedNarrowing(coursePlan);
assertDiscriminatedNarrowing(quizUpdate);
assertExecutionTargetNarrowing(executionRequest.target);
