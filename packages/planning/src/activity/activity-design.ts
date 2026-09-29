import { derivePrimaryOutputLanguageAuthority, type CoreCourseDesignContext, type SourceReference } from "@moodle-agent-poc/contracts";
import type { ActivityGenerationContext } from "../grounding/activity-grounding-resolver.js";
import { PlanningError } from "../errors/planning-errors.js";
import { validateActivityIntent, type ActivityAlignmentOverride, type ActivityPurpose } from "./activity-intent.js";
import { primaryOutputLanguagePrompt } from "../language/output-language-policy.js";

export const ACTIVITY_DESIGN_PROMPT_VERSION = "activity-design.v0.1";
export const STRUCTURE_PROMPT_VERSION = "structure-design.v0.1";

export type ActivityQualityCheck = "PASS" | "WARN";

export interface ActivityQualityReview {
  outcome_alignment: ActivityQualityCheck;
  learner_level_fit: ActivityQualityCheck;
  scope_compliance: ActivityQualityCheck;
  purpose_fit: ActivityQualityCheck;
  warnings: string[];
}

export interface ActivityIntentDesignInput {
  id?: string;
  ref: string;
  type: "quiz" | "assignment";
  title: string;
  purpose: ActivityPurpose;
  intent_revision: number;
  selected_objective_ids: readonly string[];
  selected_outcome_ids: readonly string[];
  learner_context_revision?: number;
  learner_context_acknowledged: boolean;
  options: Record<string, unknown>;
  generation_instruction?: string | null;
  alignment_override?: ActivityAlignmentOverride;
}

export interface ActivityDesignContext {
  operation: "ACTIVITY_GENERATION";
  policy_version: string;
  activity_prompt_version: string;
  run_id: string;
  core_context_revision: number;
  structure_revision: number;
  section: {
    ref: string;
    position: number;
    title: string;
    summary: string;
    aligned_objective_ids: string[];
    aligned_outcome_ids: string[];
  };
  selected_objectives: Array<{ objective_id: string; text: string; source_refs: unknown[] }>;
  selected_outcomes: Array<{ outcome_id: string; text: string; source_outcome_ids: string[]; revision: number; source_refs: unknown[] }>;
  primary_output_language: CoreCourseDesignContext["primary_output_language"];
  learner_context: {
    revision: number;
    status: CoreCourseDesignContext["learner_context"]["status"];
    acknowledged: boolean;
    target_learners: string[];
    education_level: string[];
    year_level: string[];
    prerequisites: string[];
    prior_knowledge: string[];
  };
  activity_intent: {
    id?: string;
    ref: string;
    type: "quiz" | "assignment";
    title: string;
    purpose: ActivityPurpose;
    intent_revision: number;
    selected_objective_ids: string[];
    selected_outcome_ids: string[];
    options: Record<string, unknown>;
    generation_instruction?: string;
  };
  grounding: {
    mode: ActivityGenerationContext["mode"];
    text: string;
    source_refs: SourceReference[];
    review_required: boolean;
    allow_scoped_model_knowledge: boolean;
    material_snapshot_id?: string;
  };
  warnings: string[];
  alignment_review_required: boolean;
  alignment_override?: ActivityAlignmentOverride;
}

export interface ActivityGenerationMetadataInput {
  provider?: string;
  model?: string;
  generated_at?: string;
}

export interface ActivityGenerationMetadata {
  operation: "ACTIVITY_GENERATION";
  instructional_design_policy_version: string;
  activity_prompt_version: string;
  structure_prompt_version: string;
  provider: string;
  model: string;
  generated_at: string;
  run_id: string;
  core_context_revision: number;
  structure_revision: number;
  section_ref: string;
  activity_intent_revision: number;
  learner_context_revision: number;
  primary_output_language: CoreCourseDesignContext["primary_output_language"];
  selected_objective_ids: string[];
  selected_outcome_ids: string[];
  approved_outcome_revisions: Record<string, number>;
  grounding_mode: ActivityGenerationContext["mode"];
  alignment_review_required: boolean;
  activity_intent_id?: string;
  material_snapshot_id?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function factTexts(values: readonly { text: string }[]): string[] {
  return values.map((value) => value.text.trim()).filter(Boolean);
}

function sameIdSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && [...new Set(actual)].sort().join("\u0000") === [...new Set(expected)].sort().join("\u0000");
}

