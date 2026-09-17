import type {
  CompetencyExecutionSnapshot,
  McpClientManager,
  SafeToolExecutionOptions,
  SafeToolRepositories,
} from "@moodle-agent-poc/agent-runtime";
import type {
  CourseCreateTarget,
  CoursePlanEnvelope,
} from "@moodle-agent-poc/contracts";

export interface CategoryItem {
  id: number;
  name: string;
  idnumber?: string | undefined;
  description?: string | undefined;
  parent?: number | undefined;
  coursecount?: number | undefined;
  visible?: number | undefined;
}

export interface CategoryListingResult {
  categories: CategoryItem[];
}

export interface CourseExecutorOptions extends SafeToolExecutionOptions {
  moodleBaseUrl?: string | undefined;
  /** Teacher-authorized format carried by the Run configuration. */
  courseFormat?: string | undefined;
}

export interface CourseExecutionConfig {
  runId: string;
  planEnvelope: CoursePlanEnvelope;
  target: CourseCreateTarget;
  mcpClientManager: McpClientManager;
  repositories: SafeToolRepositories;
  options?: CourseExecutorOptions | undefined;
  competencySnapshot?: CompetencyExecutionSnapshot | undefined;
  competencyFrameworkId?: number | undefined;
  /** Atomic approval/execution claim invoked after read-only preflight and before the first Moodle mutation. */
  beforeMutation?: (() => Promise<void>) | undefined;
}

export interface CreatedEntitiesCount {
  courses: number;
  sections: number;
  assignments: number;
  quizzes: number;
  questions: number;
  slots: number;
  resources?: number;
  competencies?: number;
  competencyLinks?: number;
}

export interface ExecutionMappingItem {
  localRef: string;
  targetType: string;
  moodleId: number;
}

export interface CourseExecutionResult {
  runId: string;
  planId: string;
  revision: number;
  status: "awaiting_verification" | "failed";
  courseId?: number | undefined;
  courseShortname?: string | undefined;
  courseUrl?: string | undefined;
  createdEntities: CreatedEntitiesCount;
  mappings: ExecutionMappingItem[];
  competencyReadback?: Record<string, unknown> | undefined;
  error?: string | undefined;
}

export class CourseExecutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CourseExecutionError";
  }
}
