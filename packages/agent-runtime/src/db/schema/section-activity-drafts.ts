import { integer, jsonb, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";

export type SectionActivityDraftStatus = "generated" | "stale";

export const sectionActivityDraft = pgTable(
  "section_activity_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 }).notNull().references(() => pocRun.runId, { onDelete: "cascade" }),
    structureRevision: integer("structure_revision").notNull(),
    sectionRef: varchar("section_ref", { length: 128 }).notNull(),
    activityRef: varchar("activity_ref", { length: 128 }).notNull(),
    activityType: varchar("activity_type", { length: 32 }).notNull(),
    materialSnapshotId: varchar("material_snapshot_id", { length: 36 }).notNull(),
    generationInstruction: text("generation_instruction"),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 16 }).$type<SectionActivityDraftStatus>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [unique("section_activity_drafts_run_section_activity_unique").on(table.runId, table.sectionRef, table.activityRef)],
);

export type SectionActivityDraftRecord = typeof sectionActivityDraft.$inferSelect;
export type NewSectionActivityDraftRecord = typeof sectionActivityDraft.$inferInsert;
