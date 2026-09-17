CREATE TABLE IF NOT EXISTS "outcome_review_states" (
  "run_id" varchar(36) NOT NULL,
  "item_type" varchar(8) NOT NULL,
  "item_id" varchar(160) NOT NULL,
  "status" varchar(32) NOT NULL,
  "draft_text" text,
  "updated_by_moodle_user_id" varchar(64),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "outcome_review_states_run_id_item_type_item_id_pk" PRIMARY KEY("run_id", "item_type", "item_id"),
  CONSTRAINT "outcome_review_states_run_id_poc_run_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "outcome_review_states_item_type_check" CHECK ("item_type" IN ('LO', 'CLO')),
  CONSTRAINT "outcome_review_states_status_check" CHECK ("status" IN ('PENDING_REVIEW', 'REVIEWED', 'NEEDS_REVISION'))
);
