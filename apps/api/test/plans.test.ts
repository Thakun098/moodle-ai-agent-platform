import { randomUUID } from "node:crypto";
import {
  closeDatabase,
  createDbClient,
  ModelClientError,
  PlanRepository,
  runMigrations,
  RunRepository,
  type ModelClient,
} from "@moodle-agent-poc/agent-runtime";
import type {
  AssignmentPlanEnvelope,
  CoursePlanEnvelope,
  NormalizedSyllabus,
  QuizUpdatePlanEnvelope,
} from "@moodle-agent-poc/contracts";
import { CoursePlanner, PlanningError } from "@moodle-agent-poc/planning";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

describe("Plans Routes & Preview Lifecycle Integration (T0601â€“T0605)", () => {
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

  const sampleSyllabus: NormalizedSyllabus = {
    schema_version: "0.1",
    metadata: {
      filename: "syllabus.md",
      byte_size: 150,
      media_type: "text/markdown",
      sha256: "dummy-sha256",
    },
    course_title: "Introduction to Artificial Intelligence",
    course_code: "CS101",
    course_description: "Foundational AI topics.",
    learning_objectives: ["Understand basic search algorithms"],
    schedule_or_topics: [
      {
        week_or_unit: "Week 1",
        title: "Search Algorithms",
        topics: ["BFS", "DFS"],
        source: {
          kind: "line",
          start_line: 1,
          end_line: 5,
        },
      },
    ],
    raw_text: "Full syllabus text here",
  };

  const sampleCourseModelOutput = {
    title: "Introduction to Artificial Intelligence",
    summary: "Course generated from syllabus",
    warnings: ["Single section found in syllabus."],
    assumptions: ["Standard 1-week duration."],
    content: {
      course: {
        title: "Introduction to Artificial Intelligence",
        course_code: "CS101",
        summary: "Foundational AI topics.",
      },
      sections: [
        {
          ref: "section-01",
          position: 1,
          title: "Search Algorithms",
          summary: "BFS and DFS",
          source_refs: [
            { source: "syllabus.md", section: "Week 1" },
          ],
          activities: [
            {
              ref: "assignment-01",
              type: "assignment",
              title: "Search Assignment",
              description: "Implement BFS and DFS",
              instructions: ["Write code", "Test paths"],
              learning_objectives: ["Understand search"],
              grade: 100,
              source_refs: [
                { source: "syllabus.md", section: "Week 1" },
              ],
            },
            {
              ref: "quiz-01",
              type: "quiz",
              title: "Search Quiz",
              description: "Test your search knowledge",
              source_refs: [
                { source: "syllabus.md", section: "Week 1" },
              ],
              questions: [
                {
                  ref: "question-01",
                  type: "multichoice",
                  question: "Which data structure does BFS use?",
                  choices: [
                    { ref: "choice-1", text: "Queue" },
                    { ref: "choice-2", text: "Stack" },
                  ],
                  correct_choice_refs: ["choice-1"],
                  feedback: "BFS uses a Queue FIFO data structure.",
                  default_mark: 1,
                  source_refs: [
                    { source: "syllabus.md", section: "Week 1" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const sampleStructureModelOutput = {
    title: sampleCourseModelOutput.title,
    summary: sampleCourseModelOutput.summary,
    warnings: sampleCourseModelOutput.warnings,
    assumptions: sampleCourseModelOutput.assumptions,
    content: {
      course: sampleCourseModelOutput.content.course,
      sections: sampleCourseModelOutput.content.sections.map(({ activities, ...section }) => ({
        ...section,
        activity_intents: activities.map((activity) => ({
          type: activity.type,
          title: activity.title,
          source_refs: activity.source_refs,
          origin: "syllabus" as const,
        })),
      })),
    },
  };

  const sampleActivityModelOutput = {
    sections: sampleCourseModelOutput.content.sections.map((section) => ({
      section_ref: section.ref,
      activities: section.activities,
    })),
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = testDbUrl;
    await runMigrations(testDbUrl);
    const client = createDbClient(testDbUrl);
    runRepo = new RunRepository(client.db);
    planRepo = new PlanRepository(client.db);
    pool = client.pool;

    const mockModelClient: ModelClient = {
      ping: vi.fn().mockResolvedValue(true),
      listModels: vi.fn().mockResolvedValue([{ name: "gemma4:e2b" }]),
      chat: vi.fn()
        .mockResolvedValueOnce({ message: { role: "assistant", content: JSON.stringify(sampleStructureModelOutput) }, toolCalls: [], rawText: JSON.stringify(sampleStructureModelOutput) })
        .mockResolvedValueOnce({ message: { role: "assistant", content: JSON.stringify(sampleActivityModelOutput) }, toolCalls: [], rawText: JSON.stringify(sampleActivityModelOutput) }),
    };

    const coursePlanner = new CoursePlanner({
      modelClient: mockModelClient,
      planRepository: planRepo,
    });

    app = buildApp({
      config,
      runRepo,
      planRepo,
      modelClient: mockModelClient,
      coursePlanner,
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

  it("POST /api/runs/:runId/plans/course cannot bypass the staged Course Creation workflow", async () => {
    // 1. Create a run with normalized syllabus
    const runId = randomUUID();
    await runRepo.createRun({
      runId,
      model: "gemma4:e2b",
      status: "pending",
      normalizedSyllabus: sampleSyllabus,
    });

    // 2. Trigger course plan generation
    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/plans/course`,
    });

    expect(response.statusCode).toBe(409);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("STAGED_COURSE_CREATION_REQUIRED");
    const updatedRun = await runRepo.getRun(runId);
    expect(updatedRun?.status).toBe("pending");
  });

  it("POST /api/runs/:runId/plans/course fails if run does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${randomUUID()}/plans/course`,
    });

    expect(response.statusCode).toBe(404);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("POST /api/runs/:runId/plans/course does not invoke the legacy planner", async () => {
    const runId = randomUUID();
    await runRepo.createRun({
      runId,
      model: "gemma4:e2b",
      status: "pending",
      normalizedSyllabus: sampleSyllabus,
    });

    // Create a custom app instance with a failing planner
    const failingModelClient: ModelClient = {
      ping: vi.fn().mockResolvedValue(true),
      listModels: vi.fn().mockResolvedValue([]),
      chat: vi.fn().mockRejectedValue(new ModelClientError("MODEL_TIMEOUT", "Ollama timed out")),
    };

    const failingPlanner = new CoursePlanner({
      modelClient: failingModelClient,
      planRepository: planRepo,
    });

    const failingApp = buildApp({
      config,
      runRepo,
      planRepo,
      coursePlanner: failingPlanner,
      fastifyOptions: { logger: false },
    });

    const response = await failingApp.inject({
      method: "POST",
      url: `/api/runs/${runId}/plans/course`,
    });

    expect(response.statusCode).toBe(409);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("STAGED_COURSE_CREATION_REQUIRED");

    // Verify run status transitioned to "failed"
    const failedRun = await runRepo.getRun(runId);
    expect(failedRun?.status).toBe("pending");

    await failingApp.close();
  });

  it("GET /api/plans/:planId and GET /api/plans/:planId/preview handle latest default and explicit revisions (T0601â€“T0604)", async () => {
    const planId = randomUUID();
    const runId = randomUUID();
    await runRepo.createRun({
      runId,
      model: "gemma4:e2b",
      status: "preview",
      syllabusMetadata: { course_format: "tiles" },
    });

    const courseEnvelopeRev1: CoursePlanEnvelope = {
      schema_version: "0.1",
      plan_id: planId,
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Course Title Rev 1",
      summary: "Summary Rev 1",
      warnings: ["Warning 1"],
      assumptions: ["Assumption 1"],
      content: {
        course: { title: "Course Title Rev 1" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Section 1",
            source_refs: [{ source: "syllabus.md", section: "Week 1" }],
            activities: [],
          },
        ],
      },
    };

    const courseEnvelopeRev2: CoursePlanEnvelope = {
      ...courseEnvelopeRev1,
      revision: 2,
      title: "Course Title Rev 2",
      summary: "Summary Rev 2",
    };

    await planRepo.savePlanRevision({
      id: randomUUID(),
      planId,
      runId,
      planType: "course",
      operation: "create",
      revision: 1,
      title: courseEnvelopeRev1.title,
      summary: courseEnvelopeRev1.summary,
      content: courseEnvelopeRev1.content as unknown as Record<string, unknown>,
      rawEnvelope: courseEnvelopeRev1,
      validationStatus: "valid",
    });

    await planRepo.savePlanRevision({
      id: randomUUID(),
      planId,
      runId,
      planType: "course",
      operation: "create",
      revision: 2,
      title: courseEnvelopeRev2.title,
      summary: courseEnvelopeRev2.summary,
      content: courseEnvelopeRev2.content as unknown as Record<string, unknown>,
      rawEnvelope: courseEnvelopeRev2,
      validationStatus: "valid",
    });

    // 1. GET /api/plans/:planId without revision defaults to latest (rev 2)
    const getLatest = await app.inject({
      method: "GET",
      url: `/api/plans/${planId}`,
    });
    expect(getLatest.statusCode).toBe(200);
    expect(JSON.parse(getLatest.body).revision).toBe(2);

    // 2. GET /api/plans/:planId?revision=1 returns rev 1
    const getRev1 = await app.inject({
      method: "GET",
      url: `/api/plans/${planId}?revision=1`,
    });
    expect(getRev1.statusCode).toBe(200);
    expect(JSON.parse(getRev1.body).revision).toBe(1);

    // 3. GET /api/plans/:planId?revision=99 returns 404
    const getRev99 = await app.inject({
      method: "GET",
      url: `/api/plans/${planId}?revision=99`,
    });
    expect(getRev99.statusCode).toBe(404);

    // 4. GET /api/plans/:planId/preview defaults to latest (rev 2)
    const previewLatest = await app.inject({
      method: "GET",
      url: `/api/plans/${planId}/preview`,
    });
    expect(previewLatest.statusCode).toBe(200);
    const prevLatestData = JSON.parse(previewLatest.body);
    expect(prevLatestData.revision).toBe(2);
    expect(prevLatestData.title).toBe("Course Title Rev 2");
    expect(prevLatestData.warnings).toEqual(["Warning 1"]);
    expect(prevLatestData.assumptions).toEqual(["Assumption 1"]);
    expect(prevLatestData.execution_config).toEqual({ course_format: "tiles" });

    // 5. GET /api/plans/:planId/preview?revision=1 returns rev 1
    const previewRev1 = await app.inject({
      method: "GET",
      url: `/api/plans/${planId}/preview?revision=1`,
    });
    expect(previewRev1.statusCode).toBe(200);
    expect(JSON.parse(previewRev1.body).revision).toBe(1);

    // 6. GET /api/plans/:planId/revisions lists all revisions
    const listRevs = await app.inject({
      method: "GET",
      url: `/api/plans/${planId}/revisions`,
    });
    expect(listRevs.statusCode).toBe(200);
    const revsList = JSON.parse(listRevs.body);
    expect(revsList).toHaveLength(2);
    expect(revsList[0].revision).toBe(2);
    expect(revsList[1].revision).toBe(1);
  });

  it("GET /api/plans/:planId/preview renders AssignmentPlan and QuizUpdatePlan previews (T0602, T0603)", async () => {
    const runId = randomUUID();
    await runRepo.createRun({ runId, model: "gemma4:e2b", status: "preview" });

    // Assignment Plan
    const assignPlanId = randomUUID();
    const assignEnvelope: AssignmentPlanEnvelope = {
      schema_version: "0.1",
      plan_id: assignPlanId,
      revision: 1,
      plan_type: "assignment",
      operation: "update",
      title: "Assignment Refinement",
      summary: "Improve lab instructions",
      warnings: [],
      assumptions: [],
      content: {
        ref: "assignment-01",
        type: "assignment",
        title: "Lab 1 Refined",
        description: "Hands-on lab",
        instructions: ["Step 1", "Step 2"],
        learning_objectives: ["Objective 1"],
        grade: 100,
        source_refs: [{ source: "syllabus.md", section: "Week 1" }],
      },
    };

    await planRepo.savePlanRevision({
      id: randomUUID(),
      planId: assignPlanId,
      runId,
      planType: "assignment",
      operation: "update",
      revision: 1,
      title: assignEnvelope.title,
      summary: assignEnvelope.summary,
      content: assignEnvelope.content as unknown as Record<string, unknown>,
      rawEnvelope: assignEnvelope,
      validationStatus: "valid",
    });

    const assignRes = await app.inject({
      method: "GET",
      url: `/api/plans/${assignPlanId}/preview`,
    });
    expect(assignRes.statusCode).toBe(200);
    const assignData = JSON.parse(assignRes.body);
    expect(assignData.plan_type).toBe("assignment");
    expect(assignData.metrics.assignments).toBe(1);

    // Quiz Plan
    const quizPlanId = randomUUID();
    const quizEnvelope: QuizUpdatePlanEnvelope = {
      schema_version: "0.1",
      plan_id: quizPlanId,
      revision: 1,
      plan_type: "quiz",
      operation: "update",
      title: "Quiz Extension",
      summary: "Add questions",
      warnings: ["Added 1 question"],
      assumptions: [],
      content: {
        title: "Quiz 1 Extended",
        description: "Assessment",
        source_refs: [{ source: "syllabus.md", section: "Week 1" }],
        questions_to_add: [
          {
            ref: "question-new-01",
            type: "truefalse",
            question: "Is BFS complete?",
            correct_answer: true,
            feedback: "BFS is complete on finite trees.",
            default_mark: 1,
            source_refs: [{ source: "syllabus.md", section: "Week 1" }],
          },
        ],
        questions_to_update: [],
      },
    };

    await planRepo.savePlanRevision({
      id: randomUUID(),
      planId: quizPlanId,
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

    const quizRes = await app.inject({
      method: "GET",
      url: `/api/plans/${quizPlanId}/preview`,
    });
    expect(quizRes.statusCode).toBe(200);
    const quizData = JSON.parse(quizRes.body);
    expect(quizData.plan_type).toBe("quiz");
    expect(quizData.metrics.quizzes).toBe(1);
    expect(quizData.metrics.questions).toBe(1);
    expect(quizData.metrics.questions_by_type.truefalse).toBe(1);
  });

  it("POST /api/plans/:planId/revisions creates immutable revision N+1 and rejects invented provenance (T0605)", async () => {
    const planId = randomUUID();
    const runId = randomUUID();
    await runRepo.createRun({ runId, model: "gemma4:e2b", status: "preview" });

    const initialEnvelope: CoursePlanEnvelope = {
      schema_version: "0.1",
      plan_id: planId,
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Original Course Plan",
      summary: "Rev 1",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "CS101" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Original Section",
            source_refs: [{ source: "syllabus.md", section: "Week 1" }],
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
      title: initialEnvelope.title,
      summary: initialEnvelope.summary,
      content: initialEnvelope.content as unknown as Record<string, unknown>,
      rawEnvelope: initialEnvelope,
      validationStatus: "valid",
    });

    // 1. Direct valid edit
    const editedEnvelope: CoursePlanEnvelope = {
      ...initialEnvelope,
      title: "Direct Instructor Edited Title",
      summary: "Instructor updated title and section",
      content: {
        ...initialEnvelope.content,
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Updated Section 1",
            source_refs: [{ source: "syllabus.md", section: "Week 1" }],
            activities: [],
          },
        ],
      },
    };

    const editResponse = await app.inject({
      method: "POST",
      url: `/api/plans/${planId}/revisions`,
      payload: {
        edited_envelope: editedEnvelope,
        summary: "Direct instructor revision",
      },
    });

    expect(editResponse.statusCode).toBe(201);
    const editData = JSON.parse(editResponse.body);
    expect(editData.plan.revision).toBe(2);
    expect(editData.plan.title).toBe("Direct Instructor Edited Title");
    expect(editData.plan.summary).toBe("Instructor updated title and section");
    expect(editData.preview.revision).toBe(2);

    // Verify rev 1 remains unchanged in DB (immutability)
    const rev1Record = await planRepo.getPlanRevision(planId, 1);
    expect(rev1Record?.title).toBe("Original Course Plan");

    // 2. Reject direct edit with invented source reference (Phase 6 Grounding)
    const inventedSourceEdit: CoursePlanEnvelope = {
      ...initialEnvelope,
      content: {
        ...initialEnvelope.content,
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Section 1",
            source_refs: [{ source: "fake_book.pdf", section: "Chapter 99" }],
            activities: [],
          },
        ],
      },
    };

    const rejectSourceResponse = await app.inject({
      method: "POST",
      url: `/api/plans/${planId}/revisions`,
      payload: {
        edited_envelope: inventedSourceEdit,
      },
    });

    expect(rejectSourceResponse.statusCode).toBe(422);
    const rejectData = JSON.parse(rejectSourceResponse.body);
    expect(rejectData.error.code).toBe("PLAN_DOMAIN_INVALID");

    // 3. Reject direct edit attempting to change plan_type
    const driftedEnvelope = {
      ...initialEnvelope,
      plan_type: "assignment",
    };

    const rejectDriftResponse = await app.inject({
      method: "POST",
      url: `/api/plans/${planId}/revisions`,
      payload: {
        edited_envelope: driftedEnvelope,
      },
    });

    expect(rejectDriftResponse.statusCode).toBe(422);
  });

  it("rejects a second initial CoursePlan generation for the same run with HTTP 409", async () => {
    const runId = randomUUID();
    const planId = randomUUID();
    await runRepo.createRun({
      runId,
      model: "gemma4:e2b",
      status: "preview",
      normalizedSyllabus: sampleSyllabus,
    });

    const existingEnvelope: CoursePlanEnvelope = {
      schema_version: "0.1",
      plan_id: planId,
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Existing Course Plan",
      summary: "Already generated",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "Existing Course" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Existing Section",
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
      title: existingEnvelope.title,
      summary: existingEnvelope.summary,
      content: existingEnvelope.content as unknown as Record<string, unknown>,
      rawEnvelope: existingEnvelope,
      validationStatus: "valid",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/plans/course`,
    });

    expect(response.statusCode).toBe(409);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("CONFLICT");
    expect(data.error.message).toContain("already exists");
    expect((await planRepo.listRunPlans(runId)).filter((p) => p.planType === "course")).toHaveLength(1);
  });

  it("strictly rejects malformed revision query values instead of partially parsing them", async () => {
    const planId = randomUUID();
    const runId = randomUUID();
    await runRepo.createRun({ runId, model: "gemma4:e2b", status: "preview" });

    const envelope: CoursePlanEnvelope = {
      schema_version: "0.1",
      plan_id: planId,
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Strict Revision Query",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "Strict Revision Query" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Section",
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
      title: envelope.title,
      summary: envelope.summary,
      content: envelope.content as unknown as Record<string, unknown>,
      rawEnvelope: envelope,
      validationStatus: "valid",
    });

    for (const revision of ["1abc", "1.5", "0", "-1"]) {
      const planResponse = await app.inject({
        method: "GET",
        url: `/api/plans/${planId}?revision=${encodeURIComponent(revision)}`,
      });
      expect(planResponse.statusCode, revision).toBe(400);

      const previewResponse = await app.inject({
        method: "GET",
        url: `/api/plans/${planId}/preview?revision=${encodeURIComponent(revision)}`,
      });
      expect(previewResponse.statusCode, revision).toBe(400);
    }

    const validResponse = await app.inject({
      method: "GET",
      url: `/api/plans/${planId}?revision=1`,
    });
    expect(validResponse.statusCode).toBe(200);
  });});

