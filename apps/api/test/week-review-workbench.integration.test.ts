import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createDbClient } from "../../../packages/agent-runtime/src/db/connection.js";
import { runMigrations } from "../../../packages/agent-runtime/src/db/migrate.js";
import { coreCourseDesignContexts } from "../../../packages/agent-runtime/src/db/schema/index.js";
import { CourseStructureRevisionRepository, OutcomeReviewRepository, RunRepository } from "../../../packages/agent-runtime/src/repositories/index.js";
import { courseStructureRoutes } from "../src/routes/course-structure.js";
import { loadConfig } from "../src/config/config-loader.js";

const url = process.env.DATABASE_URL ?? "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:55432/moodle_agent_poc";
const runId = randomUUID();
const source = [{ source: "syllabus.md", section: "Week 1" }];
const sections = [1, 2, 3].map((n) => ({ ref: `section-0${n}`, position: n, title: `Week ${n}`, summary: `Topic ${n}`, source_refs: source,
  activity_intents: [], aligned_objective_ids: ["lo-1"], aligned_outcome_ids: ["clo-1"], alignment_status: "CURRENT" }));

describe("UX/UI Ticket 03 Week review authority", () => {
  const client = createDbClient(url);
  const runs = new RunRepository(client.db);
  const structures = new CourseStructureRevisionRepository(client.db);
  const outcomeReviews = new OutcomeReviewRepository(client.db);
  const app = Fastify();
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    await runMigrations(url);
    await runs.createRun({ runId, model: "test", status: "planning" });
    await client.db.insert(coreCourseDesignContexts).values({ runId, revision: 1, context: {
      schema_version: "0.1", policy_version: "instructional-design.v0.1", revision: 1, run_id: runId,
      source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "a".repeat(64) }, course: {},
      learner_context: { revision: 1, status: "UNSPECIFIED", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: true },
      learning_objectives: [{ objective_id: "lo-1", source_text: "Explain basics", source_refs: source, status: "SOURCE" }],
      source_learning_outcomes: [{ source_outcome_id: "source-clo-1", source_text: "Apply basics", source_refs: source, measurable_status: "MEASURABLE", review_required: false }],
      approved_learning_outcomes: [{ outcome_id: "clo-1", text: "Apply basics", revision: 1, source_outcome_ids: ["source-clo-1"], source_refs: source, approval_origin: "SOURCE_AS_IS", approved_by_teacher: true }],
      schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [], provenance: { extractor_version: "syllabus-semantics.v0.2", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
    } as any });
    await outcomeReviews.upsert({ runId, itemType: "LO", itemId: "lo-1", status: "REVIEWED", draftText: null, updatedByMoodleUserId: "7" });
    await structures.saveRevision({ id: randomUUID(), runId, revision: 1, title: "Course", summary: "Course", content: { course: { title: "Course" }, sections }, validationStatus: "valid", teacherConstraintsJson: { alignment_state: "CURRENT", alignment_context_revision: 1 } });
    await app.register(courseStructureRoutes, { config: loadConfig({ DATABASE_URL: url, OLLAMA_MODEL: "test" }), runRepo: runs, structureRevisionRepo: structures, outcomeReviewRepo: outcomeReviews });
  });
  afterAll(async () => { await app.close(); await client.pool.query("DELETE FROM poc_run WHERE run_id = $1", [runId]); await client.pool.end(); });
  const review = (sectionRef: string, revision = 1) => app.inject({ method: "POST", url: `/api/runs/${runId}/course-structure/weeks/${sectionRef}/review`, payload: { revision, moodle_user_id: 7 } });

  it("persists only selected Week review without changing CLO authority and restores it on reload", async () => {
    const before = (await runs.getCoreCourseDesignContext(runId))!;
    const saved = await review("section-02");
    expect(saved.statusCode).toBe(200);
    expect(saved.json().structure_revision.week_reviews.map((item: any) => item.status)).toEqual(["Pending review", "Ready to configure", "Pending review"]);
    const reloaded = await app.inject({ method: "GET", url: `/api/runs/${runId}/course-structure` });
    expect(reloaded.json().current_revision.week_reviews[1].status).toBe("Ready to configure");
    expect(await runs.getCoreCourseDesignContext(runId)).toEqual(before);
    expect((await review("section-02")).json().structure_revision.week_reviews[1].status).toBe("Ready to configure");
  });

  it("rejects Week review while an LO is still pending without approving a CLO", async () => {
    await outcomeReviews.upsert({ runId, itemType: "LO", itemId: "lo-1", status: "PENDING_REVIEW", draftText: null, updatedByMoodleUserId: "7" });
    const contextBefore = await runs.getCoreCourseDesignContext(runId);
    const denied = await review("section-03");
    expect(denied.statusCode).toBe(409);
    expect(denied.json().message).toMatch(/Review every Learning Objective/);
    expect(await runs.getCoreCourseDesignContext(runId)).toEqual(contextBefore);
    await outcomeReviews.upsert({ runId, itemType: "LO", itemId: "lo-1", status: "REVIEWED", draftText: null, updatedByMoodleUserId: "7" });
  });

  it("derives Stale from changed Week content and rejects stale alignment or old revisions", async () => {
    const first = await structures.getLatestRevision(runId);
    const changed = sections.map((section) => section.ref === "section-02" ? { ...section, summary: "Changed topic" } : section);
    await structures.saveRevision({ id: randomUUID(), runId, revision: 2, title: "Course", summary: "Course", content: { course: { title: "Course" }, sections: changed }, validationStatus: "valid", teacherConstraintsJson: first!.teacherConstraintsJson as Record<string, unknown> });
    const reloaded = await app.inject({ method: "GET", url: `/api/runs/${runId}/course-structure` });
    expect(reloaded.json().current_revision.week_reviews[1].status).toBe("Stale");
    expect((await review("section-02", 1)).statusCode).toBe(409);
    const reviewedAgain = await review("section-02", 2);
    expect(reviewedAgain.statusCode).toBe(200);
    expect(reviewedAgain.json().structure_revision.week_reviews[1].status).toBe("Ready to configure");
    await structures.markAlignmentStale(runId, 2);
    expect((await review("section-03", 2)).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: `/api/runs/${runId}/course-structure` })).json().current_revision.week_reviews.every((item: any) => item.status === "Stale")).toBe(true);
  });
});
