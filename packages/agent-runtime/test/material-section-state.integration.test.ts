import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MaterialSnapshotRepository,
  MaterialSectionStateRepository,
  RunRepository,
  createDbClient,
  runMigrations,
  type AppDatabase,
} from "../src/index.js";
import { activityIntent } from "../src/db/schema/activity-intents.js";
import { eq } from "drizzle-orm";

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

  it("rolls back snapshot and ready state when sibling Activity staling fails", async () => {
    const runId = randomUUID();
    const activityId = randomUUID();
    const suffix = randomUUID().replaceAll("-", "");
    const functionName = `test_fail_material_stale_${suffix}`;
    const triggerName = `test_fail_material_stale_trigger_${suffix}`;
    await runRepo.createRun({ runId, model: "test", status: "planning" });
    await db.insert(activityIntent).values({
      id: activityId, runId, structureRevision: 1, sectionRef: "section-01", activityRef: "quiz-01", activityType: "quiz",
      status: "generated", maxAttempts: 2, optionsJson: {}, contentJson: { title: "Current quiz" }, materialSnapshotId: "old-snapshot",
    });
    await pool.query(`CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected stale propagation failure'; END; $$`);
    await pool.query(`CREATE TRIGGER ${triggerName} BEFORE UPDATE ON poc_activity_intent FOR EACH ROW WHEN (NEW.id = '${activityId}') EXECUTE FUNCTION ${functionName}()`);
    const snapshotRepo = new MaterialSnapshotRepository(db);
    try {
      await expect(snapshotRepo.saveReplacement({
        id: randomUUID(), runId, structureRevision: 1, sectionRef: "section-01", revision: 1,
        files: [], extractorVersion: "test", normalizedText: "replacement", normalizedTextHash: "a".repeat(64),
        estimatedTokens: 2, createdByMoodleUserId: 7,
      })).rejects.toThrow("Failed query: update");

      expect(await snapshotRepo.getLatestSnapshot(runId, 1, "section-01")).toBeNull();
      expect(await stateRepo.getState(runId, 1, "section-01")).toBeNull();
      const [activity] = await db.select().from(activityIntent).where(eq(activityIntent.id, activityId));
      expect(activity).toMatchObject({ status: "generated", attemptCount: 0, materialSnapshotId: "old-snapshot" });
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON poc_activity_intent`);
      await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    }
  });
});
