import { describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "../src/agent/agent-loop.js";
import { AgentTimeoutError } from "../src/agent/types.js";
import type {
  ModelChatParams,
  ModelChatResult,
  ModelClient,
} from "../src/llm/types.js";

class RecordingMessageRepo {
  messages: any[] = [];
  async appendMessage(data: any) {
    this.messages.push(data);
    return data;
  }
}

class RecordingToolCallRepo {
  toolCalls: any[] = [];
  async recordToolCall(data: any) {
    this.toolCalls.push(data);
    return data;
  }
}

class TimeoutModelClient implements ModelClient {
  async chat(params: ModelChatParams): Promise<ModelChatResult> {
    const timeoutMs = params.options?.timeoutMs ?? 0;
    throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
  }
}

function fakeRegistry() {
  return {
    toModelToolDefinitions: () => [],
    validateArguments: () => ({ valid: true }),
  };
}

describe("Phase 10 final timeout hardening", () => {
  it("classifies a model timeout capped by the overall deadline as RUN_TIMEOUT", async () => {
    const messageRepo = new RecordingMessageRepo();
    const toolCallRepo = new RecordingToolCallRepo();
    const mcpClientManager = {
      discoverTools: async () => [],
      getRegistry: () => fakeRegistry(),
    };

    try {
      await runAgentLoop({
        runId: "run-final-model-timeout",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: new TimeoutModelClient(),
        mcpClientManager: mcpClientManager as any,
        repositories: {
          messageRepo: messageRepo as any,
          toolCallRepo: toolCallRepo as any,
        },
        options: {
          modelTimeoutMs: 60_000,
          runTimeoutMs: 25,
        },
      });
      throw new Error("Expected runAgentLoop to throw");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AgentTimeoutError);
      expect((err as AgentTimeoutError).code).toBe("RUN_TIMEOUT");
    }
  });

  it("classifies a tool timeout capped by the overall deadline as RUN_TIMEOUT", async () => {
    const messageRepo = new RecordingMessageRepo();
    const toolCallRepo = new RecordingToolCallRepo();
    let modelCalls = 0;
    const modelClient: ModelClient = {
      async chat(): Promise<ModelChatResult> {
        modelCalls++;
        return {
          message: {
            role: "assistant",
            content: "Create course",
            tool_calls: [
              {
                id: "call-run-bound-tool-timeout",
                function: {
                  name: "moodle_create_course",
                  arguments: {
                    category_id: 1,
                    fullname: "Timeout Course",
                    shortname: "TIMEOUT-COURSE",
                  },
                },
              },
            ],
          },
          toolCalls: [],
          rawText: "",
        };
      },
    };

    const mcpClientManager = {
      discoverTools: async () => [],
      getRegistry: () => fakeRegistry(),
      callTool: async () => ({
        status: "error" as const,
        code: "TOOL_TIMEOUT",
        message: "MCP request timed out",
      }),
    };

    try {
      await runAgentLoop({
        runId: "run-final-tool-timeout",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient,
        mcpClientManager: mcpClientManager as any,
        repositories: {
          messageRepo: messageRepo as any,
          toolCallRepo: toolCallRepo as any,
        },
        options: {
          maxSteps: 2,
          toolTimeoutMs: 30_000,
          runTimeoutMs: 25,
        },
      });
      throw new Error("Expected runAgentLoop to throw");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AgentTimeoutError);
      expect((err as AgentTimeoutError).code).toBe("RUN_TIMEOUT");
    }

    expect(modelCalls).toBe(1);
    expect(toolCallRepo.toolCalls).toHaveLength(1);
    expect(toolCallRepo.toolCalls[0].status).toBe("timeout");
  });
});


describe("Phase 10 mutation network ambiguity hardening", () => {
  it("does not retry a mutating NETWORK_ERROR and records the idempotency outcome as uncertain", async () => {
    const { executeRuntimeToolCall } = await import("../src/agent/agent-loop.js");
    let calls = 0;
    const recordUncertain = vi.fn(async () => undefined);
    const manager = {
      getRegistry: () => ({ validateArguments: () => ({ valid: true }) }),
      callTool: async () => {
        calls++;
        return { status: "error" as const, code: "NETWORK_ERROR", message: "connection reset" };
      },
    };
    const toolCallRepo = new RecordingToolCallRepo();
    const result = await executeRuntimeToolCall(
      {
        runId: "run-mutation-network",
        planId: "plan-mutation-network",
        revision: 1,
        stepNumber: 1,
        mcpClientManager: manager as any,
        repositories: {
          toolCallRepo: toolCallRepo as any,
          idempotencyRepo: {
            tryAcquire: async () => ({ state: "acquired" as const, key: "idem-key" }),
            recordSuccess: async () => undefined,
            recordFailure: async () => undefined,
            recordUncertain,
          } as any,
        },
        options: { maxRetries: 2, retryDelayMs: 1 },
      },
      {
        toolCallId: "mutation-network-call",
        toolName: "moodle_update_quiz",
        arguments: { activity_id: 7, name: "Updated" },
        context: { localRef: "quiz-update" },
      }
    );
    expect(calls).toBe(1);
    expect(result).toMatchObject({ status: "error", code: "MUTATION_OUTCOME_UNCERTAIN" });
    expect(recordUncertain).toHaveBeenCalledOnce();
  });
});
