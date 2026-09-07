import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";

export type PocToolCallStatus = "success" | "error" | "timeout";

export const pocToolCall = pgTable("poc_tool_call", {
  id: varchar("id", { length: 36 }).primaryKey(),
  toolCallId: varchar("tool_call_id", { length: 64 }).notNull().unique(),
  runId: varchar("run_id", { length: 36 })
    .notNull()
    .references(() => pocRun.runId, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  toolName: varchar("tool_name", { length: 64 }).notNull(),
  arguments: jsonb("arguments").notNull(),
  normalizedResult: jsonb("normalized_result"),
  status: varchar("status", { length: 32 }).$type<PocToolCallStatus>().notNull(),
  durationMs: integer("duration_ms"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export type PocToolCallRecord = typeof pocToolCall.$inferSelect;
export type NewPocToolCallRecord = typeof pocToolCall.$inferInsert;
