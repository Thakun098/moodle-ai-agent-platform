import {
  foreignKey,
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { pocPlan } from "./plans.js";
import { pocRun } from "./runs.js";

export type PocExecutionTargetType =
  | "course"
  | "section"
  | "assignment"
  | "quiz"
  | "question"
  | "resource";

export const pocExecutionMapping = pgTable(
  "poc_execution_mapping",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => pocRun.runId, { onDelete: "cascade" }),
    planId: varchar("plan_id", { length: 36 }).notNull(),
    revision: integer("revision").notNull(),
    localRef: varchar("local_ref", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 })
      .$type<PocExecutionTargetType>()
      .notNull(),
    moodleId: integer("moodle_id").notNull(),
    moodleMetadata: jsonb("moodle_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("poc_execution_mapping_run_plan_rev_local_unique").on(
      table.runId,
      table.planId,
      table.revision,
      table.localRef
    ),
    foreignKey({
      columns: [table.planId, table.revision],
      foreignColumns: [pocPlan.planId, pocPlan.revision],
      name: "poc_execution_mapping_plan_fk",
    }).onDelete("cascade"),
  ]
);

export type PocExecutionMappingRecord = typeof pocExecutionMapping.$inferSelect;
export type NewPocExecutionMappingRecord = typeof pocExecutionMapping.$inferInsert;
