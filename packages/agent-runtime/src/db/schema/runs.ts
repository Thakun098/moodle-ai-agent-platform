import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export interface SyllabusMetadata {
  filename?: string;
  byte_size?: number;
  sha256?: string;
  hash?: string;
  media_type?: string;
  /** Teacher-authorized Moodle course format pinned when the run is created. */
  course_format?: string;
  /** Per-section teacher choice to publish the current material as a File Resource. */
  resource_publication?: Record<string, boolean>;
}

export type PocRunStatus =
  | "pending"
  | "planning"
  | "preview"
  | "executing"
  | "awaiting_verification"
  | "completed"
  | "failed";

export const pocRun = pgTable("poc_run", {
  runId: varchar("run_id", { length: 36 }).primaryKey(),
  status: varchar("status", { length: 32 }).$type<PocRunStatus>().notNull(),
  syllabusMetadata: jsonb("syllabus_metadata").$type<SyllabusMetadata>(),
  normalizedSyllabus: jsonb("normalized_syllabus").$type<NormalizedSyllabus>(),
  model: varchar("model", { length: 64 }).notNull(),
  finalResult: jsonb("final_result"),
  error: text("error"),
  approvedPlanId: varchar("approved_plan_id", { length: 36 }),
  approvedRevision: integer("approved_revision"),
  approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
  approvedByMoodleUserId: varchar("approved_by_moodle_user_id", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export type PocRunRecord = typeof pocRun.$inferSelect;
export type NewPocRunRecord = typeof pocRun.$inferInsert;
