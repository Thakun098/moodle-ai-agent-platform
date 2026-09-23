import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDbClient } from "../../../packages/agent-runtime/src/db/connection.js";
import { runMigrations } from "../../../packages/agent-runtime/src/db/migrate.js";
import { pocRun, courseStructureRevision, coreCourseDesignContexts } from "../../../packages/agent-runtime/src/db/schema/index.js";
import { ActivityIntentRepository, ActivityRevisionRepository, CompetencyCandidateRepository, CompetencyMappingReviewRepository, RunRepository } from "../../../packages/agent-runtime/src/repositories/index.js";
import { competencyMappingRoutes } from "../src/routes/competency-mappings.js";
import { loadConfig } from "../src/config/config-loader.js";

describe("Ticket 23 persisted Teacher decisions through the API", () => {
  const runId = randomUUID();
  const url = process.env.DATABASE_URL ?? "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:55432/moodle_agent_poc";
  const client = createDbClient(url);
  const intents = new ActivityIntentRepository(client.db);
  const revisions = new ActivityRevisionRepository(client.db);
  const candidates = new CompetencyCandidateRepository(client.db);
  const app = Fastify();
  const headers = { "x-agentpoc-instructional-design-key": "ticket23-test" };
  const base = `/api/runs/${runId}/competency-mappings`;
  const ids: string[] = [];

  beforeAll(async () => {
    await runMigrations(url);
    await new RunRepository(client.db).createRun({ runId, model: "no-model", status: "planning" });
    await client.db.insert(coreCourseDesignContexts).values({ runId, revision: 1, context: {
      schema_version: "0.1", policy_version: "instructional-design.v0.1", revision: 1, run_id: runId,
      source_syllabus: { normalized_syllabus_version: "0.1", filename: "fixture.md", sha256: "a".repeat(64), text_sha256: "a".repeat(64) }, course: {},
      learner_context: { revision: 1, status: "UNSPECIFIED", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: true },
      learning_objectives: [], source_learning_outcomes: [], approved_learning_outcomes: [{ outcome_id: "o", text: "Explain queues", revision: 1, source_outcome_ids: [], source_refs: [], approval_origin: "TEACHER_EDITED", approved_by_teacher: true }],
      schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [], provenance: { extractor_version: "syllabus-semantics.v0.2", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
    } });
    await client.db.insert(courseStructureRevision).values({ id: randomUUID(), runId, revision: 1, title: "Fixture", summary: "Fixture", contentJson: { sections: [] }, teacherConstraintsJson: {}, validationStatus: "valid", sealedAt: new Date().toISOString() });
    for (const type of ["quiz", "assignment"] as const) {
      const id = randomUUID(); ids.push(id);
      await intents.select({ id, runId, structureRevision: 1, sectionRef: "section-01", activityRef: `${type}-01`, activityType: type, maxAttempts: 2, optionsJson: {}, purpose: type === "quiz" ? "PRACTICE" : "SUMMATIVE", selectedOutcomeIdsJson: ["o"], contextRevision: 1, learnerContextRevision: 1, learnerContextAcknowledged: true });
      await intents.beginAttempt(id);
      await intents.complete(id, { contentJson: { ref: `${type}-01`, type, title: type }, groundingMode: "SYLLABUS_GROUNDED", reviewRequired: false });
    }
    await candidates.saveProposed(runId, [{ candidate_id: "c", name: "Queue skill", description: "Explain queues", rationale: "Shared Outcome", derived_from_outcome_ids: ["o"], source_refs: [], status: "PROPOSED", revision: 1 }]);
    await candidates.decide(runId, "c", { action: "approve", status: "APPROVED" });
    await app.register(competencyMappingRoutes, { config: loadConfig({ DATABASE_URL: url, INSTRUCTIONAL_DESIGN_SERVICE_KEY: "ticket23-test" }), reviewRepo: new CompetencyMappingReviewRepository(client.db) });
  });
  afterAll(async () => { await app.close(); await client.pool.query('DELETE FROM poc_run WHERE run_id = $1', [runId]); await client.pool.end(); });

  it("requires authentication and explicit decisions; persists independent evidence and stales only mapping after competency/content edits", async () => {
    const modelFetch = vi.fn(() => { throw new Error("Mapping must not call a model"); });
    vi.stubGlobal("fetch", modelFetch);
    try {
      expect((await app.inject({ method: "GET", url: base })).statusCode).toBe(401);
      let view = (await app.inject({ method: "GET", url: base, headers })).json();
      expect(view.mappings).toHaveLength(2);
      expect(view.mappings.map((p: any) => [p.mapping, p.evidence])).toEqual([["PROPOSED", "UNDECIDED"], ["PROPOSED", "UNDECIDED"]]);
      const submit = (activityId: string, kind: string, decision: string, revision = view.revision) => app.inject({ method: "POST", url: `${base}/decision`, headers, payload: { activity_id: activityId, competency_id: "c", kind, decision, confirmed: true, expected_revision: revision, teacher_id: 7 } });
      expect((await submit(ids[0]!, "evidence", "CONFIRMED")).statusCode).toBe(422);
      for (const id of ids) { const response = await submit(id, "mapping", "CONFIRMED"); expect(response.statusCode).toBe(200); view = response.json(); }
      expect(view.mappings.every((p: any) => p.evidence === "UNDECIDED")).toBe(true);
      view = (await submit(ids[0]!, "evidence", "DECLINED")).json();
      view = (await submit(ids[1]!, "evidence", "CONFIRMED")).json();
      expect((await submit(ids[0]!, "mapping", "DECLINED", 0)).statusCode).toBe(409);
      const reloaded = (await app.inject({ method: "GET", url: base, headers })).json();
      expect(reloaded).toEqual(view);
      expect(reloaded.mappings.find((p: any) => p.activityId === ids[0]).evidence).toBe("DECLINED");
      await candidates.decide(runId, "c", { action: "edit", status: "PROPOSED", description: "Edited competency" });
      view = (await app.inject({ method: "GET", url: base, headers })).json();
      expect(view.mappings.every((p: any) => p.mapping === "STALE" && p.evidence === "STALE")).toBe(true);
      expect((await intents.get(ids[0]!))?.status).toBe("generated");
      expect((await intents.get(ids[1]!))?.status).toBe("generated");
      await candidates.decide(runId, "c", { action: "approve", status: "APPROVED" });
      view = (await app.inject({ method: "GET", url: base, headers })).json();
      view = (await submit(ids[1]!, "mapping", "CONFIRMED")).json();
      expect(view.mappings.find((p: any) => p.activityId === ids[1]).evidence).toBe("UNDECIDED");
      const activity = await intents.get(ids[1]!);
      await revisions.saveTeacherEdit({ activityIntentId: ids[1]!, expectedActivityRevision: activity!.activityRevision, contentJson: { ...activity!.contentJson, description: "Teacher edit" } });
      view = (await app.inject({ method: "GET", url: base, headers })).json();
      expect(view.mappings.find((p: any) => p.activityId === ids[1]).mapping).toBe("STALE");
      expect(modelFetch).not.toHaveBeenCalled();
            const reviewBeforeDrift = (await app.inject({ method: "GET", url: base, headers })).json();
      await client.pool.query("UPDATE poc_competency_candidate SET revision = revision + 1 WHERE run_id = $1", [runId]);
      const staleDecision = await submit(ids[1]!, "mapping", "CONFIRMED", reviewBeforeDrift.revision);
      expect(staleDecision.statusCode).toBe(409);      await client.pool.query("UPDATE poc_run SET status = 'completed', approved_plan_id = $2, approved_revision = 1, approved_at = NOW() WHERE run_id = $1", [runId, randomUUID()]);
      // Simulate source drift after completion so GET must project STALE without writing.
      await client.pool.query("UPDATE poc_competency_candidate SET revision = revision + 1 WHERE run_id = $1", [runId]);
      const beforeCompletedRead = (await client.pool.query("SELECT revision, decisions FROM poc_competency_mapping_review WHERE run_id = $1", [runId])).rows;
      const runBefore = (await client.pool.query("SELECT approved_plan_id, approved_revision, status FROM poc_run WHERE run_id = $1", [runId])).rows;
      const read = await app.inject({ method: "GET", url: base, headers });
      expect(read.statusCode).toBe(200);
      expect(read.json().mappings.some((entry: any) => entry.mapping === "STALE")).toBe(true);
      expect((await client.pool.query("SELECT revision, decisions FROM poc_competency_mapping_review WHERE run_id = $1", [runId])).rows).toEqual(beforeCompletedRead);
      expect((await client.pool.query("SELECT approved_plan_id, approved_revision, status FROM poc_run WHERE run_id = $1", [runId])).rows).toEqual(runBefore);
    } finally { vi.unstubAllGlobals(); }
  });
});
