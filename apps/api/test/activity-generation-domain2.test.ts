import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "domain2-model", AGENT_MODEL_TIMEOUT_MS: "100" });

const syllabus = {
  schema_version: "0.1" as const,
  metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 80, sha256: "a".repeat(64) },
  course_title: "Search",
  learning_objectives: ["Explain BFS"],
  schedule_or_topics: [{ week_or_unit: "Week 1", title: "Search", topics: ["BFS queue"], source: { kind: "line" as const, start_line: 1, end_line: 1 } }],
  raw_text: "Week 1 Search BFS queue",
};

const coreContext = {
  schema_version: "0.1" as const,
  policy_version: "instructional-design.v0.1",
  revision: 3,
  run_id: "run-1",
  source_syllabus: { normalized_syllabus_version: "0.1" as const, filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) },
  course: {},
  learner_context: { revision: 2, status: "PROVIDED_BY_SYLLABUS" as const, target_learners: [{ text: "undergraduate", origin: "PROVIDED_BY_SYLLABUS" as const, source_refs: [] }], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [{ objective_id: "objective-1", source_text: "Explain BFS", source_refs: [], status: "SOURCE" as const }],
  source_learning_outcomes: [{ source_outcome_id: "source-1", source_text: "Explain BFS", source_refs: [], measurable_status: "MEASURABLE" as const, review_required: false }, { source_outcome_id: "source-2", source_text: "Implement DFS", source_refs: [], measurable_status: "MEASURABLE" as const, review_required: false }],
  approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Explain BFS", source_outcome_ids: ["source-1"], source_refs: [], approval_origin: "SOURCE_AS_IS" as const, approved_by_teacher: true as const, revision: 2 }, { outcome_id: "outcome-2", text: "Implement DFS", source_outcome_ids: ["source-2"], source_refs: [], approval_origin: "SOURCE_AS_IS" as const, approved_by_teacher: true as const, revision: 4 }],
  schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [],
  provenance: { extractor_version: "syllabus-semantics.v0.2" as const, location_basis: "NORMALIZED_RAW_TEXT_LINES" as const },
};

function makeIntentRepo() {
  const row: any = {
    id: "intent-1", runId: "run-1", structureRevision: 1, sectionRef: "section-01", activityRef: "assignment-01", activityType: "assignment",
    status: "selected", intentRevision: 4, purpose: "FORMATIVE", selectedObjectiveIdsJson: ["objective-1"], selectedOutcomeIdsJson: ["outcome-1"], contextRevision: 3,
    learnerContextRevision: 2, learnerContextAcknowledged: true, alignmentOverrideJson: null, attemptCount: 0, maxAttempts: 2,
    optionsJson: { title: "Search lab", grade: 100 }, groundingMode: null, materialSnapshotId: null, reviewRequired: false,
    shellConfirmedAt: null, contentJson: null, generationInstruction: "Use the queue trace.", qualityReviewJson: null, generationMetadataJson: null, error: null,
    updatedAt: "2026-09-16T00:00:00.000Z",
  };
  return {
    row,
    getByRef: vi.fn().mockResolvedValue(row),
    get: vi.fn().mockResolvedValue(row),
    markStaleForContext: vi.fn().mockResolvedValue(0),
    beginAttempt: vi.fn().mockImplementation(async () => { row.status = "creating"; row.attemptCount += 1; return { ...row }; }),
    failAttempt: vi.fn(),
    complete: vi.fn().mockImplementation(async (_id: string, result: any, expected: any) => { Object.assign(row, result, { status: "generated" }); return expected.intentRevision === 4; }),
    markStale: vi.fn().mockResolvedValue(true),
  };
}

function makeSnapshotRepo() {
  const snapshot = {
    id: "snapshot-1", runId: "run-1", structureRevision: 1, sectionRef: "section-01", revision: 1, extractorVersion: "test",
    normalizedText: "Breadth-first search uses a FIFO queue.", normalizedTextHash: "d".repeat(64), estimatedTokens: 8, createdByMoodleUserId: 7,
    createdAt: "2026-09-16T00:00:00.000Z", filesJson: [{ moodleMaterialId: 1, filename: "lecture.md", mediaType: "text/markdown", byteSize: 40, sha256: "e".repeat(64), useForGrounding: true, publishToCourse: false, extractionStatus: "success" }],
  };
  return { getLatestSnapshot: vi.fn().mockResolvedValue(snapshot), getSnapshot: vi.fn().mockResolvedValue(snapshot) };
}

