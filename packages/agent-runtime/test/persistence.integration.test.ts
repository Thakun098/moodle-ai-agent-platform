import type { AnyPlanEnvelope, VerificationIssue } from "@moodle-agent-poc/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  createDbClient,
  type AppDatabase,
} from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { pocRun } from "../src/db/schema/runs.js";
import {
  buildIdempotencyKey,
  ExecutionMappingRepository,
  IdempotencyRepository,
  MaterialSnapshotRepository,
  SectionActivityDraftRepository,
  MessageRepository,
  PlanRepository,
  RunRepository,
  ToolCallRepository,
  VerificationRepository,
} from "../src/repositories/index.js";

function makeValidCoursePlanEnvelope(
  planId: string,
  revision = 1,
  title = "Introduction to Computer Science"
): AnyPlanEnvelope {
  return {
    schema_version: "0.1",
    plan_id: planId,
    revision,
    plan_type: "course",
    operation: "create",
    title,
    summary: "Comprehensive course plan covering fundamentals.",
    warnings: [],
    assumptions: [],
    content: {
      course: {
        title,
        summary: "Course overview and learning goals.",
      },
      sections: [
        {
          ref: "section-01",
          position: 1,
          title: "Week 1: Fundamentals",
          summary: "Overview of core concepts.",
          source_refs: [],
          activities: [],
        },
      ],
    },
  };
}

