import {
  getDatabase,
  McpClientManager,
  RiskSnapshotRepository,
  type CourseRiskStateRecord,
} from '@moodle-agent-poc/agent-runtime';
import {
  CourseRefreshCoordinator,
  ManualRiskRefreshAdapter,
  MoodleEvidenceGateway,
  RiskRefreshError,
  RiskRefreshService,
} from '@moodle-agent-poc/risk-engine';
import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../config/config-loader.js';
import { requireRiskServiceRequest } from '../risk-service-auth.js';

export interface RiskStateReader {
  getCourseState(courseId: number): Promise<CourseRiskStateRecord | null>;
}

export interface RiskRefreshRoutesOptions {
  config: AppConfig;
  mcpClientManager?: McpClientManager | undefined;
  riskRefreshCoordinator?: CourseRefreshCoordinator | undefined;
  riskStateReader?: RiskStateReader | undefined;
}

function createConfiguredMcpManager(config: AppConfig): McpClientManager {
  const env: Record<string, string> = { PATH: process.env.PATH || '' };
  if (config.moodleBaseUrl) env.MOODLE_BASE_URL = config.moodleBaseUrl;
  if (config.moodleToken) env.MOODLE_TOKEN = config.moodleToken;
  return new McpClientManager({
    serverParams: {
      command: config.mcpServerCommand ?? 'node',
      args: [...(config.mcpServerArgs ?? ['apps/moodle-mcp-server/dist/index.js'])],
      env,
    },
  });
}

export const riskRefreshRoutes: FastifyPluginAsync<RiskRefreshRoutesOptions> = async (fastify, options) => {
  const { config, mcpClientManager: injectedMcp } = options;
  let stateReader = options.riskStateReader;
  let coordinator = options.riskRefreshCoordinator;

  // Lazy construction keeps unrelated API routes DB/MCP-free while preserving
  // one coordinator instance for all refresh requests handled by this Fastify app.
  const getCoordinator = (): CourseRefreshCoordinator => {
    if (coordinator) return coordinator;

    const snapshotRepo = new RiskSnapshotRepository(getDatabase());
    stateReader ??= snapshotRepo;
    const evidenceProvider = {
      async getCourseRiskEvidence(courseId: number) {
        const manager = injectedMcp ?? createConfiguredMcpManager(config);
        const ownsManager = injectedMcp === undefined;
        try {
          if (ownsManager) await manager.connect();
          return await new MoodleEvidenceGateway(manager).getCourseRiskEvidence(courseId);
        } finally {
          if (ownsManager) await manager.close();
        }
      },
    };
    coordinator = new CourseRefreshCoordinator(new RiskRefreshService(evidenceProvider, snapshotRepo));
    return coordinator;
  };

  fastify.post<{ Params: { courseId: string }; Body?: { change_origin_hint?: string } }>(
    '/api/risk/courses/:courseId/refresh',
    async (request, reply) => {
      const courseId = Number(request.params.courseId);
      if (!Number.isInteger(courseId) || courseId <= 0) {
        return reply.status(400).send({
          status: 'FAILED',
          error: { code: 'INVALID_COURSE_ID', message: 'courseId must be a positive integer' },
        });
      }

      if (!requireRiskServiceRequest(request, reply, config, courseId)) return;

      const changeOriginHint = request.body?.change_origin_hint;
      if (changeOriginHint !== undefined && !['LEARNING_EVENT', 'SOURCE_CORRECTION', 'UNKNOWN'].includes(changeOriginHint)) {
        return reply.status(400).send({
          status: 'FAILED',
          error: { code: 'INVALID_CHANGE_ORIGIN_HINT', message: 'change_origin_hint must be LEARNING_EVENT, SOURCE_CORRECTION, or UNKNOWN. POLICY_CHANGE is detected from the Risk Profile version and cannot be supplied by callers.' },
        });
      }

      try {
        const result = await new ManualRiskRefreshAdapter(getCoordinator()).refreshCourse(courseId, changeOriginHint as import('@moodle-agent-poc/risk-engine').RiskRefreshChangeOriginHint | undefined);
        return reply.status(200).send(result);
      } catch (error) {
        let currentState: CourseRiskStateRecord | null = null;
        if (stateReader) {
          try {
            currentState = await stateReader.getCourseState(courseId);
          } catch {
            currentState = null;
          }
        }
        const code = error instanceof RiskRefreshError ? error.code : 'RISK_REFRESH_FAILED';
        const message = error instanceof Error ? error.message : String(error);
        const sourceFailure = code === 'SOURCE_DATASET_FAILURE' || code === 'MISSING_DATASET_STATUS';
        return reply.status(sourceFailure ? 503 : 500).send({
          status: 'FAILED',
          course_id: courseId,
          error: { code, message },
          current_snapshot_id: currentState?.currentSnapshotId ?? null,
          previous_snapshot_id: currentState?.previousSnapshotId ?? null,
          last_successful_refresh_at: currentState?.lastSuccessfulRefreshAt ?? null,
          last_refresh_status: currentState?.lastRefreshStatus ?? 'FAILED',
        });
      }
    }
  );
};
