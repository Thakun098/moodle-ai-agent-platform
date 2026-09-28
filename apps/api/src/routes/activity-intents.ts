import { randomUUID } from "node:crypto";
import { ActivityIntentRepository, CourseStructureRevisionRepository, getDatabase, RunRepository } from "@moodle-agent-poc/agent-runtime";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { validateActivityIntent, type ActivityPurpose } from "@moodle-agent-poc/planning";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { serializeActivityIntent } from "../serializers/activity-intent-response.js";
import { beginInstructionalDesignMutation } from "../services/instructional-design-run-lifecycle-service.js";

export interface ActivityIntentRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository | undefined;
  structureRevisionRepo?: CourseStructureRevisionRepository | undefined;
  activityIntentRepo?: ActivityIntentRepository | undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function positiveInteger(value: unknown, fallback: number, min = 1): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) throw new Error(`Expected integer >= ${min}.`);
  return parsed;
}

function buildOptions(type: "quiz" | "assignment", sectionTitle: string, body: Record<string, unknown>, config: AppConfig): Record<string, unknown> {
  if (type === "quiz") {
    const options = asRecord(body.quiz_options);
    const questionType = typeof options.question_type === "string" ? options.question_type.trim().toLowerCase() : "multichoice";
    if (!["multichoice", "truefalse", "shortanswer", "essay"].includes(questionType)) throw new Error("Unsupported quiz question_type.");
    return {
      title: typeof options.title === "string" && options.title.trim() ? options.title.trim() : `Quiz: ${sectionTitle}`,
      question_count: positiveInteger(options.question_count, config.defaultQuizQuestionCount),
      question_type: questionType,
      choices_per_question: positiveInteger(options.choices_per_question, config.defaultQuizChoiceCount, 2),
      correct_choices_per_question: 1,
      default_mark: 1,
    };
  }
  const options = asRecord(body.assignment_options);
  return {
    title: typeof options.title === "string" && options.title.trim() ? options.title.trim() : `Assignment: ${sectionTitle}`,
    grade: positiveInteger(options.grade, config.defaultAssignmentGrade),
  };
}

function refFor(type: "quiz" | "assignment", sectionRef: string): string {
  const suffix = sectionRef.replace(/^section-/u, "");
  return `${type}-${suffix}`;
}

function arrayInput(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : undefined; } catch { return undefined; }
  }
  return undefined;
}

function typeValue(body: Record<string, unknown>, type: "quiz" | "assignment", suffix: string): unknown {
  return body[`${type}_${suffix}`] ?? body[suffix];
}

function overrideInput(body: Record<string, unknown>, type: "quiz" | "assignment") {
  const value = typeValue(body, type, "alignment_override");
  const record = asRecord(value);
  if (record.acknowledged === true && typeof record.reason === "string" && record.reason.trim() !== "") return { acknowledged: true as const, reason: record.reason.trim() };
  return undefined;
}

