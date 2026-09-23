import multipart from "@fastify/multipart";
import type {
  ActivityIntentRepository,
  ActivityRevisionRepository,
  CourseStructureRevisionRepository,
  CompetencyCandidateRepository,
  CompetencyExecutionSnapshotRepository,
  CompetencyMappingReviewRepository,
  ExecutionMappingRepository,
  IdempotencyRepository,
  McpClientManager,
  ModelClient,
  OutcomeReviewRepository,
  PlanRepository,
  RunRepository,
  SectionActivityDraftRepository,
  ToolCallRepository,
  VerificationRepository,
} from "@moodle-agent-poc/agent-runtime";
import type {
  AssignmentPlanner,
  CourseStructurePlanner,
  CoursePlanner,
  PlanRevisionHelper,
  QuizPlanner,
} from "@moodle-agent-poc/planning";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { AppConfig } from "./config/config-loader.js";
import { registerCorrelation } from "./plugins/correlation.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { assignmentRoutes } from "./routes/assignments.js";
import { activityIntentRoutes } from "./routes/activity-intents.js";
import { activityGenerationRoutes } from "./routes/activity-generation.js";
import { activityEditRoutes } from "./routes/activity-edits.js";
import { categoriesRoutes } from "./routes/categories.js";
import { executionsRoutes } from "./routes/executions.js";
import { healthRoutes } from "./routes/health.js";
import { plansRoutes } from "./routes/plans.js";
import { quizRoutes } from "./routes/quizzes.js";
import { runsRoutes } from "./routes/runs.js";
import { courseStructureRoutes } from "./routes/course-structure.js";
import { instructionalDesignRoutes } from "./routes/instructional-design.js";
import { competencyMappingRoutes } from "./routes/competency-mappings.js";
import { outcomeReviewRoutes } from "./routes/outcome-reviews.js";
import { materialSnapshotRoutes } from "./routes/material-snapshots.js";
import { riskDashboardRoutes, type RiskDashboardRepository } from "./routes/risk-dashboard.js";
import { riskInsightRoutes, type RiskInsightUseCase } from "./routes/risk-insights.js";
import { riskRefreshRoutes } from "./routes/risk-refresh.js";
import { sectionGenerationRoutes } from "./routes/section-generation.js";
import { verificationRoutes } from "./routes/verifications.js";

export interface BuildAppOptions {
  readonly config: AppConfig;
  readonly fastifyOptions?: FastifyServerOptions | undefined;
  readonly runRepo?: RunRepository | undefined;
  readonly planRepo?: PlanRepository | undefined;
  readonly modelClient?: ModelClient | undefined;
  readonly coursePlanner?: CoursePlanner | undefined;
  readonly assignmentPlanner?: AssignmentPlanner | undefined;
  readonly quizPlanner?: QuizPlanner | undefined;
  readonly planRevisionHelper?: PlanRevisionHelper | undefined;
  readonly structureRevisionRepo?: CourseStructureRevisionRepository | undefined;
  readonly structurePlanner?: CourseStructurePlanner | undefined;
  readonly snapshotRepo?: import("@moodle-agent-poc/agent-runtime").MaterialSnapshotRepository | undefined;
  readonly materialStateRepo?: import("@moodle-agent-poc/agent-runtime").MaterialSectionStateRepository | undefined;
  readonly draftRepo?: SectionActivityDraftRepository | undefined;
  readonly activityIntentRepo?: ActivityIntentRepository | undefined;
  readonly activityRevisionRepo?: ActivityRevisionRepository | undefined;
  readonly candidateRepo?: CompetencyCandidateRepository | undefined;
  readonly outcomeReviewRepo?: OutcomeReviewRepository | undefined;
  readonly competencyReviewRepo?: CompetencyMappingReviewRepository | undefined;
  readonly competencySnapshotRepo?: CompetencyExecutionSnapshotRepository | undefined;
  readonly mcpClientManager?: McpClientManager | undefined;
  readonly mappingRepo?: ExecutionMappingRepository | undefined;
  readonly toolCallRepo?: ToolCallRepository | undefined;
  readonly idempotencyRepo?: IdempotencyRepository | undefined;
  readonly verificationRepo?: VerificationRepository | undefined;
  readonly riskDashboardRepo?: RiskDashboardRepository | undefined;
  readonly riskInsightService?: RiskInsightUseCase | undefined;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const {
    config, fastifyOptions, runRepo, planRepo, modelClient, coursePlanner, assignmentPlanner, quizPlanner,
    planRevisionHelper, structureRevisionRepo, structurePlanner, snapshotRepo, materialStateRepo, draftRepo, activityIntentRepo, activityRevisionRepo, candidateRepo, outcomeReviewRepo, competencyReviewRepo, competencySnapshotRepo, mcpClientManager, mappingRepo, toolCallRepo, idempotencyRepo, verificationRepo, riskDashboardRepo, riskInsightService,
  } = options;

  const defaultLoggerOptions = {
    level: config.logLevel,
    serializers: {
      req(req: any) { return { method: req.method, url: req.url, request_id: req.id, run_id: req.runId, remoteAddress: req.ip }; },
      res(res: any) { return { statusCode: res.statusCode, request_id: res.request?.id, run_id: res.request?.runId }; },
    },
  };

