CREATE TABLE IF NOT EXISTS "risk_insights" (
  "insight_id" varchar(96) PRIMARY KEY NOT NULL,
  "course_id" integer NOT NULL,
  "student_id" integer,
  "scope" varchar(16) NOT NULL,
  "snapshot_id" varchar(36) NOT NULL,
  "risk_model_version" varchar(64) NOT NULL,
  "status" varchar(16) NOT NULL,
  "payload" jsonb NOT NULL,
  "stale_reason" varchar(160),
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "risk_insights_scope_snapshot_subject_uq" ON "risk_insights" USING btree ("course_id","scope","snapshot_id","student_id");
CREATE INDEX IF NOT EXISTS "risk_insights_course_status_idx" ON "risk_insights" USING btree ("course_id","status");
CREATE INDEX IF NOT EXISTS "risk_insights_student_status_idx" ON "risk_insights" USING btree ("course_id","student_id","status");
