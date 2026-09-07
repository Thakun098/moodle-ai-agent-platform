CREATE TABLE "poc_run" (
	"run_id" varchar(36) PRIMARY KEY NOT NULL,
	"status" varchar(32) NOT NULL,
	"syllabus_metadata" jsonb,
	"model" varchar(64) NOT NULL,
	"final_result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poc_plan" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"plan_id" varchar(36) NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"plan_type" varchar(32) NOT NULL,
	"operation" varchar(32) NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"content" jsonb NOT NULL,
	"raw_envelope" jsonb NOT NULL,
	"validation_status" varchar(16) NOT NULL,
	"validation_errors" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poc_plan_plan_id_revision_unique" UNIQUE("plan_id","revision")
);
--> statement-breakpoint
CREATE TABLE "poc_message" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"step_number" integer NOT NULL,
	"role" varchar(32) NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poc_tool_call" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tool_call_id" varchar(64) NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"step_number" integer NOT NULL,
	"tool_name" varchar(64) NOT NULL,
	"arguments" jsonb NOT NULL,
	"normalized_result" jsonb,
	"status" varchar(32) NOT NULL,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poc_tool_call_tool_call_id_unique" UNIQUE("tool_call_id")
);
--> statement-breakpoint
CREATE TABLE "poc_execution_mapping" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"plan_id" varchar(36) NOT NULL,
	"revision" integer NOT NULL,
	"local_ref" varchar(64) NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"moodle_id" integer NOT NULL,
	"moodle_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poc_execution_mapping_run_plan_rev_local_unique" UNIQUE("run_id","plan_id","revision","local_ref")
);
--> statement-breakpoint
CREATE TABLE "poc_verification" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"plan_id" varchar(36) NOT NULL,
	"revision" integer NOT NULL,
	"passed" boolean NOT NULL,
	"issues" jsonb NOT NULL,
	"expected_structure" jsonb,
	"observed_moodle_structure" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poc_idempotency_key" (
	"idempotency_key" varchar(255) PRIMARY KEY NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"plan_id" varchar(36) NOT NULL,
	"revision" integer NOT NULL,
	"local_ref" varchar(64) NOT NULL,
	"tool_name" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"result_payload" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "poc_plan" ADD CONSTRAINT "poc_plan_run_id_poc_run_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poc_message" ADD CONSTRAINT "poc_message_run_id_poc_run_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poc_tool_call" ADD CONSTRAINT "poc_tool_call_run_id_poc_run_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poc_execution_mapping" ADD CONSTRAINT "poc_execution_mapping_run_id_poc_run_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poc_execution_mapping" ADD CONSTRAINT "poc_execution_mapping_plan_fk" FOREIGN KEY ("plan_id","revision") REFERENCES "public"."poc_plan"("plan_id","revision") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poc_verification" ADD CONSTRAINT "poc_verification_run_id_poc_run_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poc_verification" ADD CONSTRAINT "poc_verification_plan_fk" FOREIGN KEY ("plan_id","revision") REFERENCES "public"."poc_plan"("plan_id","revision") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poc_idempotency_key" ADD CONSTRAINT "poc_idempotency_key_run_id_poc_run_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."poc_run"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poc_idempotency_key" ADD CONSTRAINT "poc_idempotency_key_plan_fk" FOREIGN KEY ("plan_id","revision") REFERENCES "public"."poc_plan"("plan_id","revision") ON DELETE cascade ON UPDATE no action;