function checkStatus(value: unknown, field: string): ActivityQualityCheck {
  if (value !== "PASS" && value !== "WARN") throw new PlanningError("MODEL_RESPONSE_INVALID", `quality_review.${field} must be PASS or WARN.`);
  return value;
}

function warningList(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim() !== "")) {
    throw new PlanningError("MODEL_RESPONSE_INVALID", "quality_review.warnings must be an array of non-empty strings.");
  }
  return uniqueStrings(value as string[]);
}

export function purposeGuidance(purpose: ActivityPurpose): string {
  if (purpose === "PRACTICE") return "Prioritize rehearsal, safe attempts, reinforcement, and useful feedback; do not present the Activity as automatic Competency Evidence.";
  if (purpose === "FORMATIVE") return "Use questions/tasks that reveal progress and misconceptions so the Teacher can adjust learning support; emphasize observable Outcome evidence.";
  return "Measure the selected Outcome(s) defensibly with clear grading, adequate coverage, and appropriate cognitive demand; remain a Teacher-reviewed Activity, not automatic Competency Evidence.";
}

function primaryOutputLanguageForContext(context: CoreCourseDesignContext): CoreCourseDesignContext["primary_output_language"] {
  return context.primary_output_language ?? derivePrimaryOutputLanguageAuthority({
    schedule_or_topics: context.schedule_or_topics.flatMap((item) => [item.title, ...item.topics]),
    objectives_outcomes: [
      ...context.learning_objectives.map((item) => item.source_text),
      ...context.source_learning_outcomes.map((item) => item.source_text),
    ],
    course_title: (context.course.title ?? []).map((item) => item.text),
  });
}

