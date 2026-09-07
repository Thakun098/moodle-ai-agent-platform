import { boolean, integer, jsonb, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";

export type ActivityIntentStatus = "selected" | "creating" | "generated" | "insufficient_evidence" | "failed" | "timed_out" | "retry_exhausted" | "shell" | "removed" | "stale";
export const activityIntent = pgTable("poc_activity_intent", {
  id: varchar("id", { length: 36 }).primaryKey(),
  runId: varchar("run_id", { length: 36 }).notNull().references(() => pocRun.runId, { onDelete: "cascade" }),
  structureRevision: integer("structure_revision").notNull(),
  sectionRef: text("section_ref").notNull(),
  activityRef: text("activity_ref").notNull(),
  activityType: text("activity_type").$type<"quiz" | "assignment">().notNull(),
  status: text("status").$type<ActivityIntentStatus>().notNull().default("selected"),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull(),
  optionsJson: jsonb("options_json").$type<Record<string, unknown>>().notNull(),
  groundingMode: text("grounding_mode"),
  materialSnapshotId: varchar("material_snapshot_id", { length: 36 }),
  reviewRequired: boolean("review_required").notNull().default(false),
  shellConfirmedAt: timestamp("shell_confirmed_at", { withTimezone: true, mode: "string" }),
  contentJson: jsonb("content_json").$type<Record<string, unknown>>(),
  generationInstruction: text("generation_instruction"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  unique("activity_intent_selection_unique").on(table.runId, table.structureRevision, table.sectionRef, table.activityType),
  unique("activity_intent_ref_unique").on(table.runId, table.structureRevision, table.activityRef),
]);
export type ActivityIntentRecord = typeof activityIntent.$inferSelect;
