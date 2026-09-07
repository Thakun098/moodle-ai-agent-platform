CREATE TABLE "material_snapshots" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"structure_revision" integer NOT NULL,
	"section_ref" varchar(128) NOT NULL,
	"revision" integer NOT NULL,
	"files_json" jsonb NOT NULL,
	"extractor_version" varchar(64) NOT NULL,
	"normalized_text" text NOT NULL,
	"normalized_text_hash" varchar(64) NOT NULL,
	"estimated_tokens" integer NOT NULL,
	"created_by_moodle_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_snapshots_run_section_revision_unique" UNIQUE("run_id", "section_ref", "revision")
);
--> statement-breakpoint
ALTER TABLE "material_snapshots"
	ADD CONSTRAINT "material_snapshots_run_id_poc_run_run_id_fk"
	FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id")
	ON DELETE cascade ON UPDATE no action;
