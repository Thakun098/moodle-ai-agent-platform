import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  materialSnapshot,
  type MaterialSnapshotRecord,
  type NewMaterialSnapshotRecord,
} from "../db/schema/material-snapshots.js";

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
