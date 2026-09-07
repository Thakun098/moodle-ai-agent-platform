import type { AnyPlanEnvelope } from "@moodle-agent-poc/contracts";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";

export type PocPlanValidationStatus = "valid" | "invalid";

export const pocPlan = pgTable(
  "poc_plan",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    planId: varchar("plan_id", { length: 36 }).notNull(),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => pocRun.runId, { onDelete: "cascade" }),
    planType: varchar("plan_type", { length: 32 }).notNull(),
    operation: varchar("operation", { length: 32 }).notNull(),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    content: jsonb("content").notNull(),
    rawEnvelope: jsonb("raw_envelope").$type<AnyPlanEnvelope>().notNull(),
    validationStatus: varchar("validation_status", { length: 16 })
      .$type<PocPlanValidationStatus>()
      .notNull(),
    validationErrors: jsonb("validation_errors"),
    reviewRequirements: jsonb("review_requirements").$type<Array<{ code: string; activity_ref?: string }>>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("poc_plan_plan_id_revision_unique").on(table.planId, table.revision),
  ]
);

export type PocPlanRecord = typeof pocPlan.$inferSelect;
export type NewPocPlanRecord = typeof pocPlan.$inferInsert;
