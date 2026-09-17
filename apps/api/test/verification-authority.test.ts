import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test-model" });

const plan = {
  id: "plan-row-1",
  planId: "plan-1",
  runId: "run-1",
  revision: 1,
  planType: "course",
  operation: "create",
  validationStatus: "valid",
  rawEnvelope: {
    schema_version: "0.1",
    plan_id: "plan-1",
    revision: 1,
    plan_type: "course",
    operation: "create",
    title: "Course",
    summary: "Course",
    warnings: [],
    assumptions: [],
    content: {
      course: { title: "Course" },
      sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Week 1", source_refs: [], activities: [] }],
    },
  },
  executionContext: { target: { category_id: 10 } },
};

describe("Verification execution-authority gate", () => {
  it("fails closed when the approved CoursePlan revision has no Competency execution snapshot", async () => {
    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "awaiting_verification", approvedPlanId: "plan-1", approvedRevision: 1, syllabusMetadata: { course_format: "topics" } }),
    };
    const planRepo = { getPlanRevision: vi.fn().mockResolvedValue(plan) };
    const competencySnapshotRepo = { get: vi.fn().mockResolvedValue(null) };
    const manager = { discoverTools: vi.fn(), callTool: vi.fn() };
    const app = buildApp({
      config,
      runRepo: runRepo as any,
      planRepo: planRepo as any,
      competencySnapshotRepo: competencySnapshotRepo as any,
      mappingRepo: {} as any,
      verificationRepo: {} as any,
      mcpClientManager: manager as any,
      fastifyOptions: { logger: false },
    });

    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/verify", payload: { plan_id: "plan-1", revision: 1 } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("COMPETENCY_EXECUTION_SNAPSHOT_REQUIRED");
    expect(manager.discoverTools).not.toHaveBeenCalled();
    expect(manager.callTool).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects an old executed revision after planning authority has reopened", async () => {
    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", approvedPlanId: null, approvedRevision: null, syllabusMetadata: { course_format: "topics" } }),
    };
    const planRepo = { getPlanRevision: vi.fn().mockResolvedValue(plan) };
    const competencySnapshotRepo = { get: vi.fn().mockResolvedValue({ runId: "run-1", planId: "plan-1", revision: 1, mappingReviewRevision: 1, capturedAt: "2026-09-16T00:00:00.000Z", competencies: [], mappings: [] }) };
    const manager = { discoverTools: vi.fn(), callTool: vi.fn() };
    const app = buildApp({
      config, runRepo: runRepo as any, planRepo: planRepo as any, competencySnapshotRepo: competencySnapshotRepo as any,
      mappingRepo: {} as any, verificationRepo: {} as any, mcpClientManager: manager as any, fastifyOptions: { logger: false },
    });

    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/verify", payload: { plan_id: "plan-1", revision: 1 } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("VERIFICATION_AUTHORITY_STALE");
    expect(competencySnapshotRepo.get).not.toHaveBeenCalled();
    expect(manager.discoverTools).not.toHaveBeenCalled();
    await app.close();
  });
});
