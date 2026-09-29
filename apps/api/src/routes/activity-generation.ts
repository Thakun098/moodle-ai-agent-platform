import {
  ActivityIntentRepository,
  CourseStructureRevisionRepository,
  getDatabase,
  MaterialSnapshotRepository,
  RunRepository,
  type ActivityIntentRecord,
  type MaterialSnapshotRecord,
  type ModelClient,
} from "@moodle-agent-poc/agent-runtime";
import type { ActivityPlan, NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import {
  BoundedMaterialContextProvider,
  type MaterialSnapshot,
  type MaterialSnapshotFile,
} from "@moodle-agent-poc/materials";
import {
  activityDefaultPolicy,
  buildActivityDesignContext,
  createEmptyActivityShell,
  generateActivity,
  resolveActivityGrounding,
  type ActivityDefaultPolicy,
  type CoursePlanningConstraints,
  type SectionStructureDraft,
} from "@moodle-agent-poc/planning";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { createConfiguredModelClient } from "../config/model-client-factory.js";
import { serializeActivityIntent } from "../serializers/activity-intent-response.js";
import { beginInstructionalDesignMutation } from "../services/instructional-design-run-lifecycle-service.js";

export interface ActivityGenerationRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository | undefined;
  structureRevisionRepo?: CourseStructureRevisionRepository | undefined;
  activityIntentRepo?: ActivityIntentRepository | undefined;
  snapshotRepo?: MaterialSnapshotRepository | undefined;
  modelClient?: ModelClient | undefined;
}

function policyFromConfig(config: AppConfig): ActivityDefaultPolicy {
  return {
    maxAttempts: config.activityGenerationMaxAttempts,
    quizQuestionCount: config.defaultQuizQuestionCount,
    quizChoiceCount: config.defaultQuizChoiceCount,
    quizCorrectChoiceCount: 1,
    quizDefaultMark: 1,
    assignmentGrade: config.defaultAssignmentGrade,
    syllabusDetailThreshold: config.syllabusActivityDetailThreshold,
  };
}

function toMaterialSnapshot(record: MaterialSnapshotRecord): MaterialSnapshot {
  const files = Array.isArray(record.filesJson) ? record.filesJson as MaterialSnapshotFile[] : [];
  return {
    id: record.id,
    runId: record.runId,
    structureRevision: record.structureRevision,
    sectionRef: record.sectionRef,
    revision: record.revision,
    files,
    extractorVersion: record.extractorVersion,
    normalizedText: record.normalizedText,
    normalizedTextHash: record.normalizedTextHash,
    estimatedTokens: record.estimatedTokens,
    createdByMoodleUserId: record.createdByMoodleUserId,
    createdAt: record.createdAt,
  };
}

function parseInstruction(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const value = (body as Record<string, unknown>).generation_instruction;
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("generation_instruction must be a string.");
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 4000) throw new Error("generation_instruction must not exceed 4000 characters.");
  return trimmed;
}

function titleFor(intent: ActivityIntentRecord, sectionTitle: string): string {
  const configured = intent.optionsJson.title;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  return `${intent.activityType === "quiz" ? "Quiz" : "Assignment"}: ${sectionTitle}`;
}

function constraintsFor(intent: ActivityIntentRecord, sectionPosition: number): CoursePlanningConstraints {
  if (intent.activityType === "quiz") {
    const questionType = typeof intent.optionsJson.question_type === "string" ? intent.optionsJson.question_type as "multichoice" | "truefalse" | "shortanswer" | "essay" : "multichoice";
    const questions = Number(intent.optionsJson.question_count ?? 5);
    const choices = Number(intent.optionsJson.choices_per_question ?? 4);
    return {
      activityRules: [{
        scope: "specific_sections",
        sectionPositions: [sectionPosition],
        activityType: "quiz",
        activityCount: 1,
        questionType,
        questionsPerActivity: questions,
        ...(questionType === "multichoice" ? { choicesPerQuestion: choices, correctChoicesPerQuestion: 1 } : {}),
      }],
      warnings: [],
    };
  }
  return {
    activityRules: [{ scope: "specific_sections", sectionPositions: [sectionPosition], activityType: "assignment", activityCount: 1 }],
    warnings: [],
  };
}

