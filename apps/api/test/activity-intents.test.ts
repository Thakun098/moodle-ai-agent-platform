import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test-model" });

function makeRunRepo() {
  return { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", model: "test-model" }) };
}

function makeStructureRepo() {
  return { getSealedRevision: vi.fn().mockResolvedValue({
    id: "structure-1", runId: "run-1", revision: 1, sealedAt: "2026-09-07T00:00:00Z",
    contentJson: { course: { title: "AI" }, sections: [{ ref: "section-01", position: 1, title: "Week 1: Search", summary: "Search", source_refs: [], activity_intents: [] }] },
  }) };
}

function makeIntentRepo() {
  const rows: any[] = [];
  return {
    rows,
    listSection: vi.fn().mockImplementation(async (_runId: string, revision: number, sectionRef: string) => rows.filter((r) => r.structureRevision === revision && r.sectionRef === sectionRef)),
    select: vi.fn().mockImplementation(async (input: any) => {
      const old = rows.find((r) => r.sectionRef === input.sectionRef && r.activityType === input.activityType);
      if (old) {
        if (old.status === "removed") Object.assign(old, input, { status: "selected", attemptCount: 0, reviewRequired: false });
        return old;
      }
      const row = { ...input, status: "selected", attemptCount: 0, groundingMode: null, materialSnapshotId: null, reviewRequired: false, shellConfirmedAt: null, error: null, updatedAt: "2026-09-07T00:00:00Z" };
      rows.push(row);
      return row;
    }),
    remove: vi.fn().mockImplementation(async (id: string) => { const row = rows.find((r) => r.id === id); if (!row || row.status === "creating") return false; row.status = "removed"; return true; }),
    getByRef: vi.fn().mockImplementation(async (_runId: string, revision: number, ref: string) => rows.find((r) => r.structureRevision === revision && r.activityRef === ref) ?? null),
  };
}

describe("Activity Intent API — ADR-0002", () => {
  it("selects Quiz and Assignment explicitly with deterministic defaults and no Material requirement", async () => {
    const repo = makeIntentRepo();
    const app = buildApp({ config, runRepo: makeRunRepo() as any, structureRevisionRepo: makeStructureRepo() as any, activityIntentRepo: repo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: true, assignment: true } });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.intents).toHaveLength(2);
    expect(body.intents.find((x: any) => x.activity_type === "quiz").options).toMatchObject({ question_count: 5, question_type: "multichoice", choices_per_question: 4, correct_choices_per_question: 1, default_mark: 1 });
    expect(body.intents.find((x: any) => x.activity_type === "assignment").options).toMatchObject({ grade: 100 });
    expect(body.intents.map((x: any) => x.activity_ref).sort()).toEqual(["assignment-01", "quiz-01"]);
    await app.close();
  });

  it("supports custom optional activity controls and partial selection", async () => {
    const repo = makeIntentRepo();
    const app = buildApp({ config, runRepo: makeRunRepo() as any, structureRevisionRepo: makeStructureRepo() as any, activityIntentRepo: repo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: true, quiz_options: { question_count: 8, choices_per_question: 3, question_type: "truefalse", title: "Checkpoint" } } });
    expect(response.statusCode).toBe(200);
    const intent = JSON.parse(response.body).intents[0];
    expect(intent.options).toMatchObject({ title: "Checkpoint", question_count: 8, question_type: "truefalse", choices_per_question: 3 });
    expect(intent.max_attempts).toBe(2);
    await app.close();
  });

  it("deselects only the requested Activity Intent and allows the sibling to remain", async () => {
    const repo = makeIntentRepo();
    const app = buildApp({ config, runRepo: makeRunRepo() as any, structureRevisionRepo: makeStructureRepo() as any, activityIntentRepo: repo as any, fastifyOptions: { logger: false } });
    await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: true, assignment: true } });
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: false } });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).intents.map((x: any) => x.activity_type)).toEqual(["assignment"]);
    await app.close();
  });

  it("requires a sealed Structure before selection", async () => {
    const structureRepo = { getSealedRevision: vi.fn().mockResolvedValue(null) };
    const app = buildApp({ config, runRepo: makeRunRepo() as any, structureRevisionRepo: structureRepo as any, activityIntentRepo: makeIntentRepo() as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: true } });
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe("STRUCTURE_NOT_SEALED");
    await app.close();
  });

  it("keeps GET activity-intents read-only even when Core Context advanced", async () => {
    const repo = { ...makeIntentRepo(), markStaleForContext: vi.fn().mockResolvedValue(1) };
    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", model: "test-model" }),
      getCoreCourseDesignContext: vi.fn().mockResolvedValue({ revision: 4 }),
    };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: makeStructureRepo() as any, activityIntentRepo: repo as any, fastifyOptions: { logger: false } });

    const response = await app.inject({ method: "GET", url: "/api/runs/run-1/sections/section-01/activity-intents" });

    expect(response.statusCode).toBe(200);
    expect(repo.markStaleForContext).not.toHaveBeenCalled();
    await app.close();
  });
});

  it("persists independent Purpose/alignment instructions and enforces learner/out-of-section gates", async () => {
    const currentContext: CoreCourseDesignContext = {
      schema_version: "0.1", policy_version: "instructional-design.v0.1", revision: 4, run_id: "run-1",
      source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) }, course: {},
      learner_context: { revision: 2, status: "PROVIDED_BY_SYLLABUS", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
      learning_objectives: [{ objective_id: "objective-1", source_text: "Design", source_refs: [], status: "SOURCE" }],
      source_learning_outcomes: [{ source_outcome_id: "source-1", source_text: "Source 1", source_refs: [], measurable_status: "MEASURABLE", review_required: false }, { source_outcome_id: "source-2", source_text: "Source 2", source_refs: [], measurable_status: "MEASURABLE", review_required: false }],
      approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Outcome 1", source_outcome_ids: ["source-1"], source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 2 }, { outcome_id: "outcome-2", text: "Outcome 2", source_outcome_ids: ["source-2"], source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 3 }],
      schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [], provenance: { extractor_version: "syllabus-semantics.v0.2", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
    };
    const rows: any[] = [];
    const repo = {
      rows,
      listSection: vi.fn(async (_run: string, _revision: number, sectionRef: string) => rows.filter((row) => row.sectionRef === sectionRef && row.status !== "removed")),
      select: vi.fn(async (input: any) => { const existing = rows.find((row) => row.activityType === input.activityType); if (existing) { Object.assign(existing, input); return existing; } const row = { ...input, status: "selected", intentRevision: 1, attemptCount: 0, groundingMode: null, materialSnapshotId: null, reviewRequired: false, shellConfirmedAt: null, contentJson: null, error: null, updatedAt: "2026-09-15T00:00:00Z" }; rows.push(row); return row; }),
      remove: vi.fn(async (id: string) => { const row = rows.find((item) => item.id === id); if (!row) return false; row.status = "removed"; return true; }),
      markStaleForContext: vi.fn(),
    };
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning" }), getCoreCourseDesignContext: vi.fn().mockResolvedValue(currentContext) };
    const structureRepo = { getSealedRevision: vi.fn().mockResolvedValue({ id: "structure-1", runId: "run-1", revision: 1, sealedAt: "2026-09-15T00:00:00Z", contentJson: { course: { title: "AI" }, sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Week 1", aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"], activity_intents: [] }] } }) };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, activityIntentRepo: repo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: {
      quiz: true, assignment: true,
      quiz_purpose: "PRACTICE", quiz_selected_objective_ids: ["objective-1"], quiz_selected_outcome_ids: ["outcome-1"], quiz_learner_context_revision: 2, quiz_learner_context_acknowledged: true, quiz_generation_instruction: "Use a short practice check.",
      assignment_purpose: "FORMATIVE", assignment_selected_outcome_ids: ["outcome-1"], assignment_learner_context_revision: 2, assignment_learner_context_acknowledged: true, assignment_generation_instruction: "Require explanation.",
    } });
    expect(response.statusCode).toBe(200);
    const intents = response.json().intents;
    expect(intents.find((item: any) => item.activity_type === "quiz")).toMatchObject({ purpose: "PRACTICE", selected_objective_ids: ["objective-1"], selected_outcome_ids: ["outcome-1"], generation_instruction: "Use a short practice check.", intent_revision: 1 });
    expect(intents.find((item: any) => item.activity_type === "assignment")).toMatchObject({ purpose: "FORMATIVE", selected_outcome_ids: ["outcome-1"], generation_instruction: "Require explanation.", intent_revision: 1 });

    const provisional = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { assignment: true, assignment_purpose: "FORMATIVE", assignment_selected_outcome_ids: [], assignment_learner_context_revision: 2, assignment_learner_context_acknowledged: true, assignment_alignment_override: {} } });
    expect(provisional.statusCode).toBe(200);
    expect(provisional.json().intents.find((item: any) => item.activity_type === "assignment")).toMatchObject({ selected_outcome_ids: [], alignment_override: null });

    const outOfSection = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: true, quiz_purpose: "FORMATIVE", quiz_selected_outcome_ids: ["outcome-2"], quiz_learner_context_revision: 2, quiz_learner_context_acknowledged: true } });
    expect(outOfSection.statusCode).toBe(422);
    expect(outOfSection.json().error.code).toBe("ACTIVITY_INTENT_ALIGNMENT_OVERRIDE_REQUIRED");

    const acknowledged = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: true, quiz_purpose: "FORMATIVE", quiz_selected_outcome_ids: ["outcome-2"], quiz_learner_context_revision: 2, quiz_learner_context_acknowledged: true, quiz_alignment_override: { acknowledged: true, reason: "Teacher intentionally targets the cross-section Outcome." } } });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json().intents.find((item: any) => item.activity_type === "quiz")).toMatchObject({ alignment_override: { acknowledged: true }, selected_outcome_ids: ["outcome-2"] });

    const missingAlignment = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { assignment: true, assignment_purpose: "FORMATIVE", assignment_selected_outcome_ids: [], assignment_learner_context_revision: 2, assignment_learner_context_acknowledged: true, assignment_alignment_override: { kind: "MISSING_ALIGNMENT", acknowledged: true, reason: "Generate for Teacher review without a selected CLO." } } });
    expect(missingAlignment.statusCode).toBe(200);
    expect(missingAlignment.json().intents.find((item: any) => item.activity_type === "assignment")).toMatchObject({ selected_outcome_ids: [], alignment_override: { kind: "MISSING_ALIGNMENT", acknowledged: true } });
    await app.close();
  });
