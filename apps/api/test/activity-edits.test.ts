import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "edit-test-model", AGENT_MODEL_TIMEOUT_MS: "100" });
const groundingRef = { source: "lecture.md", section: "section-01" };
const syllabus = {
  schema_version: "0.1" as const,
  metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 80, sha256: "a".repeat(64) },
  course_title: "Search",
  learning_objectives: ["Explain BFS"],
  schedule_or_topics: [{ week_or_unit: "Week 1", title: "Search", topics: ["BFS queue"], source: { kind: "line" as const, start_line: 1, end_line: 1 } }],
  raw_text: "Week 1 Search BFS queue",
};
const coreContext = {
  schema_version: "0.1" as const, policy_version: "instructional-design.v0.1", revision: 3, run_id: "run-1",
  source_syllabus: { normalized_syllabus_version: "0.1" as const, filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) }, course: {},
  learner_context: { revision: 2, status: "PROVIDED_BY_SYLLABUS" as const, target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [{ objective_id: "objective-1", source_text: "Explain BFS", source_refs: [], status: "SOURCE" as const }],
  source_learning_outcomes: [{ source_outcome_id: "source-1", source_text: "Explain BFS", source_refs: [], measurable_status: "MEASURABLE" as const, review_required: false }],
  approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Explain BFS", source_outcome_ids: ["source-1"], source_refs: [], approval_origin: "SOURCE_AS_IS" as const, approved_by_teacher: true as const, revision: 2 }],
  schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [], provenance: { extractor_version: "syllabus-semantics.v0.2" as const, location_basis: "NORMALIZED_RAW_TEXT_LINES" as const },
};
const generatedActivity = {
  ref: "assignment-01", type: "assignment", title: "Search lab", description: "Explain BFS", instructions: ["Original instruction"], learning_objectives: ["Explain BFS"], grade: 100, source_refs: [groundingRef],
};

