import type { VerificationIssue } from "@moodle-agent-poc/contracts";
import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { pocPlan } from "./plans.js";
import { pocRun } from "./runs.js";

export const pocVerification = pgTable(
  "poc_verification",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => pocRun.runId, { onDelete: "cascade" }),
    planId: varchar("plan_id", { length: 36 }).notNull(),
    revision: integer("revision").notNull(),
    passed: boolean("passed").notNull(),
    issues: jsonb("issues").$type<VerificationIssue[]>().notNull(),
    expectedStructure: jsonb("expected_structure"),
    observedMoodleStructure: jsonb("observed_moodle_structure"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.planId, table.revision],
      foreignColumns: [pocPlan.planId, pocPlan.revision],
      name: "poc_verification_plan_fk",
    }).onDelete("cascade"),
  ]
);

export type PocVerificationRecord = typeof pocVerification.$inferSelect;
export type NewPocVerificationRecord = typeof pocVerification.$inferInsert;
