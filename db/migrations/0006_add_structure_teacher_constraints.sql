ALTER TABLE "poc_run" ADD COLUMN IF NOT EXISTS "approved_plan_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "poc_run" ADD COLUMN IF NOT EXISTS "approved_revision" integer;
--> statement-breakpoint
ALTER TABLE "poc_run" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "poc_run" ADD COLUMN IF NOT EXISTS "approved_by_moodle_user_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "course_structure_revisions" ADD COLUMN IF NOT EXISTS "teacher_constraints_json" jsonb NOT NULL DEFAULT '{"activityRules":[],"warnings":[]}';
