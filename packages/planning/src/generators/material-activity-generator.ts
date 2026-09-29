import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import type { ActivityPlan, AssignmentPlan, NormalizedSyllabus, QuestionPlan, QuizPlan, SectionPlan } from "@moodle-agent-poc/contracts";
import type { MaterialContext } from "@moodle-agent-poc/materials";
import type { ActivityGenerationContext } from "../grounding/activity-grounding-resolver.js";
import {
  buildActivityGenerationMetadata,
  formatActivityDesignPrompt,
  validateActivityDesignOutput,
  type ActivityDesignContext,
  type ActivityGenerationMetadata,
  type ActivityGenerationMetadataInput,
  type ActivityQualityReview,
} from "../activity/activity-design.js";
import { PlanningError } from "../errors/planning-errors.js";
import type { CoursePlanningConstraints } from "../instructions/planning-constraints.js";
import { ModelRequestScheduler } from "../scheduling/model-request-scheduler.js";
import type { ActivityIntent, SectionStructureDraft } from "../types.js";
import { validateActivityShapeConstraints, validateSectionActivityProvenance, type ActivityRuleScopeMap } from "../validators/teacher-constraint-validator.js";

export type ActivityGenerationResult =
  | { status: "generated"; activity: ActivityPlan; qualityReview?: ActivityQualityReview; generationMetadata?: ActivityGenerationMetadata }
  | { status: "blocked"; reason: "INSUFFICIENT_MATERIAL" | "INSUFFICIENT_EVIDENCE"; message: string };

const sourceReferenceSchema = {
  type: "object",
  properties: {
    source: { type: "string", minLength: 1 },
    page: { type: "integer", minimum: 1 },
    section: { type: "string", minLength: 1 },
    text: { type: "string", minLength: 1 },
  },
  required: ["source"],
  additionalProperties: false,
};

const qualityReviewSchema = {
  type: "object",
  properties: {
    outcome_alignment: { enum: ["PASS", "WARN"] },
    learner_level_fit: { enum: ["PASS", "WARN"] },
    scope_compliance: { enum: ["PASS", "WARN"] },
    purpose_fit: { enum: ["PASS", "WARN"] },
    warnings: { type: "array", items: { type: "string", minLength: 1 } },
  },
  required: ["outcome_alignment", "learner_level_fit", "scope_compliance", "purpose_fit", "warnings"],
  additionalProperties: false,
};

const scopeExceptionsSchema = {
  type: "object",
  properties: {
    new_concepts: { type: "array", items: { type: "string", minLength: 1 } },
    new_prerequisites: { type: "array", items: { type: "string", minLength: 1 } },
    new_tools_or_frameworks: { type: "array", items: { type: "string", minLength: 1 } },
    new_technical_requirements: { type: "array", items: { type: "string", minLength: 1 } },
  },
  required: ["new_concepts", "new_prerequisites", "new_tools_or_frameworks", "new_technical_requirements"],
  additionalProperties: false,
};

const questionSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        ref: { type: "string", minLength: 1 }, type: { const: "multichoice" }, question: { type: "string", minLength: 1 },
        choices: { type: "array", minItems: 2, items: { type: "object", properties: { ref: { type: "string", minLength: 1 }, text: { type: "string", minLength: 1 } }, required: ["ref", "text"], additionalProperties: false } },
        correct_choice_refs: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } }, feedback: { type: "string" }, default_mark: { type: "number", exclusiveMinimum: 0 }, source_refs: { type: "array", items: sourceReferenceSchema },
      }, required: ["ref", "type", "question", "choices", "correct_choice_refs", "feedback", "default_mark", "source_refs"], additionalProperties: false,
    },
    {
      type: "object", properties: {
        ref: { type: "string", minLength: 1 }, type: { const: "truefalse" }, question: { type: "string", minLength: 1 }, correct_answer: { type: "boolean" }, feedback: { type: "string" }, default_mark: { type: "number", exclusiveMinimum: 0 }, source_refs: { type: "array", items: sourceReferenceSchema },
      }, required: ["ref", "type", "question", "correct_answer", "feedback", "default_mark", "source_refs"], additionalProperties: false,
    },
    {
      type: "object", properties: {
        ref: { type: "string", minLength: 1 }, type: { const: "shortanswer" }, question: { type: "string", minLength: 1 }, accepted_answers: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } }, case_sensitive: { type: "boolean" }, default_mark: { type: "number", exclusiveMinimum: 0 }, source_refs: { type: "array", items: sourceReferenceSchema },
      }, required: ["ref", "type", "question", "accepted_answers", "case_sensitive", "default_mark", "source_refs"], additionalProperties: false,
    },
    {
      type: "object", properties: {
        ref: { type: "string", minLength: 1 }, type: { const: "essay" }, question: { type: "string", minLength: 1 }, grading_guidance: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } }, default_mark: { type: "number", exclusiveMinimum: 0 }, source_refs: { type: "array", items: sourceReferenceSchema },
      }, required: ["ref", "type", "question", "grading_guidance", "default_mark", "source_refs"], additionalProperties: false,
    },
  ],
};

