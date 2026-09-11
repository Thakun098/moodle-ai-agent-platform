import {
  getDatabase,
  PlanRepository,
  RunRepository,
  type ModelClient,
} from "@moodle-agent-poc/agent-runtime";
import type { AnyPlanEnvelope } from "@moodle-agent-poc/contracts";
import {
  buildPlanPreview,
  CoursePlanner,
  PlanRevisionHelper,
  getPlanningProgress,
} from "@moodle-agent-poc/planning";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { createConfiguredModelClient } from "../config/model-client-factory.js";

function parsePositiveRevision(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}
export interface PlansRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository | undefined;
  planRepo?: PlanRepository | undefined;
  modelClient?: ModelClient | undefined;
  coursePlanner?: CoursePlanner | undefined;
  planRevisionHelper?: PlanRevisionHelper | undefined;
}

export const plansRoutes: FastifyPluginAsync<PlansRoutesOptions> = async (
  fastify,
  options
) => {
  const {
    config,
    runRepo: injectedRunRepo,
    planRepo: injectedPlanRepo,
    modelClient: injectedModelClient,
    coursePlanner: injectedCoursePlanner,
    planRevisionHelper: injectedPlanRevisionHelper,
  } = options;

  const getRunRepo = (): RunRepository => {
    if (injectedRunRepo) return injectedRunRepo;
    return new RunRepository(getDatabase());
  };

  const getPlanRepo = (): PlanRepository => {
    if (injectedPlanRepo) return injectedPlanRepo;
    return new PlanRepository(getDatabase());
  };

  const getModelClient = (): ModelClient => {
    if (injectedModelClient) return injectedModelClient;
    return createConfiguredModelClient(config);
  };

  const getCoursePlanner = (): CoursePlanner => {
    if (injectedCoursePlanner) return injectedCoursePlanner;
    return new CoursePlanner({
      modelClient: getModelClient(),
      planRepository: getPlanRepo(),
    });
  };

  const getPlanRevisionHelper = (): PlanRevisionHelper => {
    if (injectedPlanRevisionHelper) return injectedPlanRevisionHelper;
    return new PlanRevisionHelper(getPlanRepo());
  };

  const buildPersistedPreview = async (record: { runId: string; rawEnvelope: unknown }) => {
    const preview = buildPlanPreview(record.rawEnvelope as AnyPlanEnvelope);
    const run = await getRunRepo().getRun(record.runId);
    const courseFormat = (run?.syllabusMetadata as { course_format?: unknown } | null | undefined)?.course_format;
    return {
      ...preview,
      ...(typeof courseFormat === "string" && courseFormat
        ? { execution_config: { course_format: courseFormat } }
        : {}),
    };
  };

  // 1. POST /api/runs/:runId/plans/course (T0601, T0604)
  fastify.post("/api/runs/:runId/plans/course", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const runRepo = getRunRepo();
    const planRepo = getPlanRepo();
    const coursePlanner = getCoursePlanner();

    const run = await runRepo.getRun(runId);
    if (!run) {
      reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: `Run ${runId} not found`,
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    if (!run.normalizedSyllabus) {
      reply.status(422).send({
        error: {
          code: "UNPROCESSABLE_ENTITY",
          message: `Run ${runId} does not contain a normalized syllabus for course planning.`,
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    // Initial generation is single-lineage per run. Further changes must create revisions.
    const existingCoursePlan = (await planRepo.listRunPlans(runId)).find(
      (record) => record.planType === "course" && record.operation === "create"
    );
    if (existingCoursePlan) {
      reply.status(409).send({
        error: {
          code: "CONFLICT",
          message: `A course plan already exists for run ${runId} (plan ${existingCoursePlan.planId}, revision ${existingCoursePlan.revision}). Create a new revision instead of generating another initial plan.`,
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    reply.status(409).send({
      error: {
        code: "STAGED_COURSE_CREATION_REQUIRED",
        message: "Initial Course Creation now requires Course Structure → Material Snapshot → Section generation → Finalization. Use POST /api/runs/:runId/course-structure.",
        details: { run_id: runId },
        request_id: request.id,
      },
    });
    return;
  });

  // Planning progress is read-only and intentionally in-memory for the POC.
  fastify.get("/api/runs/:runId/progress", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await getRunRepo().getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    const progress = getPlanningProgress(runId);
    const planning = progress
      ? {
          stage: progress.stage,
          ...(progress.completedChunks !== undefined ? { completed_chunks: progress.completedChunks } : {}),
          ...(progress.totalChunks !== undefined ? { total_chunks: progress.totalChunks } : {}),
          ...(progress.completedSections !== undefined ? { completed_sections: progress.completedSections } : {}),
          ...(progress.totalSections !== undefined ? { total_sections: progress.totalSections } : {}),
          ...(progress.currentSectionRefs ? { current_sections: progress.currentSectionRefs } : {}),
        }
      : { stage: run.status === "preview" ? "ready_for_preview" : "normalizing_syllabus" };
    reply.send({ run_id: runId, status: run.status, planning });
  });

  // 2. GET /api/plans/:planId (T0601, T0602, T0603)
  fastify.get("/api/plans/:planId", async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const { revision } = request.query as { revision?: string };
    const planRepo = getPlanRepo();

    let record = null;
    if (revision !== undefined) {
      const revNum = parsePositiveRevision(revision);
      if (revNum === null) {
        reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: `Invalid revision query parameter: "${revision}". Must be a positive integer.`,
            details: null,
            request_id: request.id,
          },
        });
        return;
      }
      record = await planRepo.getPlanRevision(planId, revNum);
    } else {
      record = await planRepo.getLatestRevision(planId);
    }

    if (!record) {
      reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: `Plan ${planId}${revision !== undefined ? ` (revision ${revision})` : ""} not found`,
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    reply.send(record);
  });

  // 3. GET /api/plans/:planId/preview (T0601, T0602, T0603, T0604)
  fastify.get("/api/plans/:planId/preview", async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const { revision } = request.query as { revision?: string };
    const planRepo = getPlanRepo();

    let record = null;
    if (revision !== undefined) {
      const revNum = parsePositiveRevision(revision);
      if (revNum === null) {
        reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: `Invalid revision query parameter: "${revision}". Must be a positive integer.`,
            details: null,
            request_id: request.id,
          },
        });
        return;
      }
      record = await planRepo.getPlanRevision(planId, revNum);
    } else {
      record = await planRepo.getLatestRevision(planId);
    }

    if (!record) {
      reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: `Plan ${planId}${revision !== undefined ? ` (revision ${revision})` : ""} not found for preview`,
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    const preview = await buildPersistedPreview(record);
    reply.send(preview);
  });

  // 4. GET /api/plans/:planId/revisions
  fastify.get("/api/plans/:planId/revisions", async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const planRepo = getPlanRepo();

    const records = await planRepo.listPlanRevisions(planId);
    if (records.length === 0) {
      reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: `No revisions found for plan ${planId}`,
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    reply.send(records);
  });

  // 5. POST /api/plans/:planId/revisions (T0605 - Direct user edits)
  fastify.post("/api/plans/:planId/revisions", async (request, reply) => {
    const { planId } = request.params as { planId: string };
    const body = request.body as any;

    if (!body || typeof body !== "object") {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Request body is required.",
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    const editedEnvelope: AnyPlanEnvelope = body.edited_envelope || body;
    const changeSummary: string | undefined = typeof body.summary === "string" ? body.summary : undefined;

    if (!editedEnvelope || typeof editedEnvelope !== "object") {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "edited_envelope is required.",
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    const revisionHelper = getPlanRevisionHelper();
    const newRecord = await revisionHelper.createDirectUserEdit({
      planId,
      editedEnvelope,
      ...(changeSummary !== undefined ? { changeSummary } : {}),
    });

    const preview = await buildPersistedPreview(newRecord);

    reply.status(201).send({
      plan: newRecord,
      preview,
    });
  });
};

