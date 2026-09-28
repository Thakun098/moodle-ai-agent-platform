import {
  ActivityIntentRepository,
  CompetencyCandidateRepository,
  CompetencyExecutionSnapshotRepository,
  CompetencyMappingReviewRepository,
  ExecutionMappingRepository,
  IdempotencyRepository,
  McpClientManager,
  MessageRepository,
  PlanRepository,
  RunRepository,
  ToolCallRepository,
  getDatabase,
} from "@moodle-agent-poc/agent-runtime";
import {
  type AssignmentPlanEnvelope,
  type AssignmentUpdateTarget,
  type CourseCreateTarget,
  type CoursePlanEnvelope,
  type ExecutionRequest,
  type ExistingSectionTarget,
  type QuizCreatePlanEnvelope,
  type QuizUpdatePlanEnvelope,
  type QuizUpdateTarget,
  validateExecutionRequest,
} from "@moodle-agent-poc/contracts";
import {
  CourseExecutionError,
  executeAssignmentPlan,
  executeCoursePlan,
  executeQuizCreate,
  executeQuizUpdate,
} from "@moodle-agent-poc/execution";
import { PlanningError, assertExecutionTargetCompatible } from "@moodle-agent-poc/planning";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { assertCompetencyExecutionSnapshotCurrent } from "../services/competency-execution-snapshot-service.js";
import { claimApprovedExecution } from "../services/instructional-design-run-lifecycle-service.js";

export interface ExecutionsRoutesOptions {
  config: AppConfig;
  planRepo?: PlanRepository;
  runRepo?: RunRepository;
  mappingRepo?: ExecutionMappingRepository;
  toolCallRepo?: ToolCallRepository;
  idempotencyRepo?: IdempotencyRepository;
  mcpClientManager?: McpClientManager;
  candidateRepo?: CompetencyCandidateRepository;
  activityIntentRepo?: ActivityIntentRepository;
  competencyReviewRepo?: CompetencyMappingReviewRepository;
  competencySnapshotRepo?: CompetencyExecutionSnapshotRepository;
}

function createConfiguredMcpManager(config: AppConfig): McpClientManager {
  const env: Record<string, string> = { PATH: process.env.PATH || "" };
  if (config.moodleBaseUrl) env.MOODLE_BASE_URL = config.moodleBaseUrl;
  if (config.moodleToken) env.MOODLE_TOKEN = config.moodleToken;
  return new McpClientManager({ serverParams: { command: config.mcpServerCommand ?? "node", args: [...(config.mcpServerArgs ?? ["apps/moodle-mcp-server/dist/index.js"])], env } });
}

