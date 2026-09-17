import { integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";

/** Planning-only decisions; never learner ratings or Moodle execution mappings. */
export const competencyMappingReview = pgTable("poc_competency_mapping_review", {
  runId: varchar("run_id", { length: 36 }).primaryKey().references(() => pocRun.runId, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(1),
  decisions: jsonb("decisions").$type<Record<string, unknown>[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});