function activitySchema(type: ActivityIntent["type"]): Record<string, unknown> {
  if (type === "assignment") {
    return {
      type: "object", properties: {
        type: { const: "assignment" }, title: { type: "string", minLength: 1 }, description: { type: "string", minLength: 1 }, instructions: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } }, learning_objectives: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } }, grade: { type: "number", minimum: 0 }, source_refs: { type: "array", items: sourceReferenceSchema },
      }, required: ["type", "title", "description", "instructions", "learning_objectives", "grade", "source_refs"], additionalProperties: false,
    };
  }
  return {
    type: "object", properties: {
      type: { const: "quiz" }, title: { type: "string", minLength: 1 }, description: { type: "string", minLength: 1 }, source_refs: { type: "array", items: sourceReferenceSchema }, questions: { type: "array", minItems: 1, items: questionSchema },
    }, required: ["type", "title", "description", "source_refs", "questions"], additionalProperties: false,
  };
}

function constrainedQuizQuestionSchema(constraints: CoursePlanningConstraints): Record<string, unknown> {
  const rule = constraints.activityRules.find((candidate) => candidate.activityType === "quiz");
  const questionType = rule?.questionType;
  const variants = (questionSchema.oneOf ?? []) as Record<string, unknown>[];
  const typeOrder = ["multichoice", "truefalse", "shortanswer", "essay"];
  const selectedIndex = questionType ? typeOrder.indexOf(questionType) : -1;
  const selected = selectedIndex >= 0 ? structuredClone(variants[selectedIndex]!) : undefined;
  if (!selected) return questionSchema as unknown as Record<string, unknown>;

  if (questionType === "multichoice") {
    const properties = selected.properties as Record<string, any>;
    if (rule?.choicesPerQuestion !== undefined) {
      properties.choices = { ...properties.choices, minItems: rule.choicesPerQuestion, maxItems: rule.choicesPerQuestion };
    }
    if (rule?.correctChoicesPerQuestion !== undefined) {
      properties.correct_choice_refs = { ...properties.correct_choice_refs, minItems: rule.correctChoicesPerQuestion, maxItems: rule.correctChoicesPerQuestion };
    }
  }
  return selected;
}

function generatedActivitySchema(type: ActivityIntent["type"], constraints: CoursePlanningConstraints, designContext?: ActivityDesignContext): Record<string, unknown> {
  const activity = structuredClone(activitySchema(type)) as Record<string, any>;
  if (type === "quiz") {
    const rule = constraints.activityRules.find((candidate) => candidate.activityType === "quiz");
    activity.properties.questions.items = constrainedQuizQuestionSchema(constraints);
    if (rule?.questionsPerActivity !== undefined) {
      activity.properties.questions.minItems = rule.questionsPerActivity;
      activity.properties.questions.maxItems = rule.questionsPerActivity;
    }
  }
  if (designContext) {
    if (type === "assignment") activity.required = activity.required.filter((field: string) => field !== "learning_objectives");
    activity.properties.aligned_objective_ids = { type: "array", items: { type: "string", minLength: 1 } };
    activity.properties.aligned_outcome_ids = { type: "array", items: { type: "string", minLength: 1 } };
    activity.properties.quality_review = qualityReviewSchema;
    activity.properties.scope_exceptions = scopeExceptionsSchema;
    activity.required.push("aligned_objective_ids", "aligned_outcome_ids", "quality_review", "scope_exceptions");
  }
  return activity;
}

