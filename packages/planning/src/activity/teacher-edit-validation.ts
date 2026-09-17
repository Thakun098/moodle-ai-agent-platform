import type { ActivityPlan, AssignmentPlan, QuizPlan, SectionPlan, SourceReference } from "@moodle-agent-poc/contracts";
import type { ActivityDesignContext } from "./activity-design.js";
import { PlanningError } from "../errors/planning-errors.js";
import type { CoursePlanningConstraints } from "../instructions/planning-constraints.js";
import { validateActivityShapeConstraints, validateSectionActivityProvenance } from "../validators/teacher-constraint-validator.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new PlanningError("PLAN_SCHEMA_INVALID", `${field} must be a non-empty string.`);
  return value.trim();
}

function nonEmptyStringArray(value: unknown, field: string): [string, ...string[]] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new PlanningError("PLAN_SCHEMA_INVALID", `${field} must contain at least one non-empty string.`);
  }
  return value.map((item) => String(item).trim()) as [string, ...string[]];
}

function sourceRefs(value: unknown, field: string): SourceReference[] {
  if (!Array.isArray(value)) throw new PlanningError("PLAN_SCHEMA_INVALID", `${field} must be an array.`);
  return value.map((candidate, index) => {
    if (!isRecord(candidate)) throw new PlanningError("PLAN_SCHEMA_INVALID", `${field}[${index}] must be an object.`);
    const source = nonEmptyString(candidate.source, `${field}[${index}].source`);
    const result: SourceReference = { source };
    if (candidate.page !== undefined) {
      if (!Number.isInteger(candidate.page) || Number(candidate.page) < 1) throw new PlanningError("PLAN_SCHEMA_INVALID", `${field}[${index}].page must be a positive integer.`);
      result.page = Number(candidate.page);
    }
    if (candidate.section !== undefined) result.section = nonEmptyString(candidate.section, `${field}[${index}].section`);
    if (candidate.text !== undefined) result.text = nonEmptyString(candidate.text, `${field}[${index}].text`);
    return result;
  });
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
}

function validateAssignment(raw: Record<string, unknown>, context: ActivityDesignContext): AssignmentPlan {
  const expectedGrade = Number(context.activity_intent.options.grade ?? 100);
  const grade = Number(raw.grade);
  if (!Number.isFinite(grade) || grade < 0 || grade !== expectedGrade) {
    throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", `Assignment grade must remain ${expectedGrade}.`, { expected: expectedGrade, actual: raw.grade });
  }
  const objectives = nonEmptyStringArray(raw.learning_objectives, "activity.learning_objectives");
  const expectedObjectives = [...new Set([
    ...context.selected_outcomes.map((outcome) => outcome.text),
    ...context.selected_objectives.map((objective) => objective.text),
  ])];
  if (!sameStrings(objectives, expectedObjectives)) {
    throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", "Teacher edit cannot change the authorized Assignment learning objectives.", {
      expected_learning_objectives: expectedObjectives,
      actual_learning_objectives: objectives,
    });
  }
  return {
    ref: nonEmptyString(raw.ref, "activity.ref"),
    type: "assignment",
    title: nonEmptyString(raw.title, "activity.title"),
    description: nonEmptyString(raw.description, "activity.description"),
    instructions: nonEmptyStringArray(raw.instructions, "activity.instructions"),
    learning_objectives: objectives,
    grade,
    source_refs: sourceRefs(raw.source_refs, "activity.source_refs"),
  };
}

