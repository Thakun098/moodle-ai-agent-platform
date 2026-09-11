CREATE TABLE "risk_snapshots" (
  "snapshot_id" varchar(36) PRIMARY KEY NOT NULL,
  "course_id" integer NOT NULL,
  "snapshot_version" integer DEFAULT 1 NOT NULL,
  "data_as_of" bigint NOT NULL,
  "computed_at" timestamp with time zone NOT NULL,
  "risk_model_version" varchar(64) NOT NULL,
  "refresh_origin" varchar(16) NOT NULL,
  "publication_status" varchar(16) DEFAULT 'PUBLISHED' NOT NULL,
  "evidence_hash" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "risk_snapshots_course_computed_idx" ON "risk_snapshots" USING btree ("course_id", "computed_at");
--> statement-breakpoint
CREATE TABLE "course_risk_state" (
  "course_id" integer PRIMARY KEY NOT NULL,
  "current_snapshot_id" varchar(36),
  "previous_snapshot_id" varchar(36),
  "last_successful_refresh_at" timestamp with time zone,
  "last_refresh_attempt_at" timestamp with time zone NOT NULL,
  "last_refresh_status" varchar(16) NOT NULL,
  "last_refresh_origin" varchar(16) NOT NULL,
  "last_refresh_attempt_id" varchar(36) NOT NULL,
  "last_refresh_error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_risk_history" (
  "history_id" varchar(80) PRIMARY KEY NOT NULL,
  "course_id" integer NOT NULL,
  "student_id" integer NOT NULL,
  "snapshot_id" varchar(36) NOT NULL,
  "data_as_of" bigint NOT NULL,
  "risk_model_version" varchar(64) NOT NULL,
  "evaluation_status" varchar(16) NOT NULL,
  "overall_risk" varchar(16),
  "progress_risk" varchar(16),
  "performance_risk" varchar(16),
  "competency_risk" varchar(16),
  "submission_risk" varchar(16),
  "dimension_metrics" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "student_risk_history_course_student_data_idx" ON "student_risk_history" USING btree ("course_id", "student_id", "data_as_of");
--> statement-breakpoint
CREATE INDEX "student_risk_history_snapshot_idx" ON "student_risk_history" USING btree ("snapshot_id");