export function buildActivityDesignContext(params: {
  coreContext: CoreCourseDesignContext;
  structureRevision: number;
  section: {
    ref: string;
    position: number;
    title: string;
    summary: string;
    aligned_objective_ids?: readonly string[];
    aligned_outcome_ids?: readonly string[];
  };
  intent: ActivityIntentDesignInput;
  grounding: ActivityGenerationContext;
}): ActivityDesignContext {
  if (!Number.isSafeInteger(params.structureRevision) || params.structureRevision < 1) throw new PlanningError("ACTIVITY_INTENT_INVALID", "Structure revision must be a positive integer.");
  if (!Number.isSafeInteger(params.intent.intent_revision) || params.intent.intent_revision < 1) throw new PlanningError("ACTIVITY_INTENT_INVALID", "Activity Intent revision must be a positive integer.");
  if (params.coreContext.run_id === "" || params.grounding.sectionRef !== params.section.ref) throw new PlanningError("PLAN_DOMAIN_INVALID", "Activity Design Context identity does not match the selected Section.");
  const alignedObjectiveIds = uniqueStrings(params.section.aligned_objective_ids ?? []);
  const alignedOutcomeIds = uniqueStrings(params.section.aligned_outcome_ids ?? []);
  const validated = validateActivityIntent(params.coreContext, {
    ref: params.section.ref,
    aligned_objective_ids: alignedObjectiveIds,
    aligned_outcome_ids: alignedOutcomeIds,
  }, {
    activity_type: params.intent.type,
    purpose: params.intent.purpose,
    selected_objective_ids: params.intent.selected_objective_ids,
    selected_outcome_ids: params.intent.selected_outcome_ids,
    ...(params.intent.learner_context_revision !== undefined ? { learner_context_revision: params.intent.learner_context_revision } : {}),
    learner_context_acknowledged: params.intent.learner_context_acknowledged,
    ...(params.intent.generation_instruction ? { generation_instruction: params.intent.generation_instruction } : {}),
    ...(params.intent.alignment_override ? { alignment_override: params.intent.alignment_override } : {}),
  });

  const selectedObjectives = validated.selected_objective_ids.map((id) => {
    const objective = params.coreContext.learning_objectives.find((candidate) => candidate.objective_id === id);
    if (!objective) throw new PlanningError("ACTIVITY_INTENT_ALIGNMENT_INVALID", `Selected Objective ${id} is not present in the current Core Course Design Context.`);
    return { objective_id: objective.objective_id, text: objective.source_text, source_refs: [...objective.source_refs] };
  });
  const selectedOutcomes = validated.selected_outcome_ids.map((id) => {
    const outcome = params.coreContext.approved_learning_outcomes.find((candidate) => candidate.outcome_id === id);
    if (!outcome) throw new PlanningError("ACTIVITY_INTENT_OUTCOME_UNAUTHORIZED", `Selected Outcome ${id} is not present in the current approved Outcome revision.`);
    return {
      outcome_id: outcome.outcome_id,
      text: outcome.text,
      source_outcome_ids: [...outcome.source_outcome_ids],
      revision: outcome.revision,
      source_refs: [...outcome.source_refs],
    };
  });

  const primaryOutputLanguage = primaryOutputLanguageForContext(params.coreContext);
  const warnings = uniqueStrings([
    ...params.coreContext.missing_information
      .filter((item) => item.applies_to_stage.includes("ACTIVITY_GENERATION") && item.severity !== "BLOCKING")
      .map((item) => item.code),
    ...(params.coreContext.learner_context.status === "UNSPECIFIED" ? ["LEARNER_CONTEXT_UNSPECIFIED"] : []),
    ...(params.grounding.reviewRequired ? ["SYLLABUS_SCOPED_AI_REVIEW_REQUIRED"] : []),
    ...(validated.alignment_override?.kind === "MISSING_ALIGNMENT" ? ["ALIGNMENT_REVIEW_REQUIRED"] : []),
  ]);
  const generationInstruction = validated.generation_instruction;
  return {
    operation: "ACTIVITY_GENERATION",
    policy_version: params.coreContext.policy_version,
    activity_prompt_version: ACTIVITY_DESIGN_PROMPT_VERSION,
    run_id: params.coreContext.run_id,
    core_context_revision: params.coreContext.revision,
    structure_revision: params.structureRevision,
    section: {
      ref: params.section.ref,
      position: params.section.position,
      title: params.section.title,
      summary: params.section.summary,
      aligned_objective_ids: alignedObjectiveIds,
      aligned_outcome_ids: alignedOutcomeIds,
    },
    selected_objectives: selectedObjectives,
    selected_outcomes: selectedOutcomes,
    primary_output_language: primaryOutputLanguage,
    learner_context: {
      revision: params.coreContext.learner_context.revision,
      status: params.coreContext.learner_context.status,
      acknowledged: validated.learner_context_acknowledged,
      target_learners: factTexts(params.coreContext.learner_context.target_learners),
      education_level: factTexts(params.coreContext.learner_context.education_level),
      year_level: factTexts(params.coreContext.learner_context.year_level),
      prerequisites: factTexts(params.coreContext.learner_context.prerequisites),
      prior_knowledge: factTexts(params.coreContext.learner_context.prior_knowledge),
    },
    activity_intent: {
      ...(params.intent.id ? { id: params.intent.id } : {}),
      ref: params.intent.ref,
      type: params.intent.type,
      title: params.intent.title,
      purpose: validated.purpose,
      intent_revision: params.intent.intent_revision,
      selected_objective_ids: [...validated.selected_objective_ids],
      selected_outcome_ids: [...validated.selected_outcome_ids],
      options: { ...params.intent.options },
      ...(generationInstruction ? { generation_instruction: generationInstruction } : {}),
    },
    grounding: {
      mode: params.grounding.mode,
      text: params.grounding.text,
      source_refs: [...params.grounding.sourceRefs],
      review_required: params.grounding.reviewRequired,
      allow_scoped_model_knowledge: params.grounding.allowScopedModelKnowledge,
      ...(params.grounding.materialSnapshotId ? { material_snapshot_id: params.grounding.materialSnapshotId } : {}),
    },
    warnings,
    alignment_review_required: validated.alignment_override?.kind === "MISSING_ALIGNMENT",
    ...(validated.alignment_override ? { alignment_override: validated.alignment_override } : {}),
  };
}

