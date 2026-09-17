import { primaryKey, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";
import { pocRun } from "./runs.js";

export type OutcomeReviewItemType = "LO" | "CLO";
export type OutcomeReviewStatus = "PENDING_REVIEW" | "REVIEWED" | "NEEDS_REVISION";

export const outcomeReviewStates = pgTable("outcome_review_states", {
  runId: varchar("run_id", { length: 36 }).notNull().references(() => pocRun.runId, { onDelete: "cascade" }),
  itemType: varchar("item_type", { length: 8 }).$type<OutcomeReviewItemType>().notNull(),
  itemId: varchar("item_id", { length: 160 }).notNull(),
  status: varchar("status", { length: 32 }).$type<OutcomeReviewStatus>().notNull(),
  draftText: text("draft_text"),
  updatedByMoodleUserId: varchar("updated_by_moodle_user_id", { length: 64 }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.runId, table.itemType, table.itemId] })]);

export type OutcomeReviewStateRecord = typeof outcomeReviewStates.$inferSelect;
export type NewOutcomeReviewStateRecord = typeof outcomeReviewStates.$inferInsert;
