import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { executionsRoutes } from "../src/routes/executions.js";

describe("revision-owned execution context", () => {
  it.each([
    ["assignment", { course_id: 10, section_id: 20, activity_id: 30 }],
    ["quiz", { course_id: 10, section_id: 20, quiz_id: 30 }],
  ])("rejects an old %s update without identity before calling Moodle", async (planType, target) => {
    const planId = randomUUID(); const runId = randomUUID();
    const manager = { connect: vi.fn(), callTool: vi.fn() };
    const app = Fastify();
    await app.register(executionsRoutes, {
      config: {} as any, mcpClientManager: manager as any,
      runRepo: { getRun: vi.fn(async () => ({ approvedPlanId: planId, approvedRevision: 1 })) } as any,
      planRepo: { getPlanRevision: vi.fn(async () => ({ runId, planType, operation: "update", validationStatus: "valid", rawEnvelope: { plan_type: planType, operation: "update" } })) } as any,
    });
    const response = await app.inject({ method: "POST", url: `/api/runs/${runId}/execute`, payload: { plan_id: planId, revision: 1, target } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("EXECUTION_CONTEXT_REQUIRED");
    expect(manager.callTool).not.toHaveBeenCalled();
    await app.close();
  });
  it("rejects retargeting an already-bound creation retry", async () => {
    const planId = randomUUID(); const runId = randomUUID();
    const bindExecutionContext = vi.fn(async () => ({ target: { category_id: 1 } }));
    const manager = { callTool: vi.fn() };
    const app = Fastify();
    await app.register(executionsRoutes, { config: {} as any, mcpClientManager: manager as any,
      runRepo: { getRun: vi.fn(async () => ({ approvedPlanId: planId, approvedRevision: 1 })) } as any,
      planRepo: { bindExecutionContext, getPlanRevision: vi.fn(async () => ({ runId, planType: "course", operation: "create", validationStatus: "valid", rawEnvelope: { plan_type: "course", operation: "create" } })) } as any,
      candidateRepo: { list: vi.fn(async () => []) } as any, activityIntentRepo: {} as any,
      competencyReviewRepo: { review: vi.fn(async () => ({ revision: 0, mappings: [] })) } as any,
      competencySnapshotRepo: { get: vi.fn(async () => ({ runId, planId, revision: 1, mappingReviewRevision: 0, capturedAt: "2026-09-16T00:00:00.000Z", competencies: [], mappings: [] })) } as any,
    });
    const response = await app.inject({ method: "POST", url: `/api/runs/${runId}/execute`, payload: { plan_id: planId, revision: 1, target: { category_id: 2 } } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("EXECUTION_TARGET_MISMATCH");
    expect(bindExecutionContext).toHaveBeenCalledWith(planId, 1, { target: { category_id: 2 } });
    expect(manager.callTool).not.toHaveBeenCalled();
    await app.close();
  });
});
