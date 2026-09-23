import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import { ActivityIntentRepository, CompetencyCandidateRepository, CompetencyExecutionSnapshotRepository, CompetencyMappingReviewRepository, getDatabase, McpClientManager, PlanRepository, RunRepository } from "@moodle-agent-poc/agent-runtime";
import { listCourseFormats } from "@moodle-agent-poc/execution";
import {
  deriveCoreCourseDesignContext,
  detectMediaType,
  ingestSyllabus,
  MAX_SYLLABUS_FILE_SIZE,
  SyllabusIngestionError,
} from "@moodle-agent-poc/syllabus";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { captureCompetencyExecutionSnapshot } from "../services/competency-execution-snapshot-service.js";

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".docx", ".pdf"]);

export interface RunsRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository | undefined;
  planRepo?: PlanRepository | undefined;
  mcpClientManager?: McpClientManager | undefined;
  candidateRepo?: CompetencyCandidateRepository | undefined;
  activityIntentRepo?: ActivityIntentRepository | undefined;
  competencyReviewRepo?: CompetencyMappingReviewRepository | undefined;
  competencySnapshotRepo?: CompetencyExecutionSnapshotRepository | undefined;
}

function createConfiguredMcpManager(config: AppConfig): McpClientManager {
  const env: Record<string, string> = { PATH: process.env.PATH || "" };
  if (config.moodleBaseUrl) env.MOODLE_BASE_URL = config.moodleBaseUrl;
  if (config.moodleToken) env.MOODLE_TOKEN = config.moodleToken;

  return new McpClientManager({
    serverParams: {
      command: config.mcpServerCommand ?? "node",
      args: [...(config.mcpServerArgs ?? ["apps/moodle-mcp-server/dist/index.js"])],
      env,
    },
  });
}

