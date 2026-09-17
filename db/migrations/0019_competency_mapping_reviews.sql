CREATE TABLE "poc_competency_mapping_review" (
  "run_id" varchar(36) PRIMARY KEY REFERENCES "poc_run"("run_id") ON DELETE CASCADE,
  "revision" integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  "decisions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
