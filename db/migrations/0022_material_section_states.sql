CREATE TABLE IF NOT EXISTS "material_section_states" (
  "run_id" varchar(36) NOT NULL,
  "structure_revision" integer NOT NULL,
  "section_ref" varchar(128) NOT NULL,
  "status" varchar(16) NOT NULL,
  "snapshot_id" varchar(36),
  "snapshot_revision" integer,
  "error_code" varchar(64),
  "error_message" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "material_section_states_run_structure_section_pk" PRIMARY KEY("run_id","structure_revision","section_ref"),
  CONSTRAINT "material_section_states_run_id_poc_run_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "material_section_states_status_check" CHECK ("status" IN ('fallback','ready','failed'))
);

UPDATE "poc_activity_intent"
SET "attempt_count" = 0
WHERE "status" = 'stale' AND "attempt_count" <> 0;
