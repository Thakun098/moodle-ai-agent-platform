import {
  McpClientManager,
  PlanRepository,
  RunRepository,
  getDatabase,
  type ModelClient,
} from "@moodle-agent-poc/agent-runtime";
import type { QuizUpdateTarget, SourceReference } from "@moodle-agent-poc/contracts";
import {
  readQuizState,
  resolveQuizActivityId,
  toExistingQuizState,
} from "@moodle-agent-poc/execution";
import { QuizPlanner } from "@moodle-agent-poc/planning";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { createConfiguredModelClient } from "../config/model-client-factory.js";

export interface QuizRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository;
  planRepo?: PlanRepository;
  modelClient?: ModelClient;
  quizPlanner?: QuizPlanner;
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

export const quizRoutes: FastifyPluginAsync<QuizRoutesOptions> = async (fastify, options) => {
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getPlanRepo = () => options.planRepo ?? new PlanRepository(getDatabase());
  const getModelClient = (): ModelClient => options.modelClient ?? createConfiguredModelClient(options.config);
  const getPlanner = () => options.quizPlanner ?? new QuizPlanner({
    modelClient: getModelClient(),
    planRepository: getPlanRepo(),
  });

  fastify.get<{ Params: { activityId: string } }>("/api/quizzes/:activityId", async (request, reply) => {
    const activityId = Number(request.params.activityId);
    if (!Number.isInteger(activityId) || activityId <= 0) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "activityId must be a positive integer.", details: null, request_id: request.id } });
      return;
    }
    const manager = options.mcpClientManager ?? createConfiguredMcpManager(options.config);
    const owns = options.mcpClientManager === undefined;
    try {
      if (owns) await manager.connect();
      const observed = await readQuizState(manager, activityId);
      reply.send({ quiz: observed.quiz, questions: observed.questions, planning_state: toExistingQuizState(observed.quiz, observed.questions) });
    } finally {
      if (owns) await manager.close();
    }
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/plans/quiz-update", async (request, reply) => {
    const { runId } = request.params;
    const body = request.body as { instruction?: string; target?: QuizUpdateTarget; source_context?: SourceReference[] };
    if (!body?.instruction?.trim()) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "instruction is required.", details: null, request_id: request.id } });
      return;
    }
    const target = body.target;
    if (!target || ![target.course_id, target.section_id, target.quiz_id].every((v) => Number.isInteger(v) && v > 0)) {
      reply.status(400).send({ error: { code: "BAD_REQUEST", message: "target must contain positive course_id, section_id, and quiz_id.", details: null, request_id: request.id } });
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
      const activityId = await resolveQuizActivityId(manager, target);
      const observed = await readQuizState(manager, activityId);
      const envelope = await getPlanner().planQuizUpdate({
        input: {
          current: toExistingQuizState(observed.quiz, observed.questions),
          instruction: body.instruction.trim(),
          ...(body.source_context ? { source_context: body.source_context } : {}),
        },
        runId,
        model: options.config.modelName,
        timeoutMs: options.config.agentModelTimeoutMs,
      });
      await runRepo.updateStatus(runId, "preview");
      reply.status(201).send({ plan: envelope, target, resolved_activity_id: activityId, preview_url: `/api/plans/${envelope.plan_id}/preview?revision=${envelope.revision}` });
    } catch (err) {
      await runRepo.failRun(runId, err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      if (owns) await manager.close();
    }
  });
};
