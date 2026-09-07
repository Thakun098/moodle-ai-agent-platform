import crypto from "node:crypto";
import {
  executeRuntimeToolCall,
  type McpClientManager,
  type SafeToolExecutionOptions,
  type SafeToolRepositories,
} from "@moodle-agent-poc/agent-runtime";
import type {
  AssignmentPlanEnvelope,
  AssignmentUpdateTarget,
  ExistingSectionTarget,
} from "@moodle-agent-poc/contracts";
import type { ExistingAssignmentState } from "@moodle-agent-poc/planning";
import { formatAssignmentIntro } from "./serializers.js";
import { CourseExecutionError } from "./types.js";

export interface MoodleAssignmentState {
  activity_id: number;
  assignment_id: number;
  course_id: number;
  section_id: number;
  name: string;
  intro: string;
  grade: number;
}

export interface AssignmentExecutionConfig {
  runId: string;
  planEnvelope: AssignmentPlanEnvelope;
  target: ExistingSectionTarget | AssignmentUpdateTarget;
  mcpClientManager: McpClientManager;
  repositories: SafeToolRepositories;
  options?: SafeToolExecutionOptions;
}

export interface AssignmentExecutionResult {
  runId: string;
  planId: string;
  revision: number;
  operation: "create" | "update";
  status: "completed";
  activityId: number;
  assignmentId: number;
  verified: true;
  observed: MoodleAssignmentState;
}

export async function readAssignmentState(
  mcpClientManager: McpClientManager,
  activityId: number
): Promise<MoodleAssignmentState> {
  await mcpClientManager.discoverTools();
  const result = await mcpClientManager.callTool("moodle_get_assignment", { activity_id: activityId });
  if (result.status === "error") {
    throw new CourseExecutionError(result.code || "ASSIGNMENT_READ_FAILED", `Failed to read assignment ${activityId}: ${result.message}`);
  }
  const data = result.data as Record<string, unknown>;
  return {
    activity_id: Number(data.activity_id),
    assignment_id: Number(data.assignment_id),
    course_id: Number(data.course_id),
    section_id: Number(data.section_id),
    name: String(data.name ?? ""),
    intro: String(data.intro ?? ""),
    grade: Number(data.grade),
  };
}

/** Reverse the deterministic Phase 11 intro format when present; fall back to raw intro. */
export function parseAssignmentIntro(intro: string): {
  description: string;
  instructions: string[];
  learningObjectives: string[];
} {
  const instructionMarker = "\n\nInstructions:\n";
  const objectiveMarker = "\n\nLearning Objectives:\n";
  const instructionIndex = intro.indexOf(instructionMarker);
  const objectiveIndex = intro.indexOf(objectiveMarker);
  if (instructionIndex < 0 || objectiveIndex < 0 || objectiveIndex <= instructionIndex) {
    return { description: intro, instructions: [], learningObjectives: [] };
  }
  const description = intro.slice(0, instructionIndex).trim();
  const instructionBlock = intro.slice(instructionIndex + instructionMarker.length, objectiveIndex);
  const objectiveBlock = intro.slice(objectiveIndex + objectiveMarker.length);
  const instructions = instructionBlock
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  const learningObjectives = objectiveBlock
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean);
  return { description, instructions, learningObjectives };
}

export function toExistingAssignmentState(
  observed: MoodleAssignmentState,
  ref = `assignment-${observed.activity_id}`
): ExistingAssignmentState {
  const parsed = parseAssignmentIntro(observed.intro);
  return {
    ref,
    title: observed.name,
    description: parsed.description,
    instructions: parsed.instructions,
    learning_objectives: parsed.learningObjectives,
    grade: observed.grade,
    source_refs: [],
  };
}

function assertVerified(
  observed: MoodleAssignmentState,
  expected: { activityId: number; courseId: number; sectionId: number; name: string; intro: string; grade: number }
): void {
  const mismatches: string[] = [];
  if (observed.activity_id !== expected.activityId) mismatches.push("activity_id");
  if (observed.course_id !== expected.courseId) mismatches.push("course_id");
  if (observed.section_id !== expected.sectionId) mismatches.push("section_id");
  if (observed.name !== expected.name) mismatches.push("name");
  if (observed.intro !== expected.intro) mismatches.push("intro");
  if (observed.grade !== expected.grade) mismatches.push("grade");
  if (mismatches.length > 0) {
    throw new CourseExecutionError("ASSIGNMENT_VERIFICATION_FAILED", `Assignment read-back verification failed for fields: ${mismatches.join(", ")}`, { expected, observed, mismatches });
  }
}