export function formatActivityDesignPrompt(context: ActivityDesignContext): string {
  const projected = {
    section: context.section,
    selected_objectives: context.selected_objectives,
    selected_outcomes: context.selected_outcomes,
    primary_output_language: context.primary_output_language,
    learner_context: context.learner_context,
    activity_intent: context.activity_intent,
    grounding: context.grounding,
    policy_warnings: context.warnings,
    ...(context.alignment_override ? { alignment_override: context.alignment_override } : {}),
  };
  return [
    "You are an Instructional Designer specializing in Constructive Alignment.",
    "Use only this authorized Activity Design View. The application, not the model, owns Activity type, Purpose, selected IDs, deterministic options, source authority, and Primary Output Language.",
    primaryOutputLanguagePrompt(context.primary_output_language),
    `Activity Purpose: ${context.activity_intent.purpose}. ${purposeGuidance(context.activity_intent.purpose)}`,
    "Selected Objective/Outcome IDs are authoritative. Echo only these IDs in aligned_objective_ids and aligned_outcome_ids; never invent or select another Outcome, Objective, Competency, prerequisite, framework, tool, or technical requirement.",
    context.alignment_review_required
      ? "ALIGNMENT_REVIEW_REQUIRED: no Objective/Outcome was selected by the Teacher. Keep both aligned ID arrays empty, mark outcome_alignment WARN, and make the limitation explicit in quality_review.warnings. Do not infer alignment."
      : "The selected alignment is the required basis for the Activity and its outcome_alignment self-review.",
    "Material is factual authority in MATERIAL_GROUNDED mode. Pedagogical variation may change names, scenarios, framing, examples, and wording only when the authorized concepts and requirements remain unchanged.",
    context.learner_context.status === "UNSPECIFIED"
      ? "LEARNER_CONTEXT_UNSPECIFIED: learner degree, year, age, and education level are intentionally unspecified. Do not infer any of them; use only the supplied Syllabus, approved Outcomes, and authorized grounding as difficulty signals."
      : "Adapt complexity and scaffolding to the supplied learner context without changing the selected Outcome scope.",
    "Before returning the final Activity, perform one internal self-review. Return only quality_review with PASS/WARN checks for outcome_alignment, learner_level_fit, scope_compliance, purpose_fit, and warnings; do not return a numeric score or reasoning trace.",
    context.grounding.mode === "SYLLABUS_SCOPED_AI"
      ? "The syllabus defines the allowed learning scope, but scoped AI elaboration is permitted. If you introduce details not explicit in the syllabus, list them in scope_exceptions and mark scope_compliance WARN so the Teacher can review them."
      : "If you detect a scope exception, revise it away. If one remains, list it in scope_exceptions so deterministic validation can reject the result.",
    `Authorized Activity Design View:\n${JSON.stringify(projected, null, 2)}`,
  ].join("\n");
}

export function normalizeQualityReview(value: unknown, deterministicWarnings: readonly string[] = []): ActivityQualityReview {
  const record = asRecord(value);
  if (!record) throw new PlanningError("MODEL_RESPONSE_INVALID", "Activity output must include a structured quality_review object.");
  const allowed = new Set(["outcome_alignment", "learner_level_fit", "scope_compliance", "purpose_fit", "warnings"]);
  const unexpected = Object.keys(record).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) throw new PlanningError("MODEL_RESPONSE_INVALID", `quality_review contains unsupported fields: ${unexpected.join(", ")}.`);
  const warnings = warningList(record.warnings);
  return {
    outcome_alignment: checkStatus(record.outcome_alignment, "outcome_alignment"),
    learner_level_fit: checkStatus(record.learner_level_fit, "learner_level_fit"),
    scope_compliance: checkStatus(record.scope_compliance, "scope_compliance"),
    purpose_fit: checkStatus(record.purpose_fit, "purpose_fit"),
    warnings: uniqueStrings([...warnings, ...deterministicWarnings]),
  };
}

function idList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim() !== "")) {
    throw new PlanningError("MODEL_RESPONSE_INVALID", `${field} must be an array of non-empty strings.`);
  }
  return uniqueStrings(value as string[]);
}

function scopeExceptionList(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim() !== "")) {
    throw new PlanningError("MODEL_RESPONSE_INVALID", `scope_exceptions.${field} must be an array of non-empty strings.`);
  }
  return uniqueStrings(value as string[]);
}

const TECHNICAL_SCOPE_CLASSIFIERS = [
  "algorithm",
  "framework",
  "library",
  "protocol",
  "database",
  "pattern",
  "architecture",
  "runtime",
  "package",
  "dependency",
  "theorem",
  "api",
  "sdk",
  "language",
  "platform",
] as const;

const GENERIC_SCOPE_MODIFIERS = new Set([
  "this",
  "that",
  "the",
  "an",
  "a",
  "given",
  "selected",
  "current",
  "provided",
  "authorized",
  "simple",
  "basic",
  "example",
  "sample",
  "new",
]);

function normalizeScopeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u2010-\u2015]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