export const executionsRoutes: FastifyPluginAsync<ExecutionsRoutesOptions> = async (fastify, options) => {
  const getPlanRepo = () => options.planRepo ?? new PlanRepository(getDatabase());
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getRepositories = () => {
    if (options.runRepo && options.mappingRepo && options.toolCallRepo && options.idempotencyRepo) {
      return { runRepo: options.runRepo, mappingRepo: options.mappingRepo, toolCallRepo: options.toolCallRepo, idempotencyRepo: options.idempotencyRepo };
    }
    const db = getDatabase();
    return {
      runRepo: options.runRepo ?? new RunRepository(db),
      mappingRepo: options.mappingRepo ?? new ExecutionMappingRepository(db),
      toolCallRepo: options.toolCallRepo ?? new ToolCallRepository(db),
      idempotencyRepo: options.idempotencyRepo ?? new IdempotencyRepository(db),
      messageRepo: new MessageRepository(db),
    };
  };

  fastify.post("/api/executions/validate", async (request, reply) => {
    const validation = validateExecutionRequest(request.body);
    if (!validation.valid) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "ExecutionRequest schema validation failed.", details: validation.errors, request_id: request.id } });
      return;
    }
    const execRequest = request.body as ExecutionRequest;
    const record = await getPlanRepo().getPlanRevision(execRequest.plan_id, execRequest.revision);
    if (!record) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Plan "${execRequest.plan_id}" revision ${execRequest.revision} not found.`, details: null, request_id: request.id } });
      return;
    }
    if (record.validationStatus !== "valid") throw new PlanningError("PLAN_DOMAIN_INVALID", "Target plan revision is not valid.");
    assertExecutionTargetCompatible(record.rawEnvelope, execRequest);
    reply.send({ valid: true, plan_id: execRequest.plan_id, revision: execRequest.revision, plan_type: record.planType, operation: record.operation, target: execRequest.target });
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/execute", async (request, reply) => {
    const { runId } = request.params;
    const validation = validateExecutionRequest(request.body);
    if (!validation.valid) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "ExecutionRequest schema validation failed.", details: validation.errors, request_id: request.id } });
      return;
    }
    const execRequest = request.body as ExecutionRequest;
    const run = await getRunRepo().getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run "${runId}" not found.`, details: null, request_id: request.id } });
      return;
    }
    const planRevision = await getPlanRepo().getPlanRevision(execRequest.plan_id, execRequest.revision);
    if (!planRevision) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Plan "${execRequest.plan_id}" revision ${execRequest.revision} not found.`, details: null, request_id: request.id } });
      return;
    }
    if (planRevision.runId !== runId) throw new CourseExecutionError("PLAN_OWNERSHIP_MISMATCH", "Plan belongs to a different run.");
    if (planRevision.validationStatus !== "valid") throw new PlanningError("PLAN_DOMAIN_INVALID", "Plan revision is not valid.");

    // Explicit Approval Gate
    if (
      run.approvedPlanId !== execRequest.plan_id ||
      run.approvedRevision !== execRequest.revision
    ) {
      reply.status(409).send({
        error: {
          code: "PLAN_NOT_APPROVED",
          message: `Plan revision ${execRequest.revision} for plan ${execRequest.plan_id} has not been approved for run ${runId}. Execution requires explicit approval of the exact plan revision.`,
          details: {
            approved_plan_id: run.approvedPlanId ?? null,
            approved_revision: run.approvedRevision ?? null,
            requested_plan_id: execRequest.plan_id,
            requested_revision: execRequest.revision,
          },
          request_id: request.id,
        },
      });
      return;
    }

    assertExecutionTargetCompatible(planRevision.rawEnvelope, execRequest);

    let competencySnapshot;
    if (planRevision.planType === "course" && planRevision.operation === "create") {
      const db = (!options.candidateRepo || !options.activityIntentRepo || !options.competencyReviewRepo || !options.competencySnapshotRepo) ? getDatabase() : undefined;
      const snapshotRepo = options.competencySnapshotRepo ?? new CompetencyExecutionSnapshotRepository(db!);
      competencySnapshot = await snapshotRepo.get(runId, execRequest.plan_id, execRequest.revision);
      if (!competencySnapshot) {
        reply.status(409).send({ error: { code: "COMPETENCY_EXECUTION_SNAPSHOT_REQUIRED", message: "This approved Course revision has no Competency execution snapshot. Re-approve before Execute.", details: null, request_id: request.id } });
        return;
      }
      try {
        await assertCompetencyExecutionSnapshotCurrent(competencySnapshot, {
          candidateRepo: options.candidateRepo ?? new CompetencyCandidateRepository(db!),
          activityIntentRepo: options.activityIntentRepo ?? new ActivityIntentRepository(db!),
          reviewRepo: options.competencyReviewRepo ?? new CompetencyMappingReviewRepository(db!),
          runRepo: getRunRepo(),
        });
      } catch (error) {
        reply.status(409).send({ error: { code: (error as { code?: string }).code ?? "COMPETENCY_EXECUTION_SNAPSHOT_STALE", message: error instanceof Error ? error.message : String(error), details: null, request_id: request.id } });
        return;
      }
    }

    if (planRevision.operation === "update" && !planRevision.executionContext) {
      reply.status(409).send({ error: { code: "EXECUTION_CONTEXT_REQUIRED", message: "This update revision has no pinned Moodle identity. Replan before execution.", details: null, request_id: request.id } });
      return;
    }
    const executionContext = planRevision.executionContext ?? await getPlanRepo().bindExecutionContext(
      execRequest.plan_id, execRequest.revision, { target: execRequest.target }
    );
    const sameTarget = Object.keys(execRequest.target).length === Object.keys(executionContext.target).length &&
      Object.entries(execRequest.target).every(([key, value]) => (executionContext.target as unknown as Record<string, unknown>)[key] === value);
    if (!sameTarget) {
      reply.status(409).send({ error: { code: "EXECUTION_TARGET_MISMATCH", message: "Execution target differs from the pinned revision target.", details: null, request_id: request.id } });
      return;
    }

    const manager = options.mcpClientManager ?? createConfiguredMcpManager(options.config);
    const owns = options.mcpClientManager === undefined;
    try {
      if (owns) await manager.connect();
      const repositories = getRepositories();
      const executionOptions = { toolTimeoutMs: options.config.agentToolTimeoutMs, runTimeoutMs: options.config.agentRunTimeoutMs };

      if (planRevision.planType === "course" && planRevision.operation === "create") {
        const configuredFormat = (run.syllabusMetadata as { course_format?: unknown } | null | undefined)?.course_format;
        const courseFormat = typeof configuredFormat === "string" && configuredFormat.trim() ? configuredFormat.trim() : "topics";
        const result = await executeCoursePlan({
          runId,
          planEnvelope: planRevision.rawEnvelope as unknown as CoursePlanEnvelope,
          target: execRequest.target as CourseCreateTarget,
          mcpClientManager: manager,
          repositories,
          options: { ...executionOptions, moodleBaseUrl: options.config.moodleBaseUrl, courseFormat },
          competencySnapshot,
          competencyFrameworkId: competencySnapshot?.frameworkId ?? undefined,
          beforeMutation: async () => {
            await assertCompetencyExecutionSnapshotCurrent(competencySnapshot!, {
              candidateRepo: options.candidateRepo ?? new CompetencyCandidateRepository(getDatabase()),
              activityIntentRepo: options.activityIntentRepo ?? new ActivityIntentRepository(getDatabase()),
              reviewRepo: options.competencyReviewRepo ?? new CompetencyMappingReviewRepository(getDatabase()),
              runRepo: getRunRepo(),
            });
            await claimApprovedExecution(getRunRepo(), { runId, planId: execRequest.plan_id, revision: execRequest.revision });
          },
        });
        reply.send({ run_id: runId, plan_id: execRequest.plan_id, revision: execRequest.revision, status: result.status, course_id: result.courseId, course_shortname: result.courseShortname, course_url: result.courseUrl, created_entities: result.createdEntities, mappings: result.mappings });
        return;
      }
      if (planRevision.planType === "assignment") {
        const result = await executeAssignmentPlan({ runId, planEnvelope: planRevision.rawEnvelope as unknown as AssignmentPlanEnvelope, target: execRequest.target as AssignmentUpdateTarget | ExistingSectionTarget, mcpClientManager: manager, repositories, options: executionOptions });
        reply.send({ run_id: runId, plan_id: result.planId, revision: result.revision, status: result.status, operation: result.operation, activity_id: result.activityId, assignment_id: result.assignmentId, verified: result.verified, observed: result.observed });
        return;
      }
      if (planRevision.planType === "quiz" && planRevision.operation === "update") {
        const result = await executeQuizUpdate({ runId, planEnvelope: planRevision.rawEnvelope as unknown as QuizUpdatePlanEnvelope, target: execRequest.target as QuizUpdateTarget, questionBindings: executionContext.questionBindings, mcpClientManager: manager, repositories, options: executionOptions });
        reply.send({ run_id: runId, plan_id: result.planId, revision: result.revision, status: result.status, operation: "update", activity_id: result.activityId, quiz_id: result.quizId, verified: result.verified, questions_count: result.questionsCount });
        return;
      }
      if (planRevision.planType === "quiz" && planRevision.operation === "create") {
        const result = await executeQuizCreate({ runId, planEnvelope: planRevision.rawEnvelope as unknown as QuizCreatePlanEnvelope, target: execRequest.target as ExistingSectionTarget, mcpClientManager: manager, repositories, options: executionOptions });
        reply.send({ run_id: runId, plan_id: result.planId, revision: result.revision, status: result.status, operation: "create", activity_id: result.activityId, quiz_id: result.quizId, verified: result.verified, questions_count: result.questionsCount });
        return;
      }
      throw new CourseExecutionError("INCOMPATIBLE_PLAN_OPERATION", `Execution for ${planRevision.planType}/${planRevision.operation} is not implemented.`);
    } finally {
      if (owns) await manager.close();
    }
  });
};
