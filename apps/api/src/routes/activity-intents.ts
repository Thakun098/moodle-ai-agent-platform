import { randomUUID } from "node:crypto";
import {
  ActivityIntentRepository,
  CourseStructureRevisionRepository,
  getDatabase,
  RunRepository,
  type ActivityIntentRecord,
} from "@moodle-agent-poc/agent-runtime";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";

export interface ActivityIntentRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository | undefined;
  structureRevisionRepo?: CourseStructureRevisionRepository | undefined;
  activityIntentRepo?: ActivityIntentRepository | undefined;
}

function serialize(record: ActivityIntentRecord) {
  return {
    id: record.id,
    run_id: record.runId,
    structure_revision: record.structureRevision,
    section_ref: record.sectionRef,
    activity_ref: record.activityRef,
    activity_type: record.activityType,
    status: record.status,
    attempt_count: record.attemptCount,
    max_attempts: record.maxAttempts,
    options: record.optionsJson,
    grounding_mode: record.groundingMode ?? null,
    material_snapshot_id: record.materialSnapshotId ?? null,
    review_required: record.reviewRequired,
    shell_confirmed_at: record.shellConfirmedAt ?? null,
    activity: record.contentJson ?? null,
    generation_instruction: record.generationInstruction ?? null,
    error: record.error ?? null,
    updated_at: record.updatedAt,
  };
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

export const activityIntentRoutes: FastifyPluginAsync<ActivityIntentRoutesOptions> = async (fastify, options) => {
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getStructureRepo = () => options.structureRevisionRepo ?? new CourseStructureRevisionRepository(getDatabase());
  const getIntentRepo = () => options.activityIntentRepo ?? new ActivityIntentRepository(getDatabase());

  fastify.put<{ Params: { runId: string; sectionRef: string } }>("/api/runs/:runId/sections/:sectionRef/activity-intents", async (request, reply) => {
    const { runId, sectionRef } = request.params;
    const run = await getRunRepo().getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    const sealed = await getStructureRepo().getSealedRevision(runId);
    if (!sealed) {
      reply.status(409).send({ error: { code: "STRUCTURE_NOT_SEALED", message: "Activity selection requires a sealed Course Structure.", details: null, request_id: request.id } });
      return;
    }
    const sections = Array.isArray(sealed.contentJson.sections) ? sealed.contentJson.sections as Array<Record<string, unknown>> : [];
    const section = sections.find((candidate) => candidate.ref === sectionRef);
    if (!section) {
      reply.status(404).send({ error: { code: "SECTION_NOT_FOUND", message: `Section ${sectionRef} is not part of sealed Structure revision ${sealed.revision}.`, details: null, request_id: request.id } });
      return;
    }
    const body = asRecord(request.body);
    const hasQuiz = typeof body.quiz === "boolean";
    const hasAssignment = typeof body.assignment === "boolean";
    if (!hasQuiz && !hasAssignment) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "At least one of quiz or assignment must be a boolean.", details: null, request_id: request.id } });
      return;
    }
    const repo = getIntentRepo();
    const sectionTitle = typeof section.title === "string" && section.title.trim() ? section.title : sectionRef;
    try {
      for (const type of ["quiz", "assignment"] as const) {
        if (typeof body[type] !== "boolean") continue;
        const existing = (await repo.listSection(runId, sealed.revision, sectionRef)).find((record) => record.activityType === type && record.status !== "removed");
        if (body[type] === false) {
          if (existing) await repo.remove(existing.id);
          continue;
        }
        await repo.select({
          id: randomUUID(),
          runId,
          structureRevision: sealed.revision,
          sectionRef,
          activityRef: refFor(type, sectionRef),
          activityType: type,
          maxAttempts: options.config.activityGenerationMaxAttempts,
          optionsJson: buildOptions(type, sectionTitle, body, options.config),
        });
      }
    } catch (error) {
      reply.status(400).send({ error: { code: "ACTIVITY_INTENT_INVALID", message: error instanceof Error ? error.message : String(error), details: null, request_id: request.id } });
      return;
    }
    const intents = (await repo.listSection(runId, sealed.revision, sectionRef)).filter((record) => record.status !== "removed");
    reply.send({ run_id: runId, structure_revision: sealed.revision, section_ref: sectionRef, intents: intents.map(serialize) });
  });

  fastify.get<{ Params: { runId: string; sectionRef: string } }>("/api/runs/:runId/sections/:sectionRef/activity-intents", async (request, reply) => {
    const { runId, sectionRef } = request.params;
    const run = await getRunRepo().getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    const sealed = await getStructureRepo().getSealedRevision(runId);
    if (!sealed) {
      reply.status(409).send({ error: { code: "STRUCTURE_NOT_SEALED", message: "Activity selection requires a sealed Course Structure.", details: null, request_id: request.id } });
      return;
    }
    const intents = (await getIntentRepo().listSection(runId, sealed.revision, sectionRef)).filter((record) => record.status !== "removed");
    reply.send({ run_id: runId, structure_revision: sealed.revision, section_ref: sectionRef, intents: intents.map(serialize) });
  });

  fastify.delete<{ Params: { runId: string; sectionRef: string; activityRef: string } }>("/api/runs/:runId/sections/:sectionRef/activities/:activityRef", async (request, reply) => {
    const { runId, sectionRef, activityRef } = request.params;
    const sealed = await getStructureRepo().getSealedRevision(runId);
    if (!sealed) {
      reply.status(409).send({ error: { code: "STRUCTURE_NOT_SEALED", message: "Activity removal requires a sealed Course Structure.", details: null, request_id: request.id } });
      return;
    }
    const intent = await getIntentRepo().getByRef(runId, sealed.revision, activityRef);
    if (!intent || intent.sectionRef !== sectionRef || intent.status === "removed") {
      reply.status(404).send({ error: { code: "ACTIVITY_INTENT_NOT_FOUND", message: `Activity Intent ${activityRef} not found.`, details: null, request_id: request.id } });
      return;
    }
    if (intent.status === "creating") {
      reply.status(409).send({ error: { code: "ACTIVITY_CREATING", message: "An Activity Intent cannot be removed while generation is in progress.", details: null, request_id: request.id } });
      return;
    }
    await getIntentRepo().remove(intent.id);
    reply.send({ run_id: runId, section_ref: sectionRef, activity_ref: activityRef, status: "removed" });
  });
};
