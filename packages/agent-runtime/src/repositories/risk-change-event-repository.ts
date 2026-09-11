import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  riskChangeEvent,
  type NewRiskChangeEventRecord,
  type RiskChangeEventRecord,
  type RiskChangeOrigin,
  type RiskChangeScope,
} from "../db/schema/risk-change-events.js";

export interface RecordRiskChangeEventInput {
  eventId: string;
  courseId: number;
  studentId?: number | null;
  scope: RiskChangeScope;
  fromSnapshotId?: string | null;
  toSnapshotId: string;
  material: boolean;
  changeOrigin: RiskChangeOrigin;
  reasons: string[];
  sourceChanges: Record<string, unknown>[];
  createdAt?: string;
}

export class RiskChangeEventRepository {
  constructor(private readonly db: AppDatabase) {}

  async record(input: RecordRiskChangeEventInput): Promise<RiskChangeEventRecord> {
    const values: NewRiskChangeEventRecord = {
      eventId: input.eventId,
      courseId: input.courseId,
      studentId: input.studentId ?? null,
      scope: input.scope,
      fromSnapshotId: input.fromSnapshotId ?? null,
      toSnapshotId: input.toSnapshotId,
      material: input.material,
      changeOrigin: input.changeOrigin,
      reasons: input.reasons,
      sourceChanges: input.sourceChanges,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    };
    const [created] = await this.db.insert(riskChangeEvent).values(values).returning();
    if (!created) throw new Error(`Failed to record Risk change event ${input.eventId}`);
    return created;
  }

  async listCourseEvents(courseId: number): Promise<RiskChangeEventRecord[]> {
    return this.db
      .select()
      .from(riskChangeEvent)
      .where(eq(riskChangeEvent.courseId, courseId))
      .orderBy(asc(riskChangeEvent.createdAt));
  }

  async listStudentEvents(courseId: number, studentId: number): Promise<RiskChangeEventRecord[]> {
    return this.db
      .select()
      .from(riskChangeEvent)
      .where(and(eq(riskChangeEvent.courseId, courseId), eq(riskChangeEvent.studentId, studentId)))
      .orderBy(asc(riskChangeEvent.createdAt));
  }
}
