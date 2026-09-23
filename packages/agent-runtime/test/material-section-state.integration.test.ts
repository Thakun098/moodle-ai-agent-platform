import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MaterialSectionStateRepository,
  RunRepository,
  createDbClient,
  runMigrations,
  type AppDatabase,
} from "../src/index.js";

const dbUrl = process.env.DATABASE_URL || "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:55432/moodle_agent_poc";

describe("Ticket 06 Material section lifecycle persistence", () => {
  let db: AppDatabase;
  let pool: any;
  let runRepo: RunRepository;
  let stateRepo: MaterialSectionStateRepository;

  beforeAll(async () => {
    await runMigrations(dbUrl);
    const client = createDbClient(dbUrl);
    db = client.db;
    pool = client.pool;
    runRepo = new RunRepository(db);
    stateRepo = new MaterialSectionStateRepository(db);
  });

  afterAll(async () => { if (pool) await pool.end(); });

  it("persists ready/failed/ready lifecycle while retaining the last valid snapshot through a failure", async () => {
    const runId = randomUUID();
    await runRepo.createRun({ runId, model: "test", status: "planning" });

    await stateRepo.markReady({ runId, structureRevision: 1, sectionRef: "section-01", snapshotId: "snapshot-1", snapshotRevision: 3 });
    expect(await stateRepo.getState(runId, 1, "section-01")).toMatchObject({
      status: "ready", snapshotId: "snapshot-1", snapshotRevision: 3, errorCode: null, errorMessage: null,
    });

    await stateRepo.markFailed({
      runId, structureRevision: 1, sectionRef: "section-01",
      errorCode: "MATERIAL_EXTRACTION_FAILED", errorMessage: "No readable text",
    });
    expect(await stateRepo.getState(runId, 1, "section-01")).toMatchObject({
      status: "failed", snapshotId: "snapshot-1", snapshotRevision: 3,
      errorCode: "MATERIAL_EXTRACTION_FAILED", errorMessage: "No readable text",
    });

    await stateRepo.markReady({ runId, structureRevision: 1, sectionRef: "section-01", snapshotId: "snapshot-2", snapshotRevision: 4 });
    expect(await stateRepo.getState(runId, 1, "section-01")).toMatchObject({
      status: "ready", snapshotId: "snapshot-2", snapshotRevision: 4, errorCode: null, errorMessage: null,
    });
  });
});
