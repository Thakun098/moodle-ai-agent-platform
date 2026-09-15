import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, createDbClient, type AppDatabase } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrate.js";
import { pocRun } from "../src/db/schema/runs.js";
import { ActivityIntentRepository, CompetencyCandidateRepository, RunRepository } from "../src/repositories/index.js";

const dbUrl = process.env.DATABASE_URL || "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:55432/moodle_agent_poc";
const runId = "33333333-3333-4333-8333-333333333333";

describe("Instructional Design persistence", () => {
  let db: AppDatabase;
  let pool: any;
  let runRepo: RunRepository;
  let candidateRepo: CompetencyCandidateRepository;
  let intentRepo: ActivityIntentRepository;

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    await runMigrations(dbUrl);
    const client = createDbClient(dbUrl); db = client.db; pool = client.pool;
    runRepo = new RunRepository(db); candidateRepo = new CompetencyCandidateRepository(db); intentRepo = new ActivityIntentRepository(db);
  });
  beforeEach(async () => { await db.delete(pocRun).where(eq(pocRun.runId, runId)); await runRepo.createRun({ runId, model: "test", status: "planning" }); });
  afterAll(async () => { await closeDatabase(); if (pool) await pool.end(); });

  it("persists Candidate many-to-many lifecycle and revisioned decisions", async () => {
    const [created] = await candidateRepo.saveProposed(runId, [{ candidate_id: "candidate-1", name: "Program design", description: "Design programs", rationale: "Combines approved Outcomes", derived_from_outcome_ids: ["outcome-1", "outcome-2"], source_refs: [], status: "PROPOSED", revision: 1 }]);
    expect(created?.status).toBe("PROPOSED");
    const edited = await candidateRepo.decide(runId, "candidate-1", { action: "edit", status: "UNALIGNED", derived_from_outcome_ids: [], description: "Teacher edited", name: "Program design", rationale: "Needs explicit review" });
    expect(edited).toMatchObject({ revision: 2, status: "UNALIGNED", derivedFromOutcomeIdsJson: [] });
    const approved = await candidateRepo.decide(runId, "candidate-1", { action: "approve", status: "APPROVED", derived_from_outcome_ids: [], teacher_override: { acknowledged: true, reason: "Teacher override" } });
    expect(approved).toMatchObject({ revision: 3, status: "APPROVED" });
  });

  it("persists Activity Intent semantics, avoids no-op churn, and marks generated content stale on change", async () => {
    const input = { id: "44444444-4444-4444-8444-444444444444", runId, structureRevision: 1, sectionRef: "section-01", activityRef: "quiz-01", activityType: "quiz" as const, maxAttempts: 2, optionsJson: { question_count: 5 }, purpose: "PRACTICE" as const, selectedObjectiveIdsJson: ["objective-1"], selectedOutcomeIdsJson: ["outcome-1"], contextRevision: 3, learnerContextRevision: 2, learnerContextAcknowledged: true, generationInstruction: "Practice loops" };
    const first = await intentRepo.select(input);
    expect(first).toMatchObject({ intentRevision: 1, purpose: "PRACTICE", selectedOutcomeIdsJson: ["outcome-1"], generationInstruction: "Practice loops" });
    const noop = await intentRepo.select({ ...input, id: "55555555-5555-4555-8555-555555555555" });
    expect(noop.intentRevision).toBe(1);
    await intentRepo.beginAttempt(first.id);
    await intentRepo.complete(first.id, { contentJson: { type: "quiz" }, groundingMode: "SYLLABUS_SCOPED_AI", reviewRequired: false, generationInstruction: "Practice loops" });
    const changed = await intentRepo.select({ ...input, id: "66666666-6666-4666-8666-666666666666", purpose: "FORMATIVE", selectedObjectiveIdsJson: [], selectedOutcomeIdsJson: ["outcome-1"], generationInstruction: "Explain loops" });
    expect(changed).toMatchObject({ intentRevision: 2, purpose: "FORMATIVE", status: "stale", generationInstruction: "Explain loops" });
  });

  it("treats PostgreSQL jsonb key order as a no-op and isolates generated siblings", async () => {
    const common = {
      runId,
      structureRevision: 1,
      sectionRef: "section-01",
      maxAttempts: 2,
      purpose: "FORMATIVE" as const,
      selectedObjectiveIdsJson: ["objective-1"],
      selectedOutcomeIdsJson: ["outcome-1"],
      contextRevision: 3,
      learnerContextRevision: 2,
      learnerContextAcknowledged: true,
      alignmentOverrideJson: { acknowledged: true, reason: "Cross-section review", metadata: { z: 1, a: { b: 2, a: 1 } } },
    };
    const quizInput = {
      ...common,
      id: "77777777-7777-4777-8777-777777777777",
      activityRef: "quiz-01",
      activityType: "quiz" as const,
      optionsJson: { question_type: "multichoice", question_count: 5, choices_per_question: 4, constraints: { z: 1, a: { b: 2, a: 1 } } },
      generationInstruction: "Quiz prompt",
    };
    const assignmentInput = {
      ...common,
      id: "88888888-8888-4888-8888-888888888888",
      activityRef: "assignment-01",
      activityType: "assignment" as const,
      optionsJson: { grade: 100, rubric: { z: true, a: "short" } },
      generationInstruction: "Assignment prompt",
    };
    const quiz = await intentRepo.select(quizInput);
    const assignment = await intentRepo.select(assignmentInput);
    for (const intent of [quiz, assignment]) {
      await intentRepo.beginAttempt(intent.id);
      await intentRepo.complete(intent.id, { contentJson: { type: intent.activityType }, groundingMode: "SYLLABUS_SCOPED_AI", reviewRequired: false, generationInstruction: intent.generationInstruction ?? undefined });
    }

    const quizChanged = await intentRepo.select({
      ...quizInput,
      id: "99999999-9999-4999-8999-999999999999",
      optionsJson: { constraints: { a: { a: 1, b: 2 }, z: 1 }, choices_per_question: 4, question_count: 5, question_type: "multichoice" },
      generationInstruction: "Quiz revised",
      alignmentOverrideJson: { metadata: { a: { a: 1, b: 2 }, z: 1 }, reason: "Cross-section review", acknowledged: true },
    });
    expect(quizChanged).toMatchObject({ status: "stale", intentRevision: 2, generationInstruction: "Quiz revised" });

    const assignmentNoop = await intentRepo.select({
      ...assignmentInput,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      optionsJson: { rubric: { a: "short", z: true }, grade: 100 },
      alignmentOverrideJson: { metadata: { a: { a: 1, b: 2 }, z: 1 }, reason: "Cross-section review", acknowledged: true },
    });
    expect(assignmentNoop).toMatchObject({ status: "generated", intentRevision: 1, generationInstruction: "Assignment prompt" });

    const quizNoop = await intentRepo.select({
      ...quizInput,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      optionsJson: { question_count: 5, question_type: "multichoice", constraints: { a: { a: 1, b: 2 }, z: 1 }, choices_per_question: 4 },
      generationInstruction: "Quiz revised",
      alignmentOverrideJson: { acknowledged: true, reason: "Cross-section review", metadata: { z: 1, a: { b: 2, a: 1 } } },
    });
    expect(quizNoop).toMatchObject({ status: "stale", intentRevision: 2, generationInstruction: "Quiz revised" });
  });
});