describe("Persistence Integration Tests (Real PostgreSQL)", () => {
  const testDbUrl =
    process.env.DATABASE_URL ||
    "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:5432/moodle_agent_poc";

  let db: AppDatabase;
  let pool: any;
  let runRepo: RunRepository;
  let planRepo: PlanRepository;
  let messageRepo: MessageRepository;
  let toolCallRepo: ToolCallRepository;
  let mappingRepo: ExecutionMappingRepository;
  let verificationRepo: VerificationRepository;
  let idempotencyRepo: IdempotencyRepository;
  let materialSnapshotRepo: MaterialSnapshotRepository;
  let sectionActivityDraftRepo: SectionActivityDraftRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDbUrl;
    await runMigrations(testDbUrl);
    const client = createDbClient(testDbUrl);
    db = client.db;
    pool = client.pool;

    runRepo = new RunRepository(db);
    planRepo = new PlanRepository(db);
    messageRepo = new MessageRepository(db);
    toolCallRepo = new ToolCallRepository(db);
    mappingRepo = new ExecutionMappingRepository(db);
    verificationRepo = new VerificationRepository(db);
    idempotencyRepo = new IdempotencyRepository(db);
    materialSnapshotRepo = new MaterialSnapshotRepository(db);
    sectionActivityDraftRepo = new SectionActivityDraftRepository(db);
  });

  afterAll(async () => {
    await closeDatabase();
    if (pool) {
      await pool.end();
    }
  });

  const testRunId = "11111111-1111-4111-8111-111111111111";
  const testPlanId = "22222222-2222-4222-8222-222222222222";

  beforeEach(async () => {
    // Clean up test records
    await db.delete(pocRun).where(eq(pocRun.runId, testRunId));
  });

  it("handles complete run lifecycle (create, read, update, complete, fail)", async () => {
    const created = await runRepo.createRun({
      runId: testRunId,
      model: "gemma",
      status: "pending",
      syllabusMetadata: {
        filename: "syllabus.md",
        byte_size: 1024,
        hash: "abc123hash",
      },
    });

    expect(created.runId).toBe(testRunId);
    expect(created.status).toBe("pending");
    expect(created.model).toBe("gemma");
    expect(created.syllabusMetadata?.filename).toBe("syllabus.md");

    const fetched = await runRepo.getRun(testRunId);
    expect(fetched).not.toBeNull();
    expect(fetched?.runId).toBe(testRunId);

    const updated = await runRepo.updateStatus(testRunId, "executing");
    expect(updated.status).toBe("executing");

    const completed = await runRepo.completeRun(testRunId, {
      courseId: 101,
      url: "http://localhost:8000/course/view.php?id=101",
    });
    expect(completed.status).toBe("completed");
    expect(completed.finalResult).toEqual({
      courseId: 101,
      url: "http://localhost:8000/course/view.php?id=101",
    });

    const failed = await runRepo.failRun(testRunId, "Test error message");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("Test error message");
  });

  describe("PlanRepository & Decision A3 Valid-State Guard", () => {
    it("persists valid planning contract with validation_status='valid'", async () => {
      await runRepo.createRun({
        runId: testRunId,
        model: "gemma",
      });

      const validEnvelope = makeValidCoursePlanEnvelope(testPlanId, 1);

      const saved = await planRepo.savePlanRevision({
        id: "plan-rec-01",
        planId: testPlanId,
        runId: testRunId,
        planType: "course",
        operation: "create",
        revision: 1,
        title: validEnvelope.title,
        summary: validEnvelope.summary,
        content: validEnvelope.content as Record<string, unknown>,
        rawEnvelope: validEnvelope,
        validationStatus: "valid",
      });

      expect(saved.revision).toBe(1);
      expect(saved.validationStatus).toBe("valid");

      const fetched = await planRepo.getPlanRevision(testPlanId, 1);
      expect(fetched?.title).toBe("Introduction to Computer Science");
    });

    it("rejects saving invalid planning contract when validation_status='valid'", async () => {
      await runRepo.createRun({
        runId: testRunId,
        model: "gemma",
      });

      const invalidEnvelope: any = {
        schema_version: "0.1",
        plan_id: testPlanId,
        revision: 1,
        plan_type: "course",
        operation: "create",
        title: "", // Blank title is invalid per schema
        summary: "Invalid plan",
        warnings: [],
        assumptions: [],
        content: { course: {} },
      };

      await expect(
        planRepo.savePlanRevision({
          id: "plan-rec-inv-01",
          planId: testPlanId,
          runId: testRunId,
          planType: "course",
          operation: "create",
          revision: 1,
          title: "Invalid",
          summary: "Invalid",
          content: {},
          rawEnvelope: invalidEnvelope,
          validationStatus: "valid",
        })
      ).rejects.toThrow(/Planning contract schema validation failed/);
    });

    it("allows persisting invalid plan when validation_status='invalid' for debugging", async () => {
      await runRepo.createRun({
        runId: testRunId,
        model: "gemma",
      });

      const invalidEnvelope: any = {
        schema_version: "0.1",
        plan_id: testPlanId,
        revision: 1,
        plan_type: "course",
        operation: "create",
        title: "",
        summary: "Invalid plan",
        warnings: [],
        assumptions: [],
        content: {},
      };

      const saved = await planRepo.savePlanRevision({
        id: "plan-rec-inv-02",
        planId: testPlanId,
        runId: testRunId,
        planType: "course",
        operation: "create",
        revision: 1,
        title: "Invalid draft",
        summary: "Draft for debugging",
        content: {},
        rawEnvelope: invalidEnvelope,
        validationStatus: "invalid",
        validationErrors: [{ message: "Title cannot be empty" }],
      });

      expect(saved.validationStatus).toBe("invalid");
      expect(saved.validationErrors).toEqual([
        { message: "Title cannot be empty" },
      ]);
    });

    it("enforces unique (plan_id, revision)", async () => {
      await runRepo.createRun({
        runId: testRunId,
        model: "gemma",
      });

      const validEnvelope = makeValidCoursePlanEnvelope(testPlanId, 1);

      await planRepo.savePlanRevision({
        id: "plan-rec-uniq-01",
        planId: testPlanId,
        runId: testRunId,
        planType: "course",
        operation: "create",
        revision: 1,
        title: validEnvelope.title,
        summary: validEnvelope.summary,
        content: validEnvelope.content as Record<string, unknown>,
        rawEnvelope: validEnvelope,
        validationStatus: "valid",
      });

      await expect(
        planRepo.savePlanRevision({
          id: "plan-rec-uniq-02",
          planId: testPlanId,
          runId: testRunId,
          planType: "course",
          operation: "create",
          revision: 1,
          title: validEnvelope.title,
          summary: validEnvelope.summary,
          content: validEnvelope.content as Record<string, unknown>,
          rawEnvelope: validEnvelope,
          validationStatus: "valid",
        })
      ).rejects.toThrow();
    });
  });

  it("handles agent message logging in order", async () => {
    await runRepo.createRun({
      runId: testRunId,
      model: "gemma",
    });

    await messageRepo.appendMessage({
      id: "msg-01",
      runId: testRunId,
      stepNumber: 1,
      role: "system",
      content: "You are an instructional designer.",
    });

    await messageRepo.appendMessage({
      id: "msg-02",
      runId: testRunId,
      stepNumber: 2,
      role: "user",
      content: "Plan this course.",
    });

    await messageRepo.appendMessage({
      id: "msg-03",
      runId: testRunId,
      stepNumber: 3,
      role: "assistant",
      content: "Calling tool moodle_create_course",
      toolCalls: [{ name: "moodle_create_course", args: { title: "AI" } }],
    });

    const messages = await messageRepo.listRunMessages(testRunId);
    expect(messages).toHaveLength(3);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
    expect(messages[2]?.role).toBe("assistant");
    expect(messages[2]?.toolCalls).toBeDefined();
  });

  it("scopes MaterialSnapshot revision uniqueness by structure revision", async () => {
    await runRepo.createRun({ runId: testRunId, model: "gemma" });
    const common = {
      runId: testRunId,
      sectionRef: "section-01",
      files: [],
      extractorVersion: "test",
      normalizedText: "Week 1 material",
      normalizedTextHash: "d".repeat(64),
      estimatedTokens: 3,
      createdByMoodleUserId: 7,
    };
    await materialSnapshotRepo.saveSnapshot({ ...common, id: "snapshot-structure-1", structureRevision: 1, revision: 1 });
    await expect(materialSnapshotRepo.saveSnapshot({ ...common, id: "snapshot-structure-2", structureRevision: 2, revision: 1 })).resolves.toBeDefined();
    await expect(materialSnapshotRepo.saveSnapshot({ ...common, id: "snapshot-structure-2-duplicate", structureRevision: 2, revision: 1 })).rejects.toThrow();
  });

  it("persists Section generation instructions outside frozen Activity content", async () => {
    await runRepo.createRun({ runId: testRunId, model: "gemma" });
    const saved = await sectionActivityDraftRepo.saveDraft({
      id: "section-draft-instruction-01",
      runId: testRunId,
      structureRevision: 1,
      sectionRef: "section-01",
      activityRef: "assignment-01",
      activityType: "assignment",
      materialSnapshotId: "snapshot-01",
      generationInstruction: "Use a beginner-friendly checklist.",
      content: { ref: "assignment-01", type: "assignment" },
    });
    expect(saved.generationInstruction).toBe("Use a beginner-friendly checklist.");
    expect(saved.contentJson).not.toHaveProperty("generation_instruction");
  });

  it("handles tool call recording and uniqueness", async () => {
    await runRepo.createRun({
      runId: testRunId,
      model: "gemma",
    });

    const recorded = await toolCallRepo.recordToolCall({
      id: "tc-rec-01",
      toolCallId: "call_moodle_create_course_1",
      runId: testRunId,
      stepNumber: 1,
      toolName: "moodle_create_course",
      arguments: { fullname: "Intro to AI" },
      normalizedResult: { course_id: 42 },
      status: "success",
      durationMs: 350,
    });

    expect(recorded.toolCallId).toBe("call_moodle_create_course_1");
    expect(recorded.status).toBe("success");

    const fetched = await toolCallRepo.getToolCall("call_moodle_create_course_1");
    expect(fetched?.normalizedResult).toEqual({ course_id: 42 });

    // Unique tool_call_id enforcement
    await expect(
      toolCallRepo.recordToolCall({
        id: "tc-rec-02",
        toolCallId: "call_moodle_create_course_1",
        runId: testRunId,
        stepNumber: 2,
        toolName: "moodle_create_course",
        arguments: {},
        status: "error",
      })
    ).rejects.toThrow();
  });

  describe("ExecutionMappingRepository & Decision A1 Immutable Moodle ID", () => {
    beforeEach(async () => {
      await runRepo.createRun({
        runId: testRunId,
        model: "gemma",
      });

      const validEnvelope = makeValidCoursePlanEnvelope(testPlanId, 1);
      await planRepo.savePlanRevision({
        id: "plan-mapping-rev1",
        planId: testPlanId,
        runId: testRunId,
        planType: "course",
        operation: "create",
        revision: 1,
        title: validEnvelope.title,
        summary: validEnvelope.summary,
        content: validEnvelope.content as Record<string, unknown>,
        rawEnvelope: validEnvelope,
        validationStatus: "valid",
      });
    });

    it("allows first mapping creation and safe repeat mapping with same Moodle ID", async () => {
      const first = await mappingRepo.setMapping({
        id: "map-01",
        runId: testRunId,
        planId: testPlanId,
        revision: 1,
        localRef: "quiz-01",
        targetType: "quiz",
        moodleId: 20,
      });
      expect(first.moodleId).toBe(20);

      // Safe repeated call with same moodleId and updated metadata
      const repeated = await mappingRepo.setMapping({
        id: "map-02",
        runId: testRunId,
        planId: testPlanId,
        revision: 1,
        localRef: "quiz-01",
        targetType: "quiz",
        moodleId: 20,
        moodleMetadata: { cmid: 200 },
      });
      expect(repeated.moodleId).toBe(20);
      expect(repeated.moodleMetadata).toEqual({ cmid: 200 });
    });

    it("rejects repeated mapping with a different Moodle ID (Decision A1)", async () => {
      await mappingRepo.setMapping({
        id: "map-01",
        runId: testRunId,
        planId: testPlanId,
        revision: 1,
        localRef: "quiz-01",
        targetType: "quiz",
        moodleId: 20,
      });

      // Attempting to change Moodle ID to 25 must throw an explicit mapping conflict error
      await expect(
        mappingRepo.setMapping({
          id: "map-conflict",
          runId: testRunId,
          planId: testPlanId,
          revision: 1,
          localRef: "quiz-01",
          targetType: "quiz",
          moodleId: 25,
        })
      ).rejects.toThrow(
        /Mapping conflict for localRef "quiz-01".*existing moodle_id is 20, cannot overwrite with 25/
      );
    });

    it("rejects mapping referencing nonexistent plan revision (Decision A2 FK)", async () => {
      await expect(
        mappingRepo.setMapping({
          id: "map-nonexistent-plan",
          runId: testRunId,
          planId: "33333333-3333-4333-8333-333333333333", // Nonexistent plan
          revision: 99,
          localRef: "section-01",
          targetType: "section",
          moodleId: 50,
        })
      ).rejects.toThrow();
    });
  });

  describe("VerificationRepository & Decision A2 Composite FK", () => {
    beforeEach(async () => {
      await runRepo.createRun({
        runId: testRunId,
        model: "gemma",
      });

      const validEnvelope = makeValidCoursePlanEnvelope(testPlanId, 1);
      await planRepo.savePlanRevision({
        id: "plan-ver-rev1",
        planId: testPlanId,
        runId: testRunId,
        planType: "course",
        operation: "create",
        revision: 1,
        title: validEnvelope.title,
        summary: validEnvelope.summary,
        content: validEnvelope.content as Record<string, unknown>,
        rawEnvelope: validEnvelope,
        validationStatus: "valid",
      });
    });

    it("handles valid passed verification result", async () => {
      const passedVer = await verificationRepo.recordVerification({
        id: "ver-01",
        runId: testRunId,
        planId: testPlanId,
        revision: 1,
        passed: true,
        issues: [],
        expectedStructure: { sections: 3 },
        observedMoodleStructure: { sections: 3 },
      });
      expect(passedVer.passed).toBe(true);
      expect(passedVer.issues).toEqual([]);
    });

    it("handles valid failed verification result", async () => {
      const failedIssues: VerificationIssue[] = [
        {
          kind: "mismatch",
          path: "/sections/0/title",
          message: "Section title mismatch",
          expected: "Week 1",
          actual: "Topic 1",
        },
      ];

      const failedVer = await verificationRepo.recordVerification({
        id: "ver-02",
        runId: testRunId,
        planId: testPlanId,
        revision: 1,
        passed: false,
        issues: failedIssues,
      });
      expect(failedVer.passed).toBe(false);
      expect(failedVer.issues).toHaveLength(1);
    });

    it("rejects verification referencing nonexistent plan revision (Decision A2 FK)", async () => {
      await expect(
        verificationRepo.recordVerification({
          id: "ver-nonexistent-fk",
          runId: testRunId,
          planId: "44444444-4444-4444-8444-444444444444",
          revision: 99,
          passed: true,
          issues: [],
        })
      ).rejects.toThrow();
    });
  });

  describe("IdempotencyRepository, Concurrency & Capacity", () => {
    beforeEach(async () => {
      await runRepo.createRun({
        runId: testRunId,
        model: "gemma",
      });

      const validEnvelope = makeValidCoursePlanEnvelope(testPlanId, 1);
      await planRepo.savePlanRevision({
        id: "plan-idemp-rev1",
        planId: testPlanId,
        runId: testRunId,
        planType: "course",
        operation: "create",
        revision: 1,
        title: validEnvelope.title,
        summary: validEnvelope.summary,
        content: validEnvelope.content as Record<string, unknown>,
        rawEnvelope: validEnvelope,
        validationStatus: "valid",
      });
    });

    it("supports long idempotency keys exceeding 160 characters (up to varchar(255))", async () => {
      const longLocalRef = "section-01-detailed-assignment-item-semantic-ref-01";
      const longToolName = "moodle_create_custom_quiz_question_with_options";
      const params = {
        runId: testRunId,
        planId: testPlanId,
        revision: 1,
        localRef: longLocalRef,
        toolName: longToolName,
      };

      const key = buildIdempotencyKey(params);
      expect(key.length).toBeGreaterThan(160);
      expect(key.length).toBeLessThanOrEqual(255);

      const acquire = await idempotencyRepo.tryAcquire(params);
      expect(acquire.state).toBe("acquired");
      expect(acquire.key).toBe(key);
    });

    it("guarantees atomic failed retry under concurrent Promise.all() execution", async () => {
      const params = {
        runId: testRunId,
        planId: testPlanId,
        revision: 1,
        localRef: "concurrent-retry-01",
        toolName: "moodle_create_section",
      };
      const key = buildIdempotencyKey(params);

      // 1. First acquire succeeds
      const first = await idempotencyRepo.tryAcquire(params);
      expect(first.state).toBe("acquired");

      // 2. Mark operation as failed
      await idempotencyRepo.recordFailure(key, "Transient network timeout");

      // 3. Fire concurrent retry attempts simultaneously
      const results = await Promise.all([
        idempotencyRepo.tryAcquire(params),
        idempotencyRepo.tryAcquire(params),
        idempotencyRepo.tryAcquire(params),
      ]);

      const acquiredCount = results.filter((r) => r.state === "acquired").length;
      const inFlightCount = results.filter((r) => r.state === "in_flight").length;

      // Exactly ONE caller must acquire the retry, all others see in_flight
      expect(acquiredCount).toBe(1);
      expect(inFlightCount).toBe(2);
    });

    it("keeps uncertain mutation outcomes non-reacquirable until reconciliation", async () => {
      const params = {
        runId: testRunId,
        planId: testPlanId,
        revision: 1,
        localRef: "uncertain-assignment-01",
        toolName: "moodle_create_assignment",
      };
      const key = buildIdempotencyKey(params);

      const first = await idempotencyRepo.tryAcquire(params);
      expect(first.state).toBe("acquired");

      await idempotencyRepo.recordUncertain(
        key,
        "Mutation timed out; Moodle outcome requires read-back reconciliation."
      );

      const second = await idempotencyRepo.tryAcquire(params);
      expect(second.state).toBe("uncertain");
      if (second.state === "uncertain") {
        expect(second.key).toBe(key);
        expect(second.errorMessage).toContain("read-back reconciliation");
      }
    });
    it("rejects idempotency record referencing nonexistent plan revision (Decision A2 FK)", async () => {
      await expect(
        idempotencyRepo.tryAcquire({
          runId: testRunId,
          planId: "55555555-5555-4555-8555-555555555555",
          revision: 99,
          localRef: "quiz-01",
          toolName: "moodle_create_quiz",
        })
      ).rejects.toThrow();
    });
  });

  it("cascades deletion from poc_run to all dependent persistence tables", async () => {
    await runRepo.createRun({
      runId: testRunId,
      model: "gemma",
    });

    const validEnvelope = makeValidCoursePlanEnvelope(testPlanId, 1, "Cascade Test");
    await planRepo.savePlanRevision({
      id: "cascade-plan-01",
      planId: testPlanId,
      runId: testRunId,
      planType: "course",
      operation: "create",
      revision: 1,
      title: validEnvelope.title,
      summary: validEnvelope.summary,
      content: validEnvelope.content as Record<string, unknown>,
      rawEnvelope: validEnvelope,
      validationStatus: "valid",
    });

    await messageRepo.appendMessage({
      id: "cascade-msg-01",
      runId: testRunId,
      stepNumber: 1,
      role: "user",
      content: "Hello",
    });

    // Delete the run
    await db.delete(pocRun).where(eq(pocRun.runId, testRunId));

    // Child records should be gone
    const plans = await planRepo.listRunPlans(testRunId);
    expect(plans).toHaveLength(0);

    const messages = await messageRepo.listRunMessages(testRunId);
    expect(messages).toHaveLength(0);
  });
});
