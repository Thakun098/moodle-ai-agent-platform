import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config/config-loader.js";

const config: AppConfig = {
  port: 3000, host: "127.0.0.1", nodeEnv: "test", logLevel: "silent",
  databaseUrl: "postgresql://x", ollamaBaseUrl: "http://localhost:11434", ollamaModel: "test",
  moodleBaseUrl: "http://localhost:8000", moodleToken: "token",
};

function fixture() {
  const runId = randomUUID();
  const planId = randomUUID();
  const envelope: any = {
    schema_version: "0.1", plan_id: planId, revision: 1, plan_type: "course", operation: "create",
    title: "Verify", summary: "Verify", warnings: [], assumptions: [],
    content: { course: { title: "Course" }, sections: [{ ref: "section-01", position: 1, title: "S1", source_refs: [], activities: [] }] }
  };
  const stored: any[] = [];
  const runRepo = {
    getRun: vi.fn(async () => ({ runId, status: "awaiting_verification", approvedPlanId: planId, approvedRevision: 1 })),
    completeRun: vi.fn(async () => ({})), failRun: vi.fn(async () => ({})),
  };
  const planRepo = { getPlanRevision: vi.fn(async () => ({ runId, planId, revision: 1, planType: "course", operation: "create", validationStatus: "valid", rawEnvelope: envelope, executionContext: { target: { category_id: 1 } } })) };
  const mappingRepo = { listRunMappings: vi.fn(async () => [{ localRef: "course", moodleId: 10 }, { localRef: "section-01", moodleId: 20 }]) };
  const verificationRepo = {
    recordVerification: vi.fn(async (record) => { stored.push(record); return record; }),
    getLatestVerification: vi.fn(async () => stored.at(-1) ?? null),
  };
  const mcpClientManager = {
    discoverTools: vi.fn(async () => []),
    callTool: vi.fn(async () => ({ status: "success", data: { course: { id: 10, fullname: "Course", visible: 0, category_id: 1 }, sections: [{ section_id: 20, section_num: 1, name: "S1", activities: [] }] } })),
  };
  const competencySnapshotRepo = { get: vi.fn(async () => ({ runId, planId, revision: 1, mappingReviewRevision: 0, capturedAt: "2026-09-16T00:00:00.000Z", competencies: [], mappings: [] })) };
  return { runId, planId, runRepo, planRepo, mappingRepo, verificationRepo, mcpClientManager, competencySnapshotRepo };
}

describe("Phase 14 verification API", () => {
  it("verifies, persists, completes run, and exposes latest result", async () => {
    const f = fixture();
    const app = buildApp({ config, ...f as any });
    const verify = await app.inject({ method: "POST", url: `/api/runs/${f.runId}/verify`, payload: { plan_id: f.planId, revision: 1 } });
    expect(verify.statusCode).toBe(200);
    expect(JSON.parse(verify.body)).toEqual({ plan_id: f.planId, revision: 1, passed: true, issues: [] });
    expect(f.verificationRepo.recordVerification).toHaveBeenCalledOnce();
    expect(f.runRepo.completeRun).toHaveBeenCalledOnce();

    const get = await app.inject({ method: "GET", url: `/api/runs/${f.runId}/verification?plan_id=${f.planId}&revision=1` });
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(get.body).passed).toBe(true);
  });
});