function isTimeout(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code;
  if (code === "MODEL_TIMEOUT") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out/iu.test(message);
}

export const activityGenerationRoutes: FastifyPluginAsync<ActivityGenerationRoutesOptions> = async (fastify, options) => {
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getStructureRepo = () => options.structureRevisionRepo ?? new CourseStructureRevisionRepository(getDatabase());
  const getIntentRepo = () => options.activityIntentRepo ?? new ActivityIntentRepository(getDatabase());
  const getSnapshotRepo = () => options.snapshotRepo ?? new MaterialSnapshotRepository(getDatabase());
  const getModelClient = () => options.modelClient ?? createConfiguredModelClient(options.config);

  async function resolveContext(runId: string, structureRevision: number, section: SectionStructureDraft, syllabus: NormalizedSyllabus) {
    const snapshotRecord = await getSnapshotRepo().getLatestSnapshot(runId, structureRevision, section.ref);
    let materialContext;
    if (snapshotRecord) {
      const provider = new BoundedMaterialContextProvider({
        getSnapshot: async (snapshotId) => {
          const record = await getSnapshotRepo().getSnapshot(snapshotId);
          return record ? toMaterialSnapshot(record) : null;
        },
      }, options.config.activityContextTokenBudget);
      materialContext = await provider.getContext(snapshotRecord.id);
    }
    return resolveActivityGrounding(section, syllabus, materialContext, policyFromConfig(options.config));
  }

  fastify.get<{ Params: { runId: string; sectionRef: string; activityRef: string } }>("/api/runs/:runId/sections/:sectionRef/activities/:activityRef/status", async (request, reply) => {
    const { runId, sectionRef, activityRef } = request.params;
    const sealed = await getStructureRepo().getSealedRevision(runId);
    if (!sealed) {
      reply.status(409).send({ error: { code: "STRUCTURE_NOT_SEALED", message: "Activity status requires a sealed Course Structure.", details: null, request_id: request.id } });
      return;
    }
    const intent = await getIntentRepo().getByRef(runId, sealed.revision, activityRef);
    if (!intent || intent.sectionRef !== sectionRef || intent.status === "removed") {
      reply.status(404).send({ error: { code: "ACTIVITY_INTENT_NOT_FOUND", message: `Activity Intent ${activityRef} not found.`, details: null, request_id: request.id } });
      return;
    }
    reply.send(serializeActivityIntent(intent));
  });

  fastify.post<{ Params: { runId: string; sectionRef: string; activityRef: string } }>("/api/runs/:runId/sections/:sectionRef/activities/:activityRef/generate", async (request, reply) => {
    const { runId, sectionRef, activityRef } = request.params;
    const run = await getRunRepo().getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    if (!run.normalizedSyllabus) {
      reply.status(422).send({ error: { code: "SYLLABUS_REQUIRED", message: "The run has no normalized syllabus.", details: null, request_id: request.id } });
      return;
    }
    const sealed = await getStructureRepo().getSealedRevision(runId);
    if (!sealed) {
      reply.status(409).send({ error: { code: "STRUCTURE_NOT_SEALED", message: "Activity generation requires a sealed Course Structure.", details: null, request_id: request.id } });
      return;
    }
    const sectionRecord = (Array.isArray(sealed.contentJson.sections) ? sealed.contentJson.sections as Array<Record<string, unknown>> : []).find((candidate) => candidate.ref === sectionRef);
    if (!sectionRecord) {
      reply.status(404).send({ error: { code: "SECTION_NOT_FOUND", message: `Section ${sectionRef} not found.`, details: null, request_id: request.id } });
      return;
    }
    const repo = getIntentRepo();
    let selected = await repo.getByRef(runId, sealed.revision, activityRef);
    if (!selected || selected.sectionRef !== sectionRef || selected.status === "removed") {
      reply.status(404).send({ error: { code: "ACTIVITY_INTENT_NOT_FOUND", message: `Activity Intent ${activityRef} not found.`, details: null, request_id: request.id } });
      return;
    }
    await beginInstructionalDesignMutation(getRunRepo(), runId);
    const coreContext = typeof (getRunRepo() as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext === "function"
      ? await (getRunRepo() as RunRepository & { getCoreCourseDesignContext: (id: string) => Promise<any> }).getCoreCourseDesignContext(runId)
      : null;
    if (coreContext && typeof (repo as { updateContextRevision?: unknown }).updateContextRevision === "function") {
      selected = await repo.updateContextRevision(selected.id, coreContext.revision, coreContext.learner_context.revision) ?? selected;
    }
    let generationInstruction: string | undefined;
    try {
      generationInstruction = parseInstruction(request.body);
    } catch (error) {
      reply.status(400).send({ error: { code: "GENERATION_INSTRUCTION_INVALID", message: error instanceof Error ? error.message : String(error), details: null, request_id: request.id } });
      return;
    }
    const section: SectionStructureDraft = {
      ref: sectionRef,
      position: Number(sectionRecord.position),
      title: String(sectionRecord.title ?? sectionRef),
      summary: String(sectionRecord.summary ?? sectionRecord.title ?? sectionRef),
      source_refs: Array.isArray(sectionRecord.source_refs) ? sectionRecord.source_refs as SectionStructureDraft["source_refs"] : [],
      activityIntents: [],
      ...(Array.isArray(sectionRecord.aligned_objective_ids) ? { aligned_objective_ids: sectionRecord.aligned_objective_ids.filter((id): id is string => typeof id === "string") } : {}),
      ...(Array.isArray(sectionRecord.aligned_outcome_ids) ? { aligned_outcome_ids: sectionRecord.aligned_outcome_ids.filter((id): id is string => typeof id === "string") } : {}),
    };

    if (generationInstruction && typeof (repo as { updateGenerationInstruction?: unknown }).updateGenerationInstruction === "function") {
      selected = await repo.updateGenerationInstruction(selected.id, generationInstruction, coreContext?.revision ?? null) ?? selected;
    }
    const effectiveGenerationInstruction = generationInstruction ?? selected.generationInstruction ?? undefined;

    const context = await resolveContext(runId, sealed.revision, section, run.normalizedSyllabus as NormalizedSyllabus);
    if (context.mode === "INSUFFICIENT_EVIDENCE") {
      await repo.markInsufficient(selected.id);
      const current = await repo.get(selected.id);
      reply.send({ ...(current ? serializeActivityIntent(current) : serializeActivityIntent(selected)), warning: "Insufficient syllabus evidence. Upload Material, remove this Activity, or explicitly create an Empty Activity Shell." });
      return;
    }

    let activityDesignContext;
    try {
      if (coreContext && typeof selected.purpose === "string" && Array.isArray(selected.selectedObjectiveIdsJson) && Array.isArray(selected.selectedOutcomeIdsJson)) {
        activityDesignContext = buildActivityDesignContext({
          coreContext,
          structureRevision: sealed.revision,
          section,
          intent: {
            id: selected.id,
            ref: selected.activityRef,
            type: selected.activityType,
            title: titleFor(selected, section.title),
            purpose: selected.purpose,
            intent_revision: selected.intentRevision,
            selected_objective_ids: selected.selectedObjectiveIdsJson,
            selected_outcome_ids: selected.selectedOutcomeIdsJson,
            learner_context_revision: selected.learnerContextRevision ?? coreContext.learner_context.revision,
            learner_context_acknowledged: selected.learnerContextAcknowledged,
            options: selected.optionsJson,
            generation_instruction: selected.generationInstruction,
            ...(selected.alignmentOverrideJson ? { alignment_override: selected.alignmentOverrideJson as { kind?: "OUT_OF_SECTION" | "MISSING_ALIGNMENT"; acknowledged: true; reason: string } } : {}),
          },
          grounding: context,
        });
      }
    } catch (error) {
      reply.status(422).send({ error: { code: (error as { code?: string }).code ?? "ACTIVITY_INTENT_INVALID", message: error instanceof Error ? error.message : String(error), details: (error as { details?: unknown }).details ?? null, request_id: request.id } });
      return;
    }

    const started = await repo.beginAttempt(selected.id);
    if (!started) {
      const current = await repo.get(selected.id);
      const code = current?.status === "retry_exhausted" ? "ACTIVITY_RETRY_EXHAUSTED" : "ACTIVITY_STATE_INVALID";
      reply.status(409).send({ error: { code, message: `Activity ${activityRef} cannot start generation from state ${current?.status ?? selected.status}.`, details: current ? serializeActivityIntent(current, false) : null, request_id: request.id } });
      return;
    }

    if (activityDesignContext && activityDesignContext.activity_intent.intent_revision !== started.intentRevision) {
      if (typeof (repo as { markStale?: unknown }).markStale === "function") {
        await (repo as { markStale: (id: string, error: string) => Promise<boolean> }).markStale(started.id, "Activity Intent changed before generation started. Regenerate from the current revision.");
      }
      reply.status(409).send({ error: { code: "ACTIVITY_GENERATION_STALE", message: "Activity Intent changed before generation started; the generated result was not published.", details: null, request_id: request.id } });
      return;
    }

    const intent = {
      ref: started.activityRef,
      type: started.activityType,
      title: titleFor(started, section.title),
      source_refs: [...context.sourceRefs],
      origin: "teacher_instruction" as const,
      options: started.optionsJson,
    };
    const generationSection: SectionStructureDraft = { ...section, activityIntents: [intent] };
    try {
      const result = await generateActivity({
        modelClient: getModelClient(),
        section: generationSection,
        intent,
        generationContext: context,
        constraints: constraintsFor(started, section.position),
        syllabus: run.normalizedSyllabus as NormalizedSyllabus,
        ...(effectiveGenerationInstruction ? { generationInstruction: effectiveGenerationInstruction } : {}),
        ...(activityDesignContext ? { designContext: activityDesignContext, generationMetadata: { provider: options.config.modelProvider, model: options.config.modelName } } : {}),
        timeoutMs: options.config.agentModelTimeoutMs,
      });
      if (result.status === "blocked") {
        await repo.failAttempt(started.id, false, result.message);
        const current = await repo.get(started.id);
        reply.send(current ? serializeActivityIntent(current) : { status: "failed", error: result.message });
        return;
      }
      const currentBeforeComplete = await repo.get(started.id);
      const currentCoreContext = coreContext && typeof (getRunRepo() as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext === "function"
        ? await (getRunRepo() as RunRepository & { getCoreCourseDesignContext: (id: string) => Promise<any> }).getCoreCourseDesignContext(runId)
        : coreContext;
      const latestGrounding = activityDesignContext
        ? await resolveContext(runId, sealed.revision, section, run.normalizedSyllabus as NormalizedSyllabus)
        : context;
      const generationIsStale = !currentBeforeComplete
        || currentBeforeComplete.status !== "creating"
        || currentBeforeComplete.intentRevision !== started.intentRevision
        || (activityDesignContext !== undefined && (
          !currentCoreContext
          || currentCoreContext.revision !== activityDesignContext.core_context_revision
          || currentBeforeComplete.contextRevision !== activityDesignContext.core_context_revision
          || currentBeforeComplete.learnerContextRevision !== activityDesignContext.learner_context.revision
          || latestGrounding.mode !== context.mode
          || latestGrounding.materialSnapshotId !== context.materialSnapshotId
          || latestGrounding.text !== context.text
        ));
      if (generationIsStale) {
        if (currentBeforeComplete?.status === "creating" && typeof (repo as { markStale?: unknown }).markStale === "function") {
          await (repo as { markStale: (id: string, error: string) => Promise<boolean> }).markStale(started.id, "Activity generation dependencies changed while the model was running. Regenerate from the current Intent.");
        }
        const current = await repo.get(started.id);
        reply.status(409).send({ error: { code: "ACTIVITY_GENERATION_STALE", message: "Activity generation became stale while it was running; the generated result was not published.", details: current ? serializeActivityIntent(current, false) : null, request_id: request.id } });
        return;
      }
      const completed = await repo.complete(started.id, {
        contentJson: result.activity as unknown as Record<string, unknown>,
        groundingMode: context.mode,
        reviewRequired: context.reviewRequired || activityDesignContext?.alignment_review_required === true,
        ...(context.materialSnapshotId ? { materialSnapshotId: context.materialSnapshotId } : {}),
        ...(effectiveGenerationInstruction !== undefined ? { generationInstruction: effectiveGenerationInstruction } : {}),
        ...(result.qualityReview ? { qualityReviewJson: result.qualityReview as unknown as Record<string, unknown> } : {}),
        ...(result.generationMetadata ? { generationMetadataJson: result.generationMetadata as unknown as Record<string, unknown> } : {}),
      }, {
        intentRevision: started.intentRevision,
        ...(activityDesignContext ? { contextRevision: activityDesignContext.core_context_revision, learnerContextRevision: activityDesignContext.learner_context.revision } : {}),
      });
      if (!completed) {
        const current = await repo.get(started.id);
        reply.status(409).send({ error: { code: "ACTIVITY_GENERATION_STALE", message: "Activity generation was superseded before completion; the generated result was not published.", details: current ? serializeActivityIntent(current, false) : null, request_id: request.id } });
        return;
      }
      const current = await repo.get(started.id);
      reply.send(current ? serializeActivityIntent(current) : { status: "generated", activity: result.activity });
    } catch (error) {
      const timedOut = isTimeout(error);
      await repo.failAttempt(started.id, timedOut, error instanceof Error ? error.message : String(error));
      const current = await repo.get(started.id);
      reply.send(current ? serializeActivityIntent(current) : { status: timedOut ? "timed_out" : "failed", error: error instanceof Error ? error.message : String(error) });
    }
  });

  fastify.post<{ Params: { runId: string; sectionRef: string; activityRef: string } }>("/api/runs/:runId/sections/:sectionRef/activities/:activityRef/confirm-shell", async (request, reply) => {
    const { runId, sectionRef, activityRef } = request.params;
    const sealed = await getStructureRepo().getSealedRevision(runId);
    if (!sealed) {
      reply.status(409).send({ error: { code: "STRUCTURE_NOT_SEALED", message: "Empty shell confirmation requires a sealed Course Structure.", details: null, request_id: request.id } });
      return;
    }
    const sectionRecord = (Array.isArray(sealed.contentJson.sections) ? sealed.contentJson.sections as Array<Record<string, unknown>> : []).find((candidate) => candidate.ref === sectionRef);
    const intent = await getIntentRepo().getByRef(runId, sealed.revision, activityRef);
    if (!sectionRecord || !intent || intent.sectionRef !== sectionRef || intent.status === "removed") {
      reply.status(404).send({ error: { code: "ACTIVITY_INTENT_NOT_FOUND", message: `Activity Intent ${activityRef} not found.`, details: null, request_id: request.id } });
      return;
    }
    await beginInstructionalDesignMutation(getRunRepo(), runId);
    try {
      const shell = createEmptyActivityShell({
        ref: intent.activityRef,
        type: intent.activityType,
        title: titleFor(intent, String(sectionRecord.title ?? sectionRef)),
        status: intent.status,
      }, true, policyFromConfig(options.config));
      const saved = await getIntentRepo().confirmShell(intent.id, shell as unknown as Record<string, unknown>);
      if (!saved) {
        reply.status(409).send({ error: { code: "EMPTY_SHELL_NOT_ALLOWED", message: "Empty Activity Shell is only available after INSUFFICIENT_EVIDENCE.", details: null, request_id: request.id } });
        return;
      }
      const current = await getIntentRepo().get(intent.id);
      reply.send({ ...(current ? serializeActivityIntent(current) : { status: "shell", activity: shell }), warning: "Empty Activity Shell — content pending teacher completion." });
    } catch (error) {
      reply.status(409).send({ error: { code: "EMPTY_SHELL_NOT_ALLOWED", message: error instanceof Error ? error.message : String(error), details: null, request_id: request.id } });
    }
  });
};
