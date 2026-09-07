CREATE TABLE "section_activity_drafts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"structure_revision" integer NOT NULL,
	"section_ref" varchar(128) NOT NULL,
	"activity_ref" varchar(128) NOT NULL,
	"activity_type" varchar(32) NOT NULL,
	"material_snapshot_id" varchar(36) NOT NULL,
	"content_json" jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_activity_drafts_run_section_activity_unique" UNIQUE("run_id", "section_ref", "activity_ref")
);
--> statement-breakpoint
ALTER TABLE "section_activity_drafts"
	ADD CONSTRAINT "section_activity_drafts_run_id_poc_run_run_id_fk"
	FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id")
	ON DELETE cascade ON UPDATE no action;
