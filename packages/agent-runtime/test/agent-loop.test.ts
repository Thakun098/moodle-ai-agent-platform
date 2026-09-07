import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runAgentLoop } from "../src/agent/agent-loop.js";
import {
  AgentTimeoutError,
  IdempotencyInFlightError,
  MappingIdMissingError,
  MaxStepsExceededError,
  RepeatedToolCallError,
  UnrecoverableToolError,
} from "../src/agent/types.js";
import type {
  ModelChatParams,
  ModelChatResult,
  ModelClient,
  ModelMessage,
} from "../src/llm/types.js";
import { McpClientManager } from "../src/mcp/mcp-client-manager.js";

// ============================================================================
// In-Memory Test Doubles for Repositories and ModelClient
// ============================================================================

class MockMessageRepository {
  public messages: Array<{
    id: string;
    runId: string;
    stepNumber: number;
    role: string;
    content: string;
    toolCalls?: unknown;
  }> = [];

  async appendMessage(data: any) {
    this.messages.push(data);
    return data;
  }

  async listRunMessages(runId: string) {
    return this.messages.filter((m) => m.runId === runId);
  }
}

class MockToolCallRepository {
  public toolCalls: Array<{
    id: string;
    toolCallId: string;
    runId: string;
    stepNumber: number;
    toolName: string;
    arguments: Record<string, unknown>;
    normalizedResult?: unknown;
    status: string;
    durationMs?: number;
    error?: string;
  }> = [];

  async recordToolCall(data: any) {
    this.toolCalls.push(data);
    return data;
  }

  async listRunToolCalls(runId: string) {
    return this.toolCalls.filter((tc) => tc.runId === runId);
  }
}

class MockExecutionMappingRepository {
  public mappings: Array<{
    id: string;
    runId: string;
    planId: string;
    revision: number;
    localRef: string;
    targetType: string;
    moodleId: number;
    moodleMetadata?: Record<string, unknown>;
  }> = [];

  async setMapping(data: any) {
    const existing = this.mappings.find(
      (m) =>
        m.runId === data.runId &&
        m.planId === data.planId &&
        m.revision === data.revision &&
        m.localRef === data.localRef
    );
    if (existing) {
      if (existing.moodleId !== data.moodleId) {
        throw new Error("Mapping conflict");
      }
      return existing;
    }
    this.mappings.push(data);
    return data;
  }

  async getMapping(runId: string, planId: string, revision: number, localRef: string) {
    return (
      this.mappings.find(
        (m) =>
          m.runId === runId &&
          m.planId === planId &&
          m.revision === revision &&
          m.localRef === localRef
      ) ?? null
    );
  }
}

class MockIdempotencyRepository {
  public records: Map<
    string,
    { status: string; resultPayload?: unknown; errorMessage?: string }
  > = new Map();

  async tryAcquire(params: {
    runId: string;
    planId: string;
    revision: number;
    localRef: string;
    toolName: string;
  }) {
    const key = `${params.runId}:${params.planId}:${params.revision}:${params.localRef}:${params.toolName}`;
    const existing = this.records.get(key);
    if (!existing) {
      this.records.set(key, { status: "in_flight" });
      return { state: "acquired" as const, key };
    }
    if (existing.status === "completed") {
      return { state: "cached" as const, key, result: existing.resultPayload };
    }
    if (existing.status === "failed") {
      existing.status = "in_flight";
      return { state: "acquired" as const, key };
    }
    return { state: "in_flight" as const, key };
  }

  async recordSuccess(key: string, resultPayload: unknown) {
    this.records.set(key, { status: "completed", resultPayload });
  }

  async recordFailure(key: string, errorMessage: string) {
    this.records.set(key, { status: "failed", errorMessage });
  }
}

class FakeModelClient implements ModelClient {
  private responses: Array<(params: ModelChatParams) => Promise<ModelChatResult>> = [];
  public callHistory: ModelChatParams[] = [];

  enqueueResponse(fnOrResult: ModelChatResult | ((params: ModelChatParams) => Promise<ModelChatResult>)) {
    if (typeof fnOrResult === "function") {
      this.responses.push(fnOrResult);
    } else {
      this.responses.push(async () => fnOrResult);
    }
  }

  async chat(params: ModelChatParams): Promise<ModelChatResult> {
    this.callHistory.push(params);
    const next = this.responses.shift();
    if (!next) {
      throw new Error("FakeModelClient has no enqueued responses left");
    }
    return next(params);
  }
}

// ============================================================================
// Test Suite for Agent Tool Runtime Loop (T1001Ã¢â‚¬â€œT1014)
// ============================================================================