function canonicalQuestionType(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase().replace(/[\s-]+/gu, "_");
  const aliases: Record<string, string> = {
    short_answer: "shortanswer",
    shortanswer: "shortanswer",
    multiple_choice: "multichoice",
    multichoice: "multichoice",
    mcq: "multichoice",
    true_false: "truefalse",
    truefalse: "truefalse",
    essay: "essay",
  };
  return aliases[normalized];
}

function firstNonBlankString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function providerString(item: unknown): string | undefined {
  if (typeof item === "string" && item.trim()) return item.trim();
  if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
  const record = item as Record<string, unknown>;
  return firstNonBlankString(record, ["text", "value", "title", "description", "instruction", "objective", "outcome", "goal", "requirement", "deliverable"]);
}

function firstNonBlankStringList(record: Record<string, unknown>, keys: readonly string[]): [string, ...string[]] | undefined {
  for (const key of keys) {
    const value = record[key];
    const direct = providerString(value);
    if (direct) return [direct];
    if (Array.isArray(value)) {
      const strings = value.map(providerString).filter((item): item is string => Boolean(item));
      if (strings.length > 0) return strings as [string, ...string[]];
    }
  }
  return undefined;
}

function firstPositiveNumber(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return undefined;
}

function normalizeQuizActivity(activity: QuizPlan, intent: ActivityIntent, section: SectionStructureDraft, sourceRefs: MaterialContext["sourceRefs"], activityOrdinal: number): QuizPlan {
  if (!Array.isArray(activity.questions) || activity.questions.length === 0) {
    throw new PlanningError("MODEL_RESPONSE_INVALID", `Generated Quiz "${intent.title}" must contain at least one question.`);
  }
  const questions = activity.questions.map((question: any, questionIndex): QuestionPlan => {
    const questionSourceRefs = Array.isArray(question.source_refs) ? question.source_refs : [];
    const questionRef = `question-${String(section.position).padStart(2, "0")}-${String(activityOrdinal).padStart(2, "0")}-${String(questionIndex + 1).padStart(2, "0")}`;
    const questionText = typeof question.question === "string" ? question.question : typeof question.prompt === "string" ? question.prompt : typeof question.question_text === "string" ? question.question_text : typeof question.text === "string" ? question.text : typeof question.query === "string" ? question.query : "";
    const normalizedSourceRefs = questionSourceRefs.length ? questionSourceRefs : [...sourceRefs];
    const inferredChoices = Array.isArray(question.choices) ? question.choices : Array.isArray(question.options) ? question.options : undefined;
    const questionType = canonicalQuestionType(question.type);
    const isMultipleChoice = questionType === "multichoice" || inferredChoices !== undefined;
    if (!isMultipleChoice) {
      if (!questionText.trim() || !questionType) {
        throw new PlanningError("MODEL_RESPONSE_INVALID", `Generated question ${questionRef} is missing its type or question text.`);
      }
      if (questionType === "truefalse") {
        return {
          ref: questionRef,
          type: "truefalse",
          question: questionText,
          correct_answer: typeof question.correct_answer === "boolean" ? question.correct_answer : String(question.answer).toLowerCase() === "true",
          feedback: typeof question.feedback === "string" && question.feedback.trim() ? question.feedback : "Answer grounded in the authorized Learning Material.",
          default_mark: firstPositiveNumber(intent.options ?? {}, ["default_mark"]) ?? (typeof question.default_mark === "number" && question.default_mark > 0 ? question.default_mark : 1),
          source_refs: normalizedSourceRefs,
        };
      }
      if (questionType === "shortanswer") {
        if (!Array.isArray(question.accepted_answers) || question.accepted_answers.length === 0) throw new PlanningError("MODEL_RESPONSE_INVALID", `Generated short-answer question ${questionRef} is missing accepted answers.`);
        return { ref: questionRef, type: "shortanswer", question: questionText, accepted_answers: question.accepted_answers.map(String) as [string, ...string[]], case_sensitive: Boolean(question.case_sensitive), default_mark: firstPositiveNumber(intent.options ?? {}, ["default_mark"]) ?? (typeof question.default_mark === "number" && question.default_mark > 0 ? question.default_mark : 1), source_refs: normalizedSourceRefs };
      }
      if (questionType === "essay") {
        if (!Array.isArray(question.grading_guidance) || question.grading_guidance.length === 0) throw new PlanningError("MODEL_RESPONSE_INVALID", `Generated essay question ${questionRef} is missing grading guidance.`);
        return { ref: questionRef, type: "essay", question: questionText, grading_guidance: question.grading_guidance.map(String) as [string, ...string[]], default_mark: firstPositiveNumber(intent.options ?? {}, ["default_mark"]) ?? (typeof question.default_mark === "number" && question.default_mark > 0 ? question.default_mark : 1), source_refs: normalizedSourceRefs };
      }
      throw new PlanningError("MODEL_RESPONSE_INVALID", `Generated question ${questionRef} has unsupported type "${question.type}".`);
    }
    if (!inferredChoices || inferredChoices.length < 2) {
      throw new PlanningError("MODEL_RESPONSE_INVALID", `Generated multiple-choice question ${questionRef} must contain at least two choices.`);
    }
    const choiceRefs = inferredChoices.map((choice: any, choiceIndex: number) => ({
      ref: `choice-${String(section.position).padStart(2, "0")}-${String(activityOrdinal).padStart(2, "0")}-${String(questionIndex + 1).padStart(2, "0")}-${String(choiceIndex + 1).padStart(2, "0")}`,
      text: typeof choice === "string" ? choice : String(choice.text ?? choice.label ?? ""),
    }));
    const refsByOriginal = new Map(inferredChoices.map((choice: any, index: number) => [String(choice?.ref ?? choice?.id ?? index), choiceRefs[index]!.ref]));
    const rawAnswer = question.correct_choice_refs?.[0]
      ?? question.correct_choice
      ?? question.correct_option
      ?? question.answer
      ?? question.correct_answer
      ?? question.correct;
    const rawAnswerIndex = question.correct_choice_index
      ?? question.correct_index
      ?? question.correct_answer_index
      ?? question.correct_option_index
      ?? question.answer_index;
    const flaggedCorrectIndexes = inferredChoices.flatMap((choice: any, index: number) => {
      if (!choice || typeof choice !== "object") return [];
      const flag = choice.is_correct ?? choice.isCorrect ?? choice.is_answer ?? choice.isAnswer ?? choice.correct;
      return flag === true || String(flag).toLocaleLowerCase() === "true" ? [index] : [];
    });
    const rawAnswerObject = rawAnswer && typeof rawAnswer === "object" && !Array.isArray(rawAnswer) ? rawAnswer as Record<string, unknown> : undefined;
    const answerToken = rawAnswerObject
      ? firstNonBlankString(rawAnswerObject, ["ref", "id", "key", "label", "text", "value"])
      : rawAnswer;
    const explicitIndex = typeof rawAnswerIndex === "number"
      ? rawAnswerIndex
      : typeof rawAnswerIndex === "string" && rawAnswerIndex.trim() !== "" && Number.isInteger(Number(rawAnswerIndex))
        ? Number(rawAnswerIndex)
        : undefined;
    const answerRef = explicitIndex !== undefined
      ? choiceRefs[explicitIndex]?.ref
      : typeof answerToken === "number"
        ? choiceRefs[answerToken]?.ref
        : refsByOriginal.get(String(answerToken))
          ?? (typeof answerToken === "string" && /^[a-z]$/i.test(answerToken) ? choiceRefs[answerToken.toLowerCase().charCodeAt(0) - 97]?.ref : undefined)
          ?? (typeof answerToken === "string" && /^choice[_-]?(\d+)$/i.test(answerToken) ? (() => { const match = answerToken.match(/(\d+)$/u); const numeric = match ? Number(match[1]) : NaN; return Number.isInteger(numeric) ? choiceRefs[Math.max(0, numeric - 1)]?.ref : undefined; })() : undefined)
          ?? (typeof answerToken === "string" ? choiceRefs.find((choice: { ref: string; text: string }, index: number) => {
            const sourceChoice = inferredChoices[index];
            const text = typeof sourceChoice === "string" ? sourceChoice : String(sourceChoice?.text ?? sourceChoice?.label ?? "");
            return text.trim().toLocaleLowerCase() === answerToken.trim().toLocaleLowerCase();
          })?.ref : undefined)
          ?? (answerToken === undefined && flaggedCorrectIndexes.length === 1 ? choiceRefs[flaggedCorrectIndexes[0]!]?.ref : undefined);
    if (!answerRef) throw new PlanningError("MODEL_RESPONSE_INVALID", `Generated multiple-choice question ${questionRef} does not identify a valid correct choice.`, { answer: rawAnswer, choices: inferredChoices });
    return {
      ref: questionRef,
      type: "multichoice",
      question: questionText.trim(),
      choices: choiceRefs as [typeof choiceRefs[0], typeof choiceRefs[1], ...typeof choiceRefs],
      correct_choice_refs: [answerRef],
      feedback: typeof question.feedback === "string" && question.feedback.trim() ? question.feedback : "Answer grounded in the authorized Learning Material.",
      default_mark: firstPositiveNumber(intent.options ?? {}, ["default_mark"]) ?? (typeof question.default_mark === "number" && question.default_mark > 0 ? question.default_mark : 1),
      source_refs: normalizedSourceRefs,
    } as QuestionPlan;
  });
  const activitySourceRefs = Array.isArray(activity.source_refs) ? activity.source_refs : [];
  return { ref: intent.ref ?? `quiz-${String(section.position).padStart(2, "0")}`, type: "quiz", title: intent.title, description: typeof activity.description === "string" && activity.description.trim() ? activity.description : `${intent.title} generated from authorized Learning Material.`, source_refs: activitySourceRefs.length ? activitySourceRefs : [...sourceRefs], questions };
}

