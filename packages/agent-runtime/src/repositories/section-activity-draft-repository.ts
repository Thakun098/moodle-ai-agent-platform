import { and, eq, ne } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import { sectionActivityDraft, type NewSectionActivityDraftRecord, type SectionActivityDraftRecord, type SectionActivityDraftStatus } from "../db/schema/section-activity-drafts.js";

export class SectionActivityDraftRepository {
  constructor(private readonly db: AppDatabase) {}

  async saveDraft(data: {
    id: string;
    runId: string;
    structureRevision: number;
    sectionRef: string;
    activityRef: string;
    activityType: string;
    materialSnapshotId: string;
    generationInstruction?: string;
    content: Record<string, unknown>;
    status?: SectionActivityDraftStatus;
  }): Promise<SectionActivityDraftRecord> {
    const now = new Date().toISOString();
    const insertData: NewSectionActivityDraftRecord = {
      id: data.id,
      runId: data.runId,
      structureRevision: data.structureRevision,
      sectionRef: data.sectionRef,
      activityRef: data.activityRef,
      activityType: data.activityType,
      materialSnapshotId: data.materialSnapshotId,
      generationInstruction: data.generationInstruction ?? null,
      contentJson: data.content,
      status: data.status ?? "generated",
      createdAt: now,
      updatedAt: now,
    };
    const [created] = await this.db.insert(sectionActivityDraft).values(insertData).onConflictDoUpdate({
      target: [sectionActivityDraft.runId, sectionActivityDraft.sectionRef, sectionActivityDraft.activityRef],
      set: { structureRevision: data.structureRevision, activityType: data.activityType, materialSnapshotId: data.materialSnapshotId, generationInstruction: data.generationInstruction ?? null, contentJson: data.content, status: data.status ?? "generated", updatedAt: now },
    }).returning();
    if (!created) throw new Error(`Failed to save section activity draft ${data.runId}/${data.sectionRef}/${data.activityRef}`);
    return created;
  }

  async listSectionDrafts(runId: string, sectionRef: string): Promise<SectionActivityDraftRecord[]> {
    return this.db.select().from(sectionActivityDraft).where(and(eq(sectionActivityDraft.runId, runId), eq(sectionActivityDraft.sectionRef, sectionRef)));
  }

  async markStaleForSnapshot(runId: string, sectionRef: string, currentSnapshotId: string): Promise<void> {
    await this.db.update(sectionActivityDraft).set({ status: "stale", updatedAt: new Date().toISOString() }).where(and(
      eq(sectionActivityDraft.runId, runId),
      eq(sectionActivityDraft.sectionRef, sectionRef),
      ne(sectionActivityDraft.materialSnapshotId, currentSnapshotId),
      eq(sectionActivityDraft.status, "generated"),
    ));
  }
}

export type { SectionActivityDraftRecord };
