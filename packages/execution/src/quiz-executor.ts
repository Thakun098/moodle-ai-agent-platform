import crypto from "node:crypto";
import {
  executeRuntimeToolCall,
  buildIdempotencyKey,
  type PlanExecutionContext,
  type McpClientManager,
  type SafeToolExecutionOptions,
  type SafeToolRepositories,
} from "@moodle-agent-poc/agent-runtime";
import type {
  ExistingSectionTarget,
  QuestionPlan,
  QuizCreatePlanEnvelope,
  QuizUpdatePlanEnvelope,
  QuizUpdateTarget,
} from "@moodle-agent-poc/contracts";
import { compareQuestionReadback } from "@moodle-agent-poc/contracts";
import type {
  ExistingQuizQuestionState,
  ExistingQuizState,
} from "@moodle-agent-poc/planning";
import {
  formatQuestionName,
  serializeQuestionToMcpArgs,
} from "./serializers.js";

export class QuizExecutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "QuizExecutionError";
  }
}

interface MoodleQuizDetailsData {
  activity_id: number;
  quiz_id: number;
  course_id: number;
  name: string;
  intro: string;
  grade: number;
  questions_count: number;
  sumgrades: number;
}

interface MoodleQuestionSlotData {
  slot_id: number;
  slot_number: number;
  page: number;
  max_mark: number;
  question_bank_entry_id: number;
  question_id: number;
  version: number;
  name: string;
  qtype: "multichoice" | "truefalse" | "shortanswer" | "essay";
  question_text: string;
  default_mark: number;
  answers: Array<{ id: number; text: string; fraction: number; feedback: string }>;
  general_feedback?: string;
  correct_answer?: boolean;
  case_sensitive?: boolean;
  grading_guidance?: string;
}

interface CourseStructureData {
  course: { id: number };
  sections: Array<{
    section_id: number;
    activities: Array<{
      activity_id: number;
      instance_id: number;
      module_name: string;
    }>;
  }>;
}

export interface QuizExecutorOptions extends SafeToolExecutionOptions {}

export interface QuizExecutionConfigBase {
  runId: string;
  mcpClientManager: McpClientManager;
  repositories: SafeToolRepositories;
  options?: QuizExecutorOptions;
}

export interface QuizUpdateExecutionConfig extends QuizExecutionConfigBase {
  planEnvelope: QuizUpdatePlanEnvelope;
  target: QuizUpdateTarget;
  questionBindings?: PlanExecutionContext["questionBindings"] | undefined;
}

export interface QuizCreateExecutionConfig extends QuizExecutionConfigBase {
  planEnvelope: QuizCreatePlanEnvelope;
  target: ExistingSectionTarget;
}

export interface QuizExecutionResult {
  runId: string;
  planId: string;
  revision: number;
  status: "completed";
  activityId: number;
  quizId: number;
  verified: true;
  questionsCount: number;
}

async function callRead(
  manager: McpClientManager,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const result = await manager.callTool(toolName, args);
  if (result.status === "error") {
    throw new QuizExecutionError(result.code, result.message, result.details);
  }
  return result.data;
}

export async function readQuizState(
  manager: McpClientManager,
  activityId: number
): Promise<{ quiz: MoodleQuizDetailsData; questions: MoodleQuestionSlotData[] }> {
  const quiz = (await callRead(manager, "moodle_get_quiz", {
    activity_id: activityId,
  })) as MoodleQuizDetailsData;
  const questions = (await callRead(manager, "moodle_get_quiz_questions", {
    activity_id: activityId,
  })) as MoodleQuestionSlotData[];
  return { quiz, questions: [...questions].sort((a, b) => a.slot_number - b.slot_number) };
}

export function toExistingQuizState(
  quiz: MoodleQuizDetailsData,
  questions: MoodleQuestionSlotData[]
): ExistingQuizState {
  return {
    ref: "quiz",
    title: quiz.name,
    description: quiz.intro,
    source_refs: [],
    questions: [...questions]
      .sort((a, b) => a.slot_number - b.slot_number)
      .map((q, index): ExistingQuizQuestionState => ({
        ref: `question-${String(index + 1).padStart(2, "0")}`,
        slot_number: q.slot_number,
        question_bank_entry_id: q.question_bank_entry_id,
        version: q.version,
        name: q.name,
        type: q.qtype,
        question: q.question_text,
        default_mark: q.default_mark,
        answers: q.answers.map((a) => ({
          text: a.text,
          fraction: a.fraction,
          feedback: a.feedback,
        })),
        source_refs: [],
      })),
  };
}

