import type {
  AnyPlanEnvelope,
  AssignmentUpdateTarget,
  CourseCreateTarget,
  ExecutionRequest,
  ExistingSectionTarget,
  PlanningContract,
  QuizUpdateTarget,
} from "@moodle-agent-poc/contracts";
import { PlanningError } from "../errors/planning-errors.js";

/**
 * Validates that an ExecutionRequest target shape is strictly compatible with the
 * plan's plan_type and operation combination.
 *
 * Matrix:
 * | plan_type  | operation | required target                          |
 * |------------|-----------|------------------------------------------|
 * | course     | create    | { category_id }                          |
 * | assignment | create    | { course_id, section_id }                |
 * | assignment | update    | { course_id, section_id, activity_id }   |
 * | quiz       | create    | { course_id, section_id }                |
 * | quiz       | update    | { course_id, section_id, quiz_id }       |
 * | course     | update    | unsupported in POC                       |
 */
export function assertExecutionTargetCompatible(
  plan: AnyPlanEnvelope | PlanningContract,
  request: ExecutionRequest
): void {
  const { plan_type, operation } = plan;
  const target = request.target as unknown as Record<string, unknown>;

  if (!target || typeof target !== "object") {
    throw new PlanningError(
      "PLAN_DOMAIN_INVALID",
      `Execution target is required and must be an object.`
    );
  }

  if (plan_type === "course" && operation === "create") {
    const courseTarget = target as Partial<CourseCreateTarget>;
    if (
      typeof courseTarget.category_id !== "number" ||
      !Number.isInteger(courseTarget.category_id) ||
      courseTarget.category_id <= 0
    ) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Execution target for course/create must contain a positive integer "category_id" (received: ${JSON.stringify(courseTarget)}).`
      );
    }
    // Disallow extraneous activity/quiz target fields
    if ("course_id" in target || "section_id" in target || "activity_id" in target || "quiz_id" in target) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Execution target for course/create must only specify "category_id".`
      );
    }
  } else if (plan_type === "assignment" && operation === "create") {
    const secTarget = target as Partial<ExistingSectionTarget>;
    if (
      typeof secTarget.course_id !== "number" ||
      !Number.isInteger(secTarget.course_id) ||
      secTarget.course_id <= 0 ||
      typeof secTarget.section_id !== "number" ||
      !Number.isInteger(secTarget.section_id) ||
      secTarget.section_id <= 0
    ) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Execution target for assignment/create must contain positive integers "course_id" and "section_id" (received: ${JSON.stringify(secTarget)}).`
      );
    }
    if ("activity_id" in target || "quiz_id" in target || "category_id" in target) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Execution target for assignment/create must only specify "course_id" and "section_id".`
      );
    }
  } else if (plan_type === "assignment" && operation === "update") {
    const assignTarget = target as Partial<AssignmentUpdateTarget>;
    if (
      typeof assignTarget.course_id !== "number" ||
      !Number.isInteger(assignTarget.course_id) ||
      assignTarget.course_id <= 0 ||
      typeof assignTarget.section_id !== "number" ||
      !Number.isInteger(assignTarget.section_id) ||
      assignTarget.section_id <= 0 ||
      typeof assignTarget.activity_id !== "number" ||
      !Number.isInteger(assignTarget.activity_id) ||
      assignTarget.activity_id <= 0
    ) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Execution target for assignment/update must contain positive integers "course_id", "section_id", and "activity_id" (received: ${JSON.stringify(assignTarget)}).`
      );
    }
    if ("quiz_id" in target || "category_id" in target) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Execution target for assignment/update must only specify "course_id", "section_id", and "activity_id".`
      );
    }
  } else if (plan_type === "quiz" && operation === "create") {
    const secTarget = target as Partial<ExistingSectionTarget>;
    if (
      typeof secTarget.course_id !== "number" ||
      !Number.isInteger(secTarget.course_id) ||
      secTarget.course_id <= 0 ||
      typeof secTarget.section_id !== "number" ||
      !Number.isInteger(secTarget.section_id) ||
      secTarget.section_id <= 0
    ) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Execution target for quiz/create must contain positive integers "course_id" and "section_id" (received: ${JSON.stringify(secTarget)}).`
      );
    }
    if ("quiz_id" in target || "activity_id" in target || "category_id" in target) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Execution target for quiz/create must only specify "course_id" and "section_id".`
      );
    }
  } else if (plan_type === "quiz" && operation === "update") {
    const quizTarget = target as Partial<QuizUpdateTarget>;
    if (
      typeof quizTarget.course_id !== "number" ||
      !Number.isInteger(quizTarget.course_id) ||
      quizTarget.course_id <= 0 ||
      typeof quizTarget.section_id !== "number" ||
      !Number.isInteger(quizTarget.section_id) ||
      quizTarget.section_id <= 0 ||
      typeof quizTarget.quiz_id !== "number" ||
      !Number.isInteger(quizTarget.quiz_id) ||
      quizTarget.quiz_id <= 0
    ) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Execution target for quiz/update must contain positive integers "course_id", "section_id", and "quiz_id" (received: ${JSON.stringify(quizTarget)}).`
      );
    }
    if ("activity_id" in target || "category_id" in target) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Execution target for quiz/update must only specify "course_id", "section_id", and "quiz_id".`
      );
    }
  } else if (plan_type === "course" && operation === "update") {
    throw new PlanningError(
      "PLAN_DOMAIN_INVALID",
      `Course update operation is not supported in the POC.`
    );
  } else {
    throw new PlanningError(
      "PLAN_DOMAIN_INVALID",
      `Unsupported plan_type "${plan_type}" and operation "${operation}" combination for execution target.`
    );
  }
}
