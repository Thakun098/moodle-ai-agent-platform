import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test-model", AGENT_MODEL_TIMEOUT_MS: "100" });

function syllabus(title = "Recursion", topics: string[] = []) {
  return {
    schema_version: "0.1" as const,
    metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 20, sha256: "a".repeat(64) },
    course_title: "CS",
    learning_objectives: [],
    schedule_or_topics: [{ week_or_unit: "Week 1", title, topics, source: { kind: "line" as const, start_line: 1, end_line: 1 } }],
    raw_text: `Week 1 ${title}`,
  };
}

function structureRepo() {
  return { getSealedRevision: vi.fn().mockResolvedValue({
    id: "structure-1", runId: "run-1", revision: 1, title: "CS", summary: "CS", validationStatus: "valid", validationErrors: null,
    sealedAt: "2026-09-07T00:00:00Z", sealedByMoodleUserId: 7, teacherConstraintsJson: { activityRules: [], warnings: [] }, createdAt: "2026-09-07T00:00:00Z",
    contentJson: { course: { title: "CS" }, sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Week 1", source_refs: [{ source: "syllabus.md", section: "lines 1-1" }], activity_intents: [] }] },
  }) };
}

function makeIntentRepo(maxAttempts = 2) {
  const row: any = {
    id: "intent-1", runId: "run-1", structureRevision: 1, sectionRef: "section-01", activityRef: "assignment-01", activityType: "assignment",
    status: "selected", attemptCount: 0, maxAttempts, optionsJson: { title: "Assignment: Week 1", grade: 100 }, groundingMode: null,
    materialSnapshotId: null, reviewRequired: false, shellConfirmedAt: null, contentJson: null, generationInstruction: null, error: null, updatedAt: "2026-09-07T00:00:00Z",
  };
  return {
    row,
    getByRef: vi.fn().mockImplementation(async () => row),
    get: vi.fn().mockImplementation(async () => row),
    markInsufficient: vi.fn().mockImplementation(async () => { row.status = "insufficient_evidence"; row.groundingMode = "INSUFFICIENT_EVIDENCE"; }),
    beginAttempt: vi.fn().mockImplementation(async () => {
      if (!["selected", "failed", "timed_out", "stale", "insufficient_evidence"].includes(row.status) || row.attemptCount >= row.maxAttempts) return null;
      row.status = "creating"; row.attemptCount += 1; row.error = null; return { ...row };
    }),
    failAttempt: vi.fn().mockImplementation(async (_id: string, timedOut: boolean, error: string) => {
      row.status = row.attemptCount >= row.maxAttempts ? "retry_exhausted" : timedOut ? "timed_out" : "failed";
      row.error = error;
    }),
    complete: vi.fn().mockImplementation(async (_id: string, result: any) => { Object.assign(row, result, { status: "generated", materialSnapshotId: result.materialSnapshotId ?? null }); return true; }),
    confirmShell: vi.fn().mockImplementation(async (_id: string, content: any) => {
      if (row.status !== "insufficient_evidence") return false;
      row.status = "shell"; row.contentJson = content; row.shellConfirmedAt = "2026-09-07T00:00:00Z"; return true;
    }),
  };
}

const noSnapshotRepo = {
  getLatestSnapshot: vi.fn().mockResolvedValue(null),
  getSnapshot: vi.fn().mockResolvedValue(null),
};

describe("Per-Activity generation — ADR-0002", () => {
  it("returns INSUFFICIENT_EVIDENCE without spending a model call", async () => {
    const intents = makeIntentRepo();
    const model = { ping: vi.fn(), listModels: vi.fn(), chat: vi.fn() };
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", normalizedSyllabus: syllabus("Week 1") }) };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo() as any, activityIntentRepo: intents as any, snapshotRepo: noSnapshotRepo as any, modelClient: model as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/generate" });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe("insufficient_evidence");
    expect(intents.markInsufficient).toHaveBeenCalledTimes(1);
    expect(model.chat).not.toHaveBeenCalled();
    await app.close();
  });

  it("uses syllabus-scoped AI for a meaningful topic-only syllabus and persists review_required", async () => {
    const intents = makeIntentRepo();
    const model = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({ status: "generated", activity: {
        type: "assignment", title: "ignored", description: "Practice recursion", instructions: ["Solve one recursion task"], learning_objectives: ["Apply recursion"], grade: 100,
      } }) }),
    };
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", normalizedSyllabus: syllabus("Recursion") }) };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo() as any, activityIntentRepo: intents as any, snapshotRepo: noSnapshotRepo as any, modelClient: model as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/generate" });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("generated");
    expect(body.grounding_mode).toBe("SYLLABUS_SCOPED_AI");
    expect(body.review_required).toBe(true);
    expect(model.chat).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("exhausts configurable technical attempts per Activity and never converts failure into a shell", async () => {
    const intents = makeIntentRepo(2);
    const timeout = Object.assign(new Error("model timed out"), { code: "MODEL_TIMEOUT" });
    const model = { ping: vi.fn(), listModels: vi.fn(), chat: vi.fn().mockRejectedValue(timeout) };
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", normalizedSyllabus: syllabus("Recursion") }) };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo() as any, activityIntentRepo: intents as any, snapshotRepo: noSnapshotRepo as any, modelClient: model as any, fastifyOptions: { logger: false } });

    const first = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/generate" });
    expect(JSON.parse(first.body).status).toBe("timed_out");
    expect(JSON.parse(first.body).attempt_count).toBe(1);
    const second = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/generate" });
    expect(JSON.parse(second.body).status).toBe("retry_exhausted");
    expect(JSON.parse(second.body).attempt_count).toBe(2);
    const third = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/generate" });
    expect(third.statusCode).toBe(409);
    expect(JSON.parse(third.body).error.code).toBe("ACTIVITY_RETRY_EXHAUSTED");

    const shell = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/confirm-shell" });
    expect(shell.statusCode).toBe(409);
    expect(JSON.parse(shell.body).error.code).toBe("EMPTY_SHELL_NOT_ALLOWED");
    await app.close();
  });

  it("creates a deterministic shell only after insufficient evidence is confirmed", async () => {
    const intents = makeIntentRepo();
    intents.row.status = "insufficient_evidence";
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", normalizedSyllabus: syllabus("Week 1") }) };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo() as any, activityIntentRepo: intents as any, snapshotRepo: noSnapshotRepo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/confirm-shell" });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("shell");
    expect(body.activity).toMatchObject({ type: "assignment", description: "Content pending teacher input.", grade: 100 });
    await app.close();
  });
});

  it("persists generation instruction before a failed model attempt and keeps the intent revision trace", async () => {
    const events: string[] = [];
    const intents = makeIntentRepo();
    intents.row.contextRevision = 3;
    intents.row.learnerContextRevision = 1;
    intents.row.intentRevision = 1;
    intents.updateContextRevision = vi.fn().mockImplementation(async () => { events.push("context"); intents.row.contextRevision = 3; intents.row.intentRevision += 1; return intents.row; });
    intents.updateGenerationInstruction = vi.fn().mockImplementation(async (_id: string, instruction: string) => { events.push("instruction"); intents.row.generationInstruction = instruction; intents.row.intentRevision += 1; return intents.row; });
    const timeout = Object.assign(new Error("model timed out"), { code: "MODEL_TIMEOUT" });
    const model = { ping: vi.fn(), listModels: vi.fn(), chat: vi.fn().mockImplementation(async () => { events.push("model"); throw timeout; }) };
    const context = {
      schema_version: "0.1", policy_version: "instructional-design.v0.1", revision: 3, run_id: "run-1",
      source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) }, course: {},
      learner_context: { revision: 1, status: "PROVIDED_BY_SYLLABUS", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
      learning_objectives: [], source_learning_outcomes: [], approved_learning_outcomes: [], schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [], provenance: { extractor_version: "syllabus-semantics.v0.2", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
    };
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", normalizedSyllabus: syllabus("Recursion") }), getCoreCourseDesignContext: vi.fn().mockResolvedValue(context) };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo() as any, activityIntentRepo: intents as any, snapshotRepo: noSnapshotRepo as any, modelClient: model as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/generate", payload: { generation_instruction: "Explain recursion with one trace." } });
    expect(response.statusCode).toBe(200);
    expect(intents.updateGenerationInstruction).toHaveBeenCalledWith("intent-1", "Explain recursion with one trace.", 3);
    expect(events.indexOf("instruction")).toBeLessThan(events.indexOf("model"));
    expect(JSON.parse(response.body)).toMatchObject({ status: "timed_out", generation_instruction: "Explain recursion with one trace.", intent_revision: 2 });
    await app.close();
  });