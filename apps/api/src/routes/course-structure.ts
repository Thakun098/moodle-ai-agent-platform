import { randomUUID } from "node:crypto";
import {
  CourseStructureRevisionRepository,
  getDatabase,
  RunRepository,
  type CourseStructureRevisionRecord,
  type ModelClient,
} from "@moodle-agent-poc/agent-runtime";
import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import {
  CourseStructurePlanner,
  createCourseStructureRevision,
  createCourseStructureRevisionFromContent,
  PlanningError,
  interpretStructureInstruction,
  validateCourseStructureCoverage,
  type CourseStructureRevision,
} from "@moodle-agent-poc/planning";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { createConfiguredModelClient } from "../config/model-client-factory.js";

export interface CourseStructureRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository | undefined;
  structureRevisionRepo?: CourseStructureRevisionRepository | undefined;
  structurePlanner?: CourseStructurePlanner | undefined;
}

function serializeRevision(record: CourseStructureRevisionRecord | CourseStructureRevision) {
  if ("contentJson" in record) {
    return {
      id: record.id,
      run_id: record.runId,
      revision: record.revision,
      title: record.title,
      summary: record.summary,
      content: record.contentJson,
      teacher_constraints: record.teacherConstraintsJson,
      validation_status: record.validationStatus,
      validation_errors: record.validationErrors ?? null,
      sealed_at: record.sealedAt ?? null,
      sealed_by_moodle_user_id: record.sealedByMoodleUserId ?? null,
      created_at: record.createdAt,
    };
  }
  return {
    id: record.id,
    run_id: record.runId,
    revision: record.revision,
    title: record.title,
    summary: record.summary,
    content: record.content,
    teacher_constraints: record.teacherConstraints,
    validation_status: record.validationStatus,
    validation_errors: record.validationErrors ?? null,
    sealed_at: record.sealedAt ?? null,
    sealed_by_moodle_user_id: record.sealedByMoodleUserId ?? null,
    created_at: record.createdAt,
  };
}

function parseRevision(value: unknown): number {
  const revision = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new PlanningError("STRUCTURE_INVALID", "revision must be a positive integer.");
  }
  return revision;
}

function editedStructureBody(body: unknown): { title: string; summary: string; content: unknown } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PlanningError("STRUCTURE_INVALID", "Request body is required.");
  }
  const value = body as Record<string, unknown>;
  const edited = typeof value.edited_structure === "object" && value.edited_structure !== null
    ? value.edited_structure as Record<string, unknown>
    : value;
  const content = edited.content ?? value.content;
  const title = typeof edited.title === "string" ? edited.title : typeof value.title === "string" ? value.title : "";
  const summary = typeof edited.summary === "string" ? edited.summary : typeof value.summary === "string" ? value.summary : "";
  return { title, summary, content };
}

