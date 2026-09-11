import { integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import type { RiskRefreshOrigin } from "./risk-snapshots.js";

export type RiskRefreshAttemptStatus = "SUCCESS" | "FAILED";

export const courseRiskState = pgTable("course_risk_state", {
  courseId: integer("course_id").primaryKey(),
  currentSnapshotId: varchar("current_snapshot_id", { length: 36 }),
  previousSnapshotId: varchar("previous_snapshot_id", { length: 36 }),
  lastSuccessfulRefreshAt: timestamp("last_successful_refresh_at", { withTimezone: true, mode: "string" }),
  lastRefreshAttemptAt: timestamp("last_refresh_attempt_at", { withTimezone: true, mode: "string" }).notNull(),
  lastRefreshStatus: varchar("last_refresh_status", { length: 16 }).$type<RiskRefreshAttemptStatus>().notNull(),
  lastRefreshOrigin: varchar("last_refresh_origin", { length: 16 }).$type<RiskRefreshOrigin>().notNull(),
  lastRefreshAttemptId: varchar("last_refresh_attempt_id", { length: 36 }).notNull(),
  lastRefreshError: text("last_refresh_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export type CourseRiskStateRecord = typeof courseRiskState.$inferSelect;
export type NewCourseRiskStateRecord = typeof courseRiskState.$inferInsert;