describe("Ticket 21 Activity Design generation route", () => {
  it("passes only selected aligned context, persists self-review/lineage, and uses persisted instruction", async () => {
    const intents = makeIntentRepo();
    const snapshotRepo = makeSnapshotRepo();
    const model = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "assignment", title: "Provider title", description: "Explain BFS with the supplied queue.", instructions: ["Submit the explanation."], grade: 100,
        source_refs: [{ source: "lecture.md", section: "section-01" }], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"],
        quality_review: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS", warnings: [] },
        scope_exceptions: { new_concepts: [], new_prerequisites: [], new_tools_or_frameworks: [], new_technical_requirements: [] },
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", normalizedSyllabus: syllabus }), getCoreCourseDesignContext: vi.fn().mockResolvedValue(coreContext) };
    const structureRevisionRepo = { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { course: { title: "Search" }, sections: [{ ref: "section-01", position: 1, title: "Week 1: Search", summary: "BFS", source_refs: [{ source: "lecture.md", section: "section-01" }], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"], activity_intents: [] }] } }) };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRevisionRepo as any, activityIntentRepo: intents as any, snapshotRepo: snapshotRepo as any, modelClient: model as any, riskDashboardRepo: { getCourseState: vi.fn(), getSnapshot: vi.fn(), listStudentHistory: vi.fn() }, fastifyOptions: { logger: false } });

    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/generate" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ status: "generated", purpose: "FORMATIVE", selected_outcome_ids: ["outcome-1"], quality_review: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS" }, generation_metadata: { provider: "ollama", model: "domain2-model", activity_intent_revision: 4, core_context_revision: 3, structure_revision: 1, selected_outcome_ids: ["outcome-1"], material_snapshot_id: "snapshot-1" } });
    expect(body.activity.learning_objectives).toEqual(["Explain BFS"]);
    const request = model.chat.mock.calls[0]?.[0];
    expect(request.messages.every((message: { content: string }) => !message.content.includes("outcome-2"))).toBe(true);
    expect(request.messages.some((message: { content: string }) => message.content.includes("Use the queue trace."))).toBe(true);
    expect(intents.complete).toHaveBeenCalledWith("intent-1", expect.objectContaining({ qualityReviewJson: expect.objectContaining({ purpose_fit: "PASS" }), generationMetadataJson: expect.objectContaining({ structure_prompt_version: "structure-design.v0.1" }) }), expect.objectContaining({ intentRevision: 4, contextRevision: 3, learnerContextRevision: 2 }));
    await app.close();
  });
});

  it("refuses to publish when the Intent changes while the model is in flight", async () => {
    const intents = makeIntentRepo();
    const snapshotRepo = makeSnapshotRepo();
    let releaseModel!: () => void;
    let modelCalled!: () => void;
    const modelReady = new Promise<void>((resolve) => { modelCalled = resolve; });
    const modelGate = new Promise<void>((resolve) => { releaseModel = resolve; });
    const model = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn(async () => {
        modelCalled();
        await modelGate;
        return { rawText: JSON.stringify({ type: "assignment", title: "Provider title", description: "Explain BFS.", instructions: ["Submit."], grade: 100, source_refs: [{ source: "lecture.md", section: "section-01" }], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"], quality_review: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS", warnings: [] }, scope_exceptions: { new_concepts: [], new_prerequisites: [], new_tools_or_frameworks: [], new_technical_requirements: [] } }), message: { role: "assistant", content: "" }, toolCalls: [] };
      }),
    };
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", normalizedSyllabus: syllabus }), getCoreCourseDesignContext: vi.fn().mockResolvedValue(coreContext) };
    const structureRevisionRepo = { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { course: { title: "Search" }, sections: [{ ref: "section-01", position: 1, title: "Week 1: Search", summary: "BFS", source_refs: [{ source: "lecture.md", section: "section-01" }], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"], activity_intents: [] }] } }) };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRevisionRepo as any, activityIntentRepo: intents as any, snapshotRepo: snapshotRepo as any, modelClient: model as any, riskDashboardRepo: { getCourseState: vi.fn(), getSnapshot: vi.fn(), listStudentHistory: vi.fn() }, fastifyOptions: { logger: false } });

    const responsePromise = app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/generate" });
    await modelReady;
    intents.row.status = "stale";
    intents.row.intentRevision = 5;
    releaseModel();
    const response = await responsePromise;
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("ACTIVITY_GENERATION_STALE");
    expect(intents.complete).not.toHaveBeenCalled();
    await app.close();
  });

it("rejects hidden unauthorized technical scope before Activity content persistence", async () => {
  const intents = makeIntentRepo();
  const snapshotRepo = makeSnapshotRepo();
  const model = {
    ping: vi.fn(), listModels: vi.fn(),
    chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
      type: "assignment", title: "Search comparison", description: "Compare BFS with the Dijkstra algorithm.", instructions: ["Explain the Dijkstra algorithm."], grade: 100,
      source_refs: [{ source: "lecture.md", section: "section-01" }], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"],
      quality_review: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS", warnings: [] },
      scope_exceptions: { new_concepts: [], new_prerequisites: [], new_tools_or_frameworks: [], new_technical_requirements: [] },
    }), message: { role: "assistant", content: "" }, toolCalls: [] }),
  };
  const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", normalizedSyllabus: syllabus }), getCoreCourseDesignContext: vi.fn().mockResolvedValue(coreContext) };
  const structureRevisionRepo = { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { course: { title: "Search" }, sections: [{ ref: "section-01", position: 1, title: "Week 1: Search", summary: "BFS", source_refs: [{ source: "lecture.md", section: "section-01" }], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"], activity_intents: [] }] } }) };
  const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRevisionRepo as any, activityIntentRepo: intents as any, snapshotRepo: snapshotRepo as any, modelClient: model as any, riskDashboardRepo: { getCourseState: vi.fn(), getSnapshot: vi.fn(), listStudentHistory: vi.fn() }, fastifyOptions: { logger: false } });

  const response = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/generate" });
  expect(response.statusCode).toBe(200);
  expect(intents.complete).not.toHaveBeenCalled();
  expect(intents.failAttempt).toHaveBeenCalledWith("intent-1", false, expect.stringMatching(/Dijkstra|outside the authorized Material\/Outcome context/iu));
  await app.close();
});

it("marks generation without selected LO/CLO as Teacher Review Required", async () => {
  const intents = makeIntentRepo();
  intents.row.selectedObjectiveIdsJson = [];
  intents.row.selectedOutcomeIdsJson = [];
  intents.row.alignmentOverrideJson = { kind: "MISSING_ALIGNMENT", acknowledged: true, reason: "Teacher confirmed generation without selected LO/CLO alignment." };
  const snapshotRepo = makeSnapshotRepo();
  const model = { ping: vi.fn(), listModels: vi.fn(), chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
    type: "assignment", title: "Teacher review task", description: "Complete a task using the supplied weekly material.", instructions: ["Submit a response."], learning_objectives: ["Demonstrate understanding of the supplied weekly material for Teacher review."], grade: 100,
    source_refs: [{ source: "lecture.md", section: "section-01" }], aligned_objective_ids: [], aligned_outcome_ids: [],
    quality_review: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS", warnings: [] },
    scope_exceptions: { new_concepts: [], new_prerequisites: [], new_tools_or_frameworks: [], new_technical_requirements: [] },
  }), message: { role: "assistant", content: "" }, toolCalls: [] }) };
  const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", normalizedSyllabus: syllabus }), getCoreCourseDesignContext: vi.fn().mockResolvedValue(coreContext) };
  const structureRevisionRepo = { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { course: { title: "Search" }, sections: [{ ref: "section-01", position: 1, title: "Week 1: Search", summary: "BFS", source_refs: [{ source: "lecture.md", section: "section-01" }], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"], activity_intents: [] }] } }) };
  const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRevisionRepo as any, activityIntentRepo: intents as any, snapshotRepo: snapshotRepo as any, modelClient: model as any, riskDashboardRepo: { getCourseState: vi.fn(), getSnapshot: vi.fn(), listStudentHistory: vi.fn() }, fastifyOptions: { logger: false } });
  const response = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/generate" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ review_required: true, quality_review: { outcome_alignment: "WARN", warnings: expect.arrayContaining(["ALIGNMENT_REVIEW_REQUIRED"]) }, generation_metadata: { alignment_review_required: true, selected_objective_ids: [], selected_outcome_ids: [] } });
  expect(intents.complete).toHaveBeenCalledWith("intent-1", expect.objectContaining({ reviewRequired: true, generationMetadataJson: expect.objectContaining({ alignment_review_required: true }) }), expect.anything());
  await app.close();
});
