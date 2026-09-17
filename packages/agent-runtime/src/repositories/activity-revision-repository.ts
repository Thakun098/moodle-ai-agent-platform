import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import { activityIntent, type ActivityIntentRecord } from "../db/schema/activity-intents.js";
import { activityRevision, type ActivityRevisionRecord } from "../db/schema/activity-revisions.js";

export class ActivityRevisionRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(activityIntentId: string): Promise<ActivityRevisionRecord[]> {
    return this.db.select().from(activityRevision)
      .where(eq(activityRevision.activityIntentId, activityIntentId))
      .orderBy(activityRevision.revision);
  }

  async latest(activityIntentId: string): Promise<ActivityRevisionRecord | null> {
    const [record] = await this.db.select().from(activityRevision)
      .where(eq(activityRevision.activityIntentId, activityIntentId))
      .orderBy(desc(activityRevision.revision))
      .limit(1);
    return record ?? null;
  }

  async recordGeneratedFromIntent(record: ActivityIntentRecord): Promise<ActivityIntentRecord> {
    if (record.status !== "generated" || !record.contentJson) return record;
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(activityIntent).where(eq(activityIntent.id, record.id));
      if (!current || current.status !== "generated" || !current.contentJson) return current ?? record;
      const [latest] = await tx.select().from(activityRevision)
        .where(eq(activityRevision.activityIntentId, current.id))
        .orderBy(desc(activityRevision.revision))
        .limit(1);
      if (latest) {
        if (current.activityRevision > 0 && current.sourceGenerationRevision !== null && current.contentProvenance) return current;
        const sourceGenerationRevision = latest.provenance === "AI_GENERATED"
          ? latest.revision
          : latest.sourceGenerationRevision;
        const [updated] = await tx.update(activityIntent).set({
          activityRevision: latest.revision,
          contentProvenance: latest.provenance,
          sourceGenerationRevision: sourceGenerationRevision ?? latest.revision,
          updatedAt: new Date().toISOString(),
        }).where(eq(activityIntent.id, current.id)).returning();
        return updated ?? current;
      }
      const revision = 1;
      await tx.insert(activityRevision).values({
        id: randomUUID(),
        activityIntentId: current.id,
        revision,
        provenance: "AI_GENERATED",
        sourceGenerationRevision: revision,
        intentRevision: current.intentRevision,
        contextRevision: current.contextRevision,
        learnerContextRevision: current.learnerContextRevision,
        groundingMode: current.groundingMode,
        materialSnapshotId: current.materialSnapshotId,
        contentJson: current.contentJson,
        qualityReviewJson: current.qualityReviewJson,
        generationMetadataJson: current.generationMetadataJson,
      });
      const [updated] = await tx.update(activityIntent).set({
        activityRevision: revision,
        contentProvenance: "AI_GENERATED",
        sourceGenerationRevision: revision,
        updatedAt: new Date().toISOString(),
      }).where(eq(activityIntent.id, current.id)).returning();
      return updated ?? current;
    });
  }

  async saveTeacherEdit(input: {
    activityIntentId: string;
    contentJson: Record<string, unknown>;
    expectedActivityRevision?: number;
    editedByMoodleUserId?: number | null;
  }): Promise<{ intent: ActivityIntentRecord; revision: ActivityRevisionRecord }> {
    return this.db.transaction(async (tx) => {
      let [current] = await tx.select().from(activityIntent).where(eq(activityIntent.id, input.activityIntentId));
      if (!current || current.status !== "generated" || !current.contentJson) {
        throw new Error("Teacher edits require a currently generated Activity.");
      }

      let revisions = await tx.select().from(activityRevision)
        .where(eq(activityRevision.activityIntentId, current.id))
        .orderBy(activityRevision.revision);
      if (revisions.length === 0) {
        const generatedRevision = 1;
        const [seeded] = await tx.insert(activityRevision).values({
          id: randomUUID(),
          activityIntentId: current.id,
          revision: generatedRevision,
          provenance: "AI_GENERATED",
          sourceGenerationRevision: generatedRevision,
          intentRevision: current.intentRevision,
          contextRevision: current.contextRevision,
          learnerContextRevision: current.learnerContextRevision,
          groundingMode: current.groundingMode,
          materialSnapshotId: current.materialSnapshotId,
          contentJson: current.contentJson,
          qualityReviewJson: current.qualityReviewJson,
          generationMetadataJson: current.generationMetadataJson,
        }).returning();
        if (!seeded) throw new Error("Failed to preserve the source generation revision.");
        const [hydrated] = await tx.update(activityIntent).set({
          activityRevision: generatedRevision,
          contentProvenance: "AI_GENERATED",
          sourceGenerationRevision: generatedRevision,
          updatedAt: new Date().toISOString(),
        }).where(eq(activityIntent.id, current.id)).returning();
        current = hydrated ?? current;
        revisions = [seeded];
      }

      if (input.expectedActivityRevision !== undefined && current.activityRevision !== input.expectedActivityRevision) {
        throw Object.assign(new Error("Activity content revision changed before the Teacher edit was saved."), { code: "ACTIVITY_EDIT_STALE" });
      }
      const sourceGenerationRevision = current.sourceGenerationRevision
        ?? revisions.find((candidate) => candidate.provenance === "AI_GENERATED")?.revision;
      if (!sourceGenerationRevision) throw new Error("The originating AI-generated Activity revision is unavailable.");
      const nextRevision = Math.max(current.activityRevision, ...revisions.map((candidate) => candidate.revision)) + 1;
      const [savedRevision] = await tx.insert(activityRevision).values({
        id: randomUUID(),
        activityIntentId: current.id,
        revision: nextRevision,
        provenance: "TEACHER_EDITED",
        sourceGenerationRevision,
        intentRevision: current.intentRevision,
        contextRevision: current.contextRevision,
        learnerContextRevision: current.learnerContextRevision,
        groundingMode: current.groundingMode,
        materialSnapshotId: current.materialSnapshotId,
        contentJson: input.contentJson,
        qualityReviewJson: null,
        generationMetadataJson: null,
        editedByMoodleUserId: input.editedByMoodleUserId ?? null,
      }).returning();
      if (!savedRevision) throw new Error("Failed to save Teacher-edited Activity revision.");
      const [updated] = await tx.update(activityIntent).set({
        contentJson: input.contentJson,
        contentProvenance: "TEACHER_EDITED",
        activityRevision: nextRevision,
        sourceGenerationRevision,
        error: null,
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(activityIntent.id, current.id),
        eq(activityIntent.status, "generated"),
        eq(activityIntent.intentRevision, current.intentRevision),
        eq(activityIntent.activityRevision, current.activityRevision),
      )).returning();
      if (!updated) throw Object.assign(new Error("Activity changed while the Teacher edit was being saved."), { code: "ACTIVITY_EDIT_STALE" });
      return { intent: updated, revision: savedRevision };
    });
  }
}
