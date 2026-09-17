import {
  CompetencyExecutionSnapshotRepository,
  ExecutionMappingRepository,
  McpClientManager,
  PlanRepository,
  RunRepository,
  VerificationRepository,
  getDatabase,
} from "@moodle-agent-poc/agent-runtime";
import type { CoursePlanEnvelope } from "@moodle-agent-poc/contracts";
import { verifyCoursePlan } from "@moodle-agent-poc/verification";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";

export interface VerificationRoutesOptions {
  config: AppConfig;
  planRepo?: PlanRepository;
  runRepo?: RunRepository;
  mappingRepo?: ExecutionMappingRepository;
  verificationRepo?: VerificationRepository;
  mcpClientManager?: McpClientManager;
  competencySnapshotRepo?: CompetencyExecutionSnapshotRepository;
}

function createConfiguredMcpManager(config: AppConfig): McpClientManager {
  const env: Record<string, string> = { PATH: process.env.PATH || "" };
  if (config.moodleBaseUrl) env.MOODLE_BASE_URL = config.moodleBaseUrl;
  if (config.moodleToken) env.MOODLE_TOKEN = config.moodleToken;
  return new McpClientManager({ serverParams: { command: config.mcpServerCommand ?? "node", args: [...(config.mcpServerArgs ?? ["apps/moodle-mcp-server/dist/index.js"])], env } });
}

async function assertVerificationAuthority(runRepo: RunRepository, run: any, input: { runId: string; planId: string; revision: number }): Promise<void> {
  const extended = runRepo as RunRepository & { assertApprovedVerification?: (value: typeof input) => Promise<unknown> };
  if (typeof extended.assertApprovedVerification === "function") {
    await extended.assertApprovedVerification(input);
    return;
  }
  if (run?.approvedPlanId !== input.planId || run?.approvedRevision !== input.revision) {
    throw Object.assign(new Error("Verification target is not the current approved execution authority."), { code: "VERIFICATION_AUTHORITY_STALE", statusCode: 409 });
  }
  if (run?.status !== "awaiting_verification") {
    throw Object.assign(new Error(`Verification requires awaiting_verification; current run status is ${String(run?.status)}.`), { code: "VERIFICATION_STATE_INVALID", statusCode: 409 });
  }
}

export const verificationRoutes: FastifyPluginAsync<VerificationRoutesOptions> = async (fastify, options) => {
  const getRepos = () => {
    if (options.planRepo && options.runRepo && options.mappingRepo && options.verificationRepo) {
      return { planRepo: options.planRepo, runRepo: options.runRepo, mappingRepo: options.mappingRepo, verificationRepo: options.verificationRepo };
    }
    const db = getDatabase();
    return {
      planRepo: options.planRepo ?? new PlanRepository(db),
      runRepo: options.runRepo ?? new RunRepository(db),
      mappingRepo: options.mappingRepo ?? new ExecutionMappingRepository(db),
      verificationRepo: options.verificationRepo ?? new VerificationRepository(db),
    };
  };

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/verify", async (request, reply) => {
    const { runId } = request.params;
    const body = request.body as { plan_id?: string; revision?: number };
    if (!body?.plan_id || !Number.isInteger(body.revision) || Number(body.revision) <= 0) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "plan_id and positive revision are required.", details: null, request_id: request.id } });
      return;
    }
    const repos = getRepos();
    const run = await repos.runRepo.getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run "${runId}" not found.`, details: null, request_id: request.id } });
      return;
    }
    const plan = await repos.planRepo.getPlanRevision(body.plan_id, body.revision!);
    if (!plan) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Plan "${body.plan_id}" revision ${body.revision} not found.`, details: null, request_id: request.id } });
      return;
    }
    if (plan.runId !== runId || plan.planType !== "course" || plan.operation !== "create" || plan.validationStatus !== "valid") {
      reply.status(400).send({ error: { code: "INVALID_VERIFICATION_TARGET", message: "Verification requires a valid course/create plan belonging to the requested run.", details: null, request_id: request.id } });
      return;
    }

    await assertVerificationAuthority(repos.runRepo, run, { runId, planId: body.plan_id, revision: body.revision! });

    const manager = options.mcpClientManager ?? createConfiguredMcpManager(options.config);
    const owns = options.mcpClientManager === undefined;
    try {
      if (owns) await manager.connect();
      const competencySnapshotRepo = options.competencySnapshotRepo ?? new CompetencyExecutionSnapshotRepository(getDatabase());
      const competencySnapshot = await competencySnapshotRepo.get(runId, body.plan_id, body.revision!);
      if (!competencySnapshot) {
        reply.status(409).send({ error: { code: "COMPETENCY_EXECUTION_SNAPSHOT_REQUIRED", message: "Verification requires the exact approved Competency execution snapshot for this CoursePlan revision.", details: null, request_id: request.id } });
        return;
      }
      const result = await verifyCoursePlan({
        runId,
        planEnvelope: plan.rawEnvelope as unknown as CoursePlanEnvelope,
        mcpClientManager: manager,
        repositories: { mappingRepo: repos.mappingRepo, verificationRepo: repos.verificationRepo, runRepo: repos.runRepo },
        courseFormat: ((run.syllabusMetadata as { course_format?: unknown } | null | undefined)?.course_format as string | undefined),
        categoryId: plan.executionContext && "category_id" in plan.executionContext.target ? plan.executionContext.target.category_id : undefined,
        competencySnapshot,
        competencyFrameworkId: options.config.moodleCompetencyFrameworkId,
      });
      reply.status(result.passed ? 200 : 409).send(result);
    } finally {
      if (owns) await manager.close();
    }
  });

  fastify.get<{ Params: { runId: string }; Querystring: { plan_id?: string; revision?: string } }>("/api/runs/:runId/verification", async (request, reply) => {
    const { runId } = request.params;
    const planId = request.query.plan_id;
    const revision = Number(request.query.revision);
    if (!planId || !Number.isInteger(revision) || revision <= 0) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "plan_id and positive revision query parameters are required.", details: null, request_id: request.id } });
      return;
    }
    const record = await getRepos().verificationRepo.getLatestVerification(runId, planId, revision);
    if (!record) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: "Verification result not found.", details: null, request_id: request.id } });
      return;
    }
    reply.send(record);
  });
};