function validateQuiz(raw: Record<string, unknown>, context: ActivityDesignContext): QuizPlan {
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) throw new PlanningError("PLAN_SCHEMA_INVALID", "Quiz must contain at least one question.");
  const seenQuestionRefs = new Set<string>();
  const defaultMark = Number(context.activity_intent.options.default_mark ?? 1);
  const questions = raw.questions.map((candidate, index) => {
    if (!isRecord(candidate)) throw new PlanningError("PLAN_SCHEMA_INVALID", `activity.questions[${index}] must be an object.`);
    const ref = nonEmptyString(candidate.ref, `activity.questions[${index}].ref`);
    if (seenQuestionRefs.has(ref)) throw new PlanningError("PLAN_SCHEMA_INVALID", `Duplicate question ref ${ref}.`);
    seenQuestionRefs.add(ref);
    const type = nonEmptyString(candidate.type, `activity.questions[${index}].type`);
    const question = nonEmptyString(candidate.question, `activity.questions[${index}].question`);
    const mark = Number(candidate.default_mark);
    if (!Number.isFinite(mark) || mark <= 0 || mark !== defaultMark) {
      throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", `Question ${ref} default_mark must remain ${defaultMark}.`, { expected: defaultMark, actual: candidate.default_mark });
    }
    const refs = sourceRefs(candidate.source_refs, `activity.questions[${index}].source_refs`);
    if (type === "multichoice") {
      if (!Array.isArray(candidate.choices) || candidate.choices.length < 2) throw new PlanningError("PLAN_SCHEMA_INVALID", `Question ${ref} must contain at least two choices.`);
      const seenChoiceRefs = new Set<string>();
      const choices = candidate.choices.map((choice, choiceIndex) => {
        if (!isRecord(choice)) throw new PlanningError("PLAN_SCHEMA_INVALID", `Question ${ref} choice ${choiceIndex + 1} must be an object.`);
        const choiceRef = nonEmptyString(choice.ref, `Question ${ref} choice ref`);
        if (seenChoiceRefs.has(choiceRef)) throw new PlanningError("PLAN_SCHEMA_INVALID", `Question ${ref} contains duplicate choice ref ${choiceRef}.`);
        seenChoiceRefs.add(choiceRef);
        return { ref: choiceRef, text: nonEmptyString(choice.text, `Question ${ref} choice text`) };
      });
      if (!Array.isArray(candidate.correct_choice_refs) || candidate.correct_choice_refs.length !== 1 || typeof candidate.correct_choice_refs[0] !== "string" || !seenChoiceRefs.has(candidate.correct_choice_refs[0])) {
        throw new PlanningError("PLAN_SCHEMA_INVALID", `Question ${ref} must identify exactly one valid correct choice.`);
      }
      return { ref, type: "multichoice" as const, question, choices: choices as any, correct_choice_refs: [candidate.correct_choice_refs[0]], feedback: typeof candidate.feedback === "string" ? candidate.feedback : "", default_mark: mark, source_refs: refs };
    }
    if (type === "truefalse") {
      if (typeof candidate.correct_answer !== "boolean") throw new PlanningError("PLAN_SCHEMA_INVALID", `Question ${ref} correct_answer must be boolean.`);
      return { ref, type: "truefalse" as const, question, correct_answer: candidate.correct_answer, feedback: typeof candidate.feedback === "string" ? candidate.feedback : "", default_mark: mark, source_refs: refs };
    }
    if (type === "shortanswer") {
      return { ref, type: "shortanswer" as const, question, accepted_answers: nonEmptyStringArray(candidate.accepted_answers, `Question ${ref} accepted_answers`), case_sensitive: Boolean(candidate.case_sensitive), default_mark: mark, source_refs: refs };
    }
    if (type === "essay") {
      return { ref, type: "essay" as const, question, grading_guidance: nonEmptyStringArray(candidate.grading_guidance, `Question ${ref} grading_guidance`), default_mark: mark, source_refs: refs };
    }
    throw new PlanningError("PLAN_SCHEMA_INVALID", `Question ${ref} has unsupported type ${type}.`);
  });
  return {
    ref: nonEmptyString(raw.ref, "activity.ref"),
    type: "quiz",
    title: nonEmptyString(raw.title, "activity.title"),
    description: nonEmptyString(raw.description, "activity.description"),
    source_refs: sourceRefs(raw.source_refs, "activity.source_refs"),
    questions,
  } as QuizPlan;
}

export function validateTeacherEditedActivity(params: {
  activity: unknown;
  context: ActivityDesignContext;
  section: { ref: string; position: number; title: string; summary: string; source_refs: SourceReference[] };
  constraints: CoursePlanningConstraints;
  authorizedSourceRefs: readonly SourceReference[];
}): ActivityPlan {
  if (!isRecord(params.activity)) throw new PlanningError("PLAN_SCHEMA_INVALID", "Teacher-edited Activity must be a JSON object.");
  if (params.activity.type !== params.context.activity_intent.type) {
    throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", "Teacher edit cannot change Activity type.");
  }
  const activity = params.activity.type === "assignment"
    ? validateAssignment(params.activity, params.context)
    : validateQuiz(params.activity, params.context);
  if (activity.ref !== params.context.activity_intent.ref) {
    throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", "Teacher edit cannot change the Activity ref.", { expected: params.context.activity_intent.ref, actual: activity.ref });
  }
  const sectionPlan: SectionPlan = {
    ref: params.section.ref,
    position: params.section.position,
    title: params.section.title,
    summary: params.section.summary,
    source_refs: params.section.source_refs,
    activities: [activity],
  };
  const allowlist = new Set(params.authorizedSourceRefs.flatMap((source) => [
    source.source,
    ...(source.section ? [`${source.source}::section::${source.section}`] : []),
    ...(source.page !== undefined ? [`${source.source}::page::${source.page}`] : []),
  ]));
  const violations = [
    ...validateActivityShapeConstraints(sectionPlan, activity, params.constraints),
    ...validateSectionActivityProvenance(sectionPlan, allowlist, true),
  ];
  if (violations.length > 0) {
    throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", `Teacher-edited Activity failed deterministic validation: ${JSON.stringify(violations)}`, violations);
  }
  return activity;
}
