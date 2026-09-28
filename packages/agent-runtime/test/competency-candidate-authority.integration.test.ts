import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, createDbClient, type AppDatabase } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { pocRun } from "../src/db/schema/runs.js";
import { coreCourseDesignContexts } from "../src/db/schema/core-course-design-contexts.js";
import { activityIntent } from "../src/db/schema/activity-intents.js";
import { CompetencyCandidateRepository, RunRepository } from "../src/repositories/index.js";

const dbUrl = process.env.DATABASE_URL || "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:55432/moodle_agent_poc";
const runId = "94949494-9494-4949-8949-949494949494";

describe("Competency Candidate authority after Outcome revision", () => {
  let db: AppDatabase;
  let pool: any;
  let runRepo: RunRepository;
  let candidateRepo: CompetencyCandidateRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    await runMigrations(dbUrl);
    const client = createDbClient(dbUrl);
    db = client.db;
    pool = client.pool;
    runRepo = new RunRepository(db);
    candidateRepo = new CompetencyCandidateRepository(db);
  });

  beforeEach(async () => {
    await db.delete(pocRun).where(eq(pocRun.runId, runId));
    await runRepo.createRun({ runId, model: "test", status: "planning" });
  });

  afterAll(async () => {
    await closeDatabase();
    if (pool) await pool.end();
  });

  it("returns approved Candidates that depend on a changed Outcome to Teacher review without touching unrelated Candidates", async () => {
    await candidateRepo.saveProposed(runId, [
      { candidate_id: "candidate-a", revision: 1, name: "A", description: "A", rationale: "A", derived_from_outcome_ids: ["outcome-1"], source_refs: [], status: "PROPOSED" },
      { candidate_id: "candidate-b", revision: 1, name: "B", description: "B", rationale: "B", derived_from_outcome_ids: ["outcome-2"], source_refs: [], status: "PROPOSED" },
    ]);
    await candidateRepo.decide(runId, "candidate-a", { action: "approve", status: "APPROVED", expected_revision: 1, expected_context_revision: 1, derived_from_outcome_ids: ["outcome-1"] });
    await candidateRepo.decide(runId, "candidate-b", { action: "approve", status: "APPROVED", expected_revision: 1, expected_context_revision: 1, derived_from_outcome_ids: ["outcome-2"] });

    const changed = await candidateRepo.invalidateApprovedForOutcome(runId, "outcome-1");
    expect(changed).toBe(1);
    expect(await candidateRepo.get(runId, "candidate-a")).toMatchObject({ status: "PROPOSED", revision: 3, teacherOverrideJson: null });
    expect(await candidateRepo.get(runId, "candidate-b")).toMatchObject({ status: "APPROVED", revision: 2 });
  });

  it("rejects a stale Candidate decision instead of overwriting a completed approval", async () => {
    await candidateRepo.saveProposed(runId, [
      { candidate_id: "candidate-a", revision: 1, name: "A", description: "A", rationale: "A", derived_from_outcome_ids: ["outcome-1"], source_refs: [], status: "PROPOSED" },
    ]);
    await candidateRepo.decide(runId, "candidate-a", { action: "approve", status: "APPROVED", expected_revision: 1, expected_context_revision: 1, derived_from_outcome_ids: ["outcome-1"] });

    await expect(candidateRepo.decide(runId, "candidate-a", {
      action: "edit", status: "PROPOSED", expected_revision: 1, expected_context_revision: 1, description: "stale edit", derived_from_outcome_ids: ["outcome-1"],
    })).rejects.toMatchObject({ code: "COMPETENCY_CANDIDATE_REVISION_CONFLICT", statusCode: 409 });
    expect(await candidateRepo.get(runId, "candidate-a")).toMatchObject({ status: "APPROVED", revision: 2, description: "A" });
  });

  it("rejects a Candidate decision bound to an older Core Context revision", async () => {
    await db.insert(coreCourseDesignContexts).values([
      { runId, revision: 1, context: { revision: 1, approved_learning_outcomes: [{ outcome_id: "outcome-1" }] } as any },
      { runId, revision: 2, context: { revision: 2, approved_learning_outcomes: [] } as any },
    ]);
    await candidateRepo.saveProposed(runId, [
      { candidate_id: "candidate-a", revision: 1, name: "A", description: "A", rationale: "A", derived_from_outcome_ids: ["outcome-1"], source_refs: [], status: "PROPOSED" },
    ]);

    await expect(candidateRepo.decideAgainstAuthority(runId, "candidate-a", {
      action: "approve", status: "APPROVED", expected_revision: 1, expected_context_revision: 1, derived_from_outcome_ids: ["outcome-1"],
    })).rejects.toMatchObject({ code: "COMPETENCY_CANDIDATE_REVISION_CONFLICT", statusCode: 409 });
    expect(await candidateRepo.get(runId, "candidate-a")).toMatchObject({ status: "PROPOSED", revision: 1 });
  });

  it("withdraws dependent Candidate approval atomically when Core Context publishes changed Outcome authority", async () => {
    const source = { sha256: "a".repeat(64), text_sha256: "b".repeat(64) };
    await db.insert(coreCourseDesignContexts).values({
      runId,
      revision: 1,
      context: { run_id: runId, revision: 1, source_syllabus: source, approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Old wording", revision: 1 }] } as any,
    });
    await candidateRepo.saveProposed(runId, [
      { candidate_id: "candidate-a", revision: 1, name: "A", description: "A", rationale: "A", derived_from_outcome_ids: ["outcome-1"], source_refs: [], status: "PROPOSED" },
    ]);
    await candidateRepo.decide(runId, "candidate-a", { action: "approve", status: "APPROVED", expected_revision: 1, expected_context_revision: 1, derived_from_outcome_ids: ["outcome-1"] });

    await runRepo.saveCoreCourseDesignContextRevision({
      run_id: runId, revision: 2, source_syllabus: source,
      approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "New wording", revision: 2 }],
    } as any);

    expect(await candidateRepo.get(runId, "candidate-a")).toMatchObject({ status: "PROPOSED", revision: 3, teacherOverrideJson: null });
  });

  it("keeps Candidate approval when Outcome JSON key order changes without a semantic change", async () => {
    const source = { sha256: "a".repeat(64), text_sha256: "b".repeat(64) };
    await db.insert(coreCourseDesignContexts).values({
      runId, revision: 1,
      context: { run_id: runId, revision: 1, source_syllabus: source, approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Same wording", revision: 1, source_outcome_ids: ["source-1"] }] } as any,
    });
    await candidateRepo.saveProposed(runId, [
      { candidate_id: "candidate-a", revision: 1, name: "A", description: "A", rationale: "A", derived_from_outcome_ids: ["outcome-1"], source_refs: [], status: "PROPOSED" },
    ]);
    await candidateRepo.decide(runId, "candidate-a", { action: "approve", status: "APPROVED", expected_revision: 1, expected_context_revision: 1, derived_from_outcome_ids: ["outcome-1"] });

    await runRepo.saveCoreCourseDesignContextRevision({
      approved_learning_outcomes: [{ source_outcome_ids: ["source-1"], revision: 1, text: "Same wording", outcome_id: "outcome-1" }],
      source_syllabus: source, revision: 2, run_id: runId,
    } as any);

    expect(await candidateRepo.get(runId, "candidate-a")).toMatchObject({ status: "APPROVED", revision: 2 });
  });

  it("publishes Core Context and dependent Activity stale state in the same transaction", async () => {
    const source = { sha256: "a".repeat(64), text_sha256: "b".repeat(64) };
    await db.insert(coreCourseDesignContexts).values({
      runId, revision: 1,
      context: { run_id: runId, revision: 1, source_syllabus: source, approved_learning_outcomes: [] } as any,
    });
    const activityId = randomUUID();
    await db.insert(activityIntent).values({
      id: activityId, runId, structureRevision: 1, sectionRef: "section-01", activityRef: "quiz-01", activityType: "quiz",
      status: "generated", contextRevision: 1, maxAttempts: 2, optionsJson: {}, contentJson: { title: "Old context quiz" }, attemptCount: 2,
    });

    await runRepo.saveCoreCourseDesignContextRevision({ run_id: runId, revision: 2, source_syllabus: source, approved_learning_outcomes: [] } as any);

    const [activity] = await db.select().from(activityIntent).where(eq(activityIntent.id, activityId));
    expect(activity).toMatchObject({ status: "stale", attemptCount: 0, error: "Core Course Design Context changed. Regenerate this Activity before finalization." });
  });
});
