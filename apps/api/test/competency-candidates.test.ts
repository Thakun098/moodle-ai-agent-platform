import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test-model", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
const context = (approved = true): CoreCourseDesignContext => ({
  schema_version: "0.1", policy_version: "instructional-design.v0.1", revision: 3, run_id: "run-competency",
  source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) },
  course: {},
  learner_context: { revision: 1, status: "UNSPECIFIED", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [{ objective_id: "objective-1", source_text: "Design programs", source_refs: [], status: "SOURCE" }],
  source_learning_outcomes: [
    { source_outcome_id: "source-outcome-1", source_text: "CLO1", source_refs: [], measurable_status: "MEASURABLE", review_required: false },
    { source_outcome_id: "source-outcome-2", source_text: "CLO2", source_refs: [], measurable_status: "MEASURABLE", review_required: false },
  ],
  approved_learning_outcomes: approved ? [
    { outcome_id: "outcome-1", text: "Approved 1", source_outcome_ids: ["source-outcome-1"], source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 2 },
    { outcome_id: "outcome-2", text: "Approved 2", source_outcome_ids: ["source-outcome-2"], source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 3 },
  ] : [],
  schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [],
  provenance: { extractor_version: "syllabus-semantics.v0.2", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
});

function candidateRepo() {
  const rows: any[] = [];
  return {
    rows,
    list: vi.fn(async () => rows),
    get: vi.fn(async (_run: string, id: string) => rows.find((row) => row.candidateId === id) ?? null),
    saveProposed: vi.fn(async (_run: string, candidates: any[]) => {
      for (const candidate of candidates) rows.push({ id: candidate.candidate_id, candidateId: candidate.candidate_id, revision: candidate.revision, name: candidate.name, description: candidate.description, derivedFromOutcomeIdsJson: candidate.derived_from_outcome_ids, rationale: candidate.rationale, sourceRefsJson: candidate.source_refs, status: candidate.status, teacherOverrideJson: null, editedFromCandidateId: null, createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z" });
      return rows;
    }),
    decide: vi.fn(async (_run: string, id: string, decision: any) => {
      const row = rows.find((item) => item.candidateId === id); if (!row) return null;
      Object.assign(row, { revision: row.revision + 1, name: decision.name ?? row.name, description: decision.description ?? row.description, rationale: decision.rationale ?? row.rationale, derivedFromOutcomeIdsJson: decision.derived_from_outcome_ids ?? row.derivedFromOutcomeIdsJson, status: decision.status, teacherOverrideJson: decision.teacher_override ?? row.teacherOverrideJson, editedFromCandidateId: row.editedFromCandidateId ?? row.candidateId });
      return row;
    }),
  };
}

const runRepo = (current: CoreCourseDesignContext) => ({
  getRun: vi.fn().mockResolvedValue({ runId: "run-competency", status: "planning" }),
  getCoreCourseDesignContext: vi.fn().mockResolvedValue(current),
});

describe("Ticket 19 Competency Candidate API", () => {
  it("blocks derivation without approved Outcomes and persists many-to-many proposals", async () => {
    const blockedApp = buildApp({ config, runRepo: runRepo(context(false)) as any, candidateRepo: candidateRepo() as any, modelClient: { chat: vi.fn(), listModels: vi.fn(), ping: vi.fn() } as any, fastifyOptions: { logger: false } });
    const blocked = await blockedApp.inject({ method: "POST", url: "/api/runs/run-competency/competency-candidates/derive", headers: { "x-agentpoc-instructional-design-key": "test-key" } });
    expect(blocked.statusCode).toBe(422);
    await blockedApp.close();

    const repo = candidateRepo();
    const model = { chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({ candidates: [{ name: "Program design", description: "Design programs", rationale: "Combines outcomes", derived_from_outcome_ids: ["outcome-1", "outcome-2"] }] }) }), listModels: vi.fn(), ping: vi.fn() };
    const app = buildApp({ config, runRepo: runRepo(context()) as any, candidateRepo: repo as any, modelClient: model as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-competency/competency-candidates/derive", headers: { "x-agentpoc-instructional-design-key": "test-key" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().operation).toBe("DERIVE_COMPETENCIES");
    expect(response.json().candidates[0]).toMatchObject({ status: "PROPOSED", derived_from_outcome_ids: ["outcome-1", "outcome-2"] });
    expect(model.chat).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("requires an explicit override before approving an unaligned edited Candidate and reloads state", async () => {
    const repo = candidateRepo();
    const model = { chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({ candidates: [{ name: "Program design", description: "Design programs", rationale: "Combines outcomes", derived_from_outcome_ids: ["outcome-1"] }] }) }), listModels: vi.fn(), ping: vi.fn() };
    const app = buildApp({ config, runRepo: runRepo(context()) as any, candidateRepo: repo as any, modelClient: model as any, fastifyOptions: { logger: false } });
    const headers = { "x-agentpoc-instructional-design-key": "test-key" };
    await app.inject({ method: "POST", url: "/api/runs/run-competency/competency-candidates/derive", headers });
    const id = repo.rows[0].candidateId;
    const edited = await app.inject({ method: "POST", url: `/api/runs/run-competency/competency-candidates/${id}/decision`, headers, payload: { action: "edit", derived_from_outcome_ids: [], description: "No aligned outcome" } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().candidate.status).toBe("UNALIGNED");
    const blocked = await app.inject({ method: "POST", url: `/api/runs/run-competency/competency-candidates/${id}/decision`, headers, payload: { action: "approve", derived_from_outcome_ids: [] } });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error.code).toBe("COMPETENCY_ALIGNMENT_OVERRIDE_REQUIRED");
    const approved = await app.inject({
      method: "POST",
      url: `/api/runs/run-competency/competency-candidates/${id}/decision`,
      headers,
      payload: { action: "approve", derived_from_outcome_ids: [], teacher_override: { acknowledged: true, reason: "Teacher confirms this competency is intentionally cross-cutting." } },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().candidate).toMatchObject({ status: "APPROVED", teacher_override: { acknowledged: true } });
    const reloaded = await app.inject({ method: "GET", url: "/api/runs/run-competency/competency-candidates", headers });
    expect(reloaded.statusCode).toBe(200);
    expect(reloaded.json().candidates[0].status).toBe("APPROVED");
    await app.close();
  });
});
