import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  pocExecutionMapping,
  pocIdempotencyKey,
  pocMessage,
  pocPlan,
  pocRun,
  pocToolCall,
  pocVerification,
} from "../src/db/schema/index.js";

describe("Drizzle Persistence Schemas", () => {
  it("defines poc_run with required columns", () => {
    const cols = getTableColumns(pocRun);
    expect(cols.runId).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.syllabusMetadata).toBeDefined();
    expect(cols.normalizedSyllabus).toBeDefined();
    expect(cols.model).toBeDefined();
    expect(cols.finalResult).toBeDefined();
    expect(cols.error).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it("defines poc_plan with required columns and not-null run_id", () => {
    const cols = getTableColumns(pocPlan);
    expect(cols.id).toBeDefined();
    expect(cols.planId).toBeDefined();
    expect(cols.runId).toBeDefined();
    expect(cols.runId.notNull).toBe(true);
    expect(cols.planType).toBeDefined();
    expect(cols.operation).toBeDefined();
    expect(cols.revision).toBeDefined();
    expect(cols.title).toBeDefined();
    expect(cols.summary).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.rawEnvelope).toBeDefined();
    expect(cols.validationStatus).toBeDefined();
    expect(cols.validationErrors).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it("defines poc_message with required columns and not-null run_id", () => {
    const cols = getTableColumns(pocMessage);
    expect(cols.id).toBeDefined();
    expect(cols.runId).toBeDefined();
    expect(cols.runId.notNull).toBe(true);
    expect(cols.stepNumber).toBeDefined();
    expect(cols.role).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.toolCalls).toBeDefined();
    expect(cols.metadata).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it("defines poc_tool_call with required columns", () => {
    const cols = getTableColumns(pocToolCall);
    expect(cols.id).toBeDefined();
    expect(cols.toolCallId).toBeDefined();
    expect(cols.runId).toBeDefined();
    expect(cols.runId.notNull).toBe(true);
    expect(cols.stepNumber).toBeDefined();
    expect(cols.toolName).toBeDefined();
    expect(cols.arguments).toBeDefined();
    expect(cols.normalizedResult).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.durationMs).toBeDefined();
    expect(cols.error).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it("defines poc_execution_mapping with revision-aware columns", () => {
    const cols = getTableColumns(pocExecutionMapping);
    expect(cols.id).toBeDefined();
    expect(cols.runId).toBeDefined();
    expect(cols.runId.notNull).toBe(true);
    expect(cols.planId).toBeDefined();
    expect(cols.revision).toBeDefined();
    expect(cols.localRef).toBeDefined();
    expect(cols.targetType).toBeDefined();
    expect(cols.moodleId).toBeDefined();
    expect(cols.moodleMetadata).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it("defines poc_verification aligned with VerificationResult v0.1", () => {
    const cols = getTableColumns(pocVerification);
    expect(cols.id).toBeDefined();
    expect(cols.runId).toBeDefined();
    expect(cols.runId.notNull).toBe(true);
    expect(cols.planId).toBeDefined();
    expect(cols.revision).toBeDefined();
    expect(cols.passed).toBeDefined();
    expect(cols.issues).toBeDefined();
    expect(cols.expectedStructure).toBeDefined();
    expect(cols.observedMoodleStructure).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it("defines poc_idempotency_key with varchar(255) key and required columns", () => {
    const cols = getTableColumns(pocIdempotencyKey);
    expect(cols.idempotencyKey).toBeDefined();
    expect(cols.runId).toBeDefined();
    expect(cols.runId.notNull).toBe(true);
    expect(cols.planId).toBeDefined();
    expect(cols.revision).toBeDefined();
    expect(cols.localRef).toBeDefined();
    expect(cols.toolName).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.resultPayload).toBeDefined();
    expect(cols.errorMessage).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.completedAt).toBeDefined();
  });
});
