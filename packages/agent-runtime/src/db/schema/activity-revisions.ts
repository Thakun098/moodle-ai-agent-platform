import { integer, jsonb, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { activityIntent } from "./activity-intents.js";

export type ActivityRevisionProvenance = "AI_GENERATED" | "TEACHER_EDITED";

export const activityRevision = pgTable("poc_activity_revision", {
  id: varchar("id", { length: 36 }).primaryKey(),
  activityIntentId: varchar("activity_intent_id", { length: 36 }).notNull().references(() => activityIntent.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  provenance: text("provenance").$type<ActivityRevisionProvenance>().notNull(),
  sourceGenerationRevision: integer("source_generation_revision"),
  intentRevision: integer("intent_revision").notNull(),
  contextRevision: integer("context_revision"),
  learnerContextRevision: integer("learner_context_revision"),
  groundingMode: text("grounding_mode"),
  materialSnapshotId: varchar("material_snapshot_id", { length: 36 }),
  contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull(),
  qualityReviewJson: jsonb("quality_review_json").$type<Record<string, unknown> | null>(),
  generationMetadataJson: jsonb("generation_metadata_json").$type<Record<string, unknown> | null>(),
  editedByMoodleUserId: integer("edited_by_moodle_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  unique("activity_revision_number_unique").on(table.activityIntentId, table.revision),
]);

export type ActivityRevisionRecord = typeof activityRevision.$inferSelect;
