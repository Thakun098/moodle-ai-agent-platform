import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActivityIntentRepository,
  RunRepository,
  createDbClient,
  runMigrations,
  type AppDatabase,
} from "@moodle-agent-poc/agent-runtime";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const dbUrl = process.env.DATABASE_URL || "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:55432/moodle_agent_poc";
const config = loadConfig({ DATABASE_URL: dbUrl, OLLAMA_MODEL: "ticket06-model", AGENT_MODEL_TIMEOUT_MS: "100" });
let runId = randomUUID();
let targetId = randomUUID();
let siblingId = randomUUID();

const syllabus = {
  schema_version: "0.1" as const,
  metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 40, sha256: "a".repeat(64) },
  course_title: "Search",
  learning_objectives: ["Explain BFS"],
  schedule_or_topics: [{ week_or_unit: "Week 1", title: "Search", topics: ["BFS queue"], source: { kind: "line" as const, start_line: 1, end_line: 1 } }],
  raw_text: "Week 1 Search BFS queue",
};

function coreContextFor(id: string) { return {
  schema_version: "0.1" as const,
  policy_version: "instructional-design.v0.1",
  revision: 3,
  run_id: id,
  source_syllabus: { normalized_syllabus_version: "0.1" as const, filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) },
  course: {},
  learner_context: { revision: 2, status: "PROVIDED_BY_SYLLABUS" as const, target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [{ objective_id: "objective-1", source_text: "Explain BFS", source_refs: [], status: "SOURCE" as const }],
  source_learning_outcomes: [{ source_outcome_id: "source-1", source_text: "Explain BFS", source_refs: [], measurable_status: "MEASURABLE" as const, review_required: false }],
  approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Explain BFS", source_outcome_ids: ["source-1"], source_refs: [], approval_origin: "SOURCE_AS_IS" as const, approved_by_teacher: true as const, revision: 2 }],
  schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [],
  provenance: { extractor_version: "syllabus-semantics.v0.2" as const, location_basis: "NORMALIZED_RAW_TEXT_LINES" as const },
}; }

const structureRevisionRepo = {
  getSealedRevision: vi.fn().mockResolvedValue({
    revision: 1,
    contentJson: {
      course: { title: "Search" },
      sections: [{
        ref: "section-01", position: 1, title: "Week 1: Search", summary: "BFS",
        source_refs: [{ source: "syllabus.md", section: "section-01" }],
        aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"], activity_intents: [],
      }],
    },
  }),
};

const snapshotRepo = { getLatestSnapshot: vi.fn().mockResolvedValue(null), getSnapshot: vi.fn().mockResolvedValue(null) };

const model = {
  ping: vi.fn(), listModels: vi.fn(),
  chat: vi.fn().mockResolvedValue({
    rawText: JSON.stringify({
      type: "assignment", title: "BFS practice", description: "Practice BFS with the queue model.",
      instructions: ["Explain BFS queue behavior."], grade: 100,
      source_refs: [{ source: "syllabus.md", section: "section-01" }],
      aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"],
      quality_review: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS", warnings: [] },
      scope_exceptions: { new_concepts: [], new_prerequisites: [], new_tools_or_frameworks: [], new_technical_requirements: [] },
    }),
    message: { role: "assistant", content: "" }, toolCalls: [],
  }),
};

