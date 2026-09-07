import { randomUUID } from "node:crypto";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpClientManager,
  type PlanRepository,
  type RunRepository,
} from "@moodle-agent-poc/agent-runtime";
import type { AssignmentPlanEnvelope, PocRunRecord } from "@moodle-agent-poc/contracts";
import type { AssignmentPlanner } from "@moodle-agent-poc/planning";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/config-loader.js";

const config: AppConfig = {
  port: 3000,
  host: "127.0.0.1",
  logLevel: "silent",
  databaseUrl: "postgresql://test",
  ollamaModel: "test-model",
  moodleBaseUrl: "http://localhost:8000",
  moodleToken: "token",
  agentMaxSteps: 25,
  agentModelTimeoutMs: 1000,
  agentToolTimeoutMs: 1000,
  agentRunTimeoutMs: 5000,
};

async function assignmentMcp() {
  const server = new McpServer({ name: "p12-api", version: "1" });
  server.registerTool("moodle_get_assignment", { inputSchema: z.object({ activity_id: z.number() }) }, async () => ({
    content: [{ type: "text", text: "ok" }],
    structuredContent: { status: "success", data: { activity_id: 42, assignment_id: 420, course_id: 7, section_id: 8, name: "Old Assignment", intro: "Old intro", grade: 100 } },
  }));
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const manager = new McpClientManager({ type: "in_memory", transport: ct });
  await manager.connect();
  return { server, manager };
}

describe("Phase 12 assignment API", () => {
  it("reads current assignment state through GET /api/assignments/:activityId (T1201)", async () => {
    const mcp = await assignmentMcp();
    const app = buildApp({ config, mcpClientManager: mcp.manager });
    const response = await app.inject({ method: "GET", url: "/api/assignments/42" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.assignment).toMatchObject({ activity_id: 42, course_id: 7, section_id: 8, name: "Old Assignment" });
    expect(body.planning_state).toMatchObject({ ref: "assignment-42", title: "Old Assignment", description: "Old intro" });
    await app.close(); await mcp.manager.close(); await mcp.server.close();
  });

  it("reads Moodle state, invokes AssignmentPlanner, persists preview lifecycle (T1202-T1203)", async () => {
    const mcp = await assignmentMcp();
    const runId = randomUUID();
    const statuses: string[] = [];
    const runRepo = {
      getRun: vi.fn(async () => ({ runId, status: "preview", model: "test" } as PocRunRecord)),
      updateStatus: vi.fn(async (_id, status) => { statuses.push(status); return { runId, status } as PocRunRecord; }),
      failRun: vi.fn(),
    } as unknown as RunRepository;
    const envelope: AssignmentPlanEnvelope = {
      schema_version: "0.1", plan_id: randomUUID(), revision: 1, plan_type: "assignment", operation: "update",
      title: "Updated", summary: "Updated", warnings: [], assumptions: [],
      content: { ref: "assignment-42", type: "assignment", title: "Updated Assignment", description: "Updated intro", instructions: ["Do it"], learning_objectives: ["Learn"], grade: 50, source_refs: [] },
    };
    const planner = {
      planAssignmentUpdate: vi.fn(async (params) => {
        expect(params.input.current).toMatchObject({ ref: "assignment-42", title: "Old Assignment", grade: 100 });
        expect(params.input.instruction).toBe("Make it shorter");
        return envelope;
      }),
    } as unknown as AssignmentPlanner;
    const planRepo = {} as PlanRepository;
    const app = buildApp({ config, runRepo, planRepo, assignmentPlanner: planner, mcpClientManager: mcp.manager });
    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/plans/assignment-update`,
      payload: { instruction: "Make it shorter", target: { course_id: 7, section_id: 8, activity_id: 42 } },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().plan.plan_id).toBe(envelope.plan_id);
    expect(statuses).toEqual(["planning", "preview"]);
    expect(planner.planAssignmentUpdate).toHaveBeenCalledOnce();
    await app.close(); await mcp.manager.close(); await mcp.server.close();
  });
});