describe("Agent Tool Runtime Ã¢â‚¬â€ Explicit Loop & Guards (T1001Ã¢â‚¬â€œT1014)", () => {
  async function setupTestEnvironment() {
    const server = new McpServer({ name: "moodle-test-server", version: "0.1.0" });
    const toolInvocationTracker: Array<{ name: string; args: Record<string, unknown> }> = [];

    server.registerTool(
      "moodle_create_course",
      {
        description: "Create course tool",
        inputSchema: z.object({
          category_id: z.number(),
          fullname: z.string(),
          shortname: z.string(),
        }),
      },
      async (args) => {
        toolInvocationTracker.push({ name: "moodle_create_course", args });
        return {
          content: [{ type: "text", text: "Course created" }],
          structuredContent: {
            status: "success",
            data: { course_id: 101, fullname: args.fullname, shortname: args.shortname },
          },
        };
      }
    );

    server.registerTool(
      "moodle_create_section",
      {
        description: "Create section tool",
        inputSchema: z.object({
          course_id: z.number(),
          position: z.number(),
          name: z.string(),
        }),
      },
      async (args) => {
        toolInvocationTracker.push({ name: "moodle_create_section", args });
        return {
          content: [{ type: "text", text: "Section created" }],
          structuredContent: {
            status: "success",
            data: { section_id: 201, section_num: args.position, name: args.name },
          },
        };
      }
    );

    server.registerTool(
      "moodle_create_assignment",
      {
        description: "Create assignment tool",
        inputSchema: z.object({
          course_id: z.number(),
          section_id: z.number(),
          name: z.string(),
        }),
      },
      async (args) => {
        toolInvocationTracker.push({ name: "moodle_create_assignment", args });
        return {
          content: [{ type: "text", text: "Assignment created" }],
          structuredContent: {
            status: "success",
            data: { activity_id: 301, assignment_id: 401, name: args.name },
          },
        };
      }
    );

    server.registerTool(
      "moodle_conflict_tool",
      {
        description: "Conflict tool",
        inputSchema: z.object({
          id: z.number(),
        }),
      },
      async (args) => {
        toolInvocationTracker.push({ name: "moodle_conflict_tool", args });
        return {
          content: [{ type: "text", text: "Conflict error" }],
          structuredContent: {
            status: "error",
            code: "CONFLICT",
            message: "Item already exists",
          },
          isError: true,
        };
      }
    );

    server.registerTool(
      "moodle_auth_fail_tool",
      {
        description: "Auth fail tool",
        inputSchema: z.object({}),
      },
      async (args) => {
        toolInvocationTracker.push({ name: "moodle_auth_fail_tool", args });
        return {
          content: [{ type: "text", text: "Auth error" }],
          structuredContent: {
            status: "error",
            code: "AUTH_ERROR",
            message: "Invalid token",
          },
          isError: true,
        };
      }
    );

    let transientAttempts = 0;
    server.registerTool(
      "moodle_transient_tool",
      {
        description: "Transient tool",
        inputSchema: z.object({
          attemptsNeeded: z.number(),
        }),
      },
      async (args) => {
        toolInvocationTracker.push({ name: "moodle_transient_tool", args });
        transientAttempts++;
        if (transientAttempts < args.attemptsNeeded) {
          return {
            content: [{ type: "text", text: "Network blip" }],
            structuredContent: {
              status: "error",
              code: "NETWORK_ERROR",
              message: "Temporary socket reset",
            },
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: "Success after retry" }],
          structuredContent: {
            status: "success",
            data: { attempts: transientAttempts },
          },
        };
      }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const mcpClientManager = new McpClientManager({ transport: clientTransport });
    await mcpClientManager.connect();

    const modelClient = new FakeModelClient();
    const messageRepo = new MockMessageRepository();
    const toolCallRepo = new MockToolCallRepository();
    const mappingRepo = new MockExecutionMappingRepository();
    const idempotencyRepo = new MockIdempotencyRepository();

    return {
      server,
      mcpClientManager,
      modelClient,
      messageRepo,
      toolCallRepo,
      mappingRepo,
      idempotencyRepo,
      toolInvocationTracker,
    };
  }

  // ==========================================================================
  // Test 1: Happy Path & Multi-Step Sequential Chaining (T1004, P10-D6)
  // ==========================================================================
  it("executes multi-step sequential tool calls and records mappings (T1004, P10-D6, T1007)", async () => {
    const env = await setupTestEnvironment();

    // Turn 1: Model emits 2 sequential tool calls (course + section)
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Creating course and section...",
        tool_calls: [
          {
            id: "call_course_1",
            function: {
              name: "moodle_create_course",
              arguments: { category_id: 1, fullname: "AI Course", shortname: "CS101" },
            },
          },
          {
            id: "call_sec_1",
            function: {
              name: "moodle_create_section",
              arguments: { course_id: 101, position: 1, name: "Week 1" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    // Turn 2: Model emits assignment tool call using previously created section
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Creating assignment...",
        tool_calls: [
          {
            id: "call_assign_1",
            function: {
              name: "moodle_create_assignment",
              arguments: { course_id: 101, section_id: 201, name: "Lab 1" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    // Turn 3: Model finishes with final summary message (no tool calls)
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Course structure created successfully.",
        tool_calls: [],
      },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-001",
      planId: "plan-001",
      revision: 1,
      systemPrompt: "You are the Moodle course creator agent.",
      initialUserMessage: "Please build CS101 course.",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
        mappingRepo: env.mappingRepo as any,
        idempotencyRepo: env.idempotencyRepo as any,
      },
      options: {
        toolContextResolver: ({ toolName }) => {
          if (toolName === "moodle_create_course") return { localRef: "course-01", targetType: "course" };
          if (toolName === "moodle_create_section") return { localRef: "section-01", targetType: "section" };
          if (toolName === "moodle_create_assignment") return { localRef: "assign-01", targetType: "assignment" };
          return undefined;
        },
      },
    });

    expect(result.status).toBe("finished");
    expect(result.totalSteps).toBe(3);
    expect(result.totalToolCalls).toBe(3);
    expect(result.finalMessage).toBe("Course structure created successfully.");

    // Verify tool calls executed in sequential order
    expect(env.toolInvocationTracker.map((t) => t.name)).toEqual([
      "moodle_create_course",
      "moodle_create_section",
      "moodle_create_assignment",
    ]);

    // Verify P10-D1: localRef was NOT passed to MCP tool arguments
    for (const inv of env.toolInvocationTracker) {
      expect((inv.args as any).localRef).toBeUndefined();
      expect((inv.args as any).targetType).toBeUndefined();
    }

    // Verify T1007: Mappings recorded with canonical IDs
    expect(env.mappingRepo.mappings).toHaveLength(3);
    expect(env.mappingRepo.mappings[0]).toMatchObject({
      localRef: "course-01",
      targetType: "course",
      moodleId: 101,
    });
    expect(env.mappingRepo.mappings[1]).toMatchObject({
      localRef: "section-01",
      targetType: "section",
      moodleId: 201,
    });
    expect(env.mappingRepo.mappings[2]).toMatchObject({
      localRef: "assign-01",
      targetType: "assignment",
      moodleId: 301, // activity_id for assignment
    });

    // Verify P10-D4: All messages persisted (system, user, assistant, tool)
    expect(env.messageRepo.messages.length).toBeGreaterThanOrEqual(6);
    expect(env.messageRepo.messages[0]).toMatchObject({ role: "system", stepNumber: 0 });
    expect(env.messageRepo.messages[1]).toMatchObject({ role: "user", stepNumber: 0 });

    // Verify P10-D5: Model tool-call ID preserved
    expect(env.toolCallRepo.toolCalls[0].toolCallId).toBe("call_course_1");
    expect(env.toolCallRepo.toolCalls[1].toolCallId).toBe("call_sec_1");
    expect(env.toolCallRepo.toolCalls[2].toolCallId).toBe("call_assign_1");

    // Provider protocols require each tool-result message to reference the
    // assistant tool call it answers.
    const secondTurnToolMessages = env.modelClient.callHistory[1].messages.filter(
      (message) => message.role === "tool"
    );
    expect(secondTurnToolMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "tool", tool_call_id: "call_course_1" }),
        expect.objectContaining({ role: "tool", tool_call_id: "call_sec_1" }),
      ])
    );
  });

  // ==========================================================================
  // Test 2: Argument Schema Validation Failure (T1005)
  // ==========================================================================
  it("rejects invalid arguments and returns structured error without invoking MCP (T1005)", async () => {
    const env = await setupTestEnvironment();

    // Turn 1: Model passes invalid arguments (missing required shortname)
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Creating course...",
        tool_calls: [
          {
            id: "call_invalid_1",
            function: {
              name: "moodle_create_course",
              arguments: { category_id: 1, fullname: "AI Course" }, // missing shortname
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    // Turn 2: Model corrects itself after receiving INVALID_ARGUMENTS
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Correcting arguments...",
        tool_calls: [
          {
            id: "call_valid_2",
            function: {
              name: "moodle_create_course",
              arguments: { category_id: 1, fullname: "AI Course", shortname: "CS101" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    // Turn 3: Complete
    env.modelClient.enqueueResponse({
      message: { role: "assistant", content: "Done", tool_calls: [] },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-002",
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
      },
    });

    expect(result.status).toBe("finished");

    // MCP was only invoked once (the valid call)
    expect(env.toolInvocationTracker).toHaveLength(1);

    // Both calls are persisted in poc_tool_call (T1006)
    expect(env.toolCallRepo.toolCalls).toHaveLength(2);
    expect(env.toolCallRepo.toolCalls[0].status).toBe("error");
    expect(env.toolCallRepo.toolCalls[0].error).toContain("must have required property 'shortname'");
    expect(env.toolCallRepo.toolCalls[1].status).toBe("success");
  });

  // ==========================================================================
  // Test 3: Conflict Error is Model-Correctable (P10-D7)
  // ==========================================================================
  it("returns CONFLICT to the model without halting the loop (P10-D7)", async () => {
    const env = await setupTestEnvironment();

    // Turn 1: Model calls conflict tool
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Calling item 1...",
        tool_calls: [
          {
            id: "call_conflict_1",
            function: { name: "moodle_conflict_tool", arguments: { id: 1 } },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    // Turn 2: Model adapts to conflict error and finishes
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Conflict received, proceeding with alternate plan.",
        tool_calls: [],
      },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-003",
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
      },
    });

    expect(result.status).toBe("finished");
    expect(result.finalMessage).toContain("proceeding with alternate plan");
  });

  // ==========================================================================
  // Test 4: Unrecoverable Errors (AUTH_ERROR) Halt Immediately (T1014, P10-D7)
  // ==========================================================================
  it("halts immediately on unrecoverable AUTH_ERROR (T1014, P10-D7)", async () => {
    const env = await setupTestEnvironment();

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Calling with expired token...",
        tool_calls: [
          {
            id: "call_auth_fail",
            function: { name: "moodle_auth_fail_tool", arguments: {} },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    await expect(
      runAgentLoop({
        runId: "run-004",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
        },
      })
    ).rejects.toThrow(UnrecoverableToolError);
  });

  // ==========================================================================
  // Test 5: Repeated Identical Tool Call Detection (T1010, Correction 6)
  // ==========================================================================
  it("halts when tool is called 3 consecutive times with identical canonical arguments (T1010)", async () => {
    const env = await setupTestEnvironment();

    // Model repeats the exact same call across turns
    for (let i = 1; i <= 3; i++) {
      env.modelClient.enqueueResponse({
        message: {
          role: "assistant",
          content: `Attempt ${i}...`,
          tool_calls: [
            {
              id: `call_repeat_${i}`,
              function: {
                name: "moodle_conflict_tool",
                arguments: { id: 99 },
              },
            },
          ],
        },
        toolCalls: [],
        rawText: "",
      });
    }

    await expect(
      runAgentLoop({
        runId: "run-005",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
        },
      })
    ).rejects.toThrow(RepeatedToolCallError);
  });

  // ==========================================================================
  // Test 6: Idempotency Caching (T1013, P10-D9)
  // ==========================================================================
  it("returns cached result without invoking MCP when idempotency status is completed (P10-D9)", async () => {
    const env = await setupTestEnvironment();

    // Pre-populate idempotency cache for section-01
    const key = "run-006:plan-001:1:section-01:moodle_create_section";
    await env.idempotencyRepo.recordSuccess(key, { section_id: 888, section_num: 1, name: "Pre-cached" });

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Creating section...",
        tool_calls: [
          {
            id: "call_cached_1",
            function: {
              name: "moodle_create_section",
              arguments: { course_id: 101, position: 1, name: "Pre-cached" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    env.modelClient.enqueueResponse({
      message: { role: "assistant", content: "Done", tool_calls: [] },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-006",
      planId: "plan-001",
      revision: 1,
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
        idempotencyRepo: env.idempotencyRepo as any,
      },
      options: {
        toolContextResolver: () => ({ localRef: "section-01", targetType: "section" }),
      },
    });

    expect(result.status).toBe("finished");
    // MCP tool was not called because result was returned from cache
    expect(env.toolInvocationTracker).toHaveLength(0);
    // Tool call was persisted with status success
    expect(env.toolCallRepo.toolCalls[0].status).toBe("success");
    expect((env.toolCallRepo.toolCalls[0].normalizedResult as any).data.section_id).toBe(888);
  });

  // ==========================================================================
  // Test 7: Idempotency In-Flight Rejection (P10-D9)
  // ==========================================================================
  it("rejects with IdempotencyInFlightError when mutation is in_flight (P10-D9)", async () => {
    const env = await setupTestEnvironment();

    // Pre-set in_flight
    const key = "run-007:plan-001:1:section-01:moodle_create_section";
    env.idempotencyRepo.records.set(key, { status: "in_flight" });

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Creating section...",
        tool_calls: [
          {
            id: "call_inflight_1",
            function: {
              name: "moodle_create_section",
              arguments: { course_id: 101, position: 1, name: "Section 1" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    await expect(
      runAgentLoop({
        runId: "run-007",
        planId: "plan-001",
        revision: 1,
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
          idempotencyRepo: env.idempotencyRepo as any,
        },
        options: {
          toolContextResolver: () => ({ localRef: "section-01", targetType: "section" }),
        },
      })
    ).rejects.toThrow(IdempotencyInFlightError);

    // MCP was not called
    expect(env.toolInvocationTracker).toHaveLength(0);
  });

  // ==========================================================================
  // Test 8: Transient Error Bounded Retry (T1012, P10-D8)
  // ==========================================================================
  it("retries transient NETWORK_ERROR up to maxRetries and succeeds (T1012, P10-D8)", async () => {
    const env = await setupTestEnvironment();

    // Tool needs 2 attempts before succeeding
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Calling transient tool...",
        tool_calls: [
          {
            id: "call_transient_1",
            function: {
              name: "moodle_transient_tool",
              arguments: { attemptsNeeded: 2 },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    env.modelClient.enqueueResponse({
      message: { role: "assistant", content: "Done", tool_calls: [] },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-008",
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
      },
      options: {
        maxRetries: 2,
        retryDelayMs: 10,
      },
    });

    expect(result.status).toBe("finished");
    // Tool was invoked twice (1 retry)
    expect(env.toolInvocationTracker).toHaveLength(2);
  });

  // ==========================================================================
  // Test 9: Max Steps Limit Enforcement (T1009, Correction 7)
  // ==========================================================================
  it("enforces maxSteps limit throwing MaxStepsExceededError (T1009)", async () => {
    const env = await setupTestEnvironment();

    // Enqueue 3 assistant turns that continue requesting tools
    for (let i = 1; i <= 3; i++) {
      env.modelClient.enqueueResponse({
        message: {
          role: "assistant",
          content: `Step ${i}`,
          tool_calls: [
            {
              id: `call_step_${i}`,
              function: {
                name: "moodle_create_course",
                arguments: { category_id: 1, fullname: `Course ${i}`, shortname: `CS${i}` },
              },
            },
          ],
        },
        toolCalls: [],
        rawText: "",
      });
    }

    await expect(
      runAgentLoop({
        runId: "run-009",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
        },
        options: {
          maxSteps: 2, // limit to 2 turns
        },
      })
    ).rejects.toThrow(MaxStepsExceededError);
  });

  // ==========================================================================
  // Test 10: Model Timeout (T1011)
  // ==========================================================================
  it("handles model timeout cleanly with AgentTimeoutError (T1011)", async () => {
    const env = await setupTestEnvironment();

    env.modelClient.enqueueResponse(async () => {
      throw new Error("Ollama request timed out after 60000ms");
    });

    await expect(
      runAgentLoop({
        runId: "run-010",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
        },
      })
    ).rejects.toThrow(AgentTimeoutError);
  });

  // ==========================================================================
  // Test 11: Quiz and Question Execution Mappings (T1007, Correction 9)
  // ==========================================================================
  it("maps quiz to activity_id and question to question_bank_entry_id (T1007)", async () => {
    const env = await setupTestEnvironment();

    env.server.registerTool(
      "moodle_create_quiz",
      {
        description: "Create quiz",
        inputSchema: z.object({ course_id: z.number(), name: z.string() }),
      },
      async (args) => ({
        content: [{ type: "text", text: "Quiz created" }],
        structuredContent: {
          status: "success",
          data: { activity_id: 555, quiz_id: 666, name: args.name },
        },
      })
    );

    env.server.registerTool(
      "moodle_create_quiz_question",
      {
        description: "Create question",
        inputSchema: z.object({ activity_id: z.number(), name: z.string() }),
      },
      async (args) => ({
        content: [{ type: "text", text: "Question created" }],
        structuredContent: {
          status: "success",
          data: {
            question_bank_entry_id: 777,
            question_id: 888,
            version: 1,
            name: args.name,
          },
        },
      })
    );

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Creating quiz and question...",
        tool_calls: [
          {
            id: "call_quiz_1",
            function: {
              name: "moodle_create_quiz",
              arguments: { course_id: 101, name: "Quiz 1" },
            },
          },
          {
            id: "call_q_1",
            function: {
              name: "moodle_create_quiz_question",
              arguments: { activity_id: 555, name: "Q1" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    env.modelClient.enqueueResponse({
      message: { role: "assistant", content: "Done", tool_calls: [] },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-011",
      planId: "plan-001",
      revision: 1,
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
        mappingRepo: env.mappingRepo as any,
      },
      options: {
        toolContextResolver: ({ toolName }) => {
          if (toolName === "moodle_create_quiz") {
            return { localRef: "quiz-01", targetType: "quiz" };
          }
          if (toolName === "moodle_create_quiz_question") {
            return { localRef: "question-01", targetType: "question" };
          }
          return undefined;
        },
      },
    });

    expect(result.status).toBe("finished");
    expect(env.mappingRepo.mappings).toHaveLength(2);

    // Quiz mapped to activity_id (555)
    expect(env.mappingRepo.mappings[0]).toMatchObject({
      localRef: "quiz-01",
      targetType: "quiz",
      moodleId: 555,
    });

    // Question mapped to question_bank_entry_id (777)
    expect(env.mappingRepo.mappings[1]).toMatchObject({
      localRef: "question-01",
      targetType: "question",
      moodleId: 777,
    });
  });

  // ==========================================================================
  // Test 12: Unrecoverable PERMISSION_DENIED Error Halts Immediately (T1014)
  // ==========================================================================
  it("halts immediately on PERMISSION_DENIED error (T1014, P10-D7)", async () => {
    const env = await setupTestEnvironment();

    env.server.registerTool(
      "moodle_perm_fail_tool",
      {
        description: "Perm fail tool",
        inputSchema: z.object({}),
      },
      async () => ({
        content: [{ type: "text", text: "Permission denied" }],
        structuredContent: {
          status: "error",
          code: "PERMISSION_DENIED",
          message: "User does not have required capability",
        },
        isError: true,
      })
    );

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Calling protected tool...",
        tool_calls: [
          {
            id: "call_perm_fail",
            function: { name: "moodle_perm_fail_tool", arguments: {} },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    await expect(
      runAgentLoop({
        runId: "run-012",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
        },
      })
    ).rejects.toThrow(UnrecoverableToolError);
  });

  // ==========================================================================
  // Test 13: Overall Run Deadline Timeout (T1011)
  // ==========================================================================
  it("halts with RUN_TIMEOUT when overall run deadline expires (T1011)", async () => {
    const env = await setupTestEnvironment();

    env.modelClient.enqueueResponse(async () => {
      // simulate slow model turn
      await new Promise((r) => setTimeout(r, 60));
      return {
        message: {
          role: "assistant",
          content: "Creating course...",
          tool_calls: [
            {
              id: "call_late",
              function: {
                name: "moodle_create_course",
                arguments: { category_id: 1, fullname: "Late", shortname: "LT" },
              },
            },
          ],
        },
        toolCalls: [],
        rawText: "",
      };
    });

    await expect(
      runAgentLoop({
        runId: "run-013",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
        },
        options: {
          runTimeoutMs: 30, // 30ms run deadline
        },
      })
    ).rejects.toThrow(AgentTimeoutError);
  });

  // ==========================================================================
  // Test 14: UUID Fallback when Model Tool Call ID is Missing (P10-D5)
  // ==========================================================================
  it("generates UUID fallback when model tool call ID is omitted (P10-D5)", async () => {
    const env = await setupTestEnvironment();

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Creating course without call ID...",
        tool_calls: [
          {
            // Omit id
            function: {
              name: "moodle_create_course",
              arguments: { category_id: 1, fullname: "AI Course", shortname: "CS101" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    env.modelClient.enqueueResponse({
      message: { role: "assistant", content: "Done", tool_calls: [] },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-014",
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
      },
    });

    expect(result.status).toBe("finished");
    expect(env.toolCallRepo.toolCalls).toHaveLength(1);
    // Verified UUID was generated
    expect(env.toolCallRepo.toolCalls[0].toolCallId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  // ==========================================================================
  // Test 15: Mutation TOOL_TIMEOUT is NOT Automatically Retried (P10-RD2)
  // ==========================================================================
  it("does not automatically retry timed-out mutation tools (P10-RD2)", async () => {
    const env = await setupTestEnvironment();

    let mutationInvocationCount = 0;
    env.server.registerTool(
      "moodle_update_assignment",
      {
        description: "Update assignment",
        inputSchema: z.object({ assignment_id: z.number(), name: z.string() }),
      },
      async (args) => {
        mutationInvocationCount++;
        // Simulate slow mutation
        await new Promise((r) => setTimeout(r, 100));
        return {
          content: [{ type: "text", text: "Updated" }],
          structuredContent: { status: "success", data: { assignment_id: args.assignment_id } },
        };
      }
    );

    // Turn 1: Model calls mutating tool which times out
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Updating assignment...",
        tool_calls: [
          {
            id: "call_mut_timeout",
            function: {
              name: "moodle_update_assignment",
              arguments: { assignment_id: 101, name: "New Name" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    // Turn 2: Model receives TOOL_TIMEOUT error and gracefully completes
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Observed timeout, stopping to let reconciliation handle state.",
        tool_calls: [],
      },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-015",
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
      },
      options: {
        maxRetries: 3,
        toolTimeoutMs: 30, // 30ms timeout (< 100ms delay)
      },
    });

    expect(result.status).toBe("finished");
    // Crucial: mutating tool was invoked EXACTLY ONCE (no retry attempt 2 or 3)
    expect(mutationInvocationCount).toBe(1);
    expect(env.toolCallRepo.toolCalls).toHaveLength(1);
    expect(env.toolCallRepo.toolCalls[0].status).toBe("timeout");
    expect((env.toolCallRepo.toolCalls[0].normalizedResult as any).code).toBe("MUTATION_OUTCOME_UNCERTAIN");
  });

  // ==========================================================================
  // Test 16: Read-Only TOOL_TIMEOUT Is Eligible for Bounded Retry (P10-RD2)
  // ==========================================================================
  it("retries timed-out read-only tools up to maxRetries (P10-RD2)", async () => {
    const env = await setupTestEnvironment();

    let readCount = 0;
    env.server.registerTool(
      "moodle_get_course",
      {
        description: "Get course (read-only)",
        inputSchema: z.object({ course_id: z.number() }),
      },
      async (args) => {
        readCount++;
        if (readCount === 1) {
          // First attempt times out
          await new Promise((r) => setTimeout(r, 100));
        }
        return {
          content: [{ type: "text", text: "Course data" }],
          structuredContent: { status: "success", data: { course_id: args.course_id, fullname: "CS101" } },
        };
      }
    );

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Getting course...",
        tool_calls: [
          {
            id: "call_get_course",
            function: {
              name: "moodle_get_course",
              arguments: { course_id: 101 },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    env.modelClient.enqueueResponse({
      message: { role: "assistant", content: "Done", tool_calls: [] },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-016",
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
      },
      options: {
        maxRetries: 2,
        toolTimeoutMs: 30,
        retryDelayMs: 10,
      },
    });

    expect(result.status).toBe("finished");
    // Read tool was retried and succeeded on second attempt
    expect(readCount).toBe(2);
    expect(env.toolCallRepo.toolCalls).toHaveLength(1);
    expect(env.toolCallRepo.toolCalls[0].status).toBe("success");
  });

  // ==========================================================================
  // Test 17: Tool Context Resolver Receives Full Descriptor (P10-RD3)
  // ==========================================================================
  it("resolves context with full runtime call descriptor and binds distinct localRefs (P10-RD3)", async () => {
    const env = await setupTestEnvironment();

    const receivedInputs: any[] = [];

    // Model emits 2 assignment creations using same tool in one turn
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Creating two assignments...",
        tool_calls: [
          {
            id: "call_assign_a",
            function: {
              name: "moodle_create_assignment",
              arguments: { course_id: 101, section_id: 201, name: "Assignment 1" },
            },
          },
          {
            id: "call_assign_b",
            function: {
              name: "moodle_create_assignment",
              arguments: { course_id: 101, section_id: 201, name: "Assignment 2" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    env.modelClient.enqueueResponse({
      message: { role: "assistant", content: "Done", tool_calls: [] },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-017",
      planId: "plan-001",
      revision: 1,
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
        mappingRepo: env.mappingRepo as any,
      },
      options: {
        toolContextResolver: (input) => {
          receivedInputs.push(input);
          if (input.callIndex === 0) {
            return { localRef: "assign-01", targetType: "assignment" };
          }
          if (input.callIndex === 1) {
            return { localRef: "assign-02", targetType: "assignment" };
          }
          return undefined;
        },
      },
    });

    expect(result.status).toBe("finished");
    expect(receivedInputs).toHaveLength(2);
    expect(receivedInputs[0]).toMatchObject({
      toolCallId: "call_assign_a",
      toolName: "moodle_create_assignment",
      stepNumber: 1,
      callIndex: 0,
    });
    expect(receivedInputs[1]).toMatchObject({
      toolCallId: "call_assign_b",
      toolName: "moodle_create_assignment",
      stepNumber: 1,
      callIndex: 1,
    });

    // Verify distinct localRef mappings created
    expect(env.mappingRepo.mappings).toHaveLength(2);
    expect(env.mappingRepo.mappings[0].localRef).toBe("assign-01");
    expect(env.mappingRepo.mappings[1].localRef).toBe("assign-02");

    // Verify neither localRef reached MCP tool arguments
    for (const inv of env.toolInvocationTracker) {
      expect((inv.args as any).localRef).toBeUndefined();
    }
  });

  // ==========================================================================
  // Test 18: Question Mapping Identity (P10-RD4)
  // ==========================================================================
  it("maps question_bank_entry_id strictly and rejects question_id fallback (P10-RD4)", async () => {
    const env = await setupTestEnvironment();

    // Tool returns only question_id without question_bank_entry_id
    env.server.registerTool(
      "moodle_create_quiz_question",
      {
        description: "Question without entry ID",
        inputSchema: z.object({ name: z.string() }),
      },
      async (args) => ({
        content: [{ type: "text", text: "Created" }],
        structuredContent: {
          status: "success",
          data: { question_id: 999, name: args.name }, // lacks question_bank_entry_id
        },
      })
    );

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Creating question...",
        tool_calls: [
          {
            id: "call_q_no_entry",
            function: {
              name: "moodle_create_quiz_question",
              arguments: { name: "Q without entry" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    env.modelClient.enqueueResponse({
      message: { role: "assistant", content: "Done", tool_calls: [] },
      toolCalls: [],
      rawText: "",
    });

    await expect(
      runAgentLoop({
        runId: "run-018",
        planId: "plan-001",
        revision: 1,
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
          mappingRepo: env.mappingRepo as any,
        },
        options: {
          toolContextResolver: () => ({ localRef: "question-01", targetType: "question" }),
        },
      })
    ).rejects.toThrow(MappingIdMissingError);

    expect(env.mappingRepo.mappings).toHaveLength(0);
  });

  // ==========================================================================
  // Test 19: Repeated Invalid Calls Trigger Loop Detection (R7)
  // ==========================================================================
  it("detects 3 consecutive identical invalid calls and halts with RepeatedToolCallError (R7)", async () => {
    const env = await setupTestEnvironment();

    // Model repeats the exact same invalid call 3 times
    for (let i = 1; i <= 3; i++) {
      env.modelClient.enqueueResponse({
        message: {
          role: "assistant",
          content: `Attempting invalid call ${i}...`,
          tool_calls: [
            {
              id: `call_invalid_repeat_${i}`,
              function: {
                name: "moodle_create_course",
                arguments: { category_id: 1 }, // missing fullname and shortname
              },
            },
          ],
        },
        toolCalls: [],
        rawText: "",
      });
    }

    await expect(
      runAgentLoop({
        runId: "run-019",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
        },
      })
    ).rejects.toThrow(RepeatedToolCallError);

    // Verified: MCP was never called because it failed validation, but repetition guard halted at call 3
    expect(env.toolInvocationTracker).toHaveLength(0);
  });

  // ==========================================================================
  // Test 20: Read Tools Do Not Acquire Idempotency Keys (R9)
  // ==========================================================================
  it("does not acquire idempotency keys for read tools (R9)", async () => {
    const env = await setupTestEnvironment();

    env.server.registerTool(
      "moodle_get_course",
      {
        description: "Get course (read)",
        inputSchema: z.object({ course_id: z.number() }),
      },
      async (args) => ({
        content: [{ type: "text", text: "Course info" }],
        structuredContent: { status: "success", data: { course_id: args.course_id } },
      })
    );

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Getting course...",
        tool_calls: [
          {
            id: "call_read_idemp",
            function: { name: "moodle_get_course", arguments: { course_id: 101 } },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    env.modelClient.enqueueResponse({
      message: { role: "assistant", content: "Done", tool_calls: [] },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-020",
      planId: "plan-001",
      revision: 1,
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
        idempotencyRepo: env.idempotencyRepo as any,
      },
      options: {
        // Even if caller attached localRef, read tools must not acquire idempotency keys
        toolContextResolver: () => ({ localRef: "course-01", targetType: "course" }),
      },
    });

    expect(result.status).toBe("finished");
    expect(env.idempotencyRepo.records.size).toBe(0);
  });

  // ==========================================================================
  // Test 21: Read / Update Tools Do Not Create New Execution Mappings (R10)
  // ==========================================================================
  it("does not create execution mappings from read or update tools (R10)", async () => {
    const env = await setupTestEnvironment();

    env.server.registerTool(
      "moodle_update_assignment",
      {
        description: "Update assignment",
        inputSchema: z.object({ assignment_id: z.number() }),
      },
      async (args) => ({
        content: [{ type: "text", text: "Updated" }],
        structuredContent: { status: "success", data: { assignment_id: args.assignment_id } },
      })
    );

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Updating assignment...",
        tool_calls: [
          {
            id: "call_update_map",
            function: { name: "moodle_update_assignment", arguments: { assignment_id: 401 } },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    env.modelClient.enqueueResponse({
      message: { role: "assistant", content: "Done", tool_calls: [] },
      toolCalls: [],
      rawText: "",
    });

    const result = await runAgentLoop({
      runId: "run-021",
      planId: "plan-001",
      revision: 1,
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
        mappingRepo: env.mappingRepo as any,
      },
      options: {
        toolContextResolver: () => ({ localRef: "assign-01", targetType: "assignment" }),
      },
    });

    expect(result.status).toBe("finished");
    // moodle_update_assignment is NOT the materializing tool for assignment (moodle_create_assignment is)
    expect(env.mappingRepo.mappings).toHaveLength(0);
  });

  // ==========================================================================
  // Test 22: Max-Steps Drops Final Requested Tool Calls with Persistence (R11)
  // ==========================================================================
  it("persists rejected tool calls into poc_tool_call when maxSteps is reached (R11)", async () => {
    const env = await setupTestEnvironment();

    // Step 1: Model requests a tool call on the maxStep turn
    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Turn 1 tool call...",
        tool_calls: [
          {
            id: "call_maxstep_rejected",
            function: {
              name: "moodle_create_course",
              arguments: { category_id: 1, fullname: "Rejected Course", shortname: "REJ" },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    await expect(
      runAgentLoop({
        runId: "run-022",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
        },
        options: {
          maxSteps: 1, // 1 turn limit
        },
      })
    ).rejects.toThrow(MaxStepsExceededError);

    // MCP was not executed
    expect(env.toolInvocationTracker).toHaveLength(0);

    // Rejected tool call is persisted in poc_tool_call
    expect(env.toolCallRepo.toolCalls).toHaveLength(1);
    expect(env.toolCallRepo.toolCalls[0]).toMatchObject({
      toolCallId: "call_maxstep_rejected",
      status: "error",
    });
    expect(env.toolCallRepo.toolCalls[0].error).toContain("MAX_STEPS_EXCEEDED");
  });

  // ==========================================================================
  // Test 23: Model Timeout Capped by Remaining Run Deadline (R12)
  // ==========================================================================
  it("caps model timeout by remaining run deadline (R12)", async () => {
    const env = await setupTestEnvironment();

    let capturedTimeout: number | undefined;
    env.modelClient.enqueueResponse(async (params) => {
      capturedTimeout = params.options?.timeoutMs;
      return {
        message: { role: "assistant", content: "Done", tool_calls: [] },
        toolCalls: [],
        rawText: "",
      };
    });

    const result = await runAgentLoop({
      runId: "run-023",
      systemPrompt: "System",
      initialUserMessage: "User",
      modelClient: env.modelClient,
      mcpClientManager: env.mcpClientManager,
      repositories: {
        messageRepo: env.messageRepo as any,
        toolCallRepo: env.toolCallRepo as any,
      },
      options: {
        modelTimeoutMs: 60_000,
        runTimeoutMs: 5_000, // run deadline is 5s
      },
    });

    expect(result.status).toBe("finished");
    expect(capturedTimeout).toBeDefined();
    // Model timeout was capped to <= 5,000ms
    expect(capturedTimeout!).toBeLessThanOrEqual(5_000);
  });

  // ==========================================================================
  // Test 24: Tool Retry Delay Halts When Exceeding Run Deadline (R13)
  // ==========================================================================
  it("halts with RUN_TIMEOUT if retry delay would exceed run deadline (R13)", async () => {
    const env = await setupTestEnvironment();

    env.modelClient.enqueueResponse({
      message: {
        role: "assistant",
        content: "Calling failing tool...",
        tool_calls: [
          {
            id: "call_transient_late",
            function: {
              name: "moodle_transient_tool",
              arguments: { attemptsNeeded: 5 },
            },
          },
        ],
      },
      toolCalls: [],
      rawText: "",
    });

    await expect(
      runAgentLoop({
        runId: "run-024",
        systemPrompt: "System",
        initialUserMessage: "User",
        modelClient: env.modelClient,
        mcpClientManager: env.mcpClientManager,
        repositories: {
          messageRepo: env.messageRepo as any,
          toolCallRepo: env.toolCallRepo as any,
        },
        options: {
          maxRetries: 3,
          retryDelayMs: 200, // 200ms delay > 50ms run deadline
          runTimeoutMs: 50,
        },
      })
    ).rejects.toThrow(AgentTimeoutError);
  });
});