export async function executeAssignmentPlan(config: AssignmentExecutionConfig): Promise<AssignmentExecutionResult> {
  const { runId, planEnvelope, target, mcpClientManager, repositories } = config;
  const options = config.options ?? {};
  if (planEnvelope.plan_type !== "assignment") throw new CourseExecutionError("INCOMPATIBLE_PLAN_TYPE", "Assignment executor requires plan_type='assignment'.");
  if (planEnvelope.operation !== "create" && planEnvelope.operation !== "update") throw new CourseExecutionError("INCOMPATIBLE_OPERATION", `Unsupported assignment operation '${planEnvelope.operation}'.`);

  await mcpClientManager.discoverTools();
  await repositories.runRepo?.updateStatus(runId, "executing");
  const runTimeoutMs = options.runTimeoutMs ?? 300_000;
  const runDeadline = Date.now() + runTimeoutMs;
  let stepNumber = 1;
  const baseContext = {
    runId,
    planId: planEnvelope.plan_id,
    revision: planEnvelope.revision,
    mcpClientManager,
    repositories,
    options,
    runDeadline,
    recentSignatures: [] as string[],
  };

  try {
    const intro = formatAssignmentIntro(planEnvelope.content);
    const courseId = Number((target as ExistingSectionTarget).course_id);
    const sectionId = Number((target as ExistingSectionTarget).section_id);
    let activityId: number;
    let assignmentId: number;

    if (planEnvelope.operation === "update") {
      const updateTarget = target as AssignmentUpdateTarget;
      activityId = Number(updateTarget.activity_id);
      const updateResult = await executeRuntimeToolCall(
        { ...baseContext, stepNumber: stepNumber++ },
        {
          toolCallId: crypto.randomUUID(),
          toolName: "moodle_update_assignment",
          arguments: { activity_id: activityId, name: planEnvelope.content.title, intro, grade: planEnvelope.content.grade },
          context: { localRef: planEnvelope.content.ref },
        }
      );
      if (updateResult.status === "error") throw new CourseExecutionError(updateResult.code, updateResult.message, updateResult.details);
      assignmentId = Number((updateResult.data as Record<string, unknown>).assignment_id);
    } else {
      const createResult = await executeRuntimeToolCall(
        { ...baseContext, stepNumber: stepNumber++ },
        {
          toolCallId: crypto.randomUUID(),
          toolName: "moodle_create_assignment",
          arguments: { course_id: courseId, section_id: sectionId, name: planEnvelope.content.title, intro, grade: planEnvelope.content.grade },
          context: { localRef: planEnvelope.content.ref, targetType: "assignment" },
        }
      );
      if (createResult.status === "error") throw new CourseExecutionError(createResult.code, createResult.message, createResult.details);
      const created = createResult.data as Record<string, unknown>;
      activityId = Number(created.activity_id);
      assignmentId = Number(created.assignment_id);
    }

    const readResult = await executeRuntimeToolCall(
      { ...baseContext, stepNumber: stepNumber++ },
      { toolCallId: crypto.randomUUID(), toolName: "moodle_get_assignment", arguments: { activity_id: activityId } }
    );
    if (readResult.status === "error") throw new CourseExecutionError(readResult.code, readResult.message, readResult.details);
    const d = readResult.data as Record<string, unknown>;
    const observed: MoodleAssignmentState = {
      activity_id: Number(d.activity_id), assignment_id: Number(d.assignment_id), course_id: Number(d.course_id), section_id: Number(d.section_id),
      name: String(d.name ?? ""), intro: String(d.intro ?? ""), grade: Number(d.grade),
    };
    assertVerified(observed, { activityId, courseId, sectionId, name: planEnvelope.content.title, intro, grade: planEnvelope.content.grade });

    const result: AssignmentExecutionResult = {
      runId, planId: planEnvelope.plan_id, revision: planEnvelope.revision, operation: planEnvelope.operation,
      status: "completed", activityId, assignmentId, verified: true, observed,
    };
    await repositories.runRepo?.completeRun(runId, result as unknown as Record<string, unknown>);
    return result;
  } catch (err: unknown) {
    await repositories.runRepo?.failRun(runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
