CREATE TABLE "core_course_design_contexts" (
  "run_id" varchar(36) NOT NULL REFERENCES "poc_run"("run_id") ON DELETE CASCADE,
  "revision" integer NOT NULL CHECK (revision > 0),
  "context" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("run_id", "revision"),
  CHECK ("context"->>'run_id' = "run_id"),
  CHECK (("context"->>'revision')::integer = "revision")
);
