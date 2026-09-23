import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/connection.js";
import { activityIntent, type ActivityIntentRecord } from "../db/schema/activity-intents.js";
import { activityRevision } from "../db/schema/activity-revisions.js";

type ActivityPurpose = "PRACTICE" | "FORMATIVE" | "SUMMATIVE";

type SemanticFields = {
  purpose?: ActivityPurpose;
  selectedObjectiveIdsJson?: string[];
  selectedOutcomeIdsJson?: string[];
  contextRevision?: number | null;
  learnerContextRevision?: number | null;
  learnerContextAcknowledged?: boolean;
  alignmentOverrideJson?: Record<string, unknown> | null;
  generationInstruction?: string | null;
};

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, canonicalizeJson(record[key])]),
  );
}

function jsonSemanticallyEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalizeJson(a)) === JSON.stringify(canonicalizeJson(b));
}

function selectionIds(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort();
}

function arraysEqual(a: unknown, b: unknown): boolean {
  return jsonSemanticallyEqual(Array.isArray(a) ? a : [], Array.isArray(b) ? b : []);
}

function semanticChanged(existing: ActivityIntentRecord, input: SemanticFields): boolean {
  return existing.purpose !== (input.purpose ?? "PRACTICE")
    || !arraysEqual(selectionIds(existing.selectedObjectiveIdsJson), selectionIds(input.selectedObjectiveIdsJson))
    || !arraysEqual(selectionIds(existing.selectedOutcomeIdsJson), selectionIds(input.selectedOutcomeIdsJson))
    || (existing.contextRevision ?? null) !== (input.contextRevision ?? null)
    || (existing.learnerContextRevision ?? null) !== (input.learnerContextRevision ?? null)
    || existing.learnerContextAcknowledged !== (input.learnerContextAcknowledged ?? false)
    || !jsonSemanticallyEqual(existing.alignmentOverrideJson ?? null, input.alignmentOverrideJson ?? null)
    || (existing.generationInstruction ?? null) !== (input.generationInstruction ?? null);
}

function updateStatusForChange(existing: ActivityIntentRecord): { status: ActivityIntentRecord["status"]; error: string | null } {
  const generated = existing.status === "generated" || existing.status === "shell" || existing.status === "creating" || existing.contentJson !== null;
  return generated
    ? { status: "stale", error: "Activity Intent changed. Regenerate this Activity before finalization." }
    : { status: "selected", error: null };
}