  const app = Fastify({ requestIdHeader: "x-request-id", logger: fastifyOptions?.logger ?? defaultLoggerOptions, ...fastifyOptions });
  registerCorrelation(app);
  registerErrorHandler(app);
  // The material workflow allows 30 MiB files; syllabus routes enforce their
  // stricter 10 MiB limit after buffering, so one multipart parser can serve
  // both boundaries without rejecting valid material uploads at 10 MiB.
  app.register(multipart, { limits: { fileSize: 30 * 1024 * 1024, files: 10 } });

  app.register(healthRoutes);
  app.register(competencyMappingRoutes, { config, ...(competencyReviewRepo ? { reviewRepo: competencyReviewRepo } : {}) });
  app.register(runsRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(planRepo ? { planRepo } : {}), ...(candidateRepo ? { candidateRepo } : {}), ...(activityIntentRepo ? { activityIntentRepo } : {}), ...(competencyReviewRepo ? { competencyReviewRepo } : {}), ...(competencySnapshotRepo ? { competencySnapshotRepo } : {}), ...(mcpClientManager ? { mcpClientManager } : {}) });
  app.register(courseStructureRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(structureRevisionRepo ? { structureRevisionRepo } : {}), ...(structurePlanner ? { structurePlanner } : {}) });
  app.register(instructionalDesignRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(structureRevisionRepo ? { structureRevisionRepo } : {}), ...(candidateRepo ? { candidateRepo } : {}), ...(outcomeReviewRepo ? { reviewRepo: outcomeReviewRepo } : {}), ...(activityIntentRepo ? { activityIntentRepo } : {}), enforceOutcomeReview: true, ...(modelClient ? { modelClient } : {}) });
  app.register(outcomeReviewRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(outcomeReviewRepo ? { reviewRepo: outcomeReviewRepo } : {}) });
  app.register(materialSnapshotRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(snapshotRepo ? { snapshotRepo } : {}), ...(materialStateRepo ? { materialStateRepo } : {}), ...(structureRevisionRepo ? { structureRevisionRepo } : {}), ...(activityIntentRepo ? { activityIntentRepo } : {}) });
  app.register(activityIntentRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(structureRevisionRepo ? { structureRevisionRepo } : {}), ...(activityIntentRepo ? { activityIntentRepo } : {}) });
  app.register(activityGenerationRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(structureRevisionRepo ? { structureRevisionRepo } : {}), ...(activityIntentRepo ? { activityIntentRepo } : {}), ...(snapshotRepo ? { snapshotRepo } : {}), ...(modelClient ? { modelClient } : {}) });
  app.register(activityEditRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(structureRevisionRepo ? { structureRevisionRepo } : {}), ...(activityIntentRepo ? { activityIntentRepo } : {}), ...(activityRevisionRepo ? { activityRevisionRepo } : {}), ...(snapshotRepo ? { snapshotRepo } : {}) });
  app.register(sectionGenerationRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(structureRevisionRepo ? { structureRevisionRepo } : {}), ...(snapshotRepo ? { snapshotRepo } : {}), ...(draftRepo ? { draftRepo } : {}), ...(activityIntentRepo ? { activityIntentRepo } : {}), ...(planRepo ? { planRepo } : {}), ...(competencySnapshotRepo ? { competencySnapshotRepo } : {}), ...(modelClient ? { modelClient } : {}) });
  app.register(plansRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(planRepo ? { planRepo } : {}), ...(modelClient ? { modelClient } : {}), ...(coursePlanner ? { coursePlanner } : {}), ...(planRevisionHelper ? { planRevisionHelper } : {}) });
  app.register(assignmentRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(planRepo ? { planRepo } : {}), ...(modelClient ? { modelClient } : {}), ...(assignmentPlanner ? { assignmentPlanner } : {}), ...(mcpClientManager ? { mcpClientManager } : {}) });
  app.register(quizRoutes, { config, ...(runRepo ? { runRepo } : {}), ...(planRepo ? { planRepo } : {}), ...(modelClient ? { modelClient } : {}), ...(quizPlanner ? { quizPlanner } : {}), ...(mcpClientManager ? { mcpClientManager } : {}) });
  app.register(categoriesRoutes, { config, ...(mcpClientManager ? { mcpClientManager } : {}) });
  app.register(executionsRoutes, { config, ...(planRepo ? { planRepo } : {}), ...(runRepo ? { runRepo } : {}), ...(mappingRepo ? { mappingRepo } : {}), ...(toolCallRepo ? { toolCallRepo } : {}), ...(idempotencyRepo ? { idempotencyRepo } : {}), ...(candidateRepo ? { candidateRepo } : {}), ...(activityIntentRepo ? { activityIntentRepo } : {}), ...(competencyReviewRepo ? { competencyReviewRepo } : {}), ...(competencySnapshotRepo ? { competencySnapshotRepo } : {}), ...(mcpClientManager ? { mcpClientManager } : {}) });
  app.register(verificationRoutes, { config, ...(planRepo ? { planRepo } : {}), ...(runRepo ? { runRepo } : {}), ...(mappingRepo ? { mappingRepo } : {}), ...(verificationRepo ? { verificationRepo } : {}), ...(competencySnapshotRepo ? { competencySnapshotRepo } : {}), ...(mcpClientManager ? { mcpClientManager } : {}) });
  app.register(riskRefreshRoutes, { config, ...(mcpClientManager ? { mcpClientManager } : {}) });
  app.register(riskDashboardRoutes, { config, ...(riskDashboardRepo ? { riskDashboardRepo } : {}) });
  app.register(riskInsightRoutes, { config, ...(modelClient ? { modelClient } : {}), ...(riskInsightService ? { riskInsightService } : {}) });
  return app;
}