export async function resolveQuizActivityId(
  manager: McpClientManager,
  target: QuizUpdateTarget
): Promise<number> {
  const structure = (await callRead(manager, "moodle_get_course_structure", {
    course_id: target.course_id,
  })) as CourseStructureData;
  if (structure.course.id !== target.course_id) {
    throw new QuizExecutionError("QUIZ_TARGET_MISMATCH", "Course structure response does not match target course_id.");
  }
  const section = structure.sections.find((s) => s.section_id === target.section_id);
  if (!section) {
    throw new QuizExecutionError("QUIZ_TARGET_MISMATCH", `Section ${target.section_id} was not found in course ${target.course_id}.`);
  }
  const activity = section.activities.find(
    (a) => a.module_name === "quiz" && a.instance_id === target.quiz_id
  );
  if (!activity) {
    throw new QuizExecutionError(
      "QUIZ_TARGET_MISMATCH",
      `Quiz instance ${target.quiz_id} was not found in section ${target.section_id}.`
    );
  }
  return activity.activity_id;
}

function serializeQuestionUpdate(
  activityId: number,
  questionBankEntryId: number,
  question: QuestionPlan,
  ordinal: number
): Record<string, unknown> {
  const created = serializeQuestionToMcpArgs(1, question, ordinal);
  const { activity_id: _ignored, ...rest } = created;
  return { activity_id: activityId, max_mark: question.default_mark, question_bank_entry_id: questionBankEntryId, ...rest };
}

function questionMatches(actual: MoodleQuestionSlotData, expected: QuestionPlan): boolean {
  return compareQuestionReadback(actual, expected).length === 0;
}

async function executeCreateQuestionAndSlot(
  safeContext: Parameters<typeof executeRuntimeToolCall>[0],
  activityId: number,
  question: QuestionPlan,
  ordinal: number
): Promise<number> {
  safeContext.stepNumber = (safeContext.stepNumber ?? 0) + 1;
  const created = await executeRuntimeToolCall(safeContext, {
    toolCallId: crypto.randomUUID(),
    toolName: "moodle_create_quiz_question",
    arguments: serializeQuestionToMcpArgs(activityId, question, ordinal),
    context: { targetType: "question", localRef: question.ref },
  });
  if (created.status === "error") {
    throw new QuizExecutionError(created.code, created.message, created.details);
  }
  const qbe = Number((created.data as { question_bank_entry_id: number }).question_bank_entry_id);
  safeContext.stepNumber = (safeContext.stepNumber ?? 0) + 1;
  const slotted = await executeRuntimeToolCall(safeContext, {
    toolCallId: crypto.randomUUID(),
    toolName: "moodle_add_question_to_quiz",
    arguments: {
      activity_id: activityId,
      question_bank_entry_id: qbe,
      max_mark: question.default_mark,
    },
    context: { localRef: question.ref },
  });
  if (slotted.status === "error") {
    throw new QuizExecutionError(slotted.code, slotted.message, slotted.details);
  }
  return qbe;
}