export const courseStructureRoutes: FastifyPluginAsync<CourseStructureRoutesOptions> = async (fastify, options) => {
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getStructureRepo = () => options.structureRevisionRepo ?? new CourseStructureRevisionRepository(getDatabase());
  const getPlanner = () => options.structurePlanner ?? new CourseStructurePlanner(createConfiguredModelClient(options.config));

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/course-structure", async (request, reply) => {
    const { runId } = request.params;
    const runRepo = getRunRepo();
    const structureRepo = getStructureRepo();
    const run = await runRepo.getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    if (!run.normalizedSyllabus) {
      reply.status(422).send({ error: { code: "UNPROCESSABLE_ENTITY", message: `Run ${runId} does not contain a normalized syllabus for structure planning.`, details: null, request_id: request.id } });
      return;
    }
    if (await structureRepo.getLatestRevision(runId)) {
      reply.status(409).send({ error: { code: "CONFLICT", message: `A course structure revision already exists for run ${runId}. Create an edited revision instead.`, details: null, request_id: request.id } });
      return;
    }

    await runRepo.updateStatus(runId, "planning");
    try {
      const body = typeof request.body === "object" && request.body !== null ? request.body as Record<string, unknown> : {};
      const teacherInstruction = typeof body.teacher_instruction === "string" ? body.teacher_instruction : undefined;
      const structureInstruction = interpretStructureInstruction(teacherInstruction);
      const teacherConstraints: import("@moodle-agent-poc/planning").CoursePlanningConstraints = {
        activityRules: [],
        ...(structureInstruction.originalInstruction ? { originalInstruction: structureInstruction.originalInstruction } : {}),
        warnings: structureInstruction.warnings,
      };
      const draft = await getPlanner().plan(
        run.normalizedSyllabus as NormalizedSyllabus,
        teacherConstraints,
        options.config.modelName,
        options.config.agentModelTimeoutMs,
        "json",
      );
      validateCourseStructureCoverage(run.normalizedSyllabus as NormalizedSyllabus, draft.content.sections);
      const revision = createCourseStructureRevision({
        id: randomUUID(),
        runId,
        revision: 1,
        draft: {
          ...draft,
          warnings: [...draft.warnings, ...teacherConstraints.warnings],
          content: {
            ...draft.content,
            sections: draft.content.sections.map((section) => ({ ...section, activityIntents: [] })),
          },
        },
        syllabus: run.normalizedSyllabus as NormalizedSyllabus,
        teacherConstraints,
      });
      const record = await structureRepo.saveRevision({
        id: revision.id,
        runId: revision.runId,
        revision: revision.revision,
        title: revision.title,
        summary: revision.summary,
        content: revision.content as unknown as Record<string, unknown>,
        validationStatus: revision.validationStatus,
        teacherConstraintsJson: revision.teacherConstraints as unknown as Record<string, unknown>,
        ...(revision.validationErrors ? { validationErrors: revision.validationErrors } : {}),
        createdAt: revision.createdAt,
      });
      reply.status(201).send({ run_id: runId, status: "planning", structure_revision: serializeRevision(record) });
    } catch (error) {
      await runRepo.failRun(runId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  });

  fastify.get<{ Params: { runId: string } }>("/api/runs/:runId/course-structure", async (request, reply) => {
    const { runId } = request.params;
    const run = await getRunRepo().getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    const revisions = await getStructureRepo().listRevisions(runId);
    reply.send({
      run_id: runId,
      status: run.status,
      sealed_revision: revisions.find((revision) => revision.sealedAt !== null) ? serializeRevision(revisions.find((revision) => revision.sealedAt !== null)!) : null,
      current_revision: revisions[0] ? serializeRevision(revisions[0]) : null,
      revisions: revisions.map(serializeRevision),
    });
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/course-structure/revisions", async (request, reply) => {
    const { runId } = request.params;
    const runRepo = getRunRepo();
    const structureRepo = getStructureRepo();
    const run = await runRepo.getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    const latest = await structureRepo.getLatestRevision(runId);
    if (!latest) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `No course structure revision exists for run ${runId}.`, details: null, request_id: request.id } });
      return;
    }
    const edited = editedStructureBody(request.body);
    if (latest.sealedAt !== null) {
      await structureRepo.unsealRevisions(runId);
    }
    const teacherConstraints = latest.teacherConstraintsJson as unknown as import("@moodle-agent-poc/planning").CoursePlanningConstraints;
    const provisionalRevision = createCourseStructureRevisionFromContent({
      id: randomUUID(),
      runId,
      revision: latest.revision + 1,
      title: edited.title || latest.title,
      summary: edited.summary || latest.summary,
      content: edited.content,
      syllabus: run.normalizedSyllabus as NormalizedSyllabus,
      teacherConstraints,
    });
    const resolvedSections = provisionalRevision.content.sections.map((section) => ({
      ref: section.ref,
      position: section.position,
      title: section.title,
      summary: section.summary,
      source_refs: section.source_refs,
      activityIntents: [],
    }));
    const revision = createCourseStructureRevisionFromContent({
      id: provisionalRevision.id,
      runId: provisionalRevision.runId,
      revision: provisionalRevision.revision,
      title: provisionalRevision.title,
      summary: provisionalRevision.summary,
      content: {
        course: provisionalRevision.content.course,
        sections: resolvedSections.map((section) => ({
          ref: section.ref,
          position: section.position,
          title: section.title,
          summary: section.summary,
          source_refs: section.source_refs,
          activity_intents: section.activityIntents,
        })),
      },
      syllabus: run.normalizedSyllabus as NormalizedSyllabus,
      teacherConstraints,
    });
    const record = await structureRepo.saveRevision({
      id: revision.id,
      runId: revision.runId,
      revision: revision.revision,
      title: revision.title,
      summary: revision.summary,
      content: revision.content as unknown as Record<string, unknown>,
      validationStatus: revision.validationStatus,
      teacherConstraintsJson: revision.teacherConstraints as unknown as Record<string, unknown>,
      createdAt: revision.createdAt,
    });
    reply.status(201).send({ run_id: runId, status: run.status, structure_revision: serializeRevision(record) });
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/course-structure/seal", async (request, reply) => {
    const { runId } = request.params;
    const runRepo = getRunRepo();
    const structureRepo = getStructureRepo();
    const run = await runRepo.getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    const body = typeof request.body === "object" && request.body !== null ? request.body as Record<string, unknown> : {};
    const target = await structureRepo.getRevision(runId, parseRevision(body.revision));
    if (!target) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Course structure revision ${runId}/${body.revision} not found`, details: null, request_id: request.id } });
      return;
    }
    if (target.validationStatus !== "valid") {
      throw new PlanningError("STRUCTURE_INVALID", `Cannot seal invalid course structure revision ${runId}/${target.revision}.`, target.validationErrors);
    }
    if (!run.normalizedSyllabus) {
      throw new PlanningError("STRUCTURE_INVALID", `Run ${runId} does not contain a normalized syllabus for coverage validation.`);
    }
    const targetContent = target.contentJson;
    const targetSections = Array.isArray(targetContent.sections) ? targetContent.sections : [];
    validateCourseStructureCoverage(run.normalizedSyllabus as NormalizedSyllabus, targetSections as import("@moodle-agent-poc/planning").CourseStructureCoverageSection[]);
    const moodleUserId = body.moodle_user_id === undefined ? undefined : parseRevision(body.moodle_user_id);
    const sealed = await structureRepo.sealRevision({ runId, revision: target.revision, ...(moodleUserId !== undefined ? { moodleUserId } : {}) });
    if (run.status === "pending") await runRepo.updateStatus(runId, "planning");
    reply.send({ run_id: runId, status: "planning", structure_revision: serializeRevision(sealed) });
  });
};
