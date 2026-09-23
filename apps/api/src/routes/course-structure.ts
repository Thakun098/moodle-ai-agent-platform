import { randomUUID } from "node:crypto";
import {
  CourseStructureRevisionRepository,
  OutcomeReviewRepository,
  projectWeekReviews,
  getDatabase,
  RunRepository,
  type CourseStructureRevisionRecord,
  type ModelClient,
} from "@moodle-agent-poc/agent-runtime";
import type { CoreCourseDesignContext, NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import {
  CourseStructurePlanner,
  alignStructureSections,
  assertAuthorizedAlignment,
  assertOutcomeCoverage,
  assertRequiredOutcomeApprovals,
  unapprovedSourceOutcomeIds,
  deriveOutcomeCoverage,
  buildLearningOutcomeProposals,
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
import { beginInstructionalDesignMutation } from "../services/instructional-design-run-lifecycle-service.js";

export interface CourseStructureRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository | undefined;
  structureRevisionRepo?: CourseStructureRevisionRepository | undefined;
  outcomeReviewRepo?: OutcomeReviewRepository | undefined;
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
      week_reviews: projectWeekReviews(record),
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
  const getOutcomeReviewRepo = () => options.outcomeReviewRepo ?? new OutcomeReviewRepository(getDatabase());
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
    const coreContext = typeof (runRepo as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext === "function"
      ? await (runRepo as typeof runRepo & { getCoreCourseDesignContext: (id: string) => Promise<unknown> }).getCoreCourseDesignContext(runId)
      : null;
    if (await structureRepo.getLatestRevision(runId)) {
      reply.status(409).send({ error: { code: "CONFLICT", message: `A course structure revision already exists for run ${runId}. Create an edited revision instead.`, details: null, request_id: request.id } });
      return;
    }

    await beginInstructionalDesignMutation(runRepo, runId);
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
      const planner = getPlanner();
      const draft = coreContext
        ? await planner.plan(
          run.normalizedSyllabus as NormalizedSyllabus,
          teacherConstraints,
          options.config.modelName,
          options.config.agentModelTimeoutMs,
          "json",
          coreContext as import("@moodle-agent-poc/contracts").CoreCourseDesignContext,
        )
        : await planner.plan(
          run.normalizedSyllabus as NormalizedSyllabus,
          teacherConstraints,
          options.config.modelName,
          options.config.agentModelTimeoutMs,
          "json",
        );
      const alignedSections = coreContext
        ? alignStructureSections(coreContext as import("@moodle-agent-poc/contracts").CoreCourseDesignContext, draft.content.sections as any)
        : draft.content.sections.map((section) => ({ ...section, aligned_objective_ids: [], aligned_outcome_ids: [], alignment_status: "CURRENT" as const }));
      if (coreContext) assertAuthorizedAlignment(coreContext as import("@moodle-agent-poc/contracts").CoreCourseDesignContext, alignedSections);
      const structureDraft = { ...draft, content: { ...draft.content, sections: alignedSections as any } };
      validateCourseStructureCoverage(run.normalizedSyllabus as NormalizedSyllabus, structureDraft.content.sections);
      const revision = createCourseStructureRevision({
        id: randomUUID(),
        runId,
        revision: 1,
        draft: {
          ...structureDraft,
          warnings: [...draft.warnings, ...teacherConstraints.warnings],
          content: {
            ...structureDraft.content,
            sections: structureDraft.content.sections.map((section: any) => ({ ...section, activityIntents: [] })),
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
        teacherConstraintsJson: { ...(revision.teacherConstraints as unknown as Record<string, unknown>), ...(coreContext ? { alignment_context_revision: (coreContext as { revision: number }).revision } : {}) },
        ...(revision.validationErrors ? { validationErrors: revision.validationErrors } : {}),
        createdAt: revision.createdAt,
      });
      reply.status(201).send({
        run_id: runId,
        status: "planning",
        structure_revision: serializeRevision(record),
        core_context_revision: coreContext && typeof (coreContext as { revision?: unknown }).revision === "number" ? (coreContext as { revision: number }).revision : null,
        outcome_proposals: coreContext ? buildLearningOutcomeProposals(coreContext as import("@moodle-agent-poc/contracts").CoreCourseDesignContext) : [],
      });
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
    const latestConstraints = latest.teacherConstraintsJson as Record<string, unknown>;
    let revisionTeacherConstraints = latest.teacherConstraintsJson as unknown as import("@moodle-agent-poc/planning").CoursePlanningConstraints;
    const provisionalRevision = createCourseStructureRevisionFromContent({
      id: randomUUID(),
      runId,
      revision: latest.revision + 1,
      title: edited.title || latest.title,
      summary: edited.summary || latest.summary,
      content: edited.content,
      syllabus: run.normalizedSyllabus as NormalizedSyllabus,
      teacherConstraints: revisionTeacherConstraints,
    });
    let alignmentCoverage: ReturnType<typeof deriveOutcomeCoverage> | undefined;
    let resolvedSections: any[] = provisionalRevision.content.sections.map((section) => ({
      ref: section.ref,
      position: section.position,
      title: section.title,
      summary: section.summary,
      source_refs: section.source_refs,
      activityIntents: [],
      aligned_objective_ids: (section as any).aligned_objective_ids ?? [],
      aligned_outcome_ids: (section as any).aligned_outcome_ids ?? [],
      alignment_status: (section as any).alignment_status ?? "CURRENT",
    }));
    const currentContext = typeof (runRepo as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext === "function"
      ? await (runRepo as typeof runRepo & { getCoreCourseDesignContext: (id: string) => Promise<CoreCourseDesignContext | null> }).getCoreCourseDesignContext(runId)
      : null;
    if (currentContext) {
      const candidateSections = resolvedSections.map((section) => ({
        ...section,
        activity_intents: [],
      }));
      assertAuthorizedAlignment(currentContext, candidateSections as any);
      const alignedSections = alignStructureSections(currentContext, candidateSections as any, { preserveExplicitScheduleMappings: false });
      resolvedSections = alignedSections.map((section) => ({
        ...section,
        activityIntents: [],
      }));
      const nextConstraints: Record<string, unknown> = {
        ...latestConstraints,
        alignment_context_revision: currentContext.revision,
        alignment_state: "CURRENT",
        stale_from_context_revision: null,
      };
      revisionTeacherConstraints = nextConstraints as unknown as import("@moodle-agent-poc/planning").CoursePlanningConstraints;
      if (unapprovedSourceOutcomeIds(currentContext).length === 0) {
        const coverageOverrides = Array.isArray(nextConstraints.coverage_overrides) ? nextConstraints.coverage_overrides : [];
        alignmentCoverage = deriveOutcomeCoverage(currentContext, alignedSections, coverageOverrides as any);
      }
    }
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
          aligned_objective_ids: section.aligned_objective_ids ?? [],
          aligned_outcome_ids: section.aligned_outcome_ids ?? [],
          alignment_status: section.alignment_status ?? "CURRENT",
        })),
      },
      syllabus: run.normalizedSyllabus as NormalizedSyllabus,
      teacherConstraints: revisionTeacherConstraints,
    });
    await beginInstructionalDesignMutation(runRepo, runId);
    const record = await structureRepo.saveRevision({
      id: revision.id,
      runId: revision.runId,
      revision: revision.revision,
      title: revision.title,
      summary: revision.summary,
      content: revision.content as unknown as Record<string, unknown>,
      validationStatus: revision.validationStatus,
      teacherConstraintsJson: revisionTeacherConstraints as unknown as Record<string, unknown>,
      createdAt: revision.createdAt,
    });
    reply.status(201).send({ run_id: runId, status: run.status, structure_revision: serializeRevision(record), ...(alignmentCoverage ? { coverage: alignmentCoverage } : {}) });
  });

  fastify.post<{ Params: { runId: string; sectionRef: string } }>("/api/runs/:runId/course-structure/weeks/:sectionRef/review", async (request, reply) => {
    const body = typeof request.body === "object" && request.body !== null ? request.body as Record<string, unknown> : {};
    const revision = parseRevision(body.revision);
    const moodleUserId = parseRevision(body.moodle_user_id);
    const runRepo = getRunRepo();
    const context = typeof (runRepo as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext === "function"
      ? await (runRepo as typeof runRepo & { getCoreCourseDesignContext: (id: string) => Promise<CoreCourseDesignContext | null> }).getCoreCourseDesignContext(request.params.runId)
      : null;
    if (!context) throw Object.assign(new Error("Review and approve Outcomes before reviewing a Week."), { code: "OUTCOME_REVIEW_REQUIRED", statusCode: 409 });
    assertRequiredOutcomeApprovals(context);
    const reviews = await getOutcomeReviewRepo().list(request.params.runId);
    const reviewedLoIds = new Set(reviews.filter((item) => item.itemType === "LO" && item.status === "REVIEWED").map((item) => item.itemId));
    if (context.learning_objectives.some((objective) => !reviewedLoIds.has(objective.objective_id))) {
      throw Object.assign(new Error("Review every Learning Objective before reviewing a Week."), { code: "OUTCOME_REVIEW_REQUIRED", statusCode: 409 });
    }
    const updated = await getStructureRepo().markWeekReviewed({ runId: request.params.runId, revision, sectionRef: request.params.sectionRef, moodleUserId });
    reply.send({ run_id: request.params.runId, structure_revision: serializeRevision(updated) });
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
    const currentContext = typeof (runRepo as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext === "function"
      ? await (runRepo as typeof runRepo & { getCoreCourseDesignContext: (id: string) => Promise<unknown> }).getCoreCourseDesignContext(runId)
      : null;
    if (currentContext) {
      const constraints = target.teacherConstraintsJson as Record<string, unknown>;
      const coverageOverrides = Array.isArray(constraints.coverage_overrides) ? constraints.coverage_overrides : [];
      const alignmentRevision = constraints.alignment_context_revision;
      if (constraints.alignment_state === "STALE_ALIGNMENT" || (alignmentRevision !== undefined && Number(alignmentRevision) !== (currentContext as { revision: number }).revision)) {
        throw new PlanningError("STRUCTURE_INVALID", "Structure alignment is stale against the current Core Course Design Context.", { alignment_context_revision: alignmentRevision, current_context_revision: (currentContext as { revision: number }).revision });
      }
      assertRequiredOutcomeApprovals(currentContext as import("@moodle-agent-poc/contracts").CoreCourseDesignContext);
      const coverage = deriveOutcomeCoverage(currentContext as import("@moodle-agent-poc/contracts").CoreCourseDesignContext, targetSections as any, coverageOverrides as any);
      assertOutcomeCoverage(coverage);
    }
    const moodleUserId = body.moodle_user_id === undefined ? undefined : parseRevision(body.moodle_user_id);
    await beginInstructionalDesignMutation(runRepo, runId);
    const sealed = await structureRepo.sealRevision({ runId, revision: target.revision, ...(moodleUserId !== undefined ? { moodleUserId } : {}) });
    if (run.status === "pending") await runRepo.updateStatus(runId, "planning");
    reply.send({ run_id: runId, status: "planning", structure_revision: serializeRevision(sealed) });
  });
};
