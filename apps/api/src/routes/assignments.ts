import {
  McpClientManager,
  PlanRepository,
  RunRepository,
  getDatabase,
  type ModelClient,
} from "@moodle-agent-poc/agent-runtime";
import type { AssignmentUpdateTarget, SourceReference } from "@moodle-agent-poc/contracts";
import {
  readAssignmentState,
  toExistingAssignmentState,
} from "@moodle-agent-poc/execution";
import { AssignmentPlanner } from "@moodle-agent-poc/planning";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { createConfiguredModelClient } from "../config/model-client-factory.js";

export interface AssignmentRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository;
  planRepo?: PlanRepository;
  modelClient?: ModelClient;
  assignmentPlanner?: AssignmentPlanner;
  mcpClientManager?: McpClientManager;
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

export const assignmentRoutes: FastifyPluginAsync<AssignmentRoutesOptions> = async (
  fastify,
  options
) => {
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getPlanRepo = () => options.planRepo ?? new PlanRepository(getDatabase());
  const getModelClient = (): ModelClient => options.modelClient ?? createConfiguredModelClient(options.config);
  const getPlanner = () => options.assignmentPlanner ?? new AssignmentPlanner({
    modelClient: getModelClient(),
    planRepository: getPlanRepo(),
  });

  fastify.get<{ Params: { activityId: string } }>("/api/assignments/:activityId", async (request, reply) => {
    const activityId = Number(request.params.activityId);
    if (!Number.isInteger(activityId) || activityId <= 0) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "activityId must be a positive integer.", details: null, request_id: request.id } });
      return;
    }
    const manager = options.mcpClientManager ?? createConfiguredMcpManager(options.config);
    const owns = options.mcpClientManager === undefined;
    try {
      if (owns) await manager.connect();
      const observed = await readAssignmentState(manager, activityId);
      reply.send({ assignment: observed, planning_state: toExistingAssignmentState(observed) });
    } finally {
      if (owns) await manager.close();
    }
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/plans/assignment-update", async (request, reply) => {
    const { runId } = request.params;
    const body = request.body as {
      instruction?: string;
      target?: AssignmentUpdateTarget;
      source_context?: SourceReference[];
    };
    if (!body?.instruction?.trim()) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "instruction is required.", details: null, request_id: request.id } });
      return;
    }
    const target = body.target;
    if (!target || !Number.isInteger(target.course_id) || target.course_id <= 0 || !Number.isInteger(target.section_id) || target.section_id <= 0 || !Number.isInteger(target.activity_id) || target.activity_id <= 0) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "target must contain positive course_id, section_id, and activity_id.", details: null, request_id: request.id } });
      return;
    }
    const runRepo = getRunRepo();
    const run = await runRepo.getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run "${runId}" not found.`, details: null, request_id: request.id } });
      return;
    }

    const manager = options.mcpClientManager ?? createConfiguredMcpManager(options.config);
    const owns = options.mcpClientManager === undefined;
    await runRepo.updateStatus(runId, "planning");
    try {
      if (owns) await manager.connect();
      const observed = await readAssignmentState(manager, target.activity_id);
      if (observed.course_id !== target.course_id || observed.section_id !== target.section_id) {
        reply.status(409).send({ error: { code: "TARGET_STATE_MISMATCH", message: "The requested course/section target does not match Moodle assignment state.", details: { target, observed }, request_id: request.id } });
        await runRepo.updateStatus(runId, "preview");
        return;
      }
      const envelope = await getPlanner().planAssignmentUpdate({
        input: {
          current: toExistingAssignmentState(observed),
          instruction: body.instruction.trim(),
          ...(body.source_context ? { source_context: body.source_context } : {}),
        },
        runId,
        model: options.config.modelName,
        timeoutMs: options.config.agentModelTimeoutMs,
      });
      await runRepo.updateStatus(runId, "preview");
      reply.status(201).send({ plan: envelope, target, preview_url: `/api/plans/${envelope.plan_id}/preview?revision=${envelope.revision}` });
    } catch (err) {
      await runRepo.failRun(runId, err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      if (owns) await manager.close();
    }
  });
};
