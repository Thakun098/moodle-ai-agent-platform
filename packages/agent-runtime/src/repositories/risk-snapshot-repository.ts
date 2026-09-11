import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  courseRiskState,
  riskChangeEvent,
  riskInsight,
  riskSnapshot,
  studentRiskHistory,
  type CourseRiskStateRecord,
  type RiskChangeOrigin,
  type RiskChangeScope,
  type RiskRefreshOrigin,
  type RiskSnapshotRecord,
  type StudentRiskHistoryRecord,
} from "../db/schema/index.js";

export interface PublishStudentRiskHistoryInput {
  studentId: number;
  evaluationStatus: "COMPLETE" | "INCOMPLETE";
  overallRisk: "LOW" | "MEDIUM" | "HIGH" | null;
  progressRisk: "LOW" | "MEDIUM" | "HIGH" | null;
  performanceRisk: "LOW" | "MEDIUM" | "HIGH" | null;
  competencyRisk: "LOW" | "MEDIUM" | "HIGH" | null;
  submissionRisk: "LOW" | "MEDIUM" | "HIGH" | null;
  dimensionMetrics: Record<string, Record<string, number | null>>;
}

export interface PublishRiskChangeEventInput {
  eventId: string;
  studentId?: number | null;
  scope: RiskChangeScope;
  material: boolean;
  changeOrigin: RiskChangeOrigin;
  reasons: string[];
  sourceChanges: Record<string, unknown>[];
}

export interface PublishRiskSnapshotInput {
  snapshotId: string;
  courseId: number;
  dataAsOf: number;
  computedAt: string;
  riskModelVersion: string;
  refreshOrigin: RiskRefreshOrigin;
  evidenceHash: string;
  payload: Record<string, unknown>;
  history: PublishStudentRiskHistoryInput[];
  changeEvents?: PublishRiskChangeEventInput[];
  attemptId: string;
}

export interface RecordRiskRefreshFailureInput {
  courseId: number;
  attemptedAt: string;
  refreshOrigin: RiskRefreshOrigin;
  attemptId: string;
  error: string;
}

export interface PublishRiskSnapshotResult {
  currentSnapshotId: string;
  previousSnapshotId: string | null;
}

/**
 * Persistence boundary for deterministic Risk snapshots.
 * Snapshot rows are insert-only; publication + compact history + change events + pointers share one transaction.
 */
export class RiskSnapshotRepository {
  constructor(private readonly db: AppDatabase) {}

  async publishSnapshot(input: PublishRiskSnapshotInput): Promise<PublishRiskSnapshotResult> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(courseRiskState)
        .where(eq(courseRiskState.courseId, input.courseId))
        .limit(1)
        .for("update");

      const oldCurrent = existing?.currentSnapshotId ?? null;
      const oldPrevious = existing?.previousSnapshotId ?? null;

      await tx.insert(riskSnapshot).values({
        snapshotId: input.snapshotId,
        courseId: input.courseId,
        snapshotVersion: 1,
        dataAsOf: input.dataAsOf,
        computedAt: input.computedAt,
        riskModelVersion: input.riskModelVersion,
        refreshOrigin: input.refreshOrigin,
        publicationStatus: "PUBLISHED",
        evidenceHash: input.evidenceHash,
        payload: input.payload,
      });

      if (input.history.length > 0) {
        await tx.insert(studentRiskHistory).values(
          input.history.map((point) => ({
            historyId: `${input.snapshotId}:${point.studentId}`,
            courseId: input.courseId,
            studentId: point.studentId,
            snapshotId: input.snapshotId,
            dataAsOf: input.dataAsOf,
            riskModelVersion: input.riskModelVersion,
            evaluationStatus: point.evaluationStatus,
            overallRisk: point.overallRisk,
            progressRisk: point.progressRisk,
            performanceRisk: point.performanceRisk,
            competencyRisk: point.competencyRisk,
            submissionRisk: point.submissionRisk,
            dimensionMetrics: point.dimensionMetrics,
          }))
        );
      }

      if (input.changeEvents && input.changeEvents.length > 0) {
        await tx.insert(riskChangeEvent).values(
          input.changeEvents.map((event) => ({
            eventId: event.eventId,
            courseId: input.courseId,
            studentId: event.studentId ?? null,
            scope: event.scope,
            fromSnapshotId: oldCurrent,
            toSnapshotId: input.snapshotId,
            material: event.material,
            changeOrigin: event.changeOrigin,
            reasons: event.reasons,
            sourceChanges: event.sourceChanges,
            createdAt: input.computedAt,
          }))
        );
      }

