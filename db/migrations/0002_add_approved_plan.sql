ALTER TABLE "poc_run" ADD COLUMN "approved_plan_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "poc_run" ADD COLUMN "approved_revision" integer;
--> statement-breakpoint
ALTER TABLE "poc_run" ADD COLUMN "approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "poc_run" ADD COLUMN "approved_by_moodle_user_id" varchar(64);
