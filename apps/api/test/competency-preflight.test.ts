import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";
import { assertCompetencyFrameworkCurrent, assertSnapshotParticipationCurrent } from "../src/services/competency-preflight-service.js";
import { assertCompetencyExecutionSnapshotCurrent, captureCompetencyExecutionSnapshot } from "../src/services/competency-execution-snapshot-service.js";
import type { CompetencyParticipation } from "@moodle-agent-poc/agent-runtime";

const headers = { "x-agentpoc-instructional-design-key": "ticket35-key" };
const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "unused", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "ticket35-key" });
const enabled = (revision = 1): CompetencyParticipation => ({ revision, status: "ENABLED", reason: "CONFIGURED_FRAMEWORK", framework_id: 7, framework_signature: "a".repeat(64), message: "Available", checked_at: "2026-09-30T00:00:00Z" });
const bypassed = (revision = 2): CompetencyParticipation => ({ revision, status: "BYPASSED", reason: "TEACHER_SKIP", framework_id: null, framework_signature: null, message: "Skipped by Teacher", checked_at: "2026-09-30T00:00:00Z" });
const readiness = (status: string, reason: string) => ({ status, reason, framework_id: status === "ENABLED" ? 7 : null, framework_signature: status === "ENABLED" ? "a".repeat(64) : null, message: reason });

