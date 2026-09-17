import { boolean, integer, jsonb, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";

export type ActivityIntentStatus = "selected" | "creating" | "generated" | "insufficient_evidence" | "failed" | "timed_out" | "retry_exhausted" | "shell" | "removed" | "stale";
export type ActivityContentProvenance = "AI_GENERATED" | "TEACHER_EDITED" | null;

export const activityIntent = pgTable("poc_activity_intent", {
  id: varchar("id", { length: 36 }).primaryKey(),
  runId: varchar("run_id", { length: 36 }).notNull().references(() => pocRun.runId, { onDelete: "cascade" }),
  structureRevision: integer("structure_revision").notNull(),
  sectionRef: text("section_ref").notNull(),
  activityRef: text("activity_ref").notNull(),
  activityType: text("activity_type").$type<"quiz" | "assignment">().notNull(),
  status: text("status").$type<ActivityIntentStatus>().notNull().default("selected"),
  intentRevision: integer("intent_revision").notNull().default(1),
  purpose: text("purpose").$type<"PRACTICE" | "FORMATIVE" | "SUMMATIVE">().notNull().default("PRACTICE"),
  selectedObjectiveIdsJson: jsonb("selected_objective_ids_json").$type<string[]>().notNull().default([]),
  selectedOutcomeIdsJson: jsonb("selected_outcome_ids_json").$type<string[]>().notNull().default([]),
  contextRevision: integer("context_revision"),
  learnerContextRevision: integer("learner_context_revision"),
  learnerContextAcknowledged: boolean("learner_context_acknowledged").notNull().default(false),
  alignmentOverrideJson: jsonb("alignment_override_json").$type<Record<string, unknown> | null>(),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull(),
  optionsJson: jsonb("options_json").$type<Record<string, unknown>>().notNull(),
  groundingMode: text("grounding_mode"),
  materialSnapshotId: varchar("material_snapshot_id", { length: 36 }),
  reviewRequired: boolean("review_required").notNull().default(false),
  shellConfirmedAt: timestamp("shell_confirmed_at", { withTimezone: true, mode: "string" }),
  contentJson: jsonb("content_json").$type<Record<string, unknown>>(),
  contentProvenance: text("content_provenance").$type<ActivityContentProvenance>(),
  activityRevision: integer("activity_revision").notNull().default(0),
  sourceGenerationRevision: integer("source_generation_revision"),
  generationInstruction: text("generation_instruction"),
  qualityReviewJson: jsonb("quality_review_json").$type<Record<string, unknown> | null>(),
  generationMetadataJson: jsonb("generation_metadata_json").$type<Record<string, unknown> | null>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  unique("activity_intent_selection_unique").on(table.runId, table.structureRevision, table.sectionRef, table.activityType),
  unique("activity_intent_ref_unique").on(table.runId, table.structureRevision, table.activityRef),
]);
export type ActivityIntentRecord = typeof activityIntent.$inferSelect;
