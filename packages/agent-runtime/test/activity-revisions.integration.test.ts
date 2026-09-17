import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDbClient, type AppDatabase } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { pocRun } from "../src/db/schema/runs.js";
import { ActivityIntentRepository, ActivityRevisionRepository, RunRepository } from "../src/repositories/index.js";

const dbUrl = process.env.DATABASE_URL || "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:55432/moodle_agent_poc";
const runId = "22222222-2222-4222-8222-222222222222";
const intentId = "23232323-2323-4232-8232-232323232323";

describe("Ticket 22 Activity revision persistence", () => {
  let db: AppDatabase;
  let pool: any;
  let runRepo: RunRepository;
  let intentRepo: ActivityIntentRepository;
  let revisionRepo: ActivityRevisionRepository;

  beforeAll(async () => {
    await runMigrations(dbUrl);
    const client = createDbClient(dbUrl); db = client.db; pool = client.pool;
    runRepo = new RunRepository(db); intentRepo = new ActivityIntentRepository(db); revisionRepo = new ActivityRevisionRepository(db);
  });
  beforeEach(async () => {
    await db.delete(pocRun).where(eq(pocRun.runId, runId));
    await runRepo.createRun({ runId, model: "test", status: "planning" });
  });
  afterAll(async () => { if (pool) await pool.end(); });

  async function generatedIntent() {
    const selected = await intentRepo.select({
      id: intentId, runId, structureRevision: 1, sectionRef: "section-01", activityRef: "assignment-01", activityType: "assignment", maxAttempts: 2,
      optionsJson: { title: "Assignment", grade: 100 }, purpose: "FORMATIVE", selectedObjectiveIdsJson: ["objective-1"], selectedOutcomeIdsJson: ["outcome-1"],
      contextRevision: 3, learnerContextRevision: 2, learnerContextAcknowledged: true,
    });
    await intentRepo.beginAttempt(selected.id);
    await intentRepo.complete(selected.id, {
      contentJson: { ref: "assignment-01", type: "assignment", title: "Assignment", description: "Original", instructions: ["Original instruction"], learning_objectives: ["Explain BFS"], grade: 100, source_refs: [{ source: "lecture.md", section: "section-01" }] },
      groundingMode: "MATERIAL_GROUNDED", materialSnapshotId: "24242424-2424-4242-8242-242424242424", reviewRequired: true,
      qualityReviewJson: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS", warnings: [] },
      generationMetadataJson: { provider: "groq", model: "test", activity_intent_revision: 1 },
    });
    const current = await intentRepo.get(selected.id);
    if (!current) throw new Error("Generated Activity Intent missing");
    return current;
  }

  it("preserves generated revision and appends Teacher-edited revisions without mutating history", async () => {
    const current = await generatedIntent();
    const seeded = await revisionRepo.recordGeneratedFromIntent(current);
    expect(seeded).toMatchObject({ activityRevision: 1, contentProvenance: "AI_GENERATED", sourceGenerationRevision: 1 });
    const editedContent = { ...(seeded.contentJson as Record<string, unknown>), instructions: ["Teacher revised instruction"] };
    const saved = await revisionRepo.saveTeacherEdit({ activityIntentId: intentId, contentJson: editedContent, expectedActivityRevision: 1, editedByMoodleUserId: 7 });
    expect(saved.intent).toMatchObject({ activityRevision: 2, contentProvenance: "TEACHER_EDITED", sourceGenerationRevision: 1, contentJson: expect.objectContaining({ instructions: ["Teacher revised instruction"] }) });
    const history = await revisionRepo.list(intentId);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ revision: 1, provenance: "AI_GENERATED", sourceGenerationRevision: 1, contentJson: expect.objectContaining({ instructions: ["Original instruction"] }), qualityReviewJson: expect.objectContaining({ outcome_alignment: "PASS" }) });
    expect(history[1]).toMatchObject({ revision: 2, provenance: "TEACHER_EDITED", sourceGenerationRevision: 1, editedByMoodleUserId: 7, contentJson: expect.objectContaining({ instructions: ["Teacher revised instruction"] }), qualityReviewJson: null, generationMetadataJson: null });
  });

  it("appends a new AI revision after a Teacher edit is made stale and regenerated", async () => {
    const generated = await generatedIntent();
    expect(generated).toMatchObject({ activityRevision: 1, contentProvenance: "AI_GENERATED", sourceGenerationRevision: 1 });
    const edited = await revisionRepo.saveTeacherEdit({
      activityIntentId: intentId,
      contentJson: { ...(generated.contentJson as Record<string, unknown>), instructions: ["Teacher revised instruction"] },
      expectedActivityRevision: 1,
      editedByMoodleUserId: 7,
    });
    expect(edited.intent).toMatchObject({ activityRevision: 2, contentProvenance: "TEACHER_EDITED", sourceGenerationRevision: 1 });

    const stale = await intentRepo.select({
      id: intentId, runId, structureRevision: 1, sectionRef: "section-01", activityRef: "assignment-01", activityType: "assignment", maxAttempts: 2,
      optionsJson: { title: "Assignment", grade: 100 }, purpose: "SUMMATIVE", selectedObjectiveIdsJson: ["objective-1"], selectedOutcomeIdsJson: ["outcome-1"],
      contextRevision: 3, learnerContextRevision: 2, learnerContextAcknowledged: true,
    });
    expect(stale).toMatchObject({ status: "stale", activityRevision: 2, contentProvenance: "TEACHER_EDITED" });
    const started = await intentRepo.beginAttempt(intentId);
    expect(started?.status).toBe("creating");
    const regeneratedContent = { ...(edited.intent.contentJson as Record<string, unknown>), description: "Regenerated AI content", instructions: ["Regenerated instruction"] };
    expect(await intentRepo.complete(intentId, {
      contentJson: regeneratedContent,
      groundingMode: "MATERIAL_GROUNDED", materialSnapshotId: "24242424-2424-4242-8242-242424242424", reviewRequired: true,
      qualityReviewJson: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS", warnings: [] },
      generationMetadataJson: { provider: "groq", model: "test", activity_intent_revision: stale.intentRevision },
    }, { intentRevision: stale.intentRevision, contextRevision: 3, learnerContextRevision: 2 })).toBe(true);

    const current = await intentRepo.get(intentId);
    expect(current).toMatchObject({
      status: "generated", activityRevision: 3, contentProvenance: "AI_GENERATED", sourceGenerationRevision: 3,
      contentJson: expect.objectContaining({ description: "Regenerated AI content", instructions: ["Regenerated instruction"] }),
    });
    const history = await revisionRepo.list(intentId);
    expect(history).toHaveLength(3);
    expect(history.map((revision) => [revision.revision, revision.provenance, revision.sourceGenerationRevision])).toEqual([
      [1, "AI_GENERATED", 1],
      [2, "TEACHER_EDITED", 1],
      [3, "AI_GENERATED", 3],
    ]);
    expect(history[0]?.contentJson).toMatchObject({ description: "Original" });
    expect(history[1]?.contentJson).toMatchObject({ instructions: ["Teacher revised instruction"] });
    expect(history[2]?.contentJson).toMatchObject({ description: "Regenerated AI content" });
  });

  it("rejects stale edit CAS and preserves the last valid Activity revision", async () => {
    const seeded = await revisionRepo.recordGeneratedFromIntent(await generatedIntent());
    await revisionRepo.saveTeacherEdit({ activityIntentId: intentId, contentJson: { ...(seeded.contentJson as Record<string, unknown>), description: "Valid Teacher edit" }, expectedActivityRevision: 1 });
    await expect(revisionRepo.saveTeacherEdit({ activityIntentId: intentId, contentJson: { ...(seeded.contentJson as Record<string, unknown>), description: "Stale overwrite" }, expectedActivityRevision: 1 })).rejects.toMatchObject({ code: "ACTIVITY_EDIT_STALE" });
    const current = await intentRepo.get(intentId);
    expect(current).toMatchObject({ activityRevision: 2, contentProvenance: "TEACHER_EDITED", contentJson: expect.objectContaining({ description: "Valid Teacher edit" }) });
    expect(await revisionRepo.list(intentId)).toHaveLength(2);
  });
});
