import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  materialSectionState,
  type MaterialSectionStateRecord,
} from "../db/schema/material-section-states.js";

export class MaterialSectionStateRepository {
  constructor(private readonly db: AppDatabase) {}

  async getState(runId: string, structureRevision: number, sectionRef: string): Promise<MaterialSectionStateRecord | null> {
    const [record] = await this.db.select().from(materialSectionState).where(and(
      eq(materialSectionState.runId, runId),
      eq(materialSectionState.structureRevision, structureRevision),
      eq(materialSectionState.sectionRef, sectionRef),
    )).limit(1);
    return record ?? null;
  }

  async markReady(input: {
    runId: string;
    structureRevision: number;
    sectionRef: string;
    snapshotId: string;
    snapshotRevision: number;
  }): Promise<MaterialSectionStateRecord> {
    const values = {
      runId: input.runId,
      structureRevision: input.structureRevision,
      sectionRef: input.sectionRef,
      status: "ready" as const,
      snapshotId: input.snapshotId,
      snapshotRevision: input.snapshotRevision,
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    };
    const [record] = await this.db.insert(materialSectionState).values(values).onConflictDoUpdate({
      target: [materialSectionState.runId, materialSectionState.structureRevision, materialSectionState.sectionRef],
      set: {
        status: values.status,
        snapshotId: values.snapshotId,
        snapshotRevision: values.snapshotRevision,
        errorCode: null,
        errorMessage: null,
        updatedAt: values.updatedAt,
      },
    }).returning();
    if (!record) throw new Error("Failed to persist Material section ready state.");
    return record;
  }

  async markFailed(input: {
    runId: string;
    structureRevision: number;
    sectionRef: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<MaterialSectionStateRecord> {
    const existing = await this.getState(input.runId, input.structureRevision, input.sectionRef);
    const values = {
      runId: input.runId,
      structureRevision: input.structureRevision,
      sectionRef: input.sectionRef,
      status: "failed" as const,
      snapshotId: existing?.snapshotId ?? null,
      snapshotRevision: existing?.snapshotRevision ?? null,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      updatedAt: new Date().toISOString(),
    };
    const [record] = await this.db.insert(materialSectionState).values(values).onConflictDoUpdate({
      target: [materialSectionState.runId, materialSectionState.structureRevision, materialSectionState.sectionRef],
      set: {
        status: values.status,
        errorCode: values.errorCode,
        errorMessage: values.errorMessage,
        updatedAt: values.updatedAt,
      },
    }).returning();
    if (!record) throw new Error("Failed to persist Material section failed state.");
    return record;
  }
}
