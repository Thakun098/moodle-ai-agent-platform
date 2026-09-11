import { boolean, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export type RiskChangeOrigin = "LEARNING_EVENT" | "SOURCE_CORRECTION" | "POLICY_CHANGE" | "UNKNOWN";
export type RiskChangeScope = "COURSE" | "STUDENT";

export const riskChangeEvent = pgTable("risk_change_events", {
  eventId: varchar("event_id", { length: 80 }).primaryKey(),
  courseId: integer("course_id").notNull(),
  studentId: integer("student_id"),
  scope: varchar("scope", { length: 16 }).$type<RiskChangeScope>().notNull(),
  fromSnapshotId: varchar("from_snapshot_id", { length: 36 }),
  toSnapshotId: varchar("to_snapshot_id", { length: 36 }).notNull(),
  material: boolean("material").notNull(),
  changeOrigin: varchar("change_origin", { length: 24 }).$type<RiskChangeOrigin>().notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull(),
  sourceChanges: jsonb("source_changes").$type<Record<string, unknown>[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export type RiskChangeEventRecord = typeof riskChangeEvent.$inferSelect;
export type NewRiskChangeEventRecord = typeof riskChangeEvent.$inferInsert;