function contextFromRunRepo(runRepo: RunRepository, runId: string): Promise<CoreCourseDesignContext | null> {
  if (typeof (runRepo as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext !== "function") return Promise.resolve(null);
  return (runRepo as RunRepository & { getCoreCourseDesignContext: (id: string) => Promise<unknown> }).getCoreCourseDesignContext(runId).then((value) => value && typeof value === "object" ? value as CoreCourseDesignContext : null);
}

export const activityIntentRoutes: FastifyPluginAsync<ActivityIntentRoutesOptions> = async (fastify, options) => {
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getStructureRepo = () => options.structureRevisionRepo ?? new CourseStructureRevisionRepository(getDatabase());
  const getIntentRepo = () => options.activityIntentRepo ?? new ActivityIntentRepository(getDatabase());

  fastify.put<{ Params: { runId: string; sectionRef: string } }>("/api/runs/:runId/sections/:sectionRef/activity-intents", async (request, reply) => {
    const { runId, sectionRef } = request.params;
    const runRepo = getRunRepo();
    const run = await runRepo.getRun(runId);
    if (!run) return reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
    const sealed = await getStructureRepo().getSealedRevision(runId);
    if (!sealed) return reply.status(409).send({ error: { code: "STRUCTURE_NOT_SEALED", message: "Activity selection requires a sealed Course Structure.", details: null, request_id: request.id } });
    const sections = Array.isArray(sealed.contentJson.sections) ? sealed.contentJson.sections as Array<Record<string, unknown>> : [];
    const section = sections.find((candidate) => candidate.ref === sectionRef);
    if (!section) return reply.status(404).send({ error: { code: "SECTION_NOT_FOUND", message: `Section ${sectionRef} is not part of sealed Structure revision ${sealed.revision}.`, details: null, request_id: request.id } });
    const body = asRecord(request.body);
    const hasQuiz = typeof body.quiz === "boolean";
    const hasAssignment = typeof body.assignment === "boolean";
    if (!hasQuiz && !hasAssignment) return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "At least one of quiz or assignment must be a boolean.", details: null, request_id: request.id } });
    await beginInstructionalDesignMutation(runRepo, runId);
    const context = await contextFromRunRepo(runRepo, runId);
    const repo = getIntentRepo();
    if (context && typeof (repo as { markStaleForContext?: unknown }).markStaleForContext === "function") await repo.markStaleForContext(runId, sealed.revision, context.revision);
    const sectionTitle = typeof section.title === "string" && section.title.trim() ? section.title : sectionRef;
    const sectionSemantic = { ref: sectionRef, aligned_objective_ids: Array.isArray(section.aligned_objective_ids) ? section.aligned_objective_ids.filter((id): id is string => typeof id === "string") : [], aligned_outcome_ids: Array.isArray(section.aligned_outcome_ids) ? section.aligned_outcome_ids.filter((id): id is string => typeof id === "string") : [] };
    try {
      for (const type of ["quiz", "assignment"] as const) {
        if (typeof body[type] !== "boolean") continue;
        const existing = (await repo.listSection(runId, sealed.revision, sectionRef)).find((record) => record.activityType === type && record.status !== "removed");
        if (body[type] === false) {
          if (existing) await repo.remove(existing.id);
          continue;
        }
                const activityOptions = buildOptions(type, sectionTitle, body, options.config);
        const purposeValue = typeValue(body, type, "purpose");
        const purpose = purposeValue ?? existing?.purpose ?? "PRACTICE";
        const selectedObjectivesInput = arrayInput(body, `${type}_selected_objective_ids`) ?? arrayInput(body, "selected_objective_ids");
        const selectedObjectives = selectedObjectivesInput ?? existing?.selectedObjectiveIdsJson ?? [];
        const selectedOutcomesInput = arrayInput(body, `${type}_selected_outcome_ids`) ?? arrayInput(body, "selected_outcome_ids");
        const selectedOutcomes = selectedOutcomesInput ?? existing?.selectedOutcomeIdsJson ?? [];
        const learnerRevisionValue = typeValue(body, type, "learner_context_revision");
        const learnerRevision = learnerRevisionValue === undefined ? existing?.learnerContextRevision ?? undefined : Number(learnerRevisionValue);
        const learnerAcknowledgedValue = typeValue(body, type, "learner_context_acknowledged");
        const learnerAcknowledged = learnerAcknowledgedValue === undefined
          ? existing?.learnerContextAcknowledged ?? false
          : learnerAcknowledgedValue === true || learnerAcknowledgedValue === "true";
        const generationInstructionValue = typeValue(body, type, "generation_instruction");
        const generationInstruction = generationInstructionValue === undefined
          ? existing?.generationInstruction ?? undefined
          : typeof generationInstructionValue === "string" && generationInstructionValue.trim() !== "" ? generationInstructionValue.trim() : undefined;
        const generationInstructionForPersistence = generationInstructionValue === undefined
          ? existing?.generationInstruction ?? null
          : generationInstruction ?? null;
        const alignmentOverrideValue = typeValue(body, type, "alignment_override");
        const alignmentOverride = alignmentOverrideValue === undefined
          ? existing?.alignmentOverrideJson as { acknowledged: true; reason: string } | undefined
          : overrideInput(body, type);
        const semantic = context
          ? validateActivityIntent(context, sectionSemantic, {
            activity_type: type,
            purpose: purpose as ActivityPurpose,
            selected_objective_ids: selectedObjectives,
            selected_outcome_ids: selectedOutcomes,
            ...(learnerRevision !== undefined ? { learner_context_revision: learnerRevision } : {}),
            learner_context_acknowledged: learnerAcknowledged,
            ...(generationInstruction ? { generation_instruction: generationInstruction } : {}),
            ...(alignmentOverride ? { alignment_override: alignmentOverride } : {}),
          })
          : {
            purpose: (typeof purpose === "string" ? purpose : "PRACTICE") as ActivityPurpose,
            selected_objective_ids: selectedObjectives,
            selected_outcome_ids: selectedOutcomes,
            learner_context_revision: undefined,
            learner_context_acknowledged: learnerAcknowledged,
            ...(generationInstruction ? { generation_instruction: generationInstruction } : {}),
            ...(alignmentOverride ? { alignment_override: alignmentOverride } : {}),
          };await repo.select({ id: randomUUID(), runId, structureRevision: sealed.revision, sectionRef, activityRef: refFor(type, sectionRef), activityType: type, maxAttempts: options.config.activityGenerationMaxAttempts, optionsJson: { ...activityOptions, purpose: semantic.purpose, selected_objective_ids: semantic.selected_objective_ids, selected_outcome_ids: semantic.selected_outcome_ids }, ...(semantic.learner_context_revision !== undefined ? { learnerContextRevision: semantic.learner_context_revision } : {}), ...(context ? { contextRevision: context.revision } : {}), learnerContextAcknowledged: semantic.learner_context_acknowledged, ...(semantic.alignment_override ? { alignmentOverrideJson: semantic.alignment_override } : {}), ...(context ? { purpose: semantic.purpose, selectedObjectiveIdsJson: semantic.selected_objective_ids, selectedOutcomeIdsJson: semantic.selected_outcome_ids } : {}), generationInstruction: generationInstructionForPersistence });
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "ACTIVITY_INTENT_INVALID";
      return reply.status(422).send({ error: { code, message: error instanceof Error ? error.message : String(error), details: error && typeof error === "object" && "details" in error ? (error as { details?: unknown }).details : null, request_id: request.id } });
    }
    const intents = (await repo.listSection(runId, sealed.revision, sectionRef)).filter((record) => record.status !== "removed");
    return reply.send({ run_id: runId, structure_revision: sealed.revision, section_ref: sectionRef, intents: intents.map((intent) => serializeActivityIntent(intent)) });
  });

  fastify.get<{ Params: { runId: string; sectionRef: string } }>("/api/runs/:runId/sections/:sectionRef/activity-intents", async (request, reply) => {
    const { runId, sectionRef } = request.params;
    const runRepo = getRunRepo();
    const run = await runRepo.getRun(runId);
    if (!run) return reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
    const sealed = await getStructureRepo().getSealedRevision(runId);
    if (!sealed) return reply.status(409).send({ error: { code: "STRUCTURE_NOT_SEALED", message: "Activity selection requires a sealed Course Structure.", details: null, request_id: request.id } });
    const repo = getIntentRepo();
    const intents = (await repo.listSection(runId, sealed.revision, sectionRef)).filter((record) => record.status !== "removed");
    return reply.send({ run_id: runId, structure_revision: sealed.revision, section_ref: sectionRef, intents: intents.map((intent) => serializeActivityIntent(intent)) });
  });

  fastify.delete<{ Params: { runId: string; sectionRef: string; activityRef: string } }>("/api/runs/:runId/sections/:sectionRef/activities/:activityRef", async (request, reply) => {
    const { runId, sectionRef, activityRef } = request.params;
    const sealed = await getStructureRepo().getSealedRevision(runId);
    if (!sealed) return reply.status(409).send({ error: { code: "STRUCTURE_NOT_SEALED", message: "Activity removal requires a sealed Course Structure.", details: null, request_id: request.id } });
    const intent = await getIntentRepo().getByRef(runId, sealed.revision, activityRef);
    if (!intent || intent.sectionRef !== sectionRef || intent.status === "removed") return reply.status(404).send({ error: { code: "ACTIVITY_INTENT_NOT_FOUND", message: `Activity Intent ${activityRef} not found.`, details: null, request_id: request.id } });
    if (intent.status === "creating") return reply.status(409).send({ error: { code: "ACTIVITY_CREATING", message: "An Activity Intent cannot be removed while generation is in progress.", details: null, request_id: request.id } });
    await beginInstructionalDesignMutation(getRunRepo(), runId);
    await getIntentRepo().remove(intent.id);
    return reply.send({ run_id: runId, section_ref: sectionRef, activity_ref: activityRef, status: "removed" });
  });
};
