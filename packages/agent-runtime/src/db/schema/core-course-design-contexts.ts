import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { integer, jsonb, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";
export const coreCourseDesignContexts = pgTable("core_course_design_contexts", {
  runId: varchar("run_id", { length: 36 }).notNull().references(() => pocRun.runId, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  context: jsonb("context").$type<CoreCourseDesignContext>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.runId, table.revision] })]);
