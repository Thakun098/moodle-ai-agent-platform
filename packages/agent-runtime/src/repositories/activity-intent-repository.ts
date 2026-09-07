import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import { activityIntent, type ActivityIntentRecord } from "../db/schema/activity-intents.js";

export class ActivityIntentRepository {
  constructor(private readonly db: AppDatabase) {}

  async select(input: {
    id: string;
    runId: string;
    structureRevision: number;
    sectionRef: string;
    activityRef: string;
    activityType: "quiz" | "assignment";
    maxAttempts: number;
    optionsJson: Record<string, unknown>;
  }): Promise<ActivityIntentRecord> {
    const [created] = await this.db.insert(activityIntent).values(input).onConflictDoNothing().returning();
    if (created) return created;

    const [existing] = await this.db.select().from(activityIntent).where(and(
      eq(activityIntent.runId, input.runId),
      eq(activityIntent.structureRevision, input.structureRevision),
      eq(activityIntent.sectionRef, input.sectionRef),
      eq(activityIntent.activityType, input.activityType),
    ));
    if (!existing) throw new Error("Activity identity conflict.");

    if (existing.status === "removed") {
      const [reactivated] = await this.db.update(activityIntent).set({
        status: "selected",
        activityRef: input.activityRef,
        attemptCount: 0,
        maxAttempts: input.maxAttempts,
        optionsJson: input.optionsJson,
        groundingMode: null,
        materialSnapshotId: null,
        reviewRequired: false,
        shellConfirmedAt: null,
        contentJson: null,
        generationInstruction: null,
        error: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(activityIntent.id, existing.id)).returning();
      if (!reactivated) throw new Error("Failed to reactivate Activity Intent.");
      return reactivated;
    }

    if (existing.status === "selected") {
      const [updated] = await this.db.update(activityIntent).set({
        maxAttempts: input.maxAttempts,
        optionsJson: input.optionsJson,
        updatedAt: new Date().toISOString(),
      }).where(eq(activityIntent.id, existing.id)).returning();
      return updated ?? existing;
    }

    // Repeated selection is idempotent and must not reset attempts or a terminal result.
    return existing;
  }

  async list(runId: string, structureRevision: number): Promise<ActivityIntentRecord[]> {
    return this.db.select().from(activityIntent).where(and(
      eq(activityIntent.runId, runId),
      eq(activityIntent.structureRevision, structureRevision),
    ));
  }

  async listSection(runId: string, structureRevision: number, sectionRef: string): Promise<ActivityIntentRecord[]> {
    return this.db.select().from(activityIntent).where(and(
      eq(activityIntent.runId, runId),
      eq(activityIntent.structureRevision, structureRevision),
      eq(activityIntent.sectionRef, sectionRef),
    ));
  }

  async get(id: string): Promise<ActivityIntentRecord | null> {
    const [record] = await this.db.select().from(activityIntent).where(eq(activityIntent.id, id));
    return record ?? null;
  }

  async getByRef(runId: string, structureRevision: number, activityRef: string): Promise<ActivityIntentRecord | null> {
    const [record] = await this.db.select().from(activityIntent).where(and(
      eq(activityIntent.runId, runId),
      eq(activityIntent.structureRevision, structureRevision),
      eq(activityIntent.activityRef, activityRef),
    ));
    return record ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.update(activityIntent).set({
      status: "removed",
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(activityIntent.id, id),
      inArray(activityIntent.status, ["selected", "generated", "insufficient_evidence", "failed", "timed_out", "retry_exhausted", "shell", "stale"]),
    )).returning();
    return rows.length === 1;
  }

  async markStaleForSection(runId: string, structureRevision: number, sectionRef: string): Promise<number> {
    const rows = await this.db.update(activityIntent).set({
      status: "stale",
      error: "Activity grounding source changed. Regenerate this Activity before finalization.",
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(activityIntent.runId, runId),
      eq(activityIntent.structureRevision, structureRevision),
      eq(activityIntent.sectionRef, sectionRef),
      inArray(activityIntent.status, ["generated", "shell"]),
    )).returning();
    return rows.length;
  }

  async beginAttempt(id: string): Promise<ActivityIntentRecord | null> {
    const [record] = await this.db.update(activityIntent).set({
      status: "creating",
      attemptCount: sql`${activityIntent.attemptCount} + 1`,
      error: null,
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(activityIntent.id, id),
      inArray(activityIntent.status, ["selected", "failed", "timed_out", "stale", "insufficient_evidence"]),
      lt(activityIntent.attemptCount, activityIntent.maxAttempts),
    )).returning();
    return record ?? null;
  }

  async failAttempt(id: string, timedOut: boolean, error: string): Promise<void> {
    await this.db.update(activityIntent).set({
      status: sql`CASE WHEN ${activityIntent.attemptCount} >= ${activityIntent.maxAttempts} THEN 'retry_exhausted' ELSE ${timedOut ? "timed_out" : "failed"} END`,
      error,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(activityIntent.id, id), eq(activityIntent.status, "creating")));
  }

  async markInsufficient(id: string): Promise<void> {
    // Resolution is token-free and precedes beginAttempt.
    await this.db.update(activityIntent).set({
      status: "insufficient_evidence",
      groundingMode: "INSUFFICIENT_EVIDENCE",
      reviewRequired: false,
      error: null,
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(activityIntent.id, id),
      inArray(activityIntent.status, ["selected", "insufficient_evidence", "stale"]),
    ));
  }

  async complete(id: string, result: {
    contentJson: Record<string, unknown>;
    groundingMode: string;
    reviewRequired: boolean;
    materialSnapshotId?: string;
    generationInstruction?: string;
  }): Promise<boolean> {
    const rows = await this.db.update(activityIntent).set({
      ...result,
      status: "generated",
      materialSnapshotId: result.materialSnapshotId ?? null,
      generationInstruction: result.generationInstruction ?? null,
      error: null,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(activityIntent.id, id), eq(activityIntent.status, "creating"))).returning();
    return rows.length === 1;
  }

  async confirmShell(id: string, contentJson: Record<string, unknown>): Promise<boolean> {
    const rows = await this.db.update(activityIntent).set({
      status: "shell",
      contentJson,
      reviewRequired: false,
      shellConfirmedAt: new Date().toISOString(),
      error: null,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(activityIntent.id, id), eq(activityIntent.status, "insufficient_evidence"))).returning();
    return rows.length === 1;
  }
}
