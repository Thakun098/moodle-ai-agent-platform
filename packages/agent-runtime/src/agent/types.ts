import type { ModelClient } from "../llm/model-client.js";
import type { McpClientManager } from "../mcp/mcp-client-manager.js";
import type { ExecutionMappingRepository } from "../repositories/execution-mapping-repository.js";
import type { IdempotencyRepository } from "../repositories/idempotency-repository.js";
import type { MessageRepository } from "../repositories/message-repository.js";
import type { RunRepository } from "../repositories/run-repository.js";
import type { ToolCallRepository } from "../repositories/tool-call-repository.js";

export type NormalizedToolResult =
  | { status: "success"; data: unknown }
  | { status: "error"; code: string; message: string; details?: unknown };

export const MUTATING_TOOLS = new Set([
  "moodle_create_course",
  "moodle_create_section",
  "moodle_create_assignment",
  "moodle_update_assignment",
  "moodle_create_quiz",
  "moodle_update_quiz",
  "moodle_create_quiz_question",
  "moodle_update_quiz_question",
  "moodle_add_question_to_quiz",
]);

export function isMutatingTool(toolName: string): boolean {
  return MUTATING_TOOLS.has(toolName);
}

export const MATERIALIZING_TOOLS: Record<string, string> = {
  course: "moodle_create_course",
  section: "moodle_create_section",
  assignment: "moodle_create_assignment",
  quiz: "moodle_create_quiz",
  question: "moodle_create_quiz_question",
};

export function isMaterializingTool(targetType: string, toolName: string): boolean {
  return MATERIALIZING_TOOLS[targetType] === toolName;
}

export interface ToolExecutionContext {
  localRef?: string | undefined;
  targetType?: ("course" | "section" | "assignment" | "quiz" | "question") | undefined;
}

export interface ToolContextResolutionInput {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  stepNumber: number;
  callIndex: number;
}

export interface RuntimeToolCall {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  context?: ToolExecutionContext | undefined;
}

export interface SafeToolRepositories {
  toolCallRepo: ToolCallRepository;
  mappingRepo?: ExecutionMappingRepository;
  idempotencyRepo?: IdempotencyRepository;
  runRepo?: RunRepository;
  messageRepo?: MessageRepository;
}

export interface AgentLoopRepositories extends SafeToolRepositories {
  messageRepo: MessageRepository;
}

export interface SafeToolExecutionOptions {
  maxRetries?: number | undefined;
  retryDelayMs?: number | undefined;
  toolTimeoutMs?: number | undefined;
  runTimeoutMs?: number | undefined;
}

export interface SafeToolExecutionContext {
  runId: string;
  planId?: string | undefined;
  revision?: number | undefined;
  stepNumber?: number | undefined;
  mcpClientManager: McpClientManager;
  repositories: SafeToolRepositories;
  options?: SafeToolExecutionOptions | undefined;
  recentSignatures?: string[] | undefined;
  runDeadline?: number | undefined;
}

export interface AgentLoopOptions {
  maxSteps?: number;
  modelTimeoutMs?: number;
  toolTimeoutMs?: number;
  runTimeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  toolContextResolver?: (
    input: ToolContextResolutionInput
  ) => ToolExecutionContext | undefined;
}

export interface AgentLoopConfig {
  runId: string;
  planId?: string;
  revision?: number;
  systemPrompt: string;
  initialUserMessage: string;
  modelClient: ModelClient;
  mcpClientManager: McpClientManager;
  repositories: AgentLoopRepositories;
  options?: AgentLoopOptions;
}

export interface AgentLoopResult {
  runId: string;
  status: "finished" | "failed";
  finalMessage?: string | undefined;
  totalSteps: number;
  totalToolCalls: number;
  error?: string | undefined;
}

export class AgentLoopError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AgentLoopError";
    this.code = code;
    this.details = details;
  }
}

export class McpToolSchemaError extends AgentLoopError {
  constructor(toolName: string, cause?: unknown) {
    super(
      "MCP_TOOL_SCHEMA_INVALID",
      `MCP input schema for tool '${toolName}' could not be compiled.`,
      cause
    );
    this.name = "McpToolSchemaError";
  }
}

export class MaxStepsExceededError extends AgentLoopError {
  constructor(steps: number) {
    super(
      "MAX_STEPS_EXCEEDED",
      `Agent loop exceeded maximum allowed steps limit (${steps}) without reaching a final response.`
    );
    this.name = "MaxStepsExceededError";
  }
}

export class RepeatedToolCallError extends AgentLoopError {
  constructor(toolName: string, callCount: number) {
    super(
      "REPEATED_TOOL_CALL_DETECTED",
      `Agent loop halted: tool '${toolName}' was called ${callCount} consecutive times with identical arguments.`
    );
    this.name = "RepeatedToolCallError";
  }
}

export type TimeoutKind = "MODEL_TIMEOUT" | "TOOL_TIMEOUT" | "RUN_TIMEOUT";

export class AgentTimeoutError extends AgentLoopError {
  constructor(kind: TimeoutKind, durationMs: number) {
    super(
      kind,
      `Agent loop ${kind.toLowerCase().replace("_", " ")} after ${durationMs}ms.`
    );
    this.name = "AgentTimeoutError";
  }
}

export class IdempotencyInFlightError extends AgentLoopError {
  constructor(key: string) {
    super(
      "IDEMPOTENCY_IN_FLIGHT",
      `Mutation with idempotency key '${key}' is currently in flight.`
    );
    this.name = "IdempotencyInFlightError";
  }
}

export class IdempotencyUncertainError extends AgentLoopError {
  constructor(key: string, message?: string | null) {
    super(
      "IDEMPOTENCY_UNCERTAIN",
      `Mutation with idempotency key '${key}' has an uncertain prior outcome and requires read-back reconciliation before retry.${message ? ` ${message}` : ""}`
    );
    this.name = "IdempotencyUncertainError";
  }
}

export class MappingIdMissingError extends AgentLoopError {
  constructor(toolName: string, targetType: string, localRef: string) {
    super(
      "MAPPING_ID_MISSING",
      `Materializing tool '${toolName}' succeeded but did not return the canonical Moodle identity required to map ${targetType} local ref '${localRef}'.`
    );
    this.name = "MappingIdMissingError";
  }
}

export class UnrecoverableToolError extends AgentLoopError {
  constructor(toolName: string, errorCode: string, message: string) {
    super(
      "UNRECOVERABLE_TOOL_ERROR",
      `Unrecoverable Moodle error in tool '${toolName}' [${errorCode}]: ${message}`
    );
    this.name = "UnrecoverableToolError";
  }
}
