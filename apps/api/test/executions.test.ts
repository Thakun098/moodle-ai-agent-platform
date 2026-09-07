import { randomUUID } from "node:crypto";
import {
  closeDatabase,
  createDbClient,
  PlanRepository,
  runMigrations,
  RunRepository,
} from "@moodle-agent-poc/agent-runtime";
import type {
  AssignmentPlanEnvelope,
  CoursePlanEnvelope,
  QuizCreatePlanEnvelope,
  QuizUpdatePlanEnvelope,
} from "@moodle-agent-poc/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

describe("Execution Request Validation Endpoint (T0606)", () => {
  const testDbUrl =
    process.env.DATABASE_URL ||
    "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:5432/moodle_agent_poc";

  const config = loadConfig({
    DATABASE_URL: testDbUrl,
    OLLAMA_MODEL: "gemma4:e2b",
  });

  let app: any;
  let runRepo: RunRepository;
  let planRepo: PlanRepository;
  let pool: any;
  let runId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDbUrl;
    await runMigrations(testDbUrl);
    const client = createDbClient(testDbUrl);
    runRepo = new RunRepository(client.db);
    planRepo = new PlanRepository(client.db);
    pool = client.pool;

    runId = randomUUID();
    await runRepo.createRun({ runId, model: "gemma4:e2b", status: "preview" });

    app = buildApp({
      config,
      runRepo,
      planRepo,
      fastifyOptions: { logger: false },
    });
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
    if (pool) {
      await pool.end();
    }
  });

  it("accepts valid course/create execution request with category_id", async () => {
    const planId = randomUUID();
    const courseEnvelope: CoursePlanEnvelope = {
      schema_version: "0.1",
      plan_id: planId,
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Course",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "Course" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Sec 1",
            source_refs: [],
            activities: [],
          },
        ],
      },
    };

    await planRepo.savePlanRevision({
      id: randomUUID(),
      planId,
      runId,
      planType: "course",
      operation: "create",
      revision: 1,
      title: courseEnvelope.title,
      summary: courseEnvelope.summary,
      content: courseEnvelope.content as unknown as Record<string, unknown>,
      rawEnvelope: courseEnvelope,
      validationStatus: "valid",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/executions/validate",
      payload: {
        plan_id: planId,
        revision: 1,
        target: { category_id: 15 },
      },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.valid).toBe(true);
    expect(data.plan_id).toBe(planId);
    expect(data.revision).toBe(1);
    expect(data.plan_type).toBe("course");
    expect(data.operation).toBe("create");
    expect(data.target).toEqual({ category_id: 15 });
  });

  it("accepts valid assignment/update execution request with course_id, section_id, and activity_id", async () => {
    const planId = randomUUID();
    const assignEnvelope: AssignmentPlanEnvelope = {
      schema_version: "0.1",
      plan_id: planId,
      revision: 2,
      plan_type: "assignment",
      operation: "update",
      title: "Assignment",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {
        ref: "assignment-01",
        type: "assignment",
        title: "Assignment 1",
        description: "Desc",
        instructions: ["Inst 1"],
        learning_objectives: ["Obj 1"],
        grade: 100,
        source_refs: [],
      },
    };

    await planRepo.savePlanRevision({
      id: randomUUID(),
      planId,
      runId,
      planType: "assignment",
      operation: "update",
      revision: 2,
      title: assignEnvelope.title,
      summary: assignEnvelope.summary,
      content: assignEnvelope.content as unknown as Record<string, unknown>,
      rawEnvelope: assignEnvelope,
      validationStatus: "valid",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/executions/validate",
      payload: {
        plan_id: planId,
        revision: 2,
        target: { course_id: 42, section_id: 3, activity_id: 108 },
      },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.valid).toBe(true);
    expect(data.plan_type).toBe("assignment");
    expect(data.operation).toBe("update");
  });

  it("accepts valid quiz/update execution request with course_id, section_id, and quiz_id", async () => {
    const planId = randomUUID();
    const quizEnvelope: QuizUpdatePlanEnvelope = {
      schema_version: "0.1",
      plan_id: planId,
      revision: 1,
      plan_type: "quiz",
      operation: "update",
      title: "Quiz",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {
        title: "Quiz 1",
        description: "Desc",
        source_refs: [],
        questions_to_add: [],
        questions_to_update: [],
      },
    };

    await planRepo.savePlanRevision({
      id: randomUUID(),
      planId,
      runId,
      planType: "quiz",
      operation: "update",
      revision: 1,
      title: quizEnvelope.title,
      summary: quizEnvelope.summary,
      content: quizEnvelope.content as unknown as Record<string, unknown>,
      rawEnvelope: quizEnvelope,
      validationStatus: "valid",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/executions/validate",
      payload: {
        plan_id: planId,
        revision: 1,
        target: { course_id: 42, section_id: 3, quiz_id: 99 },
      },
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.valid).toBe(true);
  });

  it("rejects execution request with missing explicit revision at schema validation time (HTTP 400)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/executions/validate",
      payload: {
        plan_id: randomUUID(),
        // revision omitted
        target: { category_id: 1 },
      },
    });

    expect(response.statusCode).toBe(400);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("BAD_REQUEST");
    expect(data.error.message).toContain("schema validation failed");
  });

  it("rejects execution request for non-existent plan (HTTP 404)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/executions/validate",
      payload: {
        plan_id: randomUUID(),
        revision: 1,
        target: { category_id: 1 },
      },
    });

    expect(response.statusCode).toBe(404);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("rejects execution request for non-existent revision of an existing plan (HTTP 404)", async () => {
    const planId = randomUUID();
    const courseEnvelope: CoursePlanEnvelope = {
      schema_version: "0.1",
      plan_id: planId,
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Course",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "Course" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Sec 1",
            source_refs: [],
            activities: [],
          },
        ],
      },
    };

    await planRepo.savePlanRevision({
      id: randomUUID(),
      planId,
      runId,
      planType: "course",
      operation: "create",
      revision: 1,
      title: courseEnvelope.title,
      summary: courseEnvelope.summary,
      content: courseEnvelope.content as unknown as Record<string, unknown>,
      rawEnvelope: courseEnvelope,
      validationStatus: "valid",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/executions/validate",
      payload: {
        plan_id: planId,
        revision: 99, // Non-existent revision
        target: { category_id: 1 },
      },
    });

    expect(response.statusCode).toBe(404);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("rejects execution request with incompatible target shape (HTTP 422)", async () => {
    const planId = randomUUID();
    const courseEnvelope: CoursePlanEnvelope = {
      schema_version: "0.1",
      plan_id: planId,
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Course",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "Course" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Sec 1",
            source_refs: [],
            activities: [],
          },
        ],
      },
    };

    await planRepo.savePlanRevision({
      id: randomUUID(),
      planId,
      runId,
      planType: "course",
      operation: "create",
      revision: 1,
      title: courseEnvelope.title,
      summary: courseEnvelope.summary,
      content: courseEnvelope.content as unknown as Record<string, unknown>,
      rawEnvelope: courseEnvelope,
      validationStatus: "valid",
    });

    // Submitting quiz target for a course create plan
    const response = await app.inject({
      method: "POST",
      url: "/api/executions/validate",
      payload: {
        plan_id: planId,
        revision: 1,
        target: { course_id: 10, section_id: 2, quiz_id: 50 },
      },
    });

    expect(response.statusCode).toBe(422);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("PLAN_DOMAIN_INVALID");
  });
});