function fixture(initial?: CompetencyParticipation, frameworkId?: number) {
  let participation = initial;
  const candidates = [{ candidateId: "reviewed-candidate", revision: 3, status: "APPROVED", name: "Design programs", description: "Teacher-reviewed", derivedFromOutcomeIdsJson: ["outcome-1"] }];
  const runRepo = {
    getRun: vi.fn(async () => ({ runId: "run-35", status: "planning", competencyParticipation: participation })),
    getCoreCourseDesignContext: vi.fn(async () => ({ revision: 3, approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Design programs", source_outcome_ids: [], source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 3 }] })),
    saveCompetencyParticipation: vi.fn(async (_run: string, value: CompetencyParticipation, expected: number) => {
      if ((participation?.revision ?? 0) !== expected) throw Object.assign(new Error("participation changed"), { code: "COMPETENCY_PARTICIPATION_CONFLICT", statusCode: 409 });
      participation = { ...value, revision: expected + 1 };
      return participation;
    }),
  };
  const candidateRepo = { list: vi.fn(async () => candidates), saveProposed: vi.fn(), decide: vi.fn() };
  const model = { chat: vi.fn(), listModels: vi.fn(), ping: vi.fn() };
  const mcp = { callTool: vi.fn().mockResolvedValue({ status: "success", data: readiness("ENABLED", "CONFIGURED_FRAMEWORK") }) };
  const appConfig = frameworkId ? { ...config, moodleCompetencyFrameworkId: frameworkId } : config;
  const app = buildApp({ config: appConfig, runRepo: runRepo as any, candidateRepo: candidateRepo as any, modelClient: model as any, mcpClientManager: mcp as any, riskDashboardRepo: {} as any, fastifyOptions: { logger: false } });
  return { app, config: appConfig, runRepo, candidateRepo, candidates, model, mcp, current: () => participation };
}

describe("Ticket 35 deterministic Competency Framework preflight API", () => {
  it("GET starts unresolved without Moodle calls or model calls", async () => {
    const f = fixture();
    try {
      const result = await f.app.inject({ method: "GET", url: "/api/runs/run-35/competency-participation", headers });
      expect(result.statusCode).toBe(200);
      expect(result.json().competency_participation).toMatchObject({ revision: 0, status: "UNRESOLVED", framework_id: null });
      expect(f.mcp.callTool).not.toHaveBeenCalled();
      expect(f.model.chat).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });

  it.each([
    ["ENABLED", "CONFIGURED_FRAMEWORK", 7],
    ["ENABLED", "CANONICAL_DEFAULT_REUSED", undefined],
    ["ENABLED", "CANONICAL_DEFAULT_CREATED", undefined],
    ["BYPASSED", "DEFAULT_SCALE_UNAVAILABLE", undefined],
    ["SELECTION_REQUIRED", "FRAMEWORK_SELECTION_REQUIRED", undefined],
    ["CHECK_FAILED", "DEFAULT_FRAMEWORK_HIDDEN", undefined],
    ["CHECK_FAILED", "COMPETENCIES_DISABLED", undefined],
  ] as const)("persists %s/%s deterministically with no Candidate mutations or model", async (status, reason, frameworkId) => {
    const f = fixture(undefined, frameworkId);
    f.mcp.callTool.mockResolvedValue({ status: "success", data: readiness(status, reason) });
    const before = structuredClone(f.candidates);
    try {
      const result = await f.app.inject({ method: "POST", url: "/api/runs/run-35/competency-preflight", headers });
      expect(result.statusCode).toBe(200);
      expect(result.json().competency_participation).toMatchObject({ status, reason, revision: 1 });
      expect(f.mcp.callTool).toHaveBeenCalledWith("moodle_competency_framework_preflight", { ...(frameworkId ? { configured_framework_id: frameworkId } : {}), provision_default: true }, expect.any(Object));
      expect(f.model.chat).not.toHaveBeenCalled();
      expect(f.candidateRepo.saveProposed).not.toHaveBeenCalled();
      expect(f.candidateRepo.decide).not.toHaveBeenCalled();
      expect(f.candidates).toEqual(before);
    } finally { await f.app.close(); }
  });

  it.each(["TOKEN_INVALID", "PERMISSION_DENIED", "MOODLE_CONNECTION_FAILED", "COMPETENCIES_DISABLED"])("MCP error %s remains actionable CHECK_FAILED", async code => {
    const f = fixture();
    f.mcp.callTool.mockResolvedValue({ status: "error", code, message: "failed" } as any);
    try {
      const result = await f.app.inject({ method: "POST", url: "/api/runs/run-35/competency-preflight", headers });
      expect(result.json().competency_participation).toMatchObject({ status: "CHECK_FAILED", reason: code, framework_id: null });
      expect(f.model.chat).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });

  it.each([undefined, { status: "BYPASSED", reason: "TOKEN_INVALID", framework_id: null, framework_signature: null, message: "not absence" }, readiness("ENABLED", "CONFIGURED_FRAMEWORK")])("invalid/throwing transport never becomes system bypass (%j)", async data => {
    const f = fixture();
    if (data?.status === "ENABLED") f.mcp.callTool.mockRejectedValue(new Error("connection failed"));
    else f.mcp.callTool.mockResolvedValue({ status: "success", data } as any);
    try {
      const result = await f.app.inject({ method: "POST", url: "/api/runs/run-35/competency-preflight", headers });
      expect(result.json().competency_participation.status).toBe("CHECK_FAILED");
      expect(f.model.chat).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });

  it("Teacher skip persists on Retry and explicit enable preserves reviewed Candidates", async () => {
    const f = fixture(enabled());
    const before = structuredClone(f.candidates);
    try {
      const skipped = await f.app.inject({ method: "POST", url: "/api/runs/run-35/competency-participation", headers, payload: { action: "skip", expected_revision: 1 } });
      expect(skipped.json().competency_participation).toMatchObject({ revision: 2, status: "BYPASSED", reason: "TEACHER_SKIP", framework_id: null });
      const retry = await f.app.inject({ method: "POST", url: "/api/runs/run-35/competency-preflight", headers });
      expect(retry.json().competency_participation).toEqual(skipped.json().competency_participation);
      expect(f.mcp.callTool).not.toHaveBeenCalled();
      const restored = await f.app.inject({ method: "POST", url: "/api/runs/run-35/competency-participation", headers, payload: { action: "enable", expected_revision: 2 } });
      expect(restored.json().competency_participation).toMatchObject({ revision: 3, status: "ENABLED" });
      expect(f.mcp.callTool).toHaveBeenCalledOnce();
      expect(f.candidates).toEqual(before);
      expect(f.candidateRepo.decide).not.toHaveBeenCalled();
      expect(f.candidateRepo.saveProposed).not.toHaveBeenCalled();
      expect(f.model.chat).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });

  it("an ENABLED response without a valid SHA256 Framework signature fails closed", async () => {
    const f = fixture();
    f.mcp.callTool.mockResolvedValue({ status: "success", data: { ...readiness("ENABLED", "CONFIGURED_FRAMEWORK"), framework_signature: "untrusted-signature" } });
    try {
      const result = await f.app.inject({ method: "POST", url: "/api/runs/run-35/competency-preflight", headers });
      expect(result.json().competency_participation).toMatchObject({ status: "CHECK_FAILED", reason: "INVALID_MCP_RESPONSE", framework_id: null, framework_signature: null });
      expect(f.model.chat).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });

  it.each(["skip", "enable"])("rejects stale %s CAS before any Moodle check", async action => {
    const f = fixture(enabled(4));
    try {
      const result = await f.app.inject({ method: "POST", url: "/api/runs/run-35/competency-participation", headers, payload: { action, expected_revision: 3 } });
      expect(result.statusCode).toBe(409);
      expect(result.json().error.code).toBe("COMPETENCY_PARTICIPATION_CONFLICT");
      expect(f.mcp.callTool).not.toHaveBeenCalled();
      expect(f.runRepo.saveCompetencyParticipation).not.toHaveBeenCalled();
      expect(f.model.chat).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });

  it.each(["UNRESOLVED", "BYPASSED", "SELECTION_REQUIRED", "CHECK_FAILED"])("direct derivation spends zero model calls for %s", async status => {
    const f = fixture({ ...bypassed(), status } as CompetencyParticipation);
    try {
      const result = await f.app.inject({ method: "POST", url: "/api/runs/run-35/competency-candidates/derive", headers });
      expect(result.statusCode).toBe(409);
      expect(result.json().error.code).toBe("COMPETENCY_PREFLIGHT_REQUIRED");
      expect(f.model.chat).not.toHaveBeenCalled();
      expect(f.mcp.callTool).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });
});

describe("Ticket 35 approval and Execute participation authority", () => {
  const snapshot = (participation: CompetencyParticipation) => ({ runId: "run-35", planId: "plan-35", revision: 1, frameworkId: participation.framework_id, participation, mappingReviewRevision: 0, capturedAt: "2026-09-30T00:00:00Z", competencies: [], mappings: [] });

  it.each(["assignment", "quiz"])("standalone %s approval retains its flow without Course Competency readiness", async planType => {
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "standalone-run", status: "preview" }), approvePlan: vi.fn().mockResolvedValue({ approvedAt: "2026-09-30T00:00:00Z" }) };
    const planRepo = { getPlanRevision: vi.fn().mockResolvedValue({ runId: "standalone-run", validationStatus: "valid", planType, operation: "create", rawEnvelope: { plan_type: planType }, reviewRequirements: [] }) };
    const mcp = { callTool: vi.fn() };
    const model = { chat: vi.fn(), ping: vi.fn(), listModels: vi.fn() };
    const app = buildApp({ config, runRepo: runRepo as any, planRepo: planRepo as any, mcpClientManager: mcp as any, modelClient: model as any, riskDashboardRepo: {} as any, fastifyOptions: { logger: false } });
    try {
      const result = await app.inject({ method: "POST", url: "/api/runs/standalone-run/approve", payload: { plan_id: "standalone-plan", revision: 1 } });
      expect(result.statusCode).toBe(200);
      expect(runRepo.approvePlan).toHaveBeenCalledWith({ runId: "standalone-run", planId: "standalone-plan", revision: 1 });
      expect(mcp.callTool).not.toHaveBeenCalled();
      expect(model.chat).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it("BYPASSED approval captures no native Competencies/mappings while preserving Candidate records", async () => {
    const candidates = [{ candidateId: "approved", revision: 4, status: "APPROVED" }, { candidateId: "rejected", revision: 2, status: "REJECTED" }];
    const candidateRepo = { list: vi.fn(async () => candidates), decide: vi.fn() };
    const dependencies = { candidateRepo, reviewRepo: { review: vi.fn() }, activityIntentRepo: { get: vi.fn() }, runRepo: { getCoreCourseDesignContext: vi.fn() }, snapshotRepo: { save: vi.fn(async value => value) } };
    const before = structuredClone(candidates);
    const approved = await captureCompetencyExecutionSnapshot({ runId: "run-35", planId: "plan-35", revision: 1, frameworkId: null, participation: bypassed(), dependencies: dependencies as any });
    expect(approved).toMatchObject({ frameworkId: null, participation: { status: "BYPASSED" }, competencies: [], mappings: [] });
    await expect(assertCompetencyExecutionSnapshotCurrent(approved, dependencies as any)).resolves.toBeUndefined();
    expect(candidateRepo.list).not.toHaveBeenCalled();
    expect(candidateRepo.decide).not.toHaveBeenCalled();
    expect(dependencies.reviewRepo.review).not.toHaveBeenCalled();
    expect(candidates).toEqual(before);
  });

  it("BYPASSED Execute checks participation snapshot without checking Moodle", async () => {
    const f = fixture(bypassed());
    try {
      await expect(assertSnapshotParticipationCurrent(snapshot(bypassed()), f.runRepo as any, config, f.mcp as any)).resolves.toBeUndefined();
      expect(f.mcp.callTool).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });

  it.each([readiness("CHECK_FAILED", "DEFAULT_FRAMEWORK_HIDDEN"), { ...readiness("ENABLED", "CONFIGURED_FRAMEWORK"), framework_signature: "b".repeat(64) }])("Execute rejects changed Framework without changing participation or Candidate decisions", async data => {
    const f = fixture(enabled());
    f.mcp.callTool.mockResolvedValue({ status: "success", data });
    try {
      await expect(assertSnapshotParticipationCurrent(snapshot(enabled()), f.runRepo as any, config, f.mcp as any)).rejects.toMatchObject({ code: "COMPETENCY_FRAMEWORK_STALE" });
      expect(f.runRepo.saveCompetencyParticipation).not.toHaveBeenCalled();
      expect(f.candidates[0]).toMatchObject({ status: "APPROVED", revision: 3 });
      expect(f.mcp.callTool).toHaveBeenCalledWith("moodle_competency_framework_preflight", { configured_framework_id: 7, provision_default: false }, expect.any(Object));
    } finally { await f.app.close(); }
  });

  it("Final approval revalidation records Framework change while retaining Teacher reviews", async () => {
    const f = fixture(enabled());
    f.mcp.callTool.mockResolvedValue({ status: "success", data: readiness("CHECK_FAILED", "DEFAULT_FRAMEWORK_HIDDEN") });
    try {
      await expect(assertCompetencyFrameworkCurrent({ runId: "run-35", participation: enabled(), config, manager: f.mcp as any, runRepo: f.runRepo as any, recordFailure: true })).rejects.toMatchObject({ code: "COMPETENCY_FRAMEWORK_STALE" });
      expect(f.current()).toMatchObject({ status: "CHECK_FAILED", reason: "FRAMEWORK_AUTHORITY_CHANGED", revision: 2, framework_id: null });
      expect(f.candidates[0]).toMatchObject({ status: "APPROVED", revision: 3 });
      expect(f.model.chat).not.toHaveBeenCalled();
    } finally { await f.app.close(); }
  });

  it("switching back to ENABLED invalidates prior bypass approval without auto-derivation", async () => {
    const f = fixture(bypassed());
    try {
      const approved = snapshot(bypassed());
      const result = await f.app.inject({ method: "POST", url: "/api/runs/run-35/competency-participation", headers, payload: { action: "enable", expected_revision: 2 } });
      expect(result.statusCode).toBe(200);
      f.mcp.callTool.mockClear();
      await expect(assertSnapshotParticipationCurrent(approved, f.runRepo as any, config, f.mcp as any)).rejects.toMatchObject({ code: "COMPETENCY_EXECUTION_SNAPSHOT_STALE" });
      expect(f.mcp.callTool).not.toHaveBeenCalled();
      expect(f.model.chat).not.toHaveBeenCalled();
      expect(f.candidates[0].status).toBe("APPROVED");
    } finally { await f.app.close(); }
  });
});
