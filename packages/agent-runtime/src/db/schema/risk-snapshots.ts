import { bigint, integer, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export type RiskRefreshOrigin = "MANUAL" | "NIGHTLY";
export type RiskSnapshotPublicationStatus = "PUBLISHED";

export const riskSnapshot = pgTable("risk_snapshots", {
  snapshotId: varchar("snapshot_id", { length: 36 }).primaryKey(),
  courseId: integer("course_id").notNull(),
  snapshotVersion: integer("snapshot_version").notNull().default(1),
  dataAsOf: bigint("data_as_of", { mode: "number" }).notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true, mode: "string" }).notNull(),
  riskModelVersion: varchar("risk_model_version", { length: 64 }).notNull(),
  refreshOrigin: varchar("refresh_origin", { length: 16 }).$type<RiskRefreshOrigin>().notNull(),
  publicationStatus: varchar("publication_status", { length: 16 })
    .$type<RiskSnapshotPublicationStatus>()
    .notNull()
    .default("PUBLISHED"),
  evidenceHash: varchar("evidence_hash", { length: 64 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export type RiskSnapshotRecord = typeof riskSnapshot.$inferSelect;
export type NewRiskSnapshotRecord = typeof riskSnapshot.$inferInsert;