export const runsRoutes: FastifyPluginAsync<RunsRoutesOptions> = async (
  fastify,
  options
) => {
  const {
    config,
    runRepo: injectedRepo,
    planRepo: injectedPlanRepo,
    mcpClientManager: injectedMcp,
    candidateRepo: injectedCandidateRepo,
    activityIntentRepo: injectedActivityIntentRepo,
    competencyReviewRepo: injectedCompetencyReviewRepo,
    competencySnapshotRepo: injectedCompetencySnapshotRepo,
  } = options;

  // Lazy resolution so booting Fastify without DATABASE_URL does not fail for /health
  const getRunRepo = (): RunRepository => {
    if (injectedRepo) {
      return injectedRepo;
    }
    return new RunRepository(getDatabase());
  };

  const getPlanRepo = (): PlanRepository => {
    if (injectedPlanRepo) {
      return injectedPlanRepo;
    }
    return new PlanRepository(getDatabase());
  };

  fastify.post("/api/runs", async (request, reply) => {
    // 1. Process multipart upload
    const fileData = await request.file();
    if (!fileData) {
      throw new SyllabusIngestionError(
        "EMPTY_CONTENT",
        "No syllabus file provided in multipart request."
      );
    }

    const filename = fileData.filename || "syllabus.txt";
    const ext = extname(filename).toLowerCase();

    // 2. Request-level validation: supported extension
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new SyllabusIngestionError(
        "UNSUPPORTED_FILE_TYPE",
        `Unsupported syllabus file type: "${filename}". Allowed formats: .txt, .md, .docx, .pdf`
      );
    }

    const buffer = await fileData.toBuffer();

    const courseFormatField = (fileData.fields as Record<string, { value?: unknown }> | undefined)?.course_format;
    const courseFormat = typeof courseFormatField?.value === "string" && courseFormatField.value.trim()
      ? courseFormatField.value.trim()
      : undefined;
    if (!courseFormat) {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "course_format is required.",
          details: null,
          request_id: request.id,
        },
      });
      return;
    }
    if (!/^[a-z][a-z0-9_-]*$/u.test(courseFormat)) {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "course_format must be a valid Moodle course-format identifier.",
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    const manager = injectedMcp ?? createConfiguredMcpManager(config);
    const ownsManager = injectedMcp === undefined;
    let availableFormats;
    try {
      if (ownsManager) await manager.connect();
      availableFormats = await listCourseFormats(manager);
    } finally {
      if (ownsManager) await manager.close();
    }
    if (!availableFormats.some((format) => format.value === courseFormat)) {
      reply.status(400).send({
        error: {
          code: "COURSE_FORMAT_UNAVAILABLE",
          message: `course_format "${courseFormat}" is not available on the target Moodle site.`,
          details: { available_formats: availableFormats },
          request_id: request.id,
        },
      });
      return;
    }

    // 3. Request-level validation: file size
    if (fileData.file.truncated || buffer.length > MAX_SYLLABUS_FILE_SIZE) {
      throw new SyllabusIngestionError(
        "FILE_TOO_LARGE",
        `Uploaded syllabus file exceeds maximum allowed size of 10 MB (size: ${buffer.length} bytes).`
      );
    }

    if (buffer.length === 0) {
      throw new SyllabusIngestionError(
        "EMPTY_CONTENT",
        "Uploaded syllabus file contains 0 bytes."
      );
    }

    // 4. Calculate SHA-256 hash immediately on raw uploaded bytes (R5)
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const mediaType = detectMediaType(filename, fileData.mimetype);

    // 5. Request validation passed -> Create poc_run record with status="pending" (P4-D2)
    const runRepo = getRunRepo();
    const runId = randomUUID();

    const runRecord = await runRepo.createRun({
      runId,
      model: config.modelName,
      status: "pending",
      syllabusMetadata: {
        filename,
        byte_size: buffer.length,
        media_type: mediaType,
        sha256,
        course_format: courseFormat,
      },
    });

    // 6. Perform deterministic ingestion (extraction, normalization, Ajv validation)
    try {
      const normalized = await ingestSyllabus({
        content: buffer,
        filename,
        mediaType: fileData.mimetype,
      });

      // Update run with normalized syllabus
      const coreContext = deriveCoreCourseDesignContext(normalized, runId);
      await runRepo.initializeCoreCourseDesignContext(runId, normalized, coreContext);

      reply.status(201).send({
        run_id: runId,
        status: "pending",
        model: config.modelName,
        syllabus: {
          course_title: normalized.course_title ?? null,
          sections_count: normalized.schedule_or_topics.length,
          objectives_count: normalized.learning_objectives.length,
        },
        core_course_design_context: coreContext,
        course_format: courseFormat,
        created_at: runRecord.createdAt,
      });
    } catch (err: unknown) {
      // Ingestion failure after run creation -> Transition poc_run to "failed"
      const errorMessage = err instanceof Error ? err.message : String(err);
      request.log.warn({ err, run_id: runId }, "Syllabus extraction failed");
      await runRepo.failRun(runId, errorMessage);
      throw err;
    }
  });

  // POST /api/runs/:runId/approve — Explicit Approval Gate
  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/approve", async (request, reply) => {
    const { runId } = request.params;
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

    const { plan_id, revision, moodle_user_id, acknowledge_ai_expanded_content } = body;
    if (typeof plan_id !== "string" || !plan_id.trim()) {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "plan_id is required and must be a non-empty string.",
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    const revNum = typeof revision === "number" ? revision : Number(revision);
    if (!Number.isSafeInteger(revNum) || revNum < 1) {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: `Invalid revision: "${revision}". Must be a positive integer.`,
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    const runRepo = getRunRepo();
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

    // State Guard: only permit approval while in "preview" state
    if (run.status !== "preview") {
      reply.status(409).send({
        error: {
          code: "RUN_STATE_INVALID",
          message: `Cannot approve plan: run ${runId} is currently in "${run.status}" state. Approval is only permitted while in "preview" state.`,
          details: {
            current_status: run.status,
          },
          request_id: request.id,
        },
      });
      return;
    }

    const planRepo = getPlanRepo();
    const planRevision = await planRepo.getPlanRevision(plan_id, revNum);
    if (!planRevision) {
      reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: `Plan "${plan_id}" revision ${revNum} not found`,
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    if (planRevision.runId !== runId) {
      reply.status(409).send({
        error: {
          code: "PLAN_OWNERSHIP_MISMATCH",
          message: `Plan ${plan_id} belongs to a different run (${planRevision.runId}), not ${runId}.`,
          details: null,
          request_id: request.id,
        },
      });
      return;
    }

    if (planRevision.validationStatus !== "valid") {
      reply.status(422).send({
        error: {
          code: "PLAN_INVALID",
          message: `Cannot approve plan revision ${revNum}: validation status is "${planRevision.validationStatus}".`,
          details: planRevision.validationErrors ?? null,
          request_id: request.id,
        },
      });
      return;
    }

    const reviewRequirements = Array.isArray(planRevision.reviewRequirements) ? planRevision.reviewRequirements : [];
    const requiresAiReview = reviewRequirements.some((requirement) => requirement && typeof requirement === "object" && (requirement as { code?: unknown }).code === "AI_EXPANDED_CONTENT");
    if (requiresAiReview && acknowledge_ai_expanded_content !== true) {
      reply.status(409).send({
        error: {
          code: "TEACHER_REVIEW_REQUIRED",
          message: "This Plan Revision contains AI-expanded Activity content. Teacher review acknowledgment is required before Approval.",
          details: { review_requirements: reviewRequirements },
          request_id: request.id,
        },
      });
      return;
    }

    const db = (!injectedCandidateRepo || !injectedActivityIntentRepo || !injectedCompetencyReviewRepo || !injectedCompetencySnapshotRepo) ? getDatabase() : undefined;
    await captureCompetencyExecutionSnapshot({
      runId,
      planId: plan_id,
      revision: revNum,
      frameworkId: options.config.moodleCompetencyFrameworkId ?? null,
      dependencies: {
        candidateRepo: injectedCandidateRepo ?? new CompetencyCandidateRepository(db!),
        activityIntentRepo: injectedActivityIntentRepo ?? new ActivityIntentRepository(db!),
        reviewRepo: injectedCompetencyReviewRepo ?? new CompetencyMappingReviewRepository(db!),
        snapshotRepo: injectedCompetencySnapshotRepo ?? new CompetencyExecutionSnapshotRepository(db!),
      },
    });

    const updatedRun = await runRepo.approvePlan({
      runId,
      planId: plan_id,
      revision: revNum,
      ...(moodle_user_id !== undefined ? { approvedByMoodleUserId: String(moodle_user_id) } : {}),
    });

    reply.send({
      run_id: runId,
      plan_id,
      revision: revNum,
      status: "approved",
      approved_at: updatedRun.approvedAt,
      approved_by_moodle_user_id: updatedRun.approvedByMoodleUserId ?? null,
    });
  });

  fastify.get<{ Params: { runId: string } }>("/api/runs/:runId/core-context", async (request, reply) => {
    const context = await getRunRepo().getCoreCourseDesignContext(request.params.runId);
    if (!context) return reply.status(404).send({ error: { code: "CORE_CONTEXT_NOT_FOUND", message: "No persisted Core Course Design Context for this run." } });
    return { core_course_design_context: context };
  });

  // P4-D9: Keep GET /api/runs/:runId endpoint
  fastify.get("/api/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const runRepo = getRunRepo();
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

    reply.send(run);
  });
};
