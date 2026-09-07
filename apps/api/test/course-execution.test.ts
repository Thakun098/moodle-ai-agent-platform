import { randomUUID } from "node:crypto";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpClientManager,
  type ExecutionMappingRepository,
  type IdempotencyRepository,
  type PlanRepository,
  type RunRepository,
  type ToolCallRepository,
} from "@moodle-agent-poc/agent-runtime";
import type {
  CoursePlanEnvelope,
  ExecutionMappingRecord,
  PocPlanRevisionRecord,
  PocRunRecord,
  PocRunStatus,
} from "@moodle-agent-poc/contracts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/config-loader.js";

describe("Course Execution API Endpoints (T1101 to T1110, P11-D1 to P11-D8)", () => {
  const testConfig: AppConfig = {
    port: 3000,
    host: "127.0.0.1",
    nodeEnv: "test",
    logLevel: "silent",
    databaseUrl: "postgresql://postgres:postgres@localhost:5432/moodle_poc",
    ollamaBaseUrl: "http://localhost:11434",
    ollamaModel: "qwen2.5:7b-instruct-q4_K_M",
    moodleBaseUrl: "http://localhost:8000",
    moodleToken: "mock-token",
  };

  const samplePlanId = randomUUID();
  const sampleCoursePlanEnvelope: CoursePlanEnvelope = {
    schema_version: "0.1",
    plan_id: samplePlanId,
    revision: 1,
    plan_type: "course",
    operation: "create",
    title: "API Test Course",
    summary: "Course created for API route tests",
    warnings: [],
    assumptions: [],
    content: {
      course: {
        title: "API Test Course",
        course_code: "APIT101",
      },
      sections: [
        {
          ref: "sec-1",
          position: 1,
          title: "Introduction",
          source_refs: [],
          activities: [
            {
              ref: "assign-1",
              type: "assignment",
              title: "Hello Assignment",
              description: "Write your first program",
              instructions: ["Open editor", "Run program"],
              learning_objectives: ["Basic syntax"],
              grade: 100,
              source_refs: [],
            },
          ],
        },
      ],
    },
  };

  let mcpServer: McpServer;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;
  let mcpClientManager: McpClientManager;

  beforeAll(async () => {
    mcpServer = new McpServer({
      name: "moodle-api-test-mcp",
      version: "0.1.0",
    });

    // moodle_list_course_categories
    mcpServer.registerTool(
      "moodle_list_course_categories",
      { description: "List categories", inputSchema: z.object({}) },
      async () => ({
        content: [{ type: "text", text: "2 categories" }],
        structuredContent: {
          status: "success",
          data: [
            { id: 1, name: "Miscellaneous", coursecount: 5, visible: 1 },
            { id: 2, name: "Science", coursecount: 2, visible: 1 },
          ],
        },
      })
    );

    // moodle_create_course
    mcpServer.registerTool(
      "moodle_create_course",
      {
        description: "Create course",
        inputSchema: z.object({
          category_id: z.number(),
          fullname: z.string(),
          shortname: z.string(),
          summary: z.string().optional(),
        }),
      },
      async (args) => ({
        content: [{ type: "text", text: "Course created" }],
        structuredContent: {
          status: "success",
          data: { course_id: 888, fullname: args.fullname, shortname: args.shortname, category_id: args.category_id },
        },
      })
    );

    // moodle_create_section
    mcpServer.registerTool(
      "moodle_create_section",
      {
        description: "Create section",
        inputSchema: z.object({
          course_id: z.number(),
          position: z.number(),
          name: z.string(),
        }),
      },
      async (args) => ({
        content: [{ type: "text", text: "Section created" }],
        structuredContent: {
          status: "success",
          data: { section_id: 777, course_id: args.course_id, section_num: args.position, name: args.name },
        },
      })
    );

    // moodle_create_assignment
    mcpServer.registerTool(
      "moodle_create_assignment",
      {
        description: "Create assignment",
        inputSchema: z.object({
          course_id: z.number(),
          section_id: z.number(),
          name: z.string(),
          intro: z.string().optional(),
          grade: z.number().optional(),
        }),
      },
      async (args) => ({
        content: [{ type: "text", text: "Assignment created" }],
        structuredContent: {
          status: "success",
          data: { activity_id: 666, course_id: args.course_id, section_id: args.section_id, name: args.name, grade: args.grade ?? 100 },
        },
      })
    );

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    mcpClientManager = new McpClientManager({
      type: "in_memory",
      transport: clientTransport,
    });
    await mcpClientManager.connect();
  });

  afterAll(async () => {
    await mcpClientManager.close();
    await mcpServer.close();
  });

  it("GET /api/categories lists course categories (T1101)", async () => {
    const app = buildApp({
      config: testConfig,
      mcpClientManager,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/categories",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.categories).toHaveLength(2);
    expect(body.categories[0].id).toBe(1);
    expect(body.categories[1].name).toBe("Science");
  });

  it("POST /api/runs/:runId/execute returns 400 for invalid request schema", async () => {
    const app = buildApp({
      config: testConfig,
      mcpClientManager,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${randomUUID()}/execute`,
      payload: {
        plan_id: "not-a-uuid",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("POST /api/runs/:runId/execute returns 404 when run does not exist", async () => {
    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue(null),
    } as unknown as RunRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
      mcpClientManager,
    });

    const nonExistentRunId = randomUUID();
    const planId = randomUUID();
    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${nonExistentRunId}/execute`,
      payload: {
        plan_id: planId,
        revision: 1,
        target: { category_id: 1 },
      },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.message).toContain(`Run "${nonExistentRunId}" not found`);
  });

  it("POST /api/runs/:runId/execute returns 404 when plan revision does not exist", async () => {
    const runId = randomUUID();
    const planId = randomUUID();
    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue({ runId, status: "preview" } as PocRunRecord),
    } as unknown as RunRepository;

    const mockPlanRepo = {
      getPlanRevision: vi.fn().mockResolvedValue(null),
    } as unknown as PlanRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
      planRepo: mockPlanRepo,
      mcpClientManager,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/execute`,
      payload: {
        plan_id: planId,
        revision: 1,
        target: { category_id: 1 },
      },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.message).toContain(`Plan "${planId}" revision 1 not found`);
  });

  it("POST /api/runs/:runId/execute returns 400 when plan belongs to a different run", async () => {
    const runTarget = randomUUID();
    const runDifferent = randomUUID();
    const planId = randomUUID();

    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: runTarget, status: "preview" } as PocRunRecord),
    } as unknown as RunRepository;

    const mockPlanRepo = {
      getPlanRevision: vi.fn().mockResolvedValue({
        id: randomUUID(),
        planId,
        revision: 1,
        runId: runDifferent, // different run
        planType: "course",
        operation: "create",
        validationStatus: "valid",
        rawEnvelope: {
          ...sampleCoursePlanEnvelope,
          plan_id: planId,
        },
      } as unknown as PocPlanRevisionRecord),
    } as unknown as PlanRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
      planRepo: mockPlanRepo,
      mcpClientManager,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runTarget}/execute`,
      payload: {
        plan_id: planId,
        revision: 1,
        target: { category_id: 1 },
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("PLAN_OWNERSHIP_MISMATCH");
  });

  it("POST /api/runs/:runId/execute executes course creation and returns 200 with status awaiting_verification (T1102, P11-D2, T1109)", async () => {
    const runId = randomUUID();
    const planId = samplePlanId;
    const runStatuses: PocRunStatus[] = [];
    const mappings: ExecutionMappingRecord[] = [];

    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue({
        runId,
        status: "preview",
        approvedPlanId: planId,
        approvedRevision: 1,
      } as PocRunRecord),
      updateStatus: vi.fn().mockImplementation(async (rId, status) => {
        runStatuses.push(status);
        return { runId: rId, status } as PocRunRecord;
      }),
      failRun: vi.fn().mockImplementation(async (rId, error) => {
        runStatuses.push("failed");
        return { runId: rId, status: "failed", error } as PocRunRecord;
      }),
    } as unknown as RunRepository;

    const mockPlanRepo = {
      getPlanRevision: vi.fn().mockResolvedValue({
        id: randomUUID(),
        planId,
        revision: 1,
        runId,
        planType: "course",
        operation: "create",
        validationStatus: "valid",
        rawEnvelope: sampleCoursePlanEnvelope,
      } as unknown as PocPlanRevisionRecord),
    } as unknown as PlanRepository;

    const mockMappingRepo = {
      setMapping: vi.fn().mockImplementation(async (rec) => {
        mappings.push(rec);
        return rec;
      }),
      getMapping: vi.fn().mockResolvedValue(null),
      listRunMappings: vi.fn().mockImplementation(async () => mappings),
    } as unknown as ExecutionMappingRepository;

    const mockToolCallRepo = {
      recordToolCall: vi.fn().mockResolvedValue({}),
      getRunToolCalls: vi.fn().mockResolvedValue([]),
    } as unknown as ToolCallRepository;

    const mockIdempotencyRepo = {
      tryAcquire: vi.fn().mockResolvedValue({ state: "acquired", key: "k" }),
      recordSuccess: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      recordUncertain: vi.fn().mockResolvedValue(undefined),
    } as unknown as IdempotencyRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
      planRepo: mockPlanRepo,
      mappingRepo: mockMappingRepo,
      toolCallRepo: mockToolCallRepo,
      idempotencyRepo: mockIdempotencyRepo,
      mcpClientManager,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/execute`,
      payload: {
        plan_id: planId,
        revision: 1,
        target: { category_id: 2 },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.run_id).toBe(runId);
    expect(body.plan_id).toBe(planId);
    expect(body.revision).toBe(1);
    expect(body.status).toBe("awaiting_verification"); // P11-D2
    expect(body.course_id).toBe(888);
    expect(body.course_shortname).toMatch(/^APIT101-[A-F0-9]{6}$/);
    expect(body.course_url).toBe("http://localhost:8000/course/view.php?id=888");
    expect(body.created_entities).toEqual({
      courses: 1,
      sections: 1,
      assignments: 1,
      quizzes: 0,
      questions: 0,
      slots: 0,
    });

    expect(runStatuses).toEqual(["executing", "awaiting_verification"]);
  });
});
