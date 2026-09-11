import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import { riskInsight, type RiskInsightRecord, type RiskInsightScope, type RiskInsightStatus } from "../db/schema/index.js";

export interface UpsertRiskInsightInput {
  insightId: string;
  courseId: number;
  studentId?: number | null;
  scope: RiskInsightScope;
  snapshotId: string;
  riskModelVersion: string;
  status: Exclude<RiskInsightStatus, "STALE">;
  payload: Record<string, unknown>;
  staleReason?: string | null;
  generatedAt: string;
}

export class RiskInsightRepository {
  constructor(private readonly db: AppDatabase) {}

  async getForSnapshot(courseId: number, scope: RiskInsightScope, snapshotId: string, studentId?: number | null): Promise<RiskInsightRecord | null> {
    const filters = [eq(riskInsight.courseId, courseId), eq(riskInsight.scope, scope), eq(riskInsight.snapshotId, snapshotId)];
    if (studentId !== undefined && studentId !== null) filters.push(eq(riskInsight.studentId, studentId));
    const [row] = await this.db.select().from(riskInsight).where(and(...filters)).orderBy(desc(riskInsight.generatedAt)).limit(1);
    return row ?? null;
  }

  async upsert(input: UpsertRiskInsightInput): Promise<RiskInsightRecord> {
    const values = {
      insightId: input.insightId,
      courseId: input.courseId,
      studentId: input.studentId ?? null,
      scope: input.scope,
      snapshotId: input.snapshotId,
      riskModelVersion: input.riskModelVersion,
      status: input.status,
      payload: input.payload,
      staleReason: input.staleReason ?? null,
      generatedAt: input.generatedAt,
      updatedAt: input.generatedAt,
    };
    await this.db.insert(riskInsight).values(values).onConflictDoUpdate({
      target: riskInsight.insightId,
      set: { status: values.status, payload: values.payload, staleReason: values.staleReason, updatedAt: values.updatedAt },
    });
    const [row] = await this.db.select().from(riskInsight).where(eq(riskInsight.insightId, input.insightId)).limit(1);
    if (!row) throw new Error(`Risk insight ${input.insightId} was not persisted.`);
    return row;
  }

  async markStaleBySnapshot(input: { courseId: number; snapshotId: string; scope: RiskInsightScope; studentIds?: number[]; reason: string; updatedAt: string }): Promise<void> {
    const filters = [eq(riskInsight.courseId, input.courseId), eq(riskInsight.snapshotId, input.snapshotId), eq(riskInsight.scope, input.scope)];
    if (input.scope === "STUDENT" && input.studentIds && input.studentIds.length > 0) filters.push(inArray(riskInsight.studentId, input.studentIds));
    await this.db.update(riskInsight).set({ status: "STALE", staleReason: input.reason, updatedAt: input.updatedAt }).where(and(...filters));
  }

  async listCourse(courseId: number): Promise<RiskInsightRecord[]> {
    return this.db.select().from(riskInsight).where(eq(riskInsight.courseId, courseId)).orderBy(desc(riskInsight.generatedAt));
  }
}
