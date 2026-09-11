import crypto from "node:crypto";
import type { ModelMessage } from "../llm/types.js";
import type {
  AgentLoopConfig,
  AgentLoopResult,
  NormalizedToolResult,
  RuntimeToolCall,
  SafeToolExecutionContext,
  ToolExecutionContext,
} from "./types.js";
import {
  AgentTimeoutError,
  IdempotencyInFlightError,
  IdempotencyUncertainError,
  isMaterializingTool,
  isMutatingTool,
  MappingIdMissingError,
  MaxStepsExceededError,
  RepeatedToolCallError,
  UnrecoverableToolError,
} from "./types.js";

export function canonicalizeArgs(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeArgs).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys.map(
    (key) => `${JSON.stringify(key)}:${canonicalizeArgs(obj[key])}`
  );
  return `{${entries.join(",")}}`;
}

function extractMoodleId(targetType: string, data: unknown): number | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;
  switch (targetType) {
    case "course":
      return typeof obj.course_id === "number" ? obj.course_id : null;
    case "section":
      return typeof obj.section_id === "number" ? obj.section_id : null;
    case "assignment":
    case "quiz":
      return typeof obj.activity_id === "number" ? obj.activity_id : null;
    case "question":
      return typeof obj.question_bank_entry_id === "number"
        ? obj.question_bank_entry_id
        : null;
    case "resource":
      return typeof obj.activity_id === "number" ? obj.activity_id : null;
    default:
      return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistRequiredMapping(
  execContext: SafeToolExecutionContext,
  runtimeCall: RuntimeToolCall,
  data: unknown
): Promise<void> {
  const { toolName, context } = runtimeCall;
  const { repositories, runId, planId, revision } = execContext;
  if (
    !context?.localRef ||
    !context.targetType ||
    !isMaterializingTool(context.targetType, toolName) ||
    planId === undefined ||
    revision === undefined ||
    !repositories.mappingRepo
  ) {
    return;
  }

  const moodleId = extractMoodleId(context.targetType, data);
  if (moodleId === null || moodleId <= 0) {
    throw new MappingIdMissingError(toolName, context.targetType, context.localRef);
  }

  await repositories.mappingRepo.setMapping({
    id: crypto.randomUUID(),
    runId,
    planId,
    revision,
    localRef: context.localRef,
    targetType: context.targetType,
    moodleId,
    ...(typeof data === "object" && data !== null
      ? { moodleMetadata: data as Record<string, unknown> }
      : {}),
  });
}

/**
 * Executes a single tool call through validation, loop detection, idempotency,
 * bounded transient retry, mapping, persistence, and error classification (P10-RD1 to P10-RD5, P11-D1).
 * Reusable by both the generic Agent loop and deterministic Plan executors.
 */
export async function executeRuntimeToolCall(
  execContext: SafeToolExecutionContext,
  runtimeCall: RuntimeToolCall
): Promise<NormalizedToolResult> {
  const { toolCallId, toolName, arguments: args, context } = runtimeCall;
  const { mcpClientManager, repositories, runId, planId, revision } = execContext;
  const registry = mcpClientManager.getRegistry();
  const options = execContext.options ?? {};
  const maxRetries = options.maxRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 50;
  const toolTimeoutMs = options.toolTimeoutMs ?? 30_000;
  const runTimeoutMs = options.runTimeoutMs ?? 300_000;
  const runDeadline = execContext.runDeadline ?? Date.now() + runTimeoutMs;
  const recentSignatures = execContext.recentSignatures ?? [];
  const stepNumber = execContext.stepNumber ?? 0;
  const startTime = Date.now();

  if (Date.now() >= runDeadline) {
    const errorMsg = `Run deadline exceeded before executing tool '${toolName}'`;
    await repositories.toolCallRepo.recordToolCall({
      id: crypto.randomUUID(),
      toolCallId,
      runId,
      stepNumber,
      toolName,
      arguments: args,
      status: "timeout",
      durationMs: 0,
      error: errorMsg,
    });
    throw new AgentTimeoutError("RUN_TIMEOUT", runTimeoutMs);
  }

  const currentSignature = `${toolName}:${canonicalizeArgs(args)}`;
  const len = recentSignatures.length;
  if (
    len >= 2 &&
    recentSignatures[len - 1] === currentSignature &&
    recentSignatures[len - 2] === currentSignature
  ) {
    const errorMsg = `Tool '${toolName}' called 3 consecutive times with identical arguments`;
    await repositories.toolCallRepo.recordToolCall({
      id: crypto.randomUUID(),
      toolCallId,
      runId,
      stepNumber,
      toolName,
      arguments: args,
      status: "error",
      durationMs: Date.now() - startTime,
      error: errorMsg,
    });
    throw new RepeatedToolCallError(toolName, 3);
  }
  recentSignatures.push(currentSignature);

  const validation = registry.validateArguments(toolName, args);
  if (!validation.valid) {
    const errorMsg = validation.errors?.join("; ") ?? "Invalid tool arguments";
    const errorResult: NormalizedToolResult = {
      status: "error",
      code: "INVALID_ARGUMENTS",
      message: errorMsg,
      details: validation.errors,
    };
    await repositories.toolCallRepo.recordToolCall({
      id: crypto.randomUUID(),
      toolCallId,
      runId,
      stepNumber,
      toolName,
      arguments: args,
      normalizedResult: errorResult,
      status: "error",
      durationMs: Date.now() - startTime,
      error: errorMsg,
    });
    return errorResult;
  }

  let idempotencyKey: string | null = null;
  if (
    isMutatingTool(toolName) &&
    context?.localRef &&
    planId !== undefined &&
    revision !== undefined &&
    repositories.idempotencyRepo
  ) {
    const acquireResult = await repositories.idempotencyRepo.tryAcquire({
      runId,
      planId,
      revision,
      localRef: context.localRef,
      toolName,
    });

    if (acquireResult.state === "cached") {
      const cachedResult: NormalizedToolResult = {
        status: "success",
        data: acquireResult.result,
      };
      try {
        await persistRequiredMapping(execContext, runtimeCall, acquireResult.result);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await repositories.toolCallRepo.recordToolCall({
          id: crypto.randomUUID(),
          toolCallId,
          runId,
          stepNumber,
          toolName,
          arguments: args,
          normalizedResult: {
            status: "error",
            code: "MAPPING_ID_MISSING",
            message: errorMsg,
          },
          status: "error",
          durationMs: Date.now() - startTime,
          error: errorMsg,
        });
        throw err;
      }
      await repositories.toolCallRepo.recordToolCall({
        id: crypto.randomUUID(),
        toolCallId,
        runId,
        stepNumber,
        toolName,
        arguments: args,
        normalizedResult: cachedResult,
        status: "success",
        durationMs: Date.now() - startTime,
      });
      return cachedResult;
    }

    if (acquireResult.state === "in_flight") {
      const errorMsg = `Idempotency key '${acquireResult.key}' is currently in flight`;
      await repositories.toolCallRepo.recordToolCall({
        id: crypto.randomUUID(),
        toolCallId,
        runId,
        stepNumber,
        toolName,
        arguments: args,
        status: "error",
        durationMs: Date.now() - startTime,
        error: errorMsg,
      });
      throw new IdempotencyInFlightError(acquireResult.key);
    }

    if (acquireResult.state === "uncertain") {
      const error = new IdempotencyUncertainError(
        acquireResult.key,
        acquireResult.errorMessage
      );
      await repositories.toolCallRepo.recordToolCall({
        id: crypto.randomUUID(),
        toolCallId,
        runId,
        stepNumber,
        toolName,
        arguments: args,
        normalizedResult: {
          status: "error",
          code: error.code,
          message: error.message,
        },
        status: "error",
        durationMs: Date.now() - startTime,
        error: error.message,
      });
      throw error;
    }

    idempotencyKey = acquireResult.key;
  }

  let result: NormalizedToolResult = {
    status: "error",
    code: "UNKNOWN_ERROR",
    message: "Tool invocation not started",
  };
  const isMutation = isMutatingTool(toolName);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const remainingToolTime = runDeadline - Date.now();
    if (remainingToolTime <= 0) {
      throw new AgentTimeoutError("RUN_TIMEOUT", runTimeoutMs);
    }

    const timeoutWasRunBound = remainingToolTime <= toolTimeoutMs;
    const effectiveToolTimeoutMs = Math.min(toolTimeoutMs, remainingToolTime);
    result = await mcpClientManager.callTool(toolName, args, {
      timeoutMs: effectiveToolTimeoutMs,
    });

    if (
      result.status === "error" &&
      result.code === "TOOL_TIMEOUT" &&
      timeoutWasRunBound
    ) {
      if (isMutation && idempotencyKey && repositories.idempotencyRepo) {
        await repositories.idempotencyRepo.recordUncertain(
          idempotencyKey,
          "Mutation timed out at the overall run deadline; Moodle outcome requires read-back reconciliation."
        );
      }
      await repositories.toolCallRepo.recordToolCall({
        id: crypto.randomUUID(),
        toolCallId,
        runId,
        stepNumber,
        toolName,
        arguments: args,
        normalizedResult: result,
        status: "timeout",
        durationMs: Date.now() - startTime,
        error: result.message,
      });
      throw new AgentTimeoutError("RUN_TIMEOUT", runTimeoutMs);
    }

    const isRetryable =
      result.status === "error" &&
      !isMutation &&
      (result.code === "NETWORK_ERROR" || result.code === "TOOL_TIMEOUT");

    if (isRetryable && attempt < maxRetries) {
      const delay = retryDelayMs * Math.pow(2, attempt);
      const remainingTime = runDeadline - Date.now();
      if (delay >= remainingTime) {
        throw new AgentTimeoutError("RUN_TIMEOUT", runTimeoutMs);
      }
      await sleep(delay);
      continue;
    }
    break;
  }

  if (
    result.status === "error" &&
    isMutation &&
    (result.code === "TOOL_TIMEOUT" || result.code === "NETWORK_ERROR")
  ) {
    const uncertaintyMessage = result.code === "TOOL_TIMEOUT"
      ? "Mutation tool timed out; Moodle outcome requires read-back reconciliation before retry."
      : "Mutation transport failed after invocation may have been dispatched; Moodle outcome requires read-back reconciliation before retry.";
    if (idempotencyKey && repositories.idempotencyRepo) {
      await repositories.idempotencyRepo.recordUncertain(idempotencyKey, uncertaintyMessage);
    }
    result = {
      status: "error",
      code: "MUTATION_OUTCOME_UNCERTAIN",
      message: uncertaintyMessage,
    };
  } else if (idempotencyKey && repositories.idempotencyRepo) {
    if (result.status === "success") {
      await repositories.idempotencyRepo.recordSuccess(idempotencyKey, result.data);
    } else {
      await repositories.idempotencyRepo.recordFailure(idempotencyKey, result.message);
    }
  }

  if (result.status === "success") {
    try {
      await persistRequiredMapping(execContext, runtimeCall, result.data);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await repositories.toolCallRepo.recordToolCall({
        id: crypto.randomUUID(),
        toolCallId,
        runId,
        stepNumber,
        toolName,
        arguments: args,
        normalizedResult: {
          status: "error",
          code: "MAPPING_ID_MISSING",
          message: errorMsg,
        },
        status: "error",
        durationMs: Date.now() - startTime,
        error: errorMsg,
      });
      throw err;
    }
  }

  const durationMs = Date.now() - startTime;
  await repositories.toolCallRepo.recordToolCall({
    id: crypto.randomUUID(),
    toolCallId,
    runId,
    stepNumber,
    toolName,
    arguments: args,
    normalizedResult: result,
    status:
      result.status === "success"
        ? "success"
        : result.code === "TOOL_TIMEOUT" ||
            result.code === "MUTATION_OUTCOME_UNCERTAIN"
          ? "timeout"
          : "error",
    durationMs,
    ...(result.status === "error" ? { error: result.message } : {}),
  });

  if (
    result.status === "error" &&
    (result.code === "AUTH_ERROR" || result.code === "PERMISSION_DENIED")
  ) {
    throw new UnrecoverableToolError(toolName, result.code, result.message);
  }

  return result;
}

