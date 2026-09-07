import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";

export type PocMessageRole = "system" | "user" | "assistant" | "tool";

export const pocMessage = pgTable("poc_message", {
  id: varchar("id", { length: 36 }).primaryKey(),
  runId: varchar("run_id", { length: 36 })
    .notNull()
    .references(() => pocRun.runId, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  role: varchar("role", { length: 32 }).$type<PocMessageRole>().notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export type PocMessageRecord = typeof pocMessage.$inferSelect;
export type NewPocMessageRecord = typeof pocMessage.$inferInsert;