export interface ActivityCompletionExpectation {
  intentRevision: number;
  contextRevision?: number | null;
  learnerContextRevision?: number | null;
}

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
  } & SemanticFields): Promise<ActivityIntentRecord> {
    const semantic = {
      purpose: input.purpose ?? "PRACTICE" as ActivityPurpose,
      selectedObjectiveIdsJson: selectionIds(input.selectedObjectiveIdsJson),
      selectedOutcomeIdsJson: selectionIds(input.selectedOutcomeIdsJson),
      contextRevision: input.contextRevision ?? null,
      learnerContextRevision: input.learnerContextRevision ?? null,
      learnerContextAcknowledged: input.learnerContextAcknowledged ?? false,
      alignmentOverrideJson: input.alignmentOverrideJson ?? null,
      generationInstruction: input.generationInstruction ?? null,
    };
    const [created] = await this.db.insert(activityIntent).values({
      id: input.id,
      runId: input.runId,
      structureRevision: input.structureRevision,
      sectionRef: input.sectionRef,
      activityRef: input.activityRef,
      activityType: input.activityType,
      maxAttempts: input.maxAttempts,
      optionsJson: input.optionsJson,
      ...semantic,
    }).onConflictDoNothing().returning();
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
        intentRevision: existing.intentRevision + 1,
        activityRef: input.activityRef,
        attemptCount: 0,
        maxAttempts: input.maxAttempts,
        optionsJson: input.optionsJson,
        ...semantic,
        groundingMode: null,
        materialSnapshotId: null,
        reviewRequired: false,
        shellConfirmedAt: null,
        contentJson: null,
        contentProvenance: null,
        activityRevision: 0,
        sourceGenerationRevision: null,
        qualityReviewJson: null,
        generationMetadataJson: null,
        error: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(activityIntent.id, existing.id)).returning();
      if (!reactivated) throw new Error("Failed to reactivate Activity Intent.");
      return reactivated;
    }

    const optionsChanged = !jsonSemanticallyEqual(existing.optionsJson, input.optionsJson);
    const changed = optionsChanged || semanticChanged(existing, semantic);
    if (!changed) return existing;
    const nextState = updateStatusForChange(existing);
    const [updated] = await this.db.update(activityIntent).set({
      intentRevision: existing.intentRevision + 1,
      maxAttempts: input.maxAttempts,
      optionsJson: input.optionsJson,
      ...semantic,
      status: nextState.status,
      ...(nextState.status === "stale" ? { attemptCount: 0 } : {}),
      error: nextState.error,
      updatedAt: new Date().toISOString(),
    }).where(eq(activityIntent.id, existing.id)).returning();
    return updated ?? existing;
  }

  async updateContextRevision(id: string, contextRevision: number, learnerContextRevision: number): Promise<ActivityIntentRecord | null> {
    const existing = await this.get(id);
    if (!existing || (existing.contextRevision === contextRevision && existing.learnerContextRevision === learnerContextRevision)) return existing;
    const nextState = updateStatusForChange(existing);
    const [updated] = await this.db.update(activityIntent).set({
      intentRevision: existing.intentRevision + 1,
      contextRevision,
      learnerContextRevision,
      status: nextState.status,
      ...(nextState.status === "stale" ? { attemptCount: 0 } : {}),
      error: nextState.error,
      updatedAt: new Date().toISOString(),
    }).where(eq(activityIntent.id, id)).returning();
    return updated ?? null;
  }
  async updateGenerationInstruction(id: string, instruction: string, contextRevision?: number | null): Promise<ActivityIntentRecord | null> {
    const existing = await this.get(id);
    if (!existing || (existing.generationInstruction ?? null) === instruction && (contextRevision === undefined || existing.contextRevision === contextRevision)) return existing;
    const nextState = updateStatusForChange(existing);
    const [updated] = await this.db.update(activityIntent).set({
      intentRevision: existing.intentRevision + 1,
      generationInstruction: instruction,
      ...(contextRevision !== undefined ? { contextRevision } : {}),
      status: nextState.status,
      ...(nextState.status === "stale" ? { attemptCount: 0 } : {}),
      error: nextState.error,
      updatedAt: new Date().toISOString(),
    }).where(eq(activityIntent.id, id)).returning();
    return updated ?? null;
  }

  async markStaleForContext(runId: string, structureRevision: number, contextRevision: number): Promise<number> {
    const rows = await this.list(runId, structureRevision);
    let changed = 0;
    for (const row of rows) {
      if ((row.contextRevision ?? null) === contextRevision) continue;
      if (row.status !== "generated" && row.status !== "shell" && row.status !== "creating") continue;
      const updated = await this.db.update(activityIntent).set({
        status: "stale",
        attemptCount: 0,
        error: "Core Course Design Context changed. Regenerate this Activity before finalization.",
        updatedAt: new Date().toISOString(),
      }).where(and(eq(activityIntent.id, row.id), inArray(activityIntent.status, ["generated", "shell", "creating"]))).returning();
      changed += updated.length;
    }
    return changed;
  }

  async list(runId: string, structureRevision: number): Promise<ActivityIntentRecord[]> {
    return this.db.select().from(activityIntent).where(and(eq(activityIntent.runId, runId), eq(activityIntent.structureRevision, structureRevision)));
  }

  async listSection(runId: string, structureRevision: number, sectionRef: string): Promise<ActivityIntentRecord[]> {
    return this.db.select().from(activityIntent).where(and(eq(activityIntent.runId, runId), eq(activityIntent.structureRevision, structureRevision), eq(activityIntent.sectionRef, sectionRef)));
  }

  async get(id: string): Promise<ActivityIntentRecord | null> {
    const [record] = await this.db.select().from(activityIntent).where(eq(activityIntent.id, id));
    return record ?? null;
  }

  async getByRef(runId: string, structureRevision: number, activityRef: string): Promise<ActivityIntentRecord | null> {
    const [record] = await this.db.select().from(activityIntent).where(and(eq(activityIntent.runId, runId), eq(activityIntent.structureRevision, structureRevision), eq(activityIntent.activityRef, activityRef)));
    return record ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db.update(activityIntent).set({ status: "removed", updatedAt: new Date().toISOString() }).where(and(eq(activityIntent.id, id), inArray(activityIntent.status, ["selected", "generated", "insufficient_evidence", "failed", "timed_out", "retry_exhausted", "shell", "stale"]))).returning();
    return rows.length === 1;
  }

  async markStaleForSection(runId: string, structureRevision: number, sectionRef: string): Promise<number> {
    const rows = await this.db.update(activityIntent).set({ status: "stale", attemptCount: 0, error: "Activity grounding source changed. Regenerate this Activity before finalization.", updatedAt: new Date().toISOString() }).where(and(eq(activityIntent.runId, runId), eq(activityIntent.structureRevision, structureRevision), eq(activityIntent.sectionRef, sectionRef), inArray(activityIntent.status, ["generated", "shell", "creating"]))).returning();
    return rows.length;
  }

  async beginAttempt(id: string): Promise<ActivityIntentRecord | null> {
    const [record] = await this.db.update(activityIntent).set({ status: "creating", attemptCount: sql`${activityIntent.attemptCount} + 1`, error: null, updatedAt: new Date().toISOString() }).where(and(eq(activityIntent.id, id), inArray(activityIntent.status, ["selected", "failed", "timed_out", "stale", "insufficient_evidence"]), lt(activityIntent.attemptCount, activityIntent.maxAttempts))).returning();
    return record ?? null;
  }

  async failAttempt(id: string, timedOut: boolean, error: string): Promise<void> {
    await this.db.update(activityIntent).set({ status: sql`CASE WHEN ${activityIntent.attemptCount} >= ${activityIntent.maxAttempts} THEN 'retry_exhausted' ELSE ${timedOut ? "timed_out" : "failed"} END`, error, updatedAt: new Date().toISOString() }).where(and(eq(activityIntent.id, id), eq(activityIntent.status, "creating")));
  }

  async markInsufficient(id: string): Promise<void> {
    await this.db.update(activityIntent).set({ status: "insufficient_evidence", groundingMode: "INSUFFICIENT_EVIDENCE", reviewRequired: false, error: null, updatedAt: new Date().toISOString() }).where(and(eq(activityIntent.id, id), inArray(activityIntent.status, ["selected", "insufficient_evidence", "stale"])));
  }

  async markStale(id: string, error: string): Promise<boolean> {
    const rows = await this.db.update(activityIntent).set({ status: "stale", attemptCount: 0, error, updatedAt: new Date().toISOString() }).where(and(eq(activityIntent.id, id), eq(activityIntent.status, "creating"))).returning();
    return rows.length === 1;
  }

  async complete(id: string, result: { contentJson: Record<string, unknown>; groundingMode: string; reviewRequired: boolean; materialSnapshotId?: string; generationInstruction?: string | null; qualityReviewJson?: Record<string, unknown> | null; generationMetadataJson?: Record<string, unknown> | null }, expected?: ActivityCompletionExpectation): Promise<boolean> {
    const conditions = [eq(activityIntent.id, id), eq(activityIntent.status, "creating")];
    if (expected) {
      conditions.push(eq(activityIntent.intentRevision, expected.intentRevision));
      if (expected.contextRevision !== undefined) conditions.push(expected.contextRevision === null ? isNull(activityIntent.contextRevision) : eq(activityIntent.contextRevision, expected.contextRevision));
      if (expected.learnerContextRevision !== undefined) conditions.push(expected.learnerContextRevision === null ? isNull(activityIntent.learnerContextRevision) : eq(activityIntent.learnerContextRevision, expected.learnerContextRevision));
    }

    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(activityIntent).where(and(...conditions));
      if (!current) return false;

      const revisions = await tx.select().from(activityRevision)
        .where(eq(activityRevision.activityIntentId, current.id))
        .orderBy(activityRevision.revision);
      let maxRevision = Math.max(current.activityRevision, 0, ...revisions.map((candidate) => candidate.revision));
      const seedLegacyGeneration = Boolean(current.contentJson) && current.activityRevision === 0;
      const legacyRevision = seedLegacyGeneration ? maxRevision + 1 : null;
      if (legacyRevision !== null) maxRevision = legacyRevision;
      const generatedRevision = maxRevision + 1;
      const now = new Date().toISOString();

      const rows = await tx.update(activityIntent).set({
        contentJson: result.contentJson,
        groundingMode: result.groundingMode,
        reviewRequired: result.reviewRequired,
        status: "generated",
        materialSnapshotId: result.materialSnapshotId ?? null,
        ...(result.generationInstruction !== undefined ? { generationInstruction: result.generationInstruction } : {}),
        qualityReviewJson: result.qualityReviewJson ?? null,
        generationMetadataJson: result.generationMetadataJson ?? null,
        contentProvenance: "AI_GENERATED",
        activityRevision: generatedRevision,
        sourceGenerationRevision: generatedRevision,
        error: null,
        updatedAt: now,
      }).where(and(
        ...conditions,
        eq(activityIntent.activityRevision, current.activityRevision),
      )).returning();
      if (rows.length !== 1) return false;

      if (legacyRevision !== null && current.contentJson) {
        await tx.insert(activityRevision).values({
          id: randomUUID(),
          activityIntentId: current.id,
          revision: legacyRevision,
          provenance: "AI_GENERATED",
          sourceGenerationRevision: legacyRevision,
          intentRevision: current.intentRevision,
          contextRevision: current.contextRevision,
          learnerContextRevision: current.learnerContextRevision,
          groundingMode: current.groundingMode,
          materialSnapshotId: current.materialSnapshotId,
          contentJson: current.contentJson,
          qualityReviewJson: current.qualityReviewJson,
          generationMetadataJson: current.generationMetadataJson,
        });
      }

      await tx.insert(activityRevision).values({
        id: randomUUID(),
        activityIntentId: current.id,
        revision: generatedRevision,
        provenance: "AI_GENERATED",
        sourceGenerationRevision: generatedRevision,
        intentRevision: current.intentRevision,
        contextRevision: current.contextRevision,
        learnerContextRevision: current.learnerContextRevision,
        groundingMode: result.groundingMode,
        materialSnapshotId: result.materialSnapshotId ?? null,
        contentJson: result.contentJson,
        qualityReviewJson: result.qualityReviewJson ?? null,
        generationMetadataJson: result.generationMetadataJson ?? null,
      });
      return true;
    });
  }

  async confirmShell(id: string, contentJson: Record<string, unknown>): Promise<boolean> {
    const rows = await this.db.update(activityIntent).set({ status: "shell", contentJson, reviewRequired: false, shellConfirmedAt: new Date().toISOString(), error: null, updatedAt: new Date().toISOString() }).where(and(eq(activityIntent.id, id), eq(activityIntent.status, "insufficient_evidence"))).returning();
    return rows.length === 1;
  }
}