      if (oldCurrent && input.changeEvents && input.changeEvents.length > 0) {
        const courseMaterial = input.changeEvents.some((event) => event.scope === "COURSE" && event.material);
        const changedStudents = input.changeEvents
          .filter((event) => event.scope === "STUDENT" && event.material && event.studentId)
          .map((event) => event.studentId!)
          .filter((value, index, all) => all.indexOf(value) === index);
        if (courseMaterial) {
          await tx.update(riskInsight)
            .set({ status: "STALE", staleReason: "COURSE_MATERIAL_CHANGE", updatedAt: input.computedAt })
            .where(and(eq(riskInsight.courseId, input.courseId), eq(riskInsight.snapshotId, oldCurrent), eq(riskInsight.scope, "COURSE")));
        }
        if (changedStudents.length > 0) {
          await tx.update(riskInsight)
            .set({ status: "STALE", staleReason: "STUDENT_MATERIAL_CHANGE", updatedAt: input.computedAt })
            .where(and(eq(riskInsight.courseId, input.courseId), eq(riskInsight.snapshotId, oldCurrent), eq(riskInsight.scope, "STUDENT"), inArray(riskInsight.studentId, changedStudents)));
        }
      }

      const stateValues = {
        currentSnapshotId: input.snapshotId,
        previousSnapshotId: oldCurrent,
        lastSuccessfulRefreshAt: input.computedAt,
        lastRefreshAttemptAt: input.computedAt,
        lastRefreshStatus: "SUCCESS" as const,
        lastRefreshOrigin: input.refreshOrigin,
        lastRefreshAttemptId: input.attemptId,
        lastRefreshError: null,
        updatedAt: input.computedAt,
      };

      await tx
        .insert(courseRiskState)
        .values({ courseId: input.courseId, ...stateValues })
        .onConflictDoUpdate({
          target: courseRiskState.courseId,
          set: stateValues,
        });

      // POC retention: keep current + previous immutable full snapshots only.
      if (oldPrevious && oldPrevious !== oldCurrent && oldPrevious !== input.snapshotId) {
        await tx.delete(riskSnapshot).where(eq(riskSnapshot.snapshotId, oldPrevious));
      }

      return {
        currentSnapshotId: input.snapshotId,
        previousSnapshotId: oldCurrent,
      };
    });
  }

  async recordRefreshFailure(input: RecordRiskRefreshFailureInput): Promise<void> {
    const existing = await this.getCourseState(input.courseId);
    const values = {
      currentSnapshotId: existing?.currentSnapshotId ?? null,
      previousSnapshotId: existing?.previousSnapshotId ?? null,
      lastSuccessfulRefreshAt: existing?.lastSuccessfulRefreshAt ?? null,
      lastRefreshAttemptAt: input.attemptedAt,
      lastRefreshStatus: "FAILED" as const,
      lastRefreshOrigin: input.refreshOrigin,
      lastRefreshAttemptId: input.attemptId,
      lastRefreshError: input.error,
      updatedAt: input.attemptedAt,
    };

    await this.db
      .insert(courseRiskState)
      .values({ courseId: input.courseId, ...values })
      .onConflictDoUpdate({
        target: courseRiskState.courseId,
        set: {
          lastRefreshAttemptAt: values.lastRefreshAttemptAt,
          lastRefreshStatus: values.lastRefreshStatus,
          lastRefreshOrigin: values.lastRefreshOrigin,
          lastRefreshAttemptId: values.lastRefreshAttemptId,
          lastRefreshError: values.lastRefreshError,
          updatedAt: values.updatedAt,
        },
      });
  }

  async getCourseState(courseId: number): Promise<CourseRiskStateRecord | null> {
    const [record] = await this.db
      .select()
      .from(courseRiskState)
      .where(eq(courseRiskState.courseId, courseId))
      .limit(1);
    return record ?? null;
  }

  async getSnapshot(snapshotId: string): Promise<RiskSnapshotRecord | null> {
    const [record] = await this.db
      .select()
      .from(riskSnapshot)
      .where(eq(riskSnapshot.snapshotId, snapshotId))
      .limit(1);
    return record ?? null;
  }

  async getCurrentSnapshot(courseId: number): Promise<RiskSnapshotRecord | null> {
    const state = await this.getCourseState(courseId);
    return state?.currentSnapshotId ? this.getSnapshot(state.currentSnapshotId) : null;
  }

  async listCourseSnapshots(courseId: number): Promise<RiskSnapshotRecord[]> {
    return this.db
      .select()
      .from(riskSnapshot)
      .where(eq(riskSnapshot.courseId, courseId))
      .orderBy(asc(riskSnapshot.computedAt));
  }

  async listStudentHistory(courseId: number, studentId: number): Promise<StudentRiskHistoryRecord[]> {
    return this.db
      .select()
      .from(studentRiskHistory)
      .where(
        and(
          eq(studentRiskHistory.courseId, courseId),
          eq(studentRiskHistory.studentId, studentId)
        )
      )
      .orderBy(asc(studentRiskHistory.dataAsOf), asc(studentRiskHistory.createdAt));
  }
}
