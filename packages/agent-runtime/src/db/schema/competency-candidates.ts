import type { CompetencyCandidateStatus } from "@moodle-agent-poc/contracts";
import { jsonb, integer, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";

export const competencyCandidate = pgTable("poc_competency_candidate", {
  id: varchar("id", { length: 36 }).primaryKey(),
  runId: varchar("run_id", { length: 36 }).notNull().references(() => pocRun.runId, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull(),
  revision: integer("revision").notNull().default(1),
  name: text("name").notNull(),
  description: text("description").notNull(),
  derivedFromOutcomeIdsJson: jsonb("derived_from_outcome_ids_json").$type<string[]>().notNull(),
  rationale: text("rationale").notNull(),
  sourceRefsJson: jsonb("source_refs_json").$type<unknown[]>().notNull().default([]),
  status: text("status").$type<CompetencyCandidateStatus>().notNull().default("PROPOSED"),
  teacherOverrideJson: jsonb("teacher_override_json").$type<Record<string, unknown> | null>(),
  editedFromCandidateId: text("edited_from_candidate_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [unique("competency_candidate_run_candidate_unique").on(table.runId, table.candidateId)]);

export type CompetencyCandidateRecord = typeof competencyCandidate.$inferSelect;
export type NewCompetencyCandidateRecord = typeof competencyCandidate.$inferInsert;