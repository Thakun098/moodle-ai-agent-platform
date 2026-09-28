import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  materialSnapshot,
  type MaterialSnapshotRecord,
  type NewMaterialSnapshotRecord,
} from "../db/schema/material-snapshots.js";
import { materialSectionState } from "../db/schema/material-section-states.js";
import { activityIntent } from "../db/schema/activity-intents.js";
import { pocRun } from "../db/schema/runs.js";

export interface SaveMaterialSnapshotInput {
  id: string;
  runId: string;
  structureRevision: number;
  sectionRef: string;
  revision: number;
  files: unknown[];
  extractorVersion: string;
  normalizedText: string;
  normalizedTextHash: string;
  estimatedTokens: number;
  createdByMoodleUserId: number;
  createdAt?: string;
}

export class MaterialSnapshotRepository {
  constructor(private readonly db: AppDatabase) {}

  async saveSnapshot(data: SaveMaterialSnapshotInput): Promise<MaterialSnapshotRecord> {
    const insertData: NewMaterialSnapshotRecord = {
      id: data.id,
      runId: data.runId,
      structureRevision: data.structureRevision,
      sectionRef: data.sectionRef,
      revision: data.revision,
      filesJson: data.files,
      extractorVersion: data.extractorVersion,
      normalizedText: data.normalizedText,
      normalizedTextHash: data.normalizedTextHash,
      estimatedTokens: data.estimatedTokens,
      createdByMoodleUserId: data.createdByMoodleUserId,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    };
    const [created] = await this.db.insert(materialSnapshot).values(insertData).returning();
    if (!created) throw new Error(`Failed to save material snapshot ${data.runId}/${data.sectionRef}/${data.revision}`);
    return created;
  }

  /** Atomically publishes a changed Material source and invalidates dependent Activity authority. */
  async saveReplacement(data: SaveMaterialSnapshotInput): Promise<{ snapshot: MaterialSnapshotRecord; staleActivityCount: number }> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, data.runId)).for("update");
      if (!run) throw Object.assign(new Error(`Run ${data.runId} not found.`), { code: "NOT_FOUND", statusCode: 404 });
      if (["executing", "awaiting_verification", "completed"].includes(run.status)) {
        throw Object.assign(new Error(`Instructional Design authority cannot change while run ${data.runId} is ${run.status}.`), { code: "INSTRUCTIONAL_DESIGN_MUTATION_LOCKED", statusCode: 409 });
      }
      const insertData: NewMaterialSnapshotRecord = {
        id: data.id,
        runId: data.runId,
        structureRevision: data.structureRevision,
        sectionRef: data.sectionRef,
        revision: data.revision,
        filesJson: data.files,
        extractorVersion: data.extractorVersion,
        normalizedText: data.normalizedText,
        normalizedTextHash: data.normalizedTextHash,
        estimatedTokens: data.estimatedTokens,
        createdByMoodleUserId: data.createdByMoodleUserId,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      };
      const [snapshot] = await tx.insert(materialSnapshot).values(insertData).returning();
      if (!snapshot) throw new Error(`Failed to save material snapshot ${data.runId}/${data.sectionRef}/${data.revision}`);
      const now = new Date().toISOString();
      await tx.insert(materialSectionState).values({
        runId: data.runId,
        structureRevision: data.structureRevision,
        sectionRef: data.sectionRef,
        status: "ready",
        snapshotId: snapshot.id,
        snapshotRevision: snapshot.revision,
        errorCode: null,
        errorMessage: null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [materialSectionState.runId, materialSectionState.structureRevision, materialSectionState.sectionRef],
        set: { status: "ready", snapshotId: snapshot.id, snapshotRevision: snapshot.revision, errorCode: null, errorMessage: null, updatedAt: now },
      });
      const staleRows = await tx.update(activityIntent).set({
        status: "stale",
        attemptCount: 0,
        error: "Activity grounding source changed. Regenerate this Activity before finalization.",
        updatedAt: now,
      }).where(and(
        eq(activityIntent.runId, data.runId),
        eq(activityIntent.structureRevision, data.structureRevision),
        eq(activityIntent.sectionRef, data.sectionRef),
        inArray(activityIntent.status, ["generated", "shell", "creating"]),
      )).returning({ id: activityIntent.id });
      await tx.update(pocRun).set({
        ...(["preview", "failed"].includes(run.status) ? { status: "planning" as const, error: null } : {}),
        approvedPlanId: null,
        approvedRevision: null,
        approvedAt: null,
        approvedByMoodleUserId: null,
        updatedAt: now,
      }).where(eq(pocRun.runId, data.runId));
      return { snapshot, staleActivityCount: staleRows.length };
    });
  }

  async getSnapshot(snapshotId: string): Promise<MaterialSnapshotRecord | null> {
    const [record] = await this.db.select().from(materialSnapshot).where(eq(materialSnapshot.id, snapshotId)).limit(1);
    return record ?? null;
  }

  async getLatestSnapshot(runId: string, structureRevision: number, sectionRef: string): Promise<MaterialSnapshotRecord | null> {
    const [record] = await this.db
      .select()
      .from(materialSnapshot)
      .where(and(eq(materialSnapshot.runId, runId), eq(materialSnapshot.structureRevision, structureRevision), eq(materialSnapshot.sectionRef, sectionRef)))
      .orderBy(desc(materialSnapshot.revision))
      .limit(1);
    return record ?? null;
  }

  async listSnapshots(runId: string, sectionRef?: string): Promise<MaterialSnapshotRecord[]> {
    return this.db
      .select()
      .from(materialSnapshot)
      .where(sectionRef === undefined
        ? eq(materialSnapshot.runId, runId)
        : and(eq(materialSnapshot.runId, runId), eq(materialSnapshot.sectionRef, sectionRef)))
      .orderBy(desc(materialSnapshot.createdAt));
  }
}

export type { MaterialSnapshotRecord };