export async function executeQuizUpdate(
  config: QuizUpdateExecutionConfig
): Promise<QuizExecutionResult> {
  const { runId, planEnvelope, target, mcpClientManager, repositories, options = {} } = config;
  if (planEnvelope.plan_type !== "quiz" || planEnvelope.operation !== "update") {
    throw new QuizExecutionError("INCOMPATIBLE_PLAN_OPERATION", "Expected quiz/update plan.");
  }
  const activityId = await resolveQuizActivityId(mcpClientManager, target);
  const before = await readQuizState(mcpClientManager, activityId);
  if (before.quiz.quiz_id !== target.quiz_id || before.quiz.course_id !== target.course_id) {
    throw new QuizExecutionError("QUIZ_TARGET_MISMATCH", "Resolved quiz does not match execution target.");
  }

  // Resolve every update against plan-time identity before making even a metadata mutation.
  if (!config.questionBindings) throw new QuizExecutionError("QUESTION_BINDINGS_REQUIRED", "Replan this quiz update to capture question identities.");
  const existingByRef = new Map<string, MoodleQuestionSlotData>();
  for (const question of planEnvelope.content.questions_to_update) {
    const binding = config.questionBindings[question.ref];
    const current = binding && before.questions.find(q => q.question_bank_entry_id === binding.questionBankEntryId);
    if (!binding || !current || current.qtype !== question.type) {
      throw new QuizExecutionError("QUESTION_TARGET_MISMATCH", `Question '${question.ref}' no longer matches its pinned Moodle identity/type.`);
    }
    if (current.version !== binding.version) {
      // A previous, successful step of this exact revision may already have created its version.
      const cached = await repositories.idempotencyRepo?.getIdempotencyRecord(buildIdempotencyKey({ runId, planId: planEnvelope.plan_id, revision: planEnvelope.revision, localRef: question.ref, toolName: "moodle_update_quiz_question" }));
      const result = cached?.resultPayload as { version?: number; question_bank_entry_id?: number } | undefined;
      if (cached?.status !== "completed" || result?.version !== current.version || result?.question_bank_entry_id !== binding.questionBankEntryId) {
        throw new QuizExecutionError("QUESTION_VERSION_CHANGED", `Question '${question.ref}' changed since planning. Replan before executing.`);
      }
    }
    existingByRef.set(question.ref, current);
  }

  await mcpClientManager.discoverTools();
  await repositories.runRepo?.updateStatus(runId, "executing");
  const runDeadline = Date.now() + (options.runTimeoutMs ?? 300_000);
  const safeContext = {
    runId,
    planId: planEnvelope.plan_id,
    revision: planEnvelope.revision,
    stepNumber: 0,
    mcpClientManager,
    repositories,
    options,
    runDeadline,
    recentSignatures: [] as string[],
  };

  try {
    safeContext.stepNumber++;
    const metadata = await executeRuntimeToolCall(safeContext, {
      toolCallId: crypto.randomUUID(),
      toolName: "moodle_update_quiz",
      arguments: {
        activity_id: activityId,
        name: planEnvelope.content.title,
        intro: planEnvelope.content.description,
      },
      context: { localRef: "quiz-update" },
    });
    if (metadata.status === "error") throw new QuizExecutionError(metadata.code, metadata.message, metadata.details);

    let updateOrdinal = 1;
    for (const question of planEnvelope.content.questions_to_update) {
      const current = existingByRef.get(question.ref);
      if (!current) {
        throw new QuizExecutionError(
          "QUESTION_REF_NOT_FOUND",
          `Question update ref '${question.ref}' does not resolve to an existing quiz slot.`
        );
      }
      safeContext.stepNumber++;
      const updated = await executeRuntimeToolCall(safeContext, {
        toolCallId: crypto.randomUUID(),
        toolName: "moodle_update_quiz_question",
        arguments: { ...serializeQuestionUpdate(activityId, current.question_bank_entry_id, question, updateOrdinal++), expected_version: current.version },
        context: { localRef: question.ref },
      });
      if (updated.status === "error") throw new QuizExecutionError(updated.code, updated.message, updated.details);
    }

    let addOrdinal = before.questions.length + 1;
    const addedIds = new Map<string, number>();
    for (const question of planEnvelope.content.questions_to_add) {
      const qbe = await executeCreateQuestionAndSlot(safeContext, activityId, question, addOrdinal++);
      addedIds.set(question.ref, qbe);
    }

    const after = await readQuizState(mcpClientManager, activityId);
    const expectedIds = new Set([...before.questions.map(q => q.question_bank_entry_id), ...addedIds.values()]);
    if (after.questions.length !== expectedIds.size || after.questions.some(q => !expectedIds.has(q.question_bank_entry_id))) {
      throw new QuizExecutionError("QUIZ_VERIFICATION_FAILED", "Quiz question membership changed during execution.");
    }
    if (!Number.isFinite(after.quiz.sumgrades) || Math.abs(after.quiz.sumgrades - after.questions.reduce((total, q) => total + q.max_mark, 0)) > 1e-7) {
      throw new QuizExecutionError("QUIZ_VERIFICATION_FAILED", "Quiz total does not match its slot marks.");
    }
    if (after.quiz.name !== planEnvelope.content.title || after.quiz.intro !== planEnvelope.content.description) {
      throw new QuizExecutionError("QUIZ_VERIFICATION_FAILED", "Quiz metadata read-back does not match approved plan.");
    }
    for (const question of planEnvelope.content.questions_to_update) {
      const current = existingByRef.get(question.ref)!;
      const actual = after.questions.find((q) => q.question_bank_entry_id === current.question_bank_entry_id);
      if (!actual || !questionMatches(actual, question)) {
        throw new QuizExecutionError("QUIZ_VERIFICATION_FAILED", `Updated question '${question.ref}' failed read-back verification.`);
      }
    }
    for (const question of planEnvelope.content.questions_to_add) {
      const qbe = addedIds.get(question.ref)!;
      const actual = after.questions.find((q) => q.question_bank_entry_id === qbe);
      if (!actual || !questionMatches(actual, question)) {
        throw new QuizExecutionError("QUIZ_VERIFICATION_FAILED", `Added question '${question.ref}' failed read-back verification.`);
      }
    }

    await repositories.runRepo?.completeRun(runId, {
      plan_id: planEnvelope.plan_id,
      revision: planEnvelope.revision,
      activity_id: activityId,
      quiz_id: target.quiz_id,
      verified: true,
    });
    return {
      runId,
      planId: planEnvelope.plan_id,
      revision: planEnvelope.revision,
      status: "completed",
      activityId,
      quizId: target.quiz_id,
      verified: true,
      questionsCount: after.questions.length,
    };
  } catch (err) {
    await repositories.runRepo?.failRun(runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function executeQuizCreate(
  config: QuizCreateExecutionConfig
): Promise<QuizExecutionResult> {
  const { runId, planEnvelope, target, mcpClientManager, repositories, options = {} } = config;
  if (planEnvelope.plan_type !== "quiz" || planEnvelope.operation !== "create") {
    throw new QuizExecutionError("INCOMPATIBLE_PLAN_OPERATION", "Expected quiz/create plan.");
  }
  await mcpClientManager.discoverTools();
  await repositories.runRepo?.updateStatus(runId, "executing");
  const safeContext = {
    runId,
    planId: planEnvelope.plan_id,
    revision: planEnvelope.revision,
    stepNumber: 1,
    mcpClientManager,
    repositories,
    options,
    runDeadline: Date.now() + (options.runTimeoutMs ?? 300_000),
    recentSignatures: [] as string[],
  };
  try {
    const created = await executeRuntimeToolCall(safeContext, {
      toolCallId: crypto.randomUUID(),
      toolName: "moodle_create_quiz",
      arguments: {
        course_id: target.course_id,
        section_id: target.section_id,
        name: planEnvelope.content.title,
        intro: planEnvelope.content.description,
      },
      context: { targetType: "quiz", localRef: planEnvelope.content.ref },
    });
    if (created.status === "error") throw new QuizExecutionError(created.code, created.message, created.details);
    const data = created.data as { activity_id: number; quiz_id: number };
    const createdQuestionIds = new Map<string, number>();
    let ordinal = 1;
    for (const question of planEnvelope.content.questions) {
      createdQuestionIds.set(question.ref, await executeCreateQuestionAndSlot(safeContext, data.activity_id, question, ordinal++));
    }
    const after = await readQuizState(mcpClientManager, data.activity_id);
    if (
      after.quiz.quiz_id !== data.quiz_id ||
      after.quiz.course_id !== target.course_id ||
      after.quiz.name !== planEnvelope.content.title ||
      after.quiz.intro !== planEnvelope.content.description ||
      after.questions.length !== planEnvelope.content.questions.length ||
      !Number.isFinite(after.quiz.sumgrades) ||
      Math.abs(after.quiz.sumgrades - after.questions.reduce((total, q) => total + q.max_mark, 0)) > 1e-7
    ) {
      throw new QuizExecutionError("QUIZ_VERIFICATION_FAILED", "Created quiz failed deterministic read-back verification.");
    }
    for (const question of planEnvelope.content.questions) {
      const actual = after.questions.find(q => q.question_bank_entry_id === createdQuestionIds.get(question.ref));
      if (!actual || !questionMatches(actual, question)) throw new QuizExecutionError("QUIZ_VERIFICATION_FAILED", `Created question '${question.ref}' failed read-back verification.`);
    }
    await repositories.runRepo?.completeRun(runId, {
      plan_id: planEnvelope.plan_id,
      revision: planEnvelope.revision,
      activity_id: data.activity_id,
      quiz_id: data.quiz_id,
      verified: true,
    });
    return {
      runId,
      planId: planEnvelope.plan_id,
      revision: planEnvelope.revision,
      status: "completed",
      activityId: data.activity_id,
      quizId: data.quiz_id,
      verified: true,
      questionsCount: after.questions.length,
    };
  } catch (err) {
    await repositories.runRepo?.failRun(runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
