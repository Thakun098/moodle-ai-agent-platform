import {
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { pocPlan } from "./plans.js";
import { pocRun } from "./runs.js";

export type PocIdempotencyStatus = "in_flight" | "completed" | "failed" | "uncertain";

export const pocIdempotencyKey = pgTable(
  "poc_idempotency_key",
  {
    idempotencyKey: varchar("idempotency_key", { length: 255 }).primaryKey(),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => pocRun.runId, { onDelete: "cascade" }),
    planId: varchar("plan_id", { length: 36 }).notNull(),
    revision: integer("revision").notNull(),
    localRef: varchar("local_ref", { length: 64 }).notNull(),
    toolName: varchar("tool_name", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<PocIdempotencyStatus>()
      .notNull(),
    resultPayload: jsonb("result_payload"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      columns: [table.planId, table.revision],
      foreignColumns: [pocPlan.planId, pocPlan.revision],
      name: "poc_idempotency_key_plan_fk",
    }).onDelete("cascade"),
  ]
);

export type PocIdempotencyKeyRecord = typeof pocIdempotencyKey.$inferSelect;
export type NewPocIdempotencyKeyRecord = typeof pocIdempotencyKey.$inferInsert;
