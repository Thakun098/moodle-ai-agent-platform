import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, createDbClient, type AppDatabase } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { pocRun } from "../src/db/schema/runs.js";
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
    await candidateRepo.decide(runId, "candidate-a", { action: "approve", status: "APPROVED", derived_from_outcome_ids: ["outcome-1"] });
    await candidateRepo.decide(runId, "candidate-b", { action: "approve", status: "APPROVED", derived_from_outcome_ids: ["outcome-2"] });

    const changed = await candidateRepo.invalidateApprovedForOutcome(runId, "outcome-1");
    expect(changed).toBe(1);
    expect(await candidateRepo.get(runId, "candidate-a")).toMatchObject({ status: "PROPOSED", revision: 3, teacherOverrideJson: null });
    expect(await candidateRepo.get(runId, "candidate-b")).toMatchObject({ status: "APPROVED", revision: 2 });
  });
});
