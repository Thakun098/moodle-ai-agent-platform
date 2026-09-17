import { randomUUID } from "node:crypto";
import {
  type PlanRepository,
  type RunRepository,
} from "@moodle-agent-poc/agent-runtime";
import type {
  CoursePlanEnvelope,
  PocPlanRevisionRecord,
  PocRunRecord,
} from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/config-loader.js";

describe("Approval Gate & Lifecycle Integration (Phase 16)", () => {
  const testConfig: AppConfig = {
    port: 3000,
    host: "127.0.0.1",
    logLevel: "silent",
    databaseUrl: "postgresql://postgres:postgres@localhost:5432/moodle_poc",
    modelProvider: "groq",
    modelName: "openai/gpt-oss-120b",
    ollamaModel: "gemma4:e2b",
    agentMaxSteps: 10,
    agentModelTimeoutMs: 30000,
    agentToolTimeoutMs: 10000,
    agentRunTimeoutMs: 60000,
  };

  const samplePlanId = randomUUID();
  const sampleCoursePlanEnvelope: CoursePlanEnvelope = {
    schema_version: "0.1",
    plan_id: samplePlanId,
    revision: 1,
    plan_type: "course",
    operation: "create",
    title: "Approval Test Course",
    summary: "Course created for approval tests",
    warnings: [],
    assumptions: [],
    content: {
      course: {
        title: "Approval Test Course",
        shortname: "APPR101",
        summary: "Testing approval lifecycle",
        course_format: "topics",
        num_sections: 1,
      },
      sections: [
        {
          title: "Introduction",
          summary: "First section",
          order: 1,
          activities: [],
        },
      ],
    },
  };

  it("approves a valid plan revision in preview state and records approver identity", async () => {
    const runId = randomUUID();
    let approvedData: any = null;

    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue({
        runId,
        status: "preview",
        model: testConfig.modelName,
      } as PocRunRecord),
      approvePlan: vi.fn().mockImplementation(async (data) => {
        approvedData = {
          approvedPlanId: data.planId,
          approvedRevision: data.revision,
          approvedAt: "2026-09-03T12:00:00Z",
          approvedByMoodleUserId: data.approvedByMoodleUserId,
        };
        return {
          runId,
          status: "preview",
          ...approvedData,
        } as PocRunRecord;
      }),
    } as unknown as RunRepository;

    const mockPlanRepo = {
      getPlanRevision: vi.fn().mockResolvedValue({
        id: randomUUID(),
        planId: samplePlanId,
        revision: 1,
        runId,
        planType: "course",
        operation: "create",
        validationStatus: "valid",
        rawEnvelope: sampleCoursePlanEnvelope,
      } as unknown as PocPlanRevisionRecord),
    } as unknown as PlanRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
      planRepo: mockPlanRepo,
      candidateRepo: { list: vi.fn(async () => []) } as any,
      activityIntentRepo: {} as any,
      competencyReviewRepo: { review: vi.fn(async () => ({ revision: 0, mappings: [] })) } as any,
      competencySnapshotRepo: { save: vi.fn(async (snapshot: any) => snapshot) } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/approve`,
      payload: {
        plan_id: samplePlanId,
        revision: 1,
        moodle_user_id: "42",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.run_id).toBe(runId);
    expect(body.plan_id).toBe(samplePlanId);
    expect(body.revision).toBe(1);
    expect(body.status).toBe("approved");
    expect(body.approved_by_moodle_user_id).toBe("42");
    expect(mockRunRepo.approvePlan).toHaveBeenCalledWith({
      runId,
      planId: samplePlanId,
      revision: 1,
      approvedByMoodleUserId: "42",
    });
  });

  it("Required Test 1 & 2: Approval of Rev 1 -> Rev 1 remains pinned, unapproved Rev 2 execution is rejected", async () => {
    const runId = randomUUID();
    const rev2Envelope = {
      ...sampleCoursePlanEnvelope,
      revision: 2,
      title: "Edited Course Title",
    };

    // Run is approved for Rev 1
    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue({
        runId,
        status: "preview",
        approvedPlanId: samplePlanId,
        approvedRevision: 1,
      } as PocRunRecord),
    } as unknown as RunRepository;

    const mockPlanRepo = {
      getPlanRevision: vi.fn().mockImplementation(async (pId: string, rev: number) => {
        if (rev === 2) {
          return {
            id: randomUUID(),
            planId: samplePlanId,
            revision: 2,
            runId,
            planType: "course",
            operation: "create",
            validationStatus: "valid",
            rawEnvelope: rev2Envelope,
          } as unknown as PocPlanRevisionRecord;
        }
        return {
          id: randomUUID(),
          planId: samplePlanId,
          revision: 1,
          runId,
          planType: "course",
          operation: "create",
          validationStatus: "valid",
          rawEnvelope: sampleCoursePlanEnvelope,
        } as unknown as PocPlanRevisionRecord;
      }),
    } as unknown as PlanRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
      planRepo: mockPlanRepo,
    });

    // Attempt to execute Rev 2 (unapproved) -> MUST be rejected with 409 PLAN_NOT_APPROVED
    const execRev2Response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/execute`,
      payload: {
        plan_id: samplePlanId,
        revision: 2,
        target: { category_id: 1 },
      },
    });

    expect(execRev2Response.statusCode).toBe(409);
    const rev2Body = JSON.parse(execRev2Response.body);
    expect(rev2Body.error.code).toBe("PLAN_NOT_APPROVED");
    expect(rev2Body.error.details.approved_revision).toBe(1);
    expect(rev2Body.error.details.requested_revision).toBe(2);
  });

  it("Required Test 3: Approval request for plan belonging to another Run is rejected with 409 PLAN_OWNERSHIP_MISMATCH", async () => {
    const runId = randomUUID();
    const otherRunId = randomUUID();

    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue({
        runId,
        status: "preview",
      } as PocRunRecord),
    } as unknown as RunRepository;

    const mockPlanRepo = {
      getPlanRevision: vi.fn().mockResolvedValue({
        id: randomUUID(),
        planId: samplePlanId,
        revision: 1,
        runId: otherRunId, // different run!
        planType: "course",
        operation: "create",
        validationStatus: "valid",
        rawEnvelope: sampleCoursePlanEnvelope,
      } as unknown as PocPlanRevisionRecord),
    } as unknown as PlanRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
      planRepo: mockPlanRepo,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/approve`,
      payload: {
        plan_id: samplePlanId,
        revision: 1,
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("PLAN_OWNERSHIP_MISMATCH");
  });

  it("Required Test 4: Approval of invalid Plan revision is rejected with 422 PLAN_INVALID", async () => {
    const runId = randomUUID();

    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue({
        runId,
        status: "preview",
      } as PocRunRecord),
    } as unknown as RunRepository;

    const mockPlanRepo = {
      getPlanRevision: vi.fn().mockResolvedValue({
        id: randomUUID(),
        planId: samplePlanId,
        revision: 1,
        runId,
        planType: "course",
        operation: "create",
        validationStatus: "invalid", // invalid plan
        validationErrors: [{ message: "Missing title" }],
        rawEnvelope: sampleCoursePlanEnvelope,
      } as unknown as PocPlanRevisionRecord),
    } as unknown as PlanRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
      planRepo: mockPlanRepo,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/approve`,
      payload: {
        plan_id: samplePlanId,
        revision: 1,
      },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("PLAN_INVALID");
  });

  it("Required Test 5: Approval while Run is executing is rejected with 409 RUN_STATE_INVALID", async () => {
    const runId = randomUUID();

    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue({
        runId,
        status: "executing", // executing!
      } as PocRunRecord),
    } as unknown as RunRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/approve`,
      payload: {
        plan_id: samplePlanId,
        revision: 1,
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("RUN_STATE_INVALID");
  });

  it("Required Test 6: Approval after Run completed is rejected with 409 RUN_STATE_INVALID", async () => {
    const runId = randomUUID();

    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue({
        runId,
        status: "completed", // completed!
      } as PocRunRecord),
    } as unknown as RunRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/approve`,
      payload: {
        plan_id: samplePlanId,
        revision: 1,
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("RUN_STATE_INVALID");
  });

  it("Required Test 7: Approval after Run failed is rejected with 409 RUN_STATE_INVALID", async () => {
    const runId = randomUUID();

    const mockRunRepo = {
      getRun: vi.fn().mockResolvedValue({
        runId,
        status: "failed", // failed!
      } as PocRunRecord),
    } as unknown as RunRepository;

    const app = buildApp({
      config: testConfig,
      runRepo: mockRunRepo,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/approve`,
      payload: {
        plan_id: samplePlanId,
        revision: 1,
      },
    });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("RUN_STATE_INVALID");
  });

  it("Required Test 12: Model metadata records config.modelName (e.g. openai/gpt-oss-120b for Groq)", async () => {
    let createdRunData: any = null;
    const mockRunRepo = {
      createRun: vi.fn().mockImplementation(async (data) => {
        createdRunData = data;
        return {
          runId: data.runId,
          status: "pending",
          model: data.model,
          createdAt: "2026-09-03T12:00:00Z",
        } as PocRunRecord;
      }),
      setNormalizedSyllabus: vi.fn().mockResolvedValue({} as PocRunRecord),
      initializeCoreCourseDesignContext: vi.fn().mockResolvedValue(undefined),
      failRun: vi.fn().mockResolvedValue({} as PocRunRecord),
    } as unknown as RunRepository;

    const app = buildApp({
      config: testConfig, // modelName: "openai/gpt-oss-120b", ollamaModel: "gemma4:e2b"
      runRepo: mockRunRepo,
      mcpClientManager: { discoverTools: vi.fn(async () => []), callTool: vi.fn(async () => ({ status: "success", data: [{ value: "topics", label: "Topics" }] })) } as any,
    });

    // Multipart upload
    const boundary = "---------------------------974767299852498929531610575";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="course_format"',
      "",
      "topics",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="syllabus.txt"',
      "Content-Type: text/plain",
      "",
      "Week 1: Introduction to AI\nWeek 2: Machine Learning",
      `--${boundary}--`,
    ].join("\r\n");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    const resBody = JSON.parse(response.body);
    expect(resBody.model).toBe("openai/gpt-oss-120b");
    expect(createdRunData.model).toBe("openai/gpt-oss-120b");
  });
});
