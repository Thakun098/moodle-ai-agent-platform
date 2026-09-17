ALTER TABLE "poc_activity_intent"
  ADD COLUMN "intent_revision" integer NOT NULL DEFAULT 1,
  ADD COLUMN "purpose" text NOT NULL DEFAULT 'PRACTICE' CHECK (purpose IN ('PRACTICE','FORMATIVE','SUMMATIVE')),
  ADD COLUMN "selected_objective_ids_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "selected_outcome_ids_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "context_revision" integer,
  ADD COLUMN "learner_context_revision" integer,
  ADD COLUMN "learner_context_acknowledged" boolean NOT NULL DEFAULT false,
  ADD COLUMN "alignment_override_json" jsonb;

CREATE TABLE "poc_competency_candidate" (
  "id" varchar(36) PRIMARY KEY,
  "run_id" varchar(36) NOT NULL REFERENCES "poc_run"("run_id") ON DELETE CASCADE,
  "candidate_id" text NOT NULL,
  "revision" integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  "name" text NOT NULL,
  "description" text NOT NULL,
  "derived_from_outcome_ids_json" jsonb NOT NULL,
  "rationale" text NOT NULL,
  "source_refs_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','REJECTED','DEFERRED','UNALIGNED')),
  "teacher_override_json" jsonb,
  "edited_from_candidate_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "competency_candidate_run_candidate_unique" UNIQUE (run_id, candidate_id)
);