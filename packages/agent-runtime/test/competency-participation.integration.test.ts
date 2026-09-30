import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type AppDatabase } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { pocRun } from "../src/db/schema/runs.js";
import { coreCourseDesignContexts } from "../src/db/schema/core-course-design-contexts.js";
import { CompetencyCandidateRepository, CompetencyExecutionSnapshotRepository, PlanRepository, RunRepository } from "../src/repositories/index.js";
import type { CompetencyParticipation } from "../src/competency-participation.js";

const enabled = (revision: number, reason = "CONFIGURED_FRAMEWORK"): CompetencyParticipation => ({ revision, status: "ENABLED", reason, framework_id: 7, framework_signature: "a".repeat(64), message: "Available", checked_at: "2026-09-30T00:00:00Z" });
const skipped = (revision: number): CompetencyParticipation => ({ revision, status: "BYPASSED", reason: "TEACHER_SKIP", framework_id: null, framework_signature: null, message: "Skipped by Teacher", checked_at: "2026-09-30T00:00:00Z" });

describe("Ticket 35 PostgreSQL Competency participation and approval authority", () => {
  let db: AppDatabase;
  let pool: ReturnType<typeof createDbClient>["pool"];
  let repo: RunRepository;
  let candidates: CompetencyCandidateRepository;
  let runId: string;
  let planId: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:55432/moodle_agent_poc";
    await runMigrations(url);
    const client = createDbClient(url);
    db = client.db;
    pool = client.pool;
    repo = new RunRepository(db);
    candidates = new CompetencyCandidateRepository(db);
  });

  beforeEach(async () => {
    runId = randomUUID();
    planId = randomUUID();
    await repo.createRun({ runId, model: "ticket35-integration", status: "preview" });
  });

  afterEach(async () => {
    if (db && runId) await db.delete(pocRun).where(eq(pocRun.runId, runId));
  });
  afterAll(async () => { if (pool) await pool.end(); });

  it("persists participation across repository reloads", async () => {
    expect((await repo.getRun(runId))?.competencyParticipation).toBeNull();
    const saved = await repo.saveCompetencyParticipation(runId, enabled(0), 0);
    expect(saved).toMatchObject({ revision: 1, status: "ENABLED", framework_id: 7 });
    expect((await new RunRepository(db).getRun(runId))?.competencyParticipation).toEqual(saved);
  });

  it("skip and re-enable atomically clear approval while preserving approved/rejected/deferred Candidate records", async () => {
    const initial = await repo.saveCompetencyParticipation(runId, enabled(0), 0);
    await candidates.saveProposed(runId, ["approved", "rejected", "deferred"].map(candidate_id => ({ candidate_id, revision: 1, name: candidate_id, description: "Teacher-reviewed wording", rationale: "Outcome lineage", derived_from_outcome_ids: ["outcome-1"], source_refs: [], status: "PROPOSED" as const })));
    for (const [candidateId, action, status] of [["approved", "approve", "APPROVED"], ["rejected", "reject", "REJECTED"], ["deferred", "defer", "DEFERRED"]] as const) {
      await candidates.decide(runId, candidateId, { action, status, expected_revision: 1, expected_context_revision: 1, derived_from_outcome_ids: ["outcome-1"] });
    }
    const before = await candidates.list(runId);
    await repo.approvePlan({ runId, planId, revision: 1, competencyParticipationRevision: initial.revision, approvedByMoodleUserId: "teacher-35" });
    const bypass = await repo.saveCompetencyParticipation(runId, skipped(initial.revision), initial.revision);
    expect(await repo.getRun(runId)).toMatchObject({ competencyParticipation: bypass, approvedPlanId: null, approvedRevision: null, approvedAt: null, approvedByMoodleUserId: null });
    expect(await candidates.list(runId)).toEqual(before);
    await repo.approvePlan({ runId, planId, revision: 1, competencyParticipationRevision: bypass.revision });
    const restored = await repo.saveCompetencyParticipation(runId, enabled(bypass.revision), bypass.revision);
    expect(restored.revision).toBe(bypass.revision + 1);
    expect(await repo.getRun(runId)).toMatchObject({ approvedPlanId: null, approvedRevision: null, approvedAt: null });
    expect(await candidates.list(runId)).toEqual(before);
  });

  it("same ENABLED Framework signature with changed informational reason does not churn revision or approval", async () => {
    const initial = await repo.saveCompetencyParticipation(runId, enabled(0, "DEFAULT_CREATED"), 0);
    const approval = await repo.approvePlan({ runId, planId, revision: 2, competencyParticipationRevision: initial.revision, approvedByMoodleUserId: "teacher-35" });
    const checked = await repo.saveCompetencyParticipation(runId, { ...enabled(initial.revision, "DEFAULT_REUSED"), checked_at: "2026-09-30T01:00:00Z", message: "Available again" }, initial.revision);
    expect(checked.revision).toBe(initial.revision);
    expect(checked.reason).toBe("DEFAULT_REUSED");
    const current = await repo.getRun(runId);
    expect(current).toMatchObject({ approvedPlanId: planId, approvedRevision: 2, approvedAt: approval.approvedAt, approvedByMoodleUserId: "teacher-35" });
  });

  it("concurrent CAS updates yield exactly one winner and one conflict", async () => {
    const initial = await repo.saveCompetencyParticipation(runId, enabled(0), 0);
    const outcomes = await Promise.allSettled([
      repo.saveCompetencyParticipation(runId, skipped(initial.revision), initial.revision),
      new RunRepository(db).saveCompetencyParticipation(runId, { ...enabled(initial.revision), framework_signature: "b".repeat(64) }, initial.revision),
    ]);
    expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(1);
    const failed = outcomes.find(value => value.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "COMPETENCY_PARTICIPATION_CONFLICT", statusCode: 409 });
    const won = outcomes.find(value => value.status === "fulfilled") as PromiseFulfilledResult<CompetencyParticipation>;
    expect((await repo.getRun(runId))?.competencyParticipation).toEqual(won.value);
    expect(won.value.revision).toBe(initial.revision + 1);
  });

  it("atomic approval rejects an obsolete participation revision without publishing any approval", async () => {
    const initial = await repo.saveCompetencyParticipation(runId, enabled(0), 0);
    const bypass = await repo.saveCompetencyParticipation(runId, skipped(initial.revision), initial.revision);
    await expect(repo.approvePlan({ runId, planId, revision: 1, competencyParticipationRevision: initial.revision })).rejects.toMatchObject({ code: "COMPETENCY_PARTICIPATION_CONFLICT", statusCode: 409 });
    expect(await repo.getRun(runId)).toMatchObject({ status: "preview", competencyParticipation: bypass, approvedPlanId: null, approvedRevision: null });
  });

  it("racing approval and participation change never leaves stale approval published", async () => {
    const initial = await repo.saveCompetencyParticipation(runId, enabled(0), 0);
    const outcomes = await Promise.allSettled([
      repo.approvePlan({ runId, planId, revision: 1, competencyParticipationRevision: initial.revision }),
      new RunRepository(db).saveCompetencyParticipation(runId, skipped(initial.revision), initial.revision),
    ]);
    expect(outcomes[1].status).toBe("fulfilled");
    if (outcomes[0].status === "rejected") expect(outcomes[0].reason).toMatchObject({ code: "COMPETENCY_PARTICIPATION_CONFLICT" });
    expect(await repo.getRun(runId)).toMatchObject({ competencyParticipation: { status: "BYPASSED", revision: initial.revision + 1 }, approvedPlanId: null, approvedRevision: null, approvedAt: null });
  });

  it("Execute claim rejects stale participation even if the Plan is otherwise approved", async () => {
    const current = await repo.saveCompetencyParticipation(runId, skipped(0), 0);
    await repo.approvePlan({ runId, planId, revision: 1, competencyParticipationRevision: current.revision });
    await expect(repo.claimApprovedExecution({ runId, planId, revision: 1, competencyParticipationRevision: current.revision - 1 })).rejects.toMatchObject({ code: "COMPETENCY_EXECUTION_SNAPSHOT_STALE", statusCode: 409 });
    expect(await repo.getRun(runId)).toMatchObject({ status: "preview", approvedPlanId: planId, approvedRevision: 1 });
  });

  it("freezes participation once the approved execution has been claimed", async () => {
    const current = await repo.saveCompetencyParticipation(runId, enabled(0), 0);
    await repo.approvePlan({ runId, planId, revision: 1, competencyParticipationRevision: current.revision });
    await repo.claimApprovedExecution({ runId, planId, revision: 1, competencyParticipationRevision: current.revision });
    await expect(repo.saveCompetencyParticipation(runId, skipped(current.revision), current.revision)).rejects.toMatchObject({ code: "INSTRUCTIONAL_DESIGN_MUTATION_LOCKED", statusCode: 409 });
    expect(await repo.getRun(runId)).toMatchObject({ status: "executing", competencyParticipation: current, approvedPlanId: planId, approvedRevision: 1 });
  });

  it("reapproval of the same enabled snapshot tolerates refreshed check time/reason without immutable conflict", async () => {
    const participation = await repo.saveCompetencyParticipation(runId, enabled(0, "DEFAULT_CREATED"), 0);
    const envelope = { schema_version: "0.1", plan_id: planId, revision: 1, plan_type: "course", operation: "create", title: "Ticket 35 snapshot", summary: "Snapshot authority test", warnings: [], assumptions: [], content: { course: { title: "Ticket 35 snapshot" }, sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Week 1", source_refs: [], activities: [] }] } };
    await new PlanRepository(db).savePlanRevision({ id: randomUUID(), runId, planId, revision: 1, planType: "course", operation: "create", title: envelope.title, summary: envelope.summary, content: envelope.content, rawEnvelope: envelope as any, validationStatus: "valid" });
    const snapshots = new CompetencyExecutionSnapshotRepository(db);
    const initial = { runId, planId, revision: 1, frameworkId: 7, participation, mappingReviewRevision: 0, capturedAt: "2026-09-30T00:00:00Z", competencies: [], mappings: [] };
    const captured = await snapshots.save(initial);
    await repo.approvePlan({ runId, planId, revision: 1, competencyParticipationRevision: participation.revision });
    const checked = await repo.saveCompetencyParticipation(runId, { ...participation, reason: "DEFAULT_REUSED", checked_at: "2026-09-30T02:00:00Z", message: "Available again" }, participation.revision);
    await expect(snapshots.save({ ...initial, participation: checked, capturedAt: "2026-09-30T02:00:00Z" })).resolves.toEqual(captured);
    await expect(repo.approvePlan({ runId, planId, revision: 1, competencyParticipationRevision: checked.revision })).resolves.toMatchObject({ approvedPlanId: planId, approvedRevision: 1 });
    expect((await repo.getRun(runId))?.approvedPlanId).toBe(planId);
  });

  it("proposal persistence checks participation and context atomically and clears approval on success", async () => {
    const participation = await repo.saveCompetencyParticipation(runId, enabled(0), 0);
    await db.insert(coreCourseDesignContexts).values({ runId, revision: 3, context: { revision: 3, approved_learning_outcomes: [{ outcome_id: "outcome-1" }] } as any });
    const proposals = [{ candidate_id: "derived-current", revision: 1, name: "Design programs", description: "A proposal", rationale: "Approved Outcome", derived_from_outcome_ids: ["outcome-1"], source_refs: [], status: "PROPOSED" as const }];
    await repo.approvePlan({ runId, planId, revision: 1, competencyParticipationRevision: participation.revision });
    await expect(candidates.saveProposed(runId, proposals, { participationRevision: participation.revision - 1, contextRevision: 3 })).rejects.toMatchObject({ code: "COMPETENCY_PARTICIPATION_CONFLICT" });
    await expect(candidates.saveProposed(runId, proposals, { participationRevision: participation.revision, contextRevision: 2 })).rejects.toMatchObject({ code: "COMPETENCY_CANDIDATE_REVISION_CONFLICT" });
    expect(await candidates.list(runId)).toEqual([]);
    expect((await repo.getRun(runId))?.approvedPlanId).toBe(planId);
    await candidates.saveProposed(runId, proposals, { participationRevision: participation.revision, contextRevision: 3 });
    expect(await candidates.get(runId, "derived-current")).toMatchObject({ status: "PROPOSED", revision: 1 });
    expect((await repo.getRun(runId))?.approvedPlanId).toBeNull();
  });

  it("proposal save fails closed after skip and after Execute claim without inserting candidates", async () => {
    const participation = await repo.saveCompetencyParticipation(runId, enabled(0), 0);
    await db.insert(coreCourseDesignContexts).values({ runId, revision: 3, context: { revision: 3, approved_learning_outcomes: [] } as any });
    const proposals = [{ candidate_id: "blocked", revision: 1, name: "Blocked", description: "Blocked", rationale: "Blocked", derived_from_outcome_ids: [], source_refs: [], status: "PROPOSED" as const }];
    const bypass = await repo.saveCompetencyParticipation(runId, skipped(participation.revision), participation.revision);
    await expect(candidates.saveProposed(runId, proposals, { participationRevision: bypass.revision, contextRevision: 3 })).rejects.toMatchObject({ code: "COMPETENCY_PARTICIPATION_CONFLICT" });
    const restored = await repo.saveCompetencyParticipation(runId, enabled(bypass.revision), bypass.revision);
    await repo.approvePlan({ runId, planId, revision: 1, competencyParticipationRevision: restored.revision });
    await repo.claimApprovedExecution({ runId, planId, revision: 1, competencyParticipationRevision: restored.revision });
    await expect(candidates.saveProposed(runId, proposals, { participationRevision: restored.revision, contextRevision: 3 })).rejects.toMatchObject({ code: "INSTRUCTIONAL_DESIGN_MUTATION_LOCKED" });
    expect(await candidates.list(runId)).toEqual([]);
  });
});
