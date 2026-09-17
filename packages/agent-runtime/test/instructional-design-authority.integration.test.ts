import type { AnyPlanEnvelope } from "@moodle-agent-poc/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, createDbClient, type AppDatabase } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { pocRun } from "../src/db/schema/runs.js";
import {
  CompetencyExecutionSnapshotRepository,
  PlanRepository,
  RunRepository,
} from "../src/repositories/index.js";

const dbUrl = process.env.DATABASE_URL || "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:55432/moodle_agent_poc";
const runId = "91919191-9191-4919-8919-919191919191";
const planId = "92929292-9292-4929-8929-929292929292";

function plan(): AnyPlanEnvelope {
  return {
    schema_version: "0.1",
    plan_id: planId,
    revision: 1,
    plan_type: "course",
    operation: "create",
    title: "Authority test",
    summary: "Authority test",
    warnings: [],
    assumptions: [],
    content: {
      course: { title: "Authority test" },
      sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Week 1", source_refs: [], activities: [] }],
    },
  };
}

function snapshot(name = "Competency A", capturedAt = "2026-09-16T00:00:00.000Z") {
  return {
    runId,
    planId,
    revision: 1,
    mappingReviewRevision: 3,
    capturedAt,
    competencies: [{
      candidateId: "candidate-1",
      competencyRevision: 2,
      name,
      description: "Definition A",
      outcomeIds: ["outcome-1"],
      idnumber: "AGENTPOC-AUTHORITY-1",
    }],
    mappings: [],
  };
}

describe("Instructional Design approval/execution authority", () => {
  let db: AppDatabase;
  let pool: any;
  let runRepo: RunRepository;
  let planRepo: PlanRepository;
  let snapshotRepo: CompetencyExecutionSnapshotRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    await runMigrations(dbUrl);
    const client = createDbClient(dbUrl);
    db = client.db;
    pool = client.pool;
    runRepo = new RunRepository(db);
    planRepo = new PlanRepository(db);
    snapshotRepo = new CompetencyExecutionSnapshotRepository(db);
  });

  beforeEach(async () => {
    await db.delete(pocRun).where(eq(pocRun.runId, runId));
    await runRepo.createRun({ runId, model: "test", status: "preview" });
    const envelope = plan();
    await planRepo.savePlanRevision({
      id: "93939393-9393-4939-8939-939393939393",
      planId,
      runId,
      planType: "course",
      operation: "create",
      revision: 1,
      title: envelope.title,
      summary: envelope.summary,
      content: envelope.content as Record<string, unknown>,
      rawEnvelope: envelope,
      validationStatus: "valid",
    });
    await runRepo.approvePlan({ runId, planId, revision: 1, approvedByMoodleUserId: "7" });
  });

  afterAll(async () => {
    await closeDatabase();
    if (pool) await pool.end();
  });

  it("invalidates prior approval before an Instructional Design mutation and blocks mutation once execution is claimed", async () => {
    const mutable = await runRepo.beginInstructionalDesignMutation(runId);
    expect(mutable.status).toBe("planning");
    expect(mutable.approvedPlanId).toBeNull();
    expect(mutable.approvedRevision).toBeNull();
    await expect(runRepo.approvePlan({ runId, planId, revision: 1, approvedByMoodleUserId: "7" })).rejects.toMatchObject({ code: "RUN_STATE_INVALID" });

    await runRepo.updateStatus(runId, "preview");
    await runRepo.approvePlan({ runId, planId, revision: 1, approvedByMoodleUserId: "7" });
    const claimed = await runRepo.claimApprovedExecution({ runId, planId, revision: 1 });
    expect(claimed.status).toBe("executing");

    await expect(runRepo.beginInstructionalDesignMutation(runId)).rejects.toMatchObject({ code: "INSTRUCTIONAL_DESIGN_MUTATION_LOCKED" });
  });

  it("allows failed execution to retry only while the exact approval is still current", async () => {
    await runRepo.updateStatus(runId, "failed");
    await expect(runRepo.claimApprovedExecution({ runId, planId, revision: 1 })).resolves.toMatchObject({ status: "executing" });

    await runRepo.updateStatus(runId, "failed");
    await runRepo.beginInstructionalDesignMutation(runId);
    await expect(runRepo.claimApprovedExecution({ runId, planId, revision: 1 })).rejects.toMatchObject({ code: "PLAN_NOT_APPROVED" });
  });

  it("finishes verification only while the exact approved execution authority is still awaiting verification", async () => {
    await runRepo.claimApprovedExecution({ runId, planId, revision: 1 });
    await runRepo.updateStatus(runId, "awaiting_verification");
    await expect(runRepo.assertApprovedVerification({ runId, planId, revision: 1 })).resolves.toMatchObject({ status: "awaiting_verification" });
    await expect(runRepo.finishApprovedVerification({ runId, planId, revision: 1, passed: true, finalResult: { passed: true } })).resolves.toMatchObject({ status: "completed" });

    await runRepo.updateStatus(runId, "failed");
    await runRepo.beginInstructionalDesignMutation(runId);
    await expect(runRepo.finishApprovedVerification({ runId, planId, revision: 1, passed: true, finalResult: { passed: true } })).rejects.toMatchObject({ code: "VERIFICATION_AUTHORITY_STALE" });
  });

  it("keeps the execution snapshot immutable for one plan revision while allowing idempotent re-save", async () => {
    const first = await snapshotRepo.save(snapshot() as any);
    expect(first.competencies[0]?.name).toBe("Competency A");

    const sameAuthority = await snapshotRepo.save(snapshot("Competency A", "2026-09-16T01:00:00.000Z") as any);
    expect(sameAuthority.capturedAt).toBe(first.capturedAt);

    await expect(snapshotRepo.save(snapshot("Competency B", "2026-09-16T02:00:00.000Z") as any)).rejects.toMatchObject({
      code: "COMPETENCY_EXECUTION_SNAPSHOT_CONFLICT",
    });
  });
});
