CREATE TABLE "course_structure_revisions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"content_json" jsonb NOT NULL,
	"validation_status" varchar(16) NOT NULL,
	"validation_errors" jsonb,
	"sealed_at" timestamp with time zone,
	"sealed_by_moodle_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_structure_revisions_run_revision_unique" UNIQUE("run_id", "revision")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "course_structure_revisions_one_sealed_run_unique"
	ON "course_structure_revisions" USING btree ("run_id")
	WHERE "sealed_at" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_structure_revisions"
	ADD CONSTRAINT "course_structure_revisions_run_id_poc_run_run_id_fk"
	FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id")
	ON DELETE cascade ON UPDATE no action;