describe("Ticket 06 targeted Activity recovery integration", () => {
  let db: AppDatabase;
  let pool: any;
  let realRunRepo: RunRepository;
  let intentRepo: ActivityIntentRepository;

  beforeAll(async () => {
    await runMigrations(dbUrl);
    const client = createDbClient(dbUrl);
    db = client.db;
    pool = client.pool;
    realRunRepo = new RunRepository(db);
    intentRepo = new ActivityIntentRepository(db);
  });

  beforeEach(async () => {
    runId = randomUUID();
    targetId = randomUUID();
    siblingId = randomUUID();
    await realRunRepo.createRun({ runId, model: "test", status: "planning", normalizedSyllabus: syllabus });
    model.chat.mockClear();
  });

  afterAll(async () => { if (pool) await pool.end(); });

  async function seedSiblingGenerated(contextRevision = 2) {
    const sibling = await intentRepo.select({
      id: siblingId, runId, structureRevision: 1, sectionRef: "section-01", activityRef: "quiz-01", activityType: "quiz", maxAttempts: 2,
      optionsJson: { title: "Quiz", question_count: 5, question_type: "multichoice", choices_per_question: 4 },
      purpose: "FORMATIVE", selectedObjectiveIdsJson: ["objective-1"], selectedOutcomeIdsJson: ["outcome-1"],
      contextRevision, learnerContextRevision: 2, learnerContextAcknowledged: true,
    });
    await intentRepo.beginAttempt(sibling.id);
    await intentRepo.complete(sibling.id, {
      contentJson: { type: "quiz", title: "Existing quiz", description: "Existing", questions: [] },
      groundingMode: "SYLLABUS_SCOPED_AI", reviewRequired: true,
    });
    return (await intentRepo.get(sibling.id))!;
  }

  async function seedFailedTarget() {
    const target = await intentRepo.select({
      id: targetId, runId, structureRevision: 1, sectionRef: "section-01", activityRef: "assignment-01", activityType: "assignment", maxAttempts: 3,
      optionsJson: { title: "Assignment", grade: 100 },
      purpose: "FORMATIVE", selectedObjectiveIdsJson: ["objective-1"], selectedOutcomeIdsJson: ["outcome-1"],
      contextRevision: 3, learnerContextRevision: 2, learnerContextAcknowledged: true,
    });
    await intentRepo.beginAttempt(target.id);
    await intentRepo.failAttempt(target.id, false, "provider failure");
    return (await intentRepo.get(target.id))!;
  }

  function app() {
    const routeRunRepo = {
      getRun: vi.fn().mockResolvedValue({ runId, status: "planning", normalizedSyllabus: syllabus }),
      getCoreCourseDesignContext: vi.fn().mockImplementation(async () => coreContextFor(runId)),
    };
    return buildApp({
      config,
      runRepo: routeRunRepo as any,
      structureRevisionRepo: structureRevisionRepo as any,
      activityIntentRepo: intentRepo,
      snapshotRepo: snapshotRepo as any,
      modelClient: model as any,
      riskDashboardRepo: { getCourseState: vi.fn(), getSnapshot: vi.fn(), listStudentHistory: vi.fn() },
      fastifyOptions: { logger: false },
    });
  }

  it("retries one failed Activity without changing a successful sibling status or revision", async () => {
    const siblingBefore = await seedSiblingGenerated(2);
    const targetBefore = await seedFailedTarget();
    expect(targetBefore.status).toBe("failed");
    expect(siblingBefore.status).toBe("generated");

    const server = app();
    const response = await server.inject({ method: "POST", url: `/api/runs/${runId}/sections/section-01/activities/assignment-01/generate` });
    expect(response.statusCode).toBe(200);
    expect(model.chat).toHaveBeenCalledTimes(1);

    const siblingAfter = await intentRepo.get(siblingId);
    expect(siblingAfter).toMatchObject({
      status: siblingBefore.status,
      activityRevision: siblingBefore.activityRevision,
      intentRevision: siblingBefore.intentRevision,
      attemptCount: siblingBefore.attemptCount,
    });
    await server.close();
  });

  it("manually regenerates one stale Activity without changing a successful sibling status or revision", async () => {
    const siblingBefore = await seedSiblingGenerated(2);
    const target = await intentRepo.select({
      id: targetId, runId, structureRevision: 1, sectionRef: "section-01", activityRef: "assignment-01", activityType: "assignment", maxAttempts: 3,
      optionsJson: { title: "Assignment", grade: 100 },
      purpose: "FORMATIVE", selectedObjectiveIdsJson: ["objective-1"], selectedOutcomeIdsJson: ["outcome-1"],
      contextRevision: 3, learnerContextRevision: 2, learnerContextAcknowledged: true,
    });
    await intentRepo.beginAttempt(target.id);
    await intentRepo.complete(target.id, { contentJson: { type: "assignment", title: "Old assignment", description: "Old", instructions: ["Old"], grade: 100 }, groundingMode: "SYLLABUS_SCOPED_AI", reviewRequired: true });
    const stale = await intentRepo.select({
      id: targetId, runId, structureRevision: 1, sectionRef: "section-01", activityRef: "assignment-01", activityType: "assignment", maxAttempts: 3,
      optionsJson: { title: "Assignment", grade: 100 },
      purpose: "SUMMATIVE", selectedObjectiveIdsJson: ["objective-1"], selectedOutcomeIdsJson: ["outcome-1"],
      contextRevision: 3, learnerContextRevision: 2, learnerContextAcknowledged: true,
    });
    expect(stale.status).toBe("stale");

    const server = app();
    const response = await server.inject({ method: "POST", url: `/api/runs/${runId}/sections/section-01/activities/assignment-01/generate` });
    expect(response.statusCode).toBe(200);
    expect(model.chat).toHaveBeenCalledTimes(1);

    const siblingAfter = await intentRepo.get(siblingId);
    expect(siblingAfter).toMatchObject({
      status: siblingBefore.status,
      activityRevision: siblingBefore.activityRevision,
      intentRevision: siblingBefore.intentRevision,
      attemptCount: siblingBefore.attemptCount,
    });
    await server.close();
  });
});
