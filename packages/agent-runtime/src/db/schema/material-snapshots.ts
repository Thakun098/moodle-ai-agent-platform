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

export const materialSnapshot = pgTable(
  "material_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => pocRun.runId, { onDelete: "cascade" }),
    structureRevision: integer("structure_revision").notNull(),
    sectionRef: varchar("section_ref", { length: 128 }).notNull(),
    revision: integer("revision").notNull(),
    filesJson: jsonb("files_json").$type<unknown[]>().notNull(),
    extractorVersion: varchar("extractor_version", { length: 64 }).notNull(),
    normalizedText: text("normalized_text").notNull(),
    normalizedTextHash: varchar("normalized_text_hash", { length: 64 }).notNull(),
    estimatedTokens: integer("estimated_tokens").notNull(),
    createdByMoodleUserId: integer("created_by_moodle_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("material_snapshots_run_structure_section_revision_unique").on(table.runId, table.structureRevision, table.sectionRef, table.revision),
  ],
);

export type MaterialSnapshotRecord = typeof materialSnapshot.$inferSelect;
export type NewMaterialSnapshotRecord = typeof materialSnapshot.$inferInsert;
