CREATE TABLE "risk_change_events" (
  "event_id" varchar(80) PRIMARY KEY NOT NULL,
  "course_id" integer NOT NULL,
  "student_id" integer,
  "scope" varchar(16) NOT NULL,
  "from_snapshot_id" varchar(36),
  "to_snapshot_id" varchar(36) NOT NULL,
  "material" boolean NOT NULL,
  "change_origin" varchar(24) NOT NULL,
  "reasons" jsonb NOT NULL,
  "source_changes" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "risk_change_events_course_created_idx" ON "risk_change_events" USING btree ("course_id", "created_at");
--> statement-breakpoint
CREATE INDEX "risk_change_events_student_created_idx" ON "risk_change_events" USING btree ("course_id", "student_id", "created_at");
--> statement-breakpoint
CREATE INDEX "risk_change_events_to_snapshot_idx" ON "risk_change_events" USING btree ("to_snapshot_id");
