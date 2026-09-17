import {
  ActivityIntentRepository,
  ActivityRevisionRepository,
  CourseStructureRevisionRepository,
  getDatabase,
  MaterialSnapshotRepository,
  RunRepository,
  type ActivityRevisionRecord,
} from "@moodle-agent-poc/agent-runtime";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { serializeActivityIntent } from "../serializers/activity-intent-response.js";
import {
  ActivityEditApplicationError,
  getActivityRevisionHistory,
  saveTeacherActivityEdit,
  type ActivityTeacherEditServiceDeps,
} from "../services/activity-teacher-edit-service.js";
import { beginInstructionalDesignMutation } from "../services/instructional-design-run-lifecycle-service.js";

export interface ActivityEditRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository | undefined;
  structureRevisionRepo?: CourseStructureRevisionRepository | undefined;
  activityIntentRepo?: ActivityIntentRepository | undefined;
  activityRevisionRepo?: ActivityRevisionRepository | undefined;
  snapshotRepo?: MaterialSnapshotRepository | undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function serializeRevision(record: ActivityRevisionRecord) {
  return {
    id: record.id,
    revision: record.revision,
    provenance: record.provenance,
    source_generation_revision: record.sourceGenerationRevision ?? null,
    intent_revision: record.intentRevision,
    context_revision: record.contextRevision ?? null,
    learner_context_revision: record.learnerContextRevision ?? null,
    grounding_mode: record.groundingMode ?? null,
    material_snapshot_id: record.materialSnapshotId ?? null,
    activity: record.contentJson,
    quality_review: record.qualityReviewJson ?? null,
    generation_metadata: record.generationMetadataJson ?? null,
    edited_by_moodle_user_id: record.editedByMoodleUserId ?? null,
    created_at: record.createdAt,
  };
}

function sendServiceError(reply: FastifyReply, requestId: string, error: unknown) {
  if (error instanceof ActivityEditApplicationError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message, details: error.details, request_id: requestId },
    });
  }
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "ACTIVITY_EDIT_INVALID";
  const status = code === "ACTIVITY_EDIT_STALE" ? 409 : 422;
  return reply.status(status).send({
    error: {
      code,
      message: error instanceof Error ? error.message : String(error),
      details: error && typeof error === "object" && "details" in error ? (error as { details?: unknown }).details : null,
      request_id: requestId,
    },
  });
}

export const activityEditRoutes: FastifyPluginAsync<ActivityEditRoutesOptions> = async (fastify, options) => {
  const getDeps = (): ActivityTeacherEditServiceDeps => ({
    config: options.config,
    runRepo: options.runRepo ?? new RunRepository(getDatabase()),
    structureRevisionRepo: options.structureRevisionRepo ?? new CourseStructureRevisionRepository(getDatabase()),
    activityIntentRepo: options.activityIntentRepo ?? new ActivityIntentRepository(getDatabase()),
    activityRevisionRepo: options.activityRevisionRepo ?? new ActivityRevisionRepository(getDatabase()),
    snapshotRepo: options.snapshotRepo ?? new MaterialSnapshotRepository(getDatabase()),
  });

  fastify.get<{ Params: { runId: string; sectionRef: string; activityRef: string } }>("/api/runs/:runId/sections/:sectionRef/activities/:activityRef/revisions", async (request, reply) => {
    try {
      const result = await getActivityRevisionHistory(getDeps(), request.params);
      return reply.send({
        ...serializeActivityIntent(result.intent),
        revisions: result.revisions.map(serializeRevision),
      });
    } catch (error) {
      return sendServiceError(reply, request.id, error);
    }
  });

  fastify.put<{ Params: { runId: string; sectionRef: string; activityRef: string } }>("/api/runs/:runId/sections/:sectionRef/activities/:activityRef/edit", async (request, reply) => {
    const body = asRecord(request.body);
    if (!("activity" in body)) {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "activity is required.", details: null, request_id: request.id } });
    }

    const expectedRaw = body.expected_activity_revision;
    const expectedActivityRevision = expectedRaw === undefined || expectedRaw === null || expectedRaw === ""
      ? undefined
      : Number(expectedRaw);
    if (expectedActivityRevision !== undefined && (!Number.isSafeInteger(expectedActivityRevision) || expectedActivityRevision < 0)) {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "expected_activity_revision must be a non-negative integer.", details: null, request_id: request.id } });
    }

    const editorRaw = body.edited_by_moodle_user_id;
    const editedByMoodleUserId = editorRaw === undefined || editorRaw === null || editorRaw === ""
      ? undefined
      : Number(editorRaw);
    if (editedByMoodleUserId !== undefined && (!Number.isSafeInteger(editedByMoodleUserId) || editedByMoodleUserId < 1)) {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "edited_by_moodle_user_id must be a positive integer.", details: null, request_id: request.id } });
    }

    try {
      const deps = getDeps();
      await beginInstructionalDesignMutation(deps.runRepo, request.params.runId);
      const result = await saveTeacherActivityEdit(deps, {
        ...request.params,
        activity: body.activity,
        ...(expectedActivityRevision !== undefined ? { expectedActivityRevision } : {}),
        ...(editedByMoodleUserId !== undefined ? { editedByMoodleUserId } : {}),
      });
      return reply.send({
        ...serializeActivityIntent(result.intent),
        current_revision: serializeRevision(result.currentRevision),
        revisions: result.revisions.map(serializeRevision),
      });
    } catch (error) {
      return sendServiceError(reply, request.id, error);
    }
  });
};
