import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { outcomeReviewRoutes } from "../src/routes/outcome-reviews.js";
import { instructionalDesignRoutes } from "../src/routes/instructional-design.js";
import { loadConfig } from "../src/config/config-loader.js";
import { registerErrorHandler } from "../src/plugins/error-handler.js";

const sourceRef = {
  source: "syllabus" as const,
  sha256: "a".repeat(64),
  start_line: 4,
  end_line: 4,
  text: "Explain loops",
};

function context(): CoreCourseDesignContext {
  return {
    schema_version: "0.1",
    policy_version: "instructional-design.v0.1",
    revision: 1,
    run_id: "run-review",
    source_syllabus: {
      normalized_syllabus_version: "0.1",
      filename: "syllabus.md",
      sha256: "a".repeat(64),
      text_sha256: "b".repeat(64),
    },
    course: {},
    learner_context: {
      revision: 1,
      status: "UNSPECIFIED",
      target_learners: [],
      education_level: [],
      year_level: [],
      prerequisites: [],
      prior_knowledge: [],
      teacher_acknowledged_unspecified: false,
    },
    learning_objectives: [
      { objective_id: "objective-1", source_text: "Explain loops", source_refs: [sourceRef], status: "SOURCE" },
    ],
    source_learning_outcomes: [
      {
        source_outcome_id: "source-outcome-1",
        source_text: "Use loops",
        source_refs: [sourceRef],
        measurable_status: "MEASURABLE",
        review_required: false,
      },
    ],
    approved_learning_outcomes: [],
    schedule_or_topics: [],
    assessment_requirements: [],
    grading_policy: [],
    constraints: [],
    missing_information: [],
    provenance: { extractor_version: "syllabus-semantics.v0.1", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
  };
}

describe("UX/UI Ticket 01 outcome review API", () => {
  it("returns server-authoritative review states and persists explicit Save without changing Core Context revision", async () => {
    const current = context();
    const reviews = new Map<string, { itemType: "LO" | "CLO"; itemId: string; status: "REVIEWED" | "NEEDS_REVISION"; draftText: string | null; updatedByMoodleUserId: string | null }>();
    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-review", status: "planning" }),
      getCoreCourseDesignContext: vi.fn().mockResolvedValue(current),
    };
    const reviewRepo = {
      list: vi.fn().mockImplementation(async () => [...reviews.values()]),
      upsert: vi.fn().mockImplementation(async (value: any) => {
        reviews.set(`${value.itemType}:${value.itemId}`, value);
        return value;
      }),
    };
    const config = loadConfig({
      DATABASE_URL: "postgresql://unused/unused",
      OLLAMA_MODEL: "test",
      INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key",
    });
    const headers = { "x-agentpoc-instructional-design-key": "test-key" };
    const app = Fastify({ logger: false });
    app.register(outcomeReviewRoutes, { config, runRepo: runRepo as any, reviewRepo: reviewRepo as any });
    await app.ready();

    const initial = await app.inject({ method: "GET", url: "/api/runs/run-review/outcome-reviews", headers });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().items).toEqual([
      expect.objectContaining({ item_type: "LO", item_id: "objective-1", status: "PENDING_REVIEW" }),
      expect.objectContaining({ item_type: "CLO", item_id: "source-outcome-1", status: "PENDING_REVIEW" }),
    ]);

    const saved = await app.inject({
      method: "POST",
      url: "/api/runs/run-review/outcome-reviews",
      headers,
      payload: {
        item_type: "CLO",
        item_id: "source-outcome-1",
        status: "REVIEWED",
        draft_text: "Use loops to solve repeated tasks",
        teacher_id: 7,
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      run_id: "run-review",
      review: {
        item_type: "CLO",
        item_id: "source-outcome-1",
        status: "REVIEWED",
        draft_text: "Use loops to solve repeated tasks",
      },
      core_context_revision: 1,
    });
    expect(reviewRepo.upsert).toHaveBeenCalledTimes(1);

    const reload = await app.inject({ method: "GET", url: "/api/runs/run-review/outcome-reviews", headers });
    expect(reload.json().items).toContainEqual(expect.objectContaining({
      item_type: "CLO",
      item_id: "source-outcome-1",
      status: "REVIEWED",
      draft_text: "Use loops to solve repeated tasks",
    }));
    expect(reload.json().core_context_revision).toBe(1);

    await app.close();
  });

  it("derives Approved only from CLO authority and rejects invalid review writes", async () => {
    const current = context();
    current.approved_learning_outcomes.push({
      outcome_id: "approved-outcome-1",
      text: "Use loops to solve repeated tasks",
      source_outcome_ids: ["source-outcome-1"],
      source_refs: [sourceRef],
      approval_origin: "TEACHER_EDITED",
      approved_by_teacher: true,
      revision: 2,
    });
    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-review", status: "planning" }),
      getCoreCourseDesignContext: vi.fn().mockResolvedValue(current),
    };
    const reviewRepo = { list: vi.fn().mockResolvedValue([]), upsert: vi.fn() };
    const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
    const headers = { "x-agentpoc-instructional-design-key": "test-key" };
    const app = Fastify({ logger: false });
    app.register(outcomeReviewRoutes, { config, runRepo: runRepo as any, reviewRepo: reviewRepo as any });
    await app.ready();

    const projection = await app.inject({ method: "GET", url: "/api/runs/run-review/outcome-reviews", headers });
    expect(projection.json().items).toContainEqual(expect.objectContaining({
      item_type: "CLO",
      item_id: "source-outcome-1",
      status: "APPROVED",
      authoritative_text: "Use loops to solve repeated tasks",
    }));

    const approved = await app.inject({ method: "POST", url: "/api/runs/run-review/outcome-reviews", headers, payload: { item_type: "CLO", item_id: "source-outcome-1", status: "APPROVED" } });
    expect(approved.statusCode).toBe(422);

    const unknown = await app.inject({ method: "POST", url: "/api/runs/run-review/outcome-reviews", headers, payload: { item_type: "LO", item_id: "objective-missing", status: "REVIEWED" } });
    expect(unknown.statusCode).toBe(422);
    expect(reviewRepo.upsert).not.toHaveBeenCalled();

    await app.close();
  });
  it("requires persisted Reviewed state before CLO approval in the runtime authority path", async () => {
    const current = context();
    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-review", status: "planning" }),
      getCoreCourseDesignContext: vi.fn().mockResolvedValue(current),
      saveCoreCourseDesignContextRevision: vi.fn(),
      beginInstructionalDesignMutation: vi.fn().mockResolvedValue({ runId: "run-review", status: "planning" }),
    };
    const structureRepo = { getLatestRevision: vi.fn().mockResolvedValue(null), markAlignmentStale: vi.fn() };
    const reviewRepo = { get: vi.fn().mockResolvedValue(null) };
    const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
    const headers = { "x-agentpoc-instructional-design-key": "test-key" };
    const app = Fastify({ logger: false });
    app.register(instructionalDesignRoutes, { config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, candidateRepo: {} as any, reviewRepo: reviewRepo as any, enforceOutcomeReview: true });
    await app.ready();

    const blocked = await app.inject({ method: "POST", url: "/api/runs/run-review/outcomes/approve", headers, payload: { source_outcome_id: "source-outcome-1", use_source_as_is: true } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("OUTCOME_REVIEW_REQUIRED");
    expect(runRepo.saveCoreCourseDesignContextRevision).not.toHaveBeenCalled();

    reviewRepo.get.mockResolvedValue({ itemType: "CLO", itemId: "source-outcome-1", status: "REVIEWED", draftText: "Use reviewed loops" });
    const mismatched = await app.inject({ method: "POST", url: "/api/runs/run-review/outcomes/approve", headers, payload: { source_outcome_id: "source-outcome-1", teacher_text: "Unreviewed replacement", recommended_text: "Use reviewed loops" } });
    expect(mismatched.statusCode).toBe(409);
    expect(mismatched.json().error.code).toBe("OUTCOME_REVIEW_TEXT_MISMATCH");
    expect(runRepo.saveCoreCourseDesignContextRevision).not.toHaveBeenCalled();

    reviewRepo.get.mockResolvedValue({ itemType: "CLO", itemId: "source-outcome-1", status: "REVIEWED", draftText: null });
    const allowed = await app.inject({ method: "POST", url: "/api/runs/run-review/outcomes/approve", headers, payload: { source_outcome_id: "source-outcome-1", use_source_as_is: true } });
    expect(allowed.statusCode).toBe(200);
    expect(runRepo.saveCoreCourseDesignContextRevision).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("safely edits an approved CLO by withdrawing authority and staling existing dependents", async () => {
    const current = context();
    current.approved_learning_outcomes.push({
      outcome_id: "outcome-1", text: "Use loops", source_outcome_ids: ["source-outcome-1"], source_refs: [sourceRef],
      approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 1,
    });
    const savedContexts: CoreCourseDesignContext[] = [];
    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-review", status: "planning" }),
      getCoreCourseDesignContext: vi.fn().mockImplementation(async () => savedContexts.at(-1) ?? current),
      saveCoreCourseDesignContextRevision: vi.fn().mockImplementation(async (value: CoreCourseDesignContext) => { savedContexts.push(value); }),
      beginInstructionalDesignMutation: vi.fn().mockResolvedValue({ runId: "run-review", status: "planning" }),
    };
    const reviewRepo = {
      upsert: vi.fn().mockImplementation(async (value: any) => ({ ...value, updatedAt: "2026-09-17T20:00:00.000Z" })),
    };
    const candidateRepo = { invalidateApprovedForOutcome: vi.fn().mockResolvedValue(2) };
    const structureRepo = {
      getLatestRevision: vi.fn().mockResolvedValue({ revision: 4 }),
      getSealedRevision: vi.fn().mockResolvedValue({ revision: 4 }),
      markAlignmentStale: vi.fn().mockResolvedValue(undefined),
    };
    const activityIntentRepo = { markStaleForContext: vi.fn().mockResolvedValue(3) };
    const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
    const headers = { "x-agentpoc-instructional-design-key": "test-key" };
    const app = Fastify({ logger: false });
    app.register(instructionalDesignRoutes, {
      config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, candidateRepo: candidateRepo as any,
      reviewRepo: reviewRepo as any, activityIntentRepo: activityIntentRepo as any, enforceOutcomeReview: true,
    } as any);
    await app.ready();

    const edited = await app.inject({
      method: "POST", url: "/api/runs/run-review/outcomes/edit-approved", headers,
      payload: { source_outcome_id: "source-outcome-1", teacher_text: "Apply loops to repeated tasks", confirmed: true, teacher_id: 7 },
    });

    expect(edited.statusCode).toBe(200);
    expect(runRepo.beginInstructionalDesignMutation).toHaveBeenCalledWith("run-review");
    expect(savedContexts).toHaveLength(1);
    expect(savedContexts[0]?.revision).toBe(2);
    expect(savedContexts[0]?.approved_learning_outcomes).toHaveLength(0);
    expect(savedContexts[0]?.missing_information).toEqual(expect.arrayContaining([expect.objectContaining({ code: "APPROVED_OUTCOMES_REQUIRED", severity: "BLOCKING" })]));
    expect(reviewRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-review", itemType: "CLO", itemId: "source-outcome-1", status: "REVIEWED", draftText: "Apply loops to repeated tasks", updatedByMoodleUserId: "7",
    }));
    expect(candidateRepo.invalidateApprovedForOutcome).toHaveBeenCalledWith("run-review", "outcome-1");
    expect(structureRepo.markAlignmentStale).toHaveBeenCalledWith("run-review", 2);
    expect(activityIntentRepo.markStaleForContext).toHaveBeenCalledWith("run-review", 4, 2);
    expect(edited.json()).toMatchObject({
      run_id: "run-review",
      core_context: { revision: 2, approved_learning_outcomes: [] },
      review: { item_type: "CLO", item_id: "source-outcome-1", status: "REVIEWED", draft_text: "Apply loops to repeated tasks" },
      stale: { structure_alignment: true, activity_count: 3, competency_candidate_count: 2 },
    });
    await app.close();
  });


  it("rejects approved-edit safety flow for non-approved or unchanged CLOs before mutation", async () => {
    const current = context();
    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-review", status: "planning" }),
      getCoreCourseDesignContext: vi.fn().mockResolvedValue(current),
      saveCoreCourseDesignContextRevision: vi.fn(),
      beginInstructionalDesignMutation: vi.fn(),
    };
    const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
    const headers = { "x-agentpoc-instructional-design-key": "test-key" };
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.register(instructionalDesignRoutes, { config, runRepo: runRepo as any, structureRevisionRepo: {} as any, candidateRepo: {} as any, reviewRepo: {} as any, activityIntentRepo: {} as any, enforceOutcomeReview: true });
    await app.ready();

    const unconfirmed = await app.inject({
      method: "POST", url: "/api/runs/run-review/outcomes/edit-approved", headers,
      payload: { source_outcome_id: "source-outcome-1", teacher_text: "Changed wording" },
    });
    expect(unconfirmed.statusCode).toBe(422);
    expect(unconfirmed.json().error.code).toBe("APPROVED_OUTCOME_EDIT_CONFIRMATION_REQUIRED");
    expect(runRepo.beginInstructionalDesignMutation).not.toHaveBeenCalled();

    const notApproved = await app.inject({
      method: "POST", url: "/api/runs/run-review/outcomes/edit-approved", headers,
      payload: { source_outcome_id: "source-outcome-1", teacher_text: "Changed wording", confirmed: true },
    });
    expect(notApproved.statusCode).toBe(409);
    expect(notApproved.json().error.code).toBe("OUTCOME_NOT_APPROVED");
    expect(runRepo.beginInstructionalDesignMutation).not.toHaveBeenCalled();

    current.approved_learning_outcomes.push({
      outcome_id: "outcome-1", text: "Use loops", source_outcome_ids: ["source-outcome-1"], source_refs: [sourceRef],
      approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 1,
    });
    const unchanged = await app.inject({
      method: "POST", url: "/api/runs/run-review/outcomes/edit-approved", headers,
      payload: { source_outcome_id: "source-outcome-1", teacher_text: "  Use loops  ", confirmed: true },
    });
    expect(unchanged.statusCode).toBe(422);
    expect(unchanged.json().error.code).toBe("APPROVED_OUTCOME_EDIT_NO_CHANGE");
    expect(runRepo.beginInstructionalDesignMutation).not.toHaveBeenCalled();
    expect(runRepo.saveCoreCourseDesignContextRevision).not.toHaveBeenCalled();
    await app.close();
  });


  it("keeps the old CLO authority current and allows retry when downstream stale propagation fails", async () => {
    const current = context();
    current.approved_learning_outcomes.push({
      outcome_id: "outcome-1", text: "Use loops", source_outcome_ids: ["source-outcome-1"], source_refs: [sourceRef],
      approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 1,
    });
    const savedContexts: CoreCourseDesignContext[] = [];
    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-review", status: "planning" }),
      getCoreCourseDesignContext: vi.fn().mockImplementation(async () => savedContexts.at(-1) ?? current),
      saveCoreCourseDesignContextRevision: vi.fn().mockImplementation(async (value: CoreCourseDesignContext) => { savedContexts.push(value); }),
      beginInstructionalDesignMutation: vi.fn().mockResolvedValue({ runId: "run-review", status: "planning" }),
    };
    const reviewRepo = { upsert: vi.fn().mockImplementation(async (value: any) => ({ ...value, updatedAt: "2026-09-17T20:00:00.000Z" })) };
    const candidateRepo = { invalidateApprovedForOutcome: vi.fn().mockResolvedValue(1) };
    const structureRepo = {
      getLatestRevision: vi.fn().mockResolvedValue({ revision: 4 }),
      getSealedRevision: vi.fn().mockResolvedValue({ revision: 4 }),
      markAlignmentStale: vi.fn().mockRejectedValueOnce(new Error("structure stale write failed")).mockResolvedValue(undefined),
    };
    const activityIntentRepo = { markStaleForContext: vi.fn().mockResolvedValue(1) };
    const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
    const headers = { "x-agentpoc-instructional-design-key": "test-key" };
    const app = Fastify({ logger: false });
    app.register(instructionalDesignRoutes, { config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, candidateRepo: candidateRepo as any, reviewRepo: reviewRepo as any, activityIntentRepo: activityIntentRepo as any, enforceOutcomeReview: true });
    await app.ready();

    const payload = { source_outcome_id: "source-outcome-1", teacher_text: "Apply loops safely", confirmed: true, teacher_id: 7 };
    const failed = await app.inject({ method: "POST", url: "/api/runs/run-review/outcomes/edit-approved", headers, payload });
    expect(failed.statusCode).toBe(500);
    expect(savedContexts).toHaveLength(0);
    expect((await runRepo.getCoreCourseDesignContext()).approved_learning_outcomes).toHaveLength(1);

    const retried = await app.inject({ method: "POST", url: "/api/runs/run-review/outcomes/edit-approved", headers, payload });
    expect(retried.statusCode).toBe(200);
    expect(savedContexts).toHaveLength(1);
    expect(savedContexts[0]?.approved_learning_outcomes).toHaveLength(0);
    await app.close();
  });


  it("does not let direct CLO re-approval bypass the approved-edit confirmation flow", async () => {
    const current = context();
    current.approved_learning_outcomes.push({
      outcome_id: "outcome-1", text: "Use loops carefully", source_outcome_ids: ["source-outcome-1"], source_refs: [sourceRef],
      approval_origin: "TEACHER_EDITED", approved_by_teacher: true, revision: 1,
    });
    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-review", status: "planning" }),
      getCoreCourseDesignContext: vi.fn().mockResolvedValue(current),
      saveCoreCourseDesignContextRevision: vi.fn(),
      beginInstructionalDesignMutation: vi.fn(),
    };
    const reviewRepo = {
      get: vi.fn().mockResolvedValue({ itemType: "CLO", itemId: "source-outcome-1", status: "REVIEWED", draftText: "Use loops carefully" }),
    };
    const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
    const headers = { "x-agentpoc-instructional-design-key": "test-key" };
    const app = Fastify({ logger: false });
    app.register(instructionalDesignRoutes, { config, runRepo: runRepo as any, reviewRepo: reviewRepo as any, enforceOutcomeReview: true });
    await app.ready();

    const bypass = await app.inject({
      method: "POST", url: "/api/runs/run-review/outcomes/approve", headers,
      payload: { source_outcome_id: "source-outcome-1", teacher_text: "Changed without confirmation", recommended_text: "Use loops carefully" },
    });
    expect(bypass.statusCode).toBe(409);
    expect(bypass.json().error.code).toBe("OUTCOME_REVIEW_TEXT_MISMATCH");
    expect(runRepo.beginInstructionalDesignMutation).not.toHaveBeenCalled();
    expect(runRepo.saveCoreCourseDesignContextRevision).not.toHaveBeenCalled();
    await app.close();
  });

});