function normalizeActivity(parsed: any, intent: ActivityIntent, section: SectionStructureDraft, context: { sourceRefs: MaterialContext["sourceRefs"] }, activityOrdinal: number, generationInstruction?: string, designContext?: ActivityDesignContext): ActivityPlan {
  const activity = parsed.status === "generated" ? parsed.activity : parsed;
  if (!activity || activity.type !== intent.type) {
    throw new PlanningError("PLAN_SCHEMA_INVALID", `Generated activity type does not match intent for section "${section.ref}".`);
  }
  if (intent.type === "assignment") {
    const assignment = activity as Record<string, unknown>;
    const rawDescription = firstNonBlankString(assignment, ["description", "assignment_description", "task_description", "task_prompt", "prompt", "overview", "details", "task", "brief"]);
    const rawInstructions = firstNonBlankStringList(assignment, ["instructions", "instruction", "task_instructions", "submission_instructions", "submission_requirements", "steps", "requirements", "directions", "deliverables"]);
    const rawLearningObjectives = firstNonBlankStringList(assignment, ["learning_objectives", "learning_objective", "learningObjective", "learningObjectives", "learning_outcome", "learning_outcomes", "learning_goals", "learningGoals", "objective", "objectives", "outcome", "outcomes", "goal", "goals"]);
    const teacherInstruction = generationInstruction?.trim();
    const description = rawDescription ?? teacherInstruction ?? rawInstructions?.[0];
    const instructions = rawInstructions ?? (teacherInstruction ? [teacherInstruction] : rawDescription ? [rawDescription] : undefined);
    const authorizedLearningObjectives = designContext
      ? [...new Set([...designContext.selected_outcomes.map((outcome) => outcome.text), ...designContext.selected_objectives.map((objective) => objective.text)])]
      : [];
    const learningObjectives = designContext
      ? (authorizedLearningObjectives.length > 0
          ? authorizedLearningObjectives as [string, ...string[]]
          : designContext.alignment_review_required ? rawLearningObjectives : undefined)
      : rawLearningObjectives ?? (teacherInstruction ? [teacherInstruction] : rawDescription ? [rawDescription] : rawInstructions ? [rawInstructions[0]] : undefined);
    if (!description || !instructions || !learningObjectives) {
      throw new PlanningError("MODEL_RESPONSE_INVALID", `Generated Assignment "${intent.title}" is missing required contract fields.`, { available_fields: Object.keys(assignment) });
    }
    return {
      ref: intent.ref ?? `assignment-${String(section.position).padStart(2, "0")}`,
      type: "assignment",
      title: intent.title,
      description,
      instructions,
      learning_objectives: learningObjectives,
      grade: firstPositiveNumber(intent.options ?? {}, ["grade"]) ?? firstPositiveNumber(assignment, ["grade", "max_grade", "max_score", "points", "total_points", "total_marks"]) ?? 100,
      source_refs: Array.isArray(assignment.source_refs) && assignment.source_refs.length ? assignment.source_refs as AssignmentPlan["source_refs"] : [...context.sourceRefs],
    };
  }
  return normalizeQuizActivity(activity as QuizPlan, intent, section, context.sourceRefs, activityOrdinal);
}