export async function runAgentLoop(
  config: AgentLoopConfig
): Promise<AgentLoopResult> {
  const {
    runId,
    systemPrompt,
    initialUserMessage,
    modelClient,
    mcpClientManager,
    repositories,
  } = config;
  const options = config.options ?? {};
  const maxSteps = options.maxSteps ?? 20;
  const modelTimeoutMs = options.modelTimeoutMs ?? 60_000;
  const runTimeoutMs = options.runTimeoutMs ?? 300_000;
  const runDeadline = Date.now() + runTimeoutMs;
  const recentSignatures: string[] = [];
  let totalToolCalls = 0;

  await mcpClientManager.discoverTools();
  const modelTools = mcpClientManager.getRegistry().toModelToolDefinitions();

  await repositories.messageRepo.appendMessage({
    id: crypto.randomUUID(),
    runId,
    stepNumber: 0,
    role: "system",
    content: systemPrompt,
  });
  await repositories.messageRepo.appendMessage({
    id: crypto.randomUUID(),
    runId,
    stepNumber: 0,
    role: "user",
    content: initialUserMessage,
  });

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: initialUserMessage },
  ];

  for (let step = 1; step <= maxSteps; step++) {
    const remainingRunTime = runDeadline - Date.now();
    if (remainingRunTime <= 0) {
      throw new AgentTimeoutError("RUN_TIMEOUT", runTimeoutMs);
    }
    const modelTimeoutBoundByRun = remainingRunTime <= modelTimeoutMs;
    const effectiveModelTimeoutMs = Math.min(modelTimeoutMs, remainingRunTime);

    let chatResult;
    try {
      chatResult = await modelClient.chat({
        messages,
        tools: modelTools,
        options: { timeoutMs: effectiveModelTimeoutMs },
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("timed out") || errMsg.includes("TIMEOUT")) {
        throw new AgentTimeoutError(
          modelTimeoutBoundByRun ? "RUN_TIMEOUT" : "MODEL_TIMEOUT",
          modelTimeoutBoundByRun ? runTimeoutMs : effectiveModelTimeoutMs
        );
      }
      throw err;
    }

    const assistantMsg = chatResult.message;
    await repositories.messageRepo.appendMessage({
      id: crypto.randomUUID(),
      runId,
      stepNumber: step,
      role: "assistant",
      content: assistantMsg.content || "",
      ...(assistantMsg.tool_calls ? { toolCalls: assistantMsg.tool_calls } : {}),
    });
    messages.push(assistantMsg);

    const toolCalls = assistantMsg.tool_calls || [];
    if (toolCalls.length === 0) {
      return {
        runId,
        status: "finished",
        finalMessage: assistantMsg.content,
        totalSteps: step,
        totalToolCalls,
      };
    }

    if (step >= maxSteps) {
      for (const tc of toolCalls) {
        const callId = tc.id || crypto.randomUUID();
        await repositories.toolCallRepo.recordToolCall({
          id: crypto.randomUUID(),
          toolCallId: callId,
          runId,
          stepNumber: step,
          toolName: tc.function.name,
          arguments: tc.function.arguments || {},
          status: "error",
          durationMs: 0,
          error: `MAX_STEPS_EXCEEDED: step limit (${maxSteps}) reached before execution`,
        });
      }
      throw new MaxStepsExceededError(maxSteps);
    }

    let callIndex = 0;
    for (const toolCall of toolCalls) {
      totalToolCalls++;
      const toolCallId = toolCall.id || crypto.randomUUID();
      const toolName = toolCall.function.name;
      const args = toolCall.function.arguments || {};
      const context: ToolExecutionContext | undefined =
        options.toolContextResolver?.({
          toolCallId,
          toolName,
          arguments: args,
          stepNumber: step,
          callIndex,
        });
      callIndex++;

      const result = await executeRuntimeToolCall(
        {
          runId,
          planId: config.planId,
          revision: config.revision,
          stepNumber: step,
          mcpClientManager,
          repositories,
          options: {
            maxRetries: options.maxRetries,
            retryDelayMs: options.retryDelayMs,
            toolTimeoutMs: options.toolTimeoutMs,
            runTimeoutMs: options.runTimeoutMs,
          },
          recentSignatures,
          runDeadline,
        },
        { toolCallId, toolName, arguments: args, context }
      );

      const toolResultContent = JSON.stringify(result);
      const toolMsg: ModelMessage = {
        role: "tool",
        content: toolResultContent,
        tool_call_id: toolCallId,
      };
      await repositories.messageRepo.appendMessage({
        id: crypto.randomUUID(),
        runId,
        stepNumber: step,
        role: "tool",
        content: toolResultContent,
      });
      messages.push(toolMsg);
    }
  }

  throw new MaxStepsExceededError(maxSteps);
}