function activityContentSegments(output: Record<string, unknown>): string[] {
  const segments: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) segments.push(value);
  };
  const pushList = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(push);
  };

  push(output.title);
  push(output.description);
  pushList(output.instructions);
  pushList(output.learning_objectives);

  if (Array.isArray(output.questions)) {
    for (const questionValue of output.questions) {
      const question = asRecord(questionValue);
      if (!question) continue;
      push(question.question);
      push(question.feedback);
      pushList(question.accepted_answers);
      pushList(question.grading_guidance);
      if (Array.isArray(question.choices)) {
        for (const choiceValue of question.choices) {
          const choice = asRecord(choiceValue);
          if (choice) push(choice.text);
          else push(choiceValue);
        }
      }
    }
  }

  return segments;
}

function extractTechnicalScopeTerms(value: string): string[] {
  const terms = new Set<string>();
  const add = (raw: string) => {
    const normalized = normalizeScopeText(raw).replace(/^[^\p{L}\p{N}+#.]+|[^\p{L}\p{N}+#.]+$/gu, "");
    if (!normalized || GENERIC_SCOPE_MODIFIERS.has(normalized)) return;
    terms.add(normalized);
  };

  for (const match of value.matchAll(/\b[A-Z][A-Z0-9]{1,}(?:[+#]{1,2})?\b/gu)) add(match[0]);

  const classifiers = TECHNICAL_SCOPE_CLASSIFIERS.join("|");
  const beforeClassifier = new RegExp(`\\b([\\p{Lu}][\\p{L}\\p{N}_+#.-]{2,})\\s+(?:${classifiers})\\b`, "gu");
  for (const match of value.matchAll(beforeClassifier)) if (match[1]) add(match[1]);

  for (const match of value.matchAll(/\b[\p{L}][\p{L}\p{N}]*?(?:\+\+|#)\b/gu)) add(match[0]);
  // Member/API names (for example Console.ReadLine) are implementation details of an already authorized concept, not new scope by themselves.

  return [...terms];
}

function scopeTermIsAuthorized(term: string, authorizedCorpus: string): boolean {
  const escaped = normalizeScopeText(term).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (!escaped) return true;
  return new RegExp(`(^|[^\\p{L}\\p{N}_+#.-])${escaped}(?=$|[^\\p{L}\\p{N}_+#.-])`, "u").test(authorizedCorpus);
}

function findUnauthorizedTechnicalScope(output: Record<string, unknown>, context: ActivityDesignContext): string[] {
  const authorizedCorpus = normalizeScopeText([
    context.grounding.text,
    context.section.title,
    context.section.summary,
    ...context.selected_objectives.map((item) => item.text),
    ...context.selected_outcomes.map((item) => item.text),
    ...context.grounding.source_refs.flatMap((ref) => typeof ref.text === "string" ? [ref.text] : []),
  ].join("\n"));

  return uniqueStrings(
    activityContentSegments(output)
      .flatMap(extractTechnicalScopeTerms)
      .filter((term) => !scopeTermIsAuthorized(term, authorizedCorpus)),
  );
}

function allowsScopedAiExpansion(context: ActivityDesignContext): boolean {
  return context.grounding.mode === "SYLLABUS_SCOPED_AI"
    && context.grounding.allow_scoped_model_knowledge
    && context.grounding.review_required;
}

export function validateActivityDesignOutput(parsed: unknown, context: ActivityDesignContext): { qualityReview: ActivityQualityReview } {
  const wrapper = asRecord(parsed);
  const output = asRecord(wrapper?.status === "generated" ? wrapper.activity : parsed);
  if (!output) throw new PlanningError("MODEL_RESPONSE_INVALID", "Activity output must be a JSON object.");
  const forbiddenOutputKeys = Object.keys(output).filter((key) => ["quality_score", "score", "confidence", "reasoning", "chain_of_thought", "analysis"].includes(key));
  if (forbiddenOutputKeys.length > 0) throw new PlanningError("MODEL_RESPONSE_INVALID", `Activity output contains prohibited score or reasoning fields: ${forbiddenOutputKeys.join(", ")}.`);
  const objectiveIds = idList(output.aligned_objective_ids, "aligned_objective_ids");
  const outcomeIds = idList(output.aligned_outcome_ids, "aligned_outcome_ids");
  if (!sameIdSet(objectiveIds, context.activity_intent.selected_objective_ids) || !sameIdSet(outcomeIds, context.activity_intent.selected_outcome_ids)) {
    throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", "Generated Activity alignment does not exactly match the Teacher-authorized Objective/Outcome IDs.", {
      expected_objective_ids: context.activity_intent.selected_objective_ids,
      actual_objective_ids: objectiveIds,
      expected_outcome_ids: context.activity_intent.selected_outcome_ids,
      actual_outcome_ids: outcomeIds,
    });
  }
  const unsupportedScopeKeys = Object.keys(output).filter((key) => ["new_concepts", "introduced_concepts", "new_prerequisites", "new_tools", "new_frameworks", "external_requirements", "technical_requirements", "new_technical_requirements"].includes(key));
  if (unsupportedScopeKeys.length > 0) throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", "Generated Activity declares unsupported scope additions.", { fields: unsupportedScopeKeys });
  const scopeExceptions = asRecord(output.scope_exceptions);
  if (!scopeExceptions) throw new PlanningError("MODEL_RESPONSE_INVALID", "Activity output must include scope_exceptions.");
  const exceptionFields = ["new_concepts", "new_prerequisites", "new_tools_or_frameworks", "new_technical_requirements"];
  const exceptions = exceptionFields.flatMap((field) => scopeExceptionList(scopeExceptions, field).map((value) => `${field}: ${value}`));
  const unauthorizedTechnicalScope = findUnauthorizedTechnicalScope(output, context);
  const scopedAiExpansion = allowsScopedAiExpansion(context);
  const scopedWarnings: string[] = [];

  if (exceptions.length > 0) {
    if (!scopedAiExpansion) {
      throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", "Generated Activity introduces content outside the authorized Activity scope.", { scope_exceptions: exceptions });
    }
    scopedWarnings.push(...exceptions.map((value) => `SYLLABUS_SCOPED_AI_SCOPE_REVIEW: ${value}`));
  }

  if (unauthorizedTechnicalScope.length > 0) {
    if (!scopedAiExpansion) {
      throw new PlanningError(
        "TEACHER_CONSTRAINT_VIOLATION",
        `Generated Activity contains technical scope terms outside the authorized Material/Outcome context: ${unauthorizedTechnicalScope.join(", ")}.`,
        { unauthorized_scope_terms: unauthorizedTechnicalScope },
      );
    }
    scopedWarnings.push(`SYLLABUS_SCOPED_AI_TECHNICAL_SCOPE_REVIEW: ${unauthorizedTechnicalScope.join(", ")}`);
  }

  const qualityReview = normalizeQualityReview(output.quality_review, [...context.warnings, ...scopedWarnings]);
  if (scopedWarnings.length > 0) qualityReview.scope_compliance = "WARN";
  if (context.alignment_review_required) qualityReview.outcome_alignment = "WARN";
  return { qualityReview };
}

export function buildActivityGenerationMetadata(
  context: ActivityDesignContext,
  input: ActivityGenerationMetadataInput = {},
): ActivityGenerationMetadata {
  return {
    operation: context.operation,
    instructional_design_policy_version: context.policy_version,
    activity_prompt_version: context.activity_prompt_version,
    structure_prompt_version: STRUCTURE_PROMPT_VERSION,
    provider: input.provider ?? "unknown",
    model: input.model ?? "unknown",
    generated_at: input.generated_at ?? new Date().toISOString(),
    run_id: context.run_id,
    core_context_revision: context.core_context_revision,
    structure_revision: context.structure_revision,
    section_ref: context.section.ref,
    ...(context.activity_intent.id ? { activity_intent_id: context.activity_intent.id } : {}),
    activity_intent_revision: context.activity_intent.intent_revision,
    learner_context_revision: context.learner_context.revision,
    primary_output_language: context.primary_output_language,
    selected_objective_ids: [...context.activity_intent.selected_objective_ids],
    selected_outcome_ids: [...context.activity_intent.selected_outcome_ids],
    approved_outcome_revisions: Object.fromEntries(context.selected_outcomes.map((outcome) => [outcome.outcome_id, outcome.revision])),
    grounding_mode: context.grounding.mode,
    alignment_review_required: context.alignment_review_required,
    ...(context.grounding.material_snapshot_id ? { material_snapshot_id: context.grounding.material_snapshot_id } : {}),
  };
}
