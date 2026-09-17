import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { CompetencyExecutionSnapshot } from "../competency-execution.js";
import type { AppDatabase } from "../db/connection.js";
import { competencyExecutionSnapshot } from "../db/schema/competency-execution-snapshots.js";

function canonical(value: unknown): string {
  function sort(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, sort(nested)]),
      );
    }
    return item;
  }
  return JSON.stringify(sort(value));
}

function authoritySignature(snapshot: CompetencyExecutionSnapshot): string {
  const { capturedAt: _capturedAt, ...authority } = snapshot;
  return canonical(authority);
}

export class CompetencyExecutionSnapshotRepository {
  constructor(private readonly db: AppDatabase) {}

  async save(snapshot: CompetencyExecutionSnapshot): Promise<CompetencyExecutionSnapshot> {
    const now = new Date().toISOString();
    const [created] = await this.db.insert(competencyExecutionSnapshot).values({
      id: randomUUID(),
      runId: snapshot.runId,
      planId: snapshot.planId,
      revision: snapshot.revision,
      mappingReviewRevision: snapshot.mappingReviewRevision,
      snapshotJson: snapshot,
      updatedAt: now,
    }).onConflictDoNothing().returning();
    if (created) return created.snapshotJson;

    const existing = await this.get(snapshot.runId, snapshot.planId, snapshot.revision);
    if (!existing) throw new Error("Failed to persist Competency execution snapshot.");
    if (authoritySignature(existing) === authoritySignature(snapshot)) return existing;

    throw Object.assign(
      new Error("This CoursePlan revision already has a different approved Competency execution authority. Finalize a new CoursePlan revision before re-approval."),
      { code: "COMPETENCY_EXECUTION_SNAPSHOT_CONFLICT", statusCode: 409 },
    );
  }

  async get(runId: string, planId: string, revision: number): Promise<CompetencyExecutionSnapshot | null> {
    const [record] = await this.db.select().from(competencyExecutionSnapshot).where(and(
      eq(competencyExecutionSnapshot.runId, runId),
      eq(competencyExecutionSnapshot.planId, planId),
      eq(competencyExecutionSnapshot.revision, revision),
    ));
    return record?.snapshotJson ?? null;
  }
}