function row() {
  return {
    id: "intent-1", runId: "run-1", structureRevision: 1, sectionRef: "section-01", activityRef: "assignment-01", activityType: "assignment" as const,
    status: "generated" as const, intentRevision: 4, purpose: "FORMATIVE" as const, selectedObjectiveIdsJson: ["objective-1"], selectedOutcomeIdsJson: ["outcome-1"], contextRevision: 3,
    learnerContextRevision: 2, learnerContextAcknowledged: false, alignmentOverrideJson: null, attemptCount: 1, maxAttempts: 2, optionsJson: { title: "Search lab", grade: 100 },
    groundingMode: "MATERIAL_GROUNDED", materialSnapshotId: "snapshot-1", reviewRequired: false, shellConfirmedAt: null, contentJson: structuredClone(generatedActivity),
    contentProvenance: null, activityRevision: 0, sourceGenerationRevision: null, generationInstruction: null,
    qualityReviewJson: { outcome_alignment: "PASS", learner_level_fit: "PASS", scope_compliance: "PASS", purpose_fit: "PASS", warnings: [] },
    generationMetadataJson: { provider: "ollama", model: "edit-test-model" }, error: null, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
  };
}
function snapshotRepo() {
  const snapshot = { id: "snapshot-1", runId: "run-1", structureRevision: 1, sectionRef: "section-01", revision: 1, extractorVersion: "test", normalizedText: "Breadth-first search uses a FIFO queue.", normalizedTextHash: "d".repeat(64), estimatedTokens: 8, createdByMoodleUserId: 7, createdAt: "2026-09-16T00:00:00.000Z", filesJson: [{ moodleMaterialId: 1, filename: "lecture.md", mediaType: "text/markdown", byteSize: 40, sha256: "e".repeat(64), useForGrounding: true, publishToCourse: false, extractionStatus: "success" }] };
  return { getLatestSnapshot: vi.fn().mockResolvedValue(snapshot), getSnapshot: vi.fn().mockResolvedValue(snapshot) };
}
function structureRepo() {
  return { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "BFS", source_refs: [groundingRef], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"] }] } }) };
}

describe("Ticket 22 Activity Teacher edit route", () => {
  it("saves a deterministic Teacher edit revision with zero LLM calls", async () => {
    const current = row();
    const intentRepo = { getByRef: vi.fn().mockResolvedValue(current) };
    const generatedRevision = { id: "rev-1", activityIntentId: "intent-1", revision: 1, provenance: "AI_GENERATED", sourceGenerationRevision: 1, intentRevision: 4, contextRevision: 3, learnerContextRevision: 2, groundingMode: "MATERIAL_GROUNDED", materialSnapshotId: "snapshot-1", contentJson: structuredClone(generatedActivity), qualityReviewJson: current.qualityReviewJson, generationMetadataJson: current.generationMetadataJson, editedByMoodleUserId: null, createdAt: "2026-09-16T00:00:00.000Z" };
    const edited = structuredClone(generatedActivity); edited.instructions = ["Teacher revised instruction"];
    const editedIntent = { ...current, contentJson: edited, contentProvenance: "TEACHER_EDITED", activityRevision: 2, sourceGenerationRevision: 1 };
    const editedRevision = { ...generatedRevision, id: "rev-2", revision: 2, provenance: "TEACHER_EDITED", contentJson: edited, qualityReviewJson: null, generationMetadataJson: null, editedByMoodleUserId: 7 };
    const revisionRepo = {
      recordGeneratedFromIntent: vi.fn().mockResolvedValue({ ...current, contentProvenance: "AI_GENERATED", activityRevision: 1, sourceGenerationRevision: 1 }),
      saveTeacherEdit: vi.fn().mockResolvedValue({ intent: editedIntent, revision: editedRevision }),
      list: vi.fn().mockResolvedValue([generatedRevision, editedRevision]),
    };
    const model = { ping: vi.fn(), listModels: vi.fn(), chat: vi.fn() };
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", normalizedSyllabus: syllabus }), getCoreCourseDesignContext: vi.fn().mockResolvedValue(coreContext) };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo() as any, activityIntentRepo: intentRepo as any, activityRevisionRepo: revisionRepo as any, snapshotRepo: snapshotRepo() as any, modelClient: model as any, riskDashboardRepo: { getCourseState: vi.fn(), getSnapshot: vi.fn(), listStudentHistory: vi.fn() }, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/edit", payload: { activity: edited, expected_activity_revision: 0, edited_by_moodle_user_id: 7 } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ content_provenance: "TEACHER_EDITED", activity_revision: 2, source_generation_revision: 1, learner_context_acknowledged: false, alignment_override: null, attempt_count: 1, max_attempts: 2, generation_instruction: null, error: null, activity: { instructions: ["Teacher revised instruction"] }, revisions: [{ revision: 1, provenance: "AI_GENERATED" }, { revision: 2, provenance: "TEACHER_EDITED" }] });
    expect(revisionRepo.saveTeacherEdit).toHaveBeenCalledWith(expect.objectContaining({ activityIntentId: "intent-1", expectedActivityRevision: 1, editedByMoodleUserId: 7 }));
    expect(model.chat).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects an invalid Teacher edit without saving a new revision", async () => {
    const current = row();
    const intentRepo = { getByRef: vi.fn().mockResolvedValue(current) };
    const revisionRepo = { recordGeneratedFromIntent: vi.fn(), saveTeacherEdit: vi.fn(), list: vi.fn() };
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", normalizedSyllabus: syllabus }), getCoreCourseDesignContext: vi.fn().mockResolvedValue(coreContext) };
    const model = { ping: vi.fn(), listModels: vi.fn(), chat: vi.fn() };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo() as any, activityIntentRepo: intentRepo as any, activityRevisionRepo: revisionRepo as any, snapshotRepo: snapshotRepo() as any, modelClient: model as any, riskDashboardRepo: { getCourseState: vi.fn(), getSnapshot: vi.fn(), listStudentHistory: vi.fn() }, fastifyOptions: { logger: false } });
    const invalid = structuredClone(generatedActivity); invalid.learning_objectives = ["Invent DFS"];
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activities/assignment-01/edit", payload: { activity: invalid } });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.message).toMatch(/cannot change the authorized Assignment learning objectives/iu);
    expect(revisionRepo.recordGeneratedFromIntent).not.toHaveBeenCalled();
    expect(revisionRepo.saveTeacherEdit).not.toHaveBeenCalled();
    expect(model.chat).not.toHaveBeenCalled();
    await app.close();
  });
});
