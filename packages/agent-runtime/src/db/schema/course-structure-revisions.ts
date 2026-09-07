import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pocRun } from "./runs.js";

export type CourseStructureValidationStatus = "valid" | "invalid";

export const courseStructureRevision = pgTable(
  "course_structure_revisions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => pocRun.runId, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>().notNull(),
    teacherConstraintsJson: jsonb("teacher_constraints_json").$type<Record<string, unknown>>().notNull(),
    validationStatus: varchar("validation_status", { length: 16 })
      .$type<CourseStructureValidationStatus>()
      .notNull(),
    validationErrors: jsonb("validation_errors"),
    sealedAt: timestamp("sealed_at", { withTimezone: true, mode: "string" }),
    sealedByMoodleUserId: integer("sealed_by_moodle_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("course_structure_revisions_run_revision_unique").on(table.runId, table.revision),
    uniqueIndex("course_structure_revisions_one_sealed_run_unique")
      .on(table.runId)
      .where(sql`${table.sealedAt} is not null`),
  ],
);

export type CourseStructureRevisionRecord = typeof courseStructureRevision.$inferSelect;
export type NewCourseStructureRevisionRecord = typeof courseStructureRevision.$inferInsert;
