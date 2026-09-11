import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpClientManager,
  type ExecutionMappingRepository,
  type IdempotencyRepository,
  type RunRepository,
  type ToolCallRepository,
} from "@moodle-agent-poc/agent-runtime";
import type { AssignmentPlanEnvelope } from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeAssignmentPlan, readAssignmentState, toExistingAssignmentState } from "../src/assignment-executor.js";

function envelope(operation: "create" | "update"): AssignmentPlanEnvelope {
  return {
    schema_version: "0.1",
    plan_id: `assignment-plan-${operation}`,
    revision: 1,
    plan_type: "assignment",
    operation,
    title: "Updated Assignment",
    summary: "Update assignment",
    warnings: [],
    assumptions: [],
    content: {
      ref: "assignment-42",
      type: "assignment",
      title: "Updated Assignment",
      description: "New description",
      instructions: ["Step one", "Step two"],
      learning_objectives: ["Understand testing"],
      grade: 50,
      source_refs: [],
    },
  };
}

async function setup() {
  let state = {
    activity_id: 42,
    assignment_id: 420,
    course_id: 7,
    section_id: 8,
    name: "Old Assignment",
    intro: "Old intro",
    grade: 100,
  };
  const server = new McpServer({ name: "assignment-p12", version: "1" });
  server.registerTool("moodle_get_assignment", { inputSchema: z.object({ activity_id: z.number().int().positive() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: state } }));
  server.registerTool("moodle_update_assignment", { inputSchema: z.object({ activity_id: z.number(), expected_course_id: z.number().optional(), expected_section_id: z.number().optional(), name: z.string().optional(), intro: z.string().optional(), grade: z.number().optional() }) }, async (args) => {
    state = { ...state, name: args.name ?? state.name, intro: args.intro ?? state.intro, grade: args.grade ?? state.grade };
    return { content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { activity_id: state.activity_id, assignment_id: state.assignment_id, name: state.name, intro: state.intro, grade: state.grade } } };
  });
  server.registerTool("moodle_create_assignment", { inputSchema: z.object({ course_id: z.number(), section_id: z.number(), name: z.string(), intro: z.string(), grade: z.number().optional() }) }, async (args) => {
    state = { activity_id: 99, assignment_id: 990, course_id: args.course_id, section_id: args.section_id, name: args.name, intro: args.intro, grade: args.grade ?? 100 };
    return { content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { activity_id: 99, assignment_id: 990, name: state.name, section_id: state.section_id, grade: state.grade } } };
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const manager = new McpClientManager({ type: "in_memory", transport: ct });
  await manager.connect();

  const acquired: any[] = [];
  const idempotencyRepo = {
    tryAcquire: vi.fn(async (p) => { acquired.push(p); return { state: "acquired" as const, key: `${p.localRef}:${p.toolName}` }; }),
    recordSuccess: vi.fn(async () => undefined),
    recordFailure: vi.fn(async () => undefined),
    recordUncertain: vi.fn(async () => undefined),
  } as unknown as IdempotencyRepository;
  const mappings: any[] = [];
  const mappingRepo = { setMapping: vi.fn(async (r) => { mappings.push(r); return r; }), listRunMappings: vi.fn(async () => mappings) } as unknown as ExecutionMappingRepository;
  const toolCallRepo = { recordToolCall: vi.fn(async (r) => r) } as unknown as ToolCallRepository;
  const statuses: string[] = [];
  const runRepo = {
    updateStatus: vi.fn(async (_id, status) => { statuses.push(status); return { status }; }),
    completeRun: vi.fn(async (_id, result) => { statuses.push("completed"); return { status: "completed", finalResult: result }; }),
    failRun: vi.fn(async (_id, error) => { statuses.push("failed"); return { status: "failed", error }; }),
  } as unknown as RunRepository;
  return { server, manager, repositories: { idempotencyRepo, mappingRepo, toolCallRepo, runRepo }, acquired, mappings, statuses };
}

describe("Phase 12 Assignment Execution", () => {
  it("reads existing assignment and converts it to planning state (T1201)", async () => {
    const e = await setup();
    const observed = await readAssignmentState(e.manager, 42);
    expect(observed.name).toBe("Old Assignment");
    expect(toExistingAssignmentState(observed)).toMatchObject({ ref: "assignment-42", title: "Old Assignment", description: "Old intro", grade: 100 });
    await e.manager.close(); await e.server.close();
  });

  it("updates then reads back/verifies and completes the run (T1204-T1205)", async () => {
    const e = await setup();
    const result = await executeAssignmentPlan({ runId: "run-u", planEnvelope: envelope("update"), target: { course_id: 7, section_id: 8, activity_id: 42 }, mcpClientManager: e.manager, repositories: e.repositories });
    expect(result.status).toBe("completed");
    expect(result.verified).toBe(true);
    expect(result.observed.name).toBe("Updated Assignment");
    expect(e.statuses).toEqual(["executing", "completed"]);
    expect(e.acquired).toContainEqual(expect.objectContaining({ localRef: "assignment-42", toolName: "moodle_update_assignment" }));
    await e.manager.close(); await e.server.close();
  });

  it("creates a new assignment in an existing section, maps it, and verifies it (T1206)", async () => {
    const e = await setup();
    const result = await executeAssignmentPlan({ runId: "run-c", planEnvelope: envelope("create"), target: { course_id: 7, section_id: 8 }, mcpClientManager: e.manager, repositories: e.repositories });
    expect(result.activityId).toBe(99);
    expect(result.verified).toBe(true);
    expect(e.mappings).toContainEqual(expect.objectContaining({ localRef: "assignment-42", targetType: "assignment", moodleId: 99 }));
    await e.manager.close(); await e.server.close();
  });
});
