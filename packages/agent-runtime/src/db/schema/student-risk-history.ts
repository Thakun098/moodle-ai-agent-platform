import { bigint, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const studentRiskHistory = pgTable("student_risk_history", {
  historyId: varchar("history_id", { length: 80 }).primaryKey(),
  courseId: integer("course_id").notNull(),
  studentId: integer("student_id").notNull(),
  snapshotId: varchar("snapshot_id", { length: 36 }).notNull(),
  dataAsOf: bigint("data_as_of", { mode: "number" }).notNull(),
  riskModelVersion: varchar("risk_model_version", { length: 64 }).notNull(),
  evaluationStatus: varchar("evaluation_status", { length: 16 })
    .$type<"COMPLETE" | "INCOMPLETE">()
    .notNull(),
  overallRisk: varchar("overall_risk", { length: 16 }).$type<"LOW" | "MEDIUM" | "HIGH" | null>(),
  progressRisk: varchar("progress_risk", { length: 16 }).$type<"LOW" | "MEDIUM" | "HIGH" | null>(),
  performanceRisk: varchar("performance_risk", { length: 16 }).$type<"LOW" | "MEDIUM" | "HIGH" | null>(),
  competencyRisk: varchar("competency_risk", { length: 16 }).$type<"LOW" | "MEDIUM" | "HIGH" | null>(),
  submissionRisk: varchar("submission_risk", { length: 16 }).$type<"LOW" | "MEDIUM" | "HIGH" | null>(),
  dimensionMetrics: jsonb("dimension_metrics").$type<Record<string, Record<string, number | null>>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export type StudentRiskHistoryRecord = typeof studentRiskHistory.$inferSelect;
export type NewStudentRiskHistoryRecord = typeof studentRiskHistory.$inferInsert;
