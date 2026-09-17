ALTER TABLE "poc_activity_intent"
  ADD COLUMN "content_provenance" text,
  ADD COLUMN "activity_revision" integer NOT NULL DEFAULT 0,
  ADD COLUMN "source_generation_revision" integer;

CREATE TABLE "poc_activity_revision" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "activity_intent_id" varchar(36) NOT NULL,
  "revision" integer NOT NULL,
  "provenance" text NOT NULL,
  "source_generation_revision" integer,
  "intent_revision" integer NOT NULL,
  "context_revision" integer,
  "learner_context_revision" integer,
  "grounding_mode" text,
  "material_snapshot_id" varchar(36),
  "content_json" jsonb NOT NULL,
  "quality_review_json" jsonb,
  "generation_metadata_json" jsonb,
  "edited_by_moodle_user_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "activity_revision_number_unique" UNIQUE("activity_intent_id", "revision")
);

ALTER TABLE "poc_activity_revision"
  ADD CONSTRAINT "poc_activity_revision_activity_intent_id_poc_activity_intent_id_fk"
  FOREIGN KEY ("activity_intent_id") REFERENCES "public"."poc_activity_intent"("id") ON DELETE cascade ON UPDATE no action;
