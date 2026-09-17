import { foreignKey, integer, jsonb, pgTable, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import type { CompetencyExecutionSnapshot } from "../../competency-execution.js";
import { pocPlan } from "./plans.js";
import { pocRun } from "./runs.js";

export const competencyExecutionSnapshot = pgTable("poc_competency_execution_snapshot", {
  id: varchar("id", { length: 36 }).primaryKey(),
  runId: varchar("run_id", { length: 36 }).notNull().references(() => pocRun.runId, { onDelete: "cascade" }),
  planId: varchar("plan_id", { length: 36 }).notNull(),
  revision: integer("revision").notNull(),
  mappingReviewRevision: integer("mapping_review_revision").notNull(),
  snapshotJson: jsonb("snapshot_json").$type<CompetencyExecutionSnapshot>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  unique("poc_competency_execution_snapshot_run_plan_rev_unique").on(table.runId, table.planId, table.revision),
  foreignKey({
    columns: [table.planId, table.revision],
    foreignColumns: [pocPlan.planId, pocPlan.revision],
    name: "poc_competency_execution_snapshot_plan_fk",
  }).onDelete("cascade"),
]);

export type CompetencyExecutionSnapshotRecord = typeof competencyExecutionSnapshot.$inferSelect;
