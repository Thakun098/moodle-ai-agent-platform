CREATE TABLE "poc_competency_execution_snapshot" (
  "id" varchar(36) PRIMARY KEY,
  "run_id" varchar(36) NOT NULL REFERENCES "poc_run"("run_id") ON DELETE CASCADE,
  "plan_id" varchar(36) NOT NULL,
  "revision" integer NOT NULL,
  "mapping_review_revision" integer NOT NULL,
  "snapshot_json" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "poc_competency_execution_snapshot_run_plan_rev_unique" UNIQUE("run_id", "plan_id", "revision"),
  CONSTRAINT "poc_competency_execution_snapshot_plan_fk" FOREIGN KEY ("plan_id", "revision") REFERENCES "poc_plan"("plan_id", "revision") ON DELETE CASCADE
);
