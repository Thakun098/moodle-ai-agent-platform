import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";

export type MaterialSectionStatus = "fallback" | "ready" | "failed";

export const materialSectionState = pgTable(
  "material_section_states",
  {
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => pocRun.runId, { onDelete: "cascade" }),
    structureRevision: integer("structure_revision").notNull(),
    sectionRef: varchar("section_ref", { length: 128 }).notNull(),
    status: varchar("status", { length: 16 }).$type<MaterialSectionStatus>().notNull(),
    snapshotId: varchar("snapshot_id", { length: 36 }),
    snapshotRevision: integer("snapshot_revision"),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.structureRevision, table.sectionRef] }),
  ],
);

export type MaterialSectionStateRecord = typeof materialSectionState.$inferSelect;