export async function generateActivity(params: {
  modelClient: ModelClient;
  section: SectionStructureDraft;
  intent: ActivityIntent;
  materialContext?: MaterialContext;
  generationContext?: ActivityGenerationContext;
  constraints: CoursePlanningConstraints;
  model?: string;
  timeoutMs?: number;
  scheduler?: ModelRequestScheduler;
  syllabus?: NormalizedSyllabus;
  ruleScopes?: ActivityRuleScopeMap;
  generationInstruction?: string;
  designContext?: ActivityDesignContext;
  generationMetadata?: ActivityGenerationMetadataInput;
}): Promise<ActivityGenerationResult> {
  const { section, intent } = params;
  const usesDeterministicGrounding = params.generationContext !== undefined;
  const usesDomain2Schema = usesDeterministicGrounding || params.designContext !== undefined;
  const context: ActivityGenerationContext | undefined = params.generationContext ?? (params.materialContext ? {
    mode: "MATERIAL_GROUNDED",
    sectionRef: params.materialContext.sectionRef,
    text: params.materialContext.text,
    sourceRefs: [...params.materialContext.sourceRefs],
    reviewRequired: false,
    allowScopedModelKnowledge: false,
    materialSnapshotId: params.materialContext.snapshotId,
  } : undefined);
  if (!context) {
    return { status: "blocked", reason: "INSUFFICIENT_EVIDENCE", message: `No authorized Activity grounding context is available for section "${section.ref}".` };
  }
  if (context.sectionRef !== section.ref) {
    throw new PlanningError("PLAN_DOMAIN_INVALID", `Activity grounding section "${context.sectionRef}" does not match "${section.ref}".`);
  }
  if (params.designContext && (
    params.designContext.section.ref !== section.ref ||
    params.designContext.activity_intent.type !== intent.type ||
    params.designContext.activity_intent.ref !== intent.ref ||
    params.designContext.grounding.mode !== context.mode ||
    params.designContext.grounding.text !== context.text
  )) {
    throw new PlanningError("PLAN_DOMAIN_INVALID", "Activity Design Context does not match the current Activity generation inputs.");
  }
  if (!context.text.trim() || context.sourceRefs.length === 0) {
    return { status: "blocked", reason: "INSUFFICIENT_EVIDENCE", message: `No sufficient authorized evidence is available for section "${section.ref}".` };
  }
  const authorityInstruction = context.mode === "MATERIAL_GROUNDED"
    ? "Learning Material is the factual/content authority. Do not introduce facts absent from the supplied Material."
    : context.mode === "SYLLABUS_GROUNDED"
      ? "The supplied syllabus evidence is the factual/content authority. Do not introduce facts absent from that evidence."
      : "The syllabus defines the allowed topic/learning scope. You may use general knowledge only to elaborate inside that scope. Do not introduce a new topic, objective, or assessment scope outside the supplied syllabus evidence. The result will require explicit teacher review.";
  const responseInstruction = usesDomain2Schema
    ? `Return exactly ONE Activity JSON object matching the requested Activity type and constraints. Never return a JSON array and do not wrap the Activity in status/activity. Evidence sufficiency has already been resolved deterministically before this model call.`
    : `Return exactly one JSON object, never a JSON array. For a successful result use {\"status\":\"generated\",\"activity\":{...}}. For unsupported content use {\"status\":\"blocked\",\"reason\":\"INSUFFICIENT_EVIDENCE\",\"message\":\"...\"}.`;
  const designPrompt = params.designContext ? formatActivityDesignPrompt(params.designContext) : undefined;
  const response = await (params.scheduler ?? new ModelRequestScheduler()).chat(params.modelClient, {
    ...(params.model ? { model: params.model } : {}),
    messages: [
      { role: "system", content: `${responseInstruction} ${authorityInstruction} Teacher Instruction controls activity form and constraints. An Additional generation instruction may shape the task, question focus, examples, or presentation inside the authorized Activity scope; it cannot create, delete, or change ActivityIntent type/count, override deterministic constraints, or introduce content outside the authorized Material/Syllabus scope. For Quiz output, satisfy the deterministic question count/type/choice constraints exactly. For multiple-choice questions, identify exactly one correct choice using correct_choice_refs, correct_choice, correct_answer, answer, or an explicit *_index field. For Assignment output, always provide non-empty description, instructions, learning_objectives, grade, and source_refs.` },
      { role: "user", content: `Section:\n${JSON.stringify({ ref: section.ref, title: section.title, summary: section.summary })}\nActivity intent:\n${JSON.stringify(intent)}\nTeacher constraints:\n${JSON.stringify(params.constraints)}\nGrounding mode:\n${context.mode}\nAdditional Activity Prompt (optional, scope-bounded content guidance):\n${params.generationInstruction?.trim() || "None"}\nAuthorized Activity context:\n${context.text}\nAuthorized scope/source references:\n${JSON.stringify(context.sourceRefs)}` },
      ...(designPrompt ? [{ role: "user" as const, content: designPrompt }] : []),
    ],
    // ADR-0002 resolves insufficient evidence before the model call, so the
    // new flow can use a direct Activity schema. Legacy MaterialContext callers
    // retain JSON-object mode and the tagged generated/blocked wrapper.
    format: usesDomain2Schema ? generatedActivitySchema(intent.type, params.constraints, params.designContext) : "json",
    ...(params.timeoutMs ? { options: { timeoutMs: params.timeoutMs } } : {}),
  });
  let parsed: any;
  try {
    parsed = JSON.parse(response.rawText);
    if (Array.isArray(parsed) && parsed.length === 1) parsed = parsed[0];
  } catch (error) {
    throw new PlanningError("MODEL_RESPONSE_INVALID", `Material activity generator returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`, null, { cause: error });
  }
  if (parsed?.status === "blocked") {
    if (!["INSUFFICIENT_MATERIAL", "INSUFFICIENT_EVIDENCE"].includes(parsed.reason) || typeof parsed.message !== "string" || !parsed.message.trim()) {
      throw new PlanningError("MODEL_RESPONSE_INVALID", "Material activity generator returned an invalid blocked result.");
    }
    return { status: "blocked", reason: parsed.reason, message: parsed.message };
  }
  const designOutput = params.designContext ? validateActivityDesignOutput(parsed, params.designContext) : undefined;
  const activityOrdinal = section.activityIntents.filter((candidate) => candidate.type === intent.type).indexOf(intent) + 1;
  const activity = normalizeActivity(parsed, intent, section, context, activityOrdinal, params.generationInstruction, params.designContext);
  const sectionPlan: SectionPlan = { ref: section.ref, position: section.position, title: section.title, summary: section.summary, source_refs: section.source_refs, activities: [activity] };
  const violations = [
    ...validateActivityShapeConstraints(sectionPlan, activity, params.constraints, params.syllabus, params.ruleScopes),
    ...validateSectionActivityProvenance(sectionPlan, new Set(context.sourceRefs.flatMap((source) => [source.source, `${source.source}::section::${source.section ?? ""}`, ...(source.page !== undefined ? [`${source.source}::page::${source.page}`] : [])])), true),
  ];
  if (violations.length > 0) {
    throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", `Generated activity failed deterministic validation: ${JSON.stringify(violations)}`, violations);
  }
  return {
    status: "generated",
    activity,
    ...(designOutput ? { qualityReview: designOutput.qualityReview } : {}),
    ...(params.designContext ? { generationMetadata: buildActivityGenerationMetadata(params.designContext, params.generationMetadata) } : {}),
  };
}
