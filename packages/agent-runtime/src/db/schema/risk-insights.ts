import { integer, jsonb, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export type RiskInsightScope = "COURSE" | "STUDENT";
export type RiskInsightStatus = "VALID" | "STALE" | "REPAIRED" | "FALLBACK" | "BLOCKED";

export const riskInsight = pgTable("risk_insights", {
  insightId: varchar("insight_id", { length: 96 }).primaryKey(),
  courseId: integer("course_id").notNull(),
  studentId: integer("student_id"),
  scope: varchar("scope", { length: 16 }).$type<RiskInsightScope>().notNull(),
  snapshotId: varchar("snapshot_id", { length: 36 }).notNull(),
  riskModelVersion: varchar("risk_model_version", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).$type<RiskInsightStatus>().notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  staleReason: varchar("stale_reason", { length: 160 }),
  generatedAt: timestamp("generated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => ({
  scopeSnapshotSubjectUnique: uniqueIndex("risk_insights_scope_snapshot_subject_uq").on(
    table.courseId,
    table.scope,
    table.snapshotId,
    table.studentId
  ),
}));

export type RiskInsightRecord = typeof riskInsight.$inferSelect;
export type NewRiskInsightRecord = typeof riskInsight.$inferInsert;
