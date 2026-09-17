import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { courseStructureRoutes } from "../src/routes/course-structure.js";
import { loadConfig } from "../src/config/config-loader.js";

const context: CoreCourseDesignContext = {
  schema_version: "0.1",
  policy_version: "instructional-design.v0.1",
  revision: 1,
  run_id: "run-structure",
  source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) },
  course: {},
  learner_context: { revision: 1, status: "UNSPECIFIED", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [{ objective_id: "objective-1", source_text: "Explain loops", source_refs: [], status: "SOURCE" }],
  source_learning_outcomes: [{ source_outcome_id: "source-outcome-1", source_text: "explain loops", source_refs: [], measurable_status: "WEAK_OR_AMBIGUOUS", review_required: true }],
  approved_learning_outcomes: [],
  schedule_or_topics: [],
  assessment_requirements: [],
  grading_policy: [],
  constraints: [],
  missing_information: [],
  provenance: { extractor_version: "syllabus-semantics.v0.1", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
};
const syllabus: any = { schema_version: "0.1", metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 1, sha256: "a".repeat(64) }, course_title: "Loops", learning_objectives: ["Explain loops"], schedule_or_topics: [], raw_text: "Loops" };

describe("Ticket 18 structure generation integration", () => {
  it("passes the Core Context projection to DESIGN_STRUCTURE and persists authorized mappings", async () => {
    const planner = { plan: vi.fn().mockImplementation(async (...args: any[]) => {
      expect(args[5]).toMatchObject({ revision: 1, source_learning_outcomes: [{ source_outcome_id: "source-outcome-1" }] });
      return { title: "Loops", summary: "Structure", warnings: [], assumptions: [], content: { course: { title: "Loops" }, sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Loops", source_refs: [], activityIntents: [], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["source-outcome-1"] }] } };
    }) };
    const saved: any[] = [];
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-structure", status: "pending", model: "test", normalizedSyllabus: syllabus }), getCoreCourseDesignContext: vi.fn().mockResolvedValue(context), updateStatus: vi.fn().mockResolvedValue({}), failRun: vi.fn() };
    const structureRepo = { getLatestRevision: vi.fn().mockResolvedValue(null), saveRevision: vi.fn().mockImplementation(async (value: any) => { const record = { ...value, contentJson: value.content, teacherConstraintsJson: value.teacherConstraintsJson, sealedAt: null, sealedByMoodleUserId: null, validationErrors: null, createdAt: value.createdAt }; saved.push(record); return record; }) };
    const app = Fastify({ logger: false });
    app.register(courseStructureRoutes, { config: loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test" }), runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, structurePlanner: planner as any });
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/api/runs/run-structure/course-structure", payload: { teacher_instruction: "organize by week" } });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.core_context_revision).toBe(1);
    expect(body.outcome_proposals[0].source_outcome_id).toBe("source-outcome-1");
    expect(body.structure_revision.content.sections[0]).toMatchObject({ aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["source-outcome-1"], activity_intents: [] });
    expect(saved[0].contentJson.sections[0].activity_intents).toEqual([]);
    await app.close();
  });
  it("validates Teacher alignment IDs and pins a new Structure revision to current Context", async () => {
    const latest = {
      id: "structure-1",
      runId: "run-structure",
      revision: 1,
      title: "Loops",
      summary: "Structure",
      contentJson: { course: { title: "Loops" }, sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Loops", source_refs: [], activity_intents: [], aligned_objective_ids: [], aligned_outcome_ids: [], alignment_status: "STALE_ALIGNMENT" }] },
      teacherConstraintsJson: { alignment_context_revision: 0, alignment_state: "STALE_ALIGNMENT", coverage_overrides: [] },
      validationStatus: "valid",
      validationErrors: null,
      sealedAt: null,
      sealedByMoodleUserId: null,
      createdAt: "2026-09-15T00:00:00Z",
    };
    const approvedContext: CoreCourseDesignContext = {
      ...context,
      revision: 2,
      approved_learning_outcomes: [{ outcome_id: "outcome-1", source_outcome_ids: ["source-outcome-1"], text: "Explain loops", source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 2 }],
    };
    const saveRevision = vi.fn().mockImplementation(async (value: any) => ({ ...value, contentJson: value.content, teacherConstraintsJson: value.teacherConstraintsJson, sealedAt: null, sealedByMoodleUserId: null, validationErrors: null }));
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-structure", status: "planning", normalizedSyllabus: syllabus }), getCoreCourseDesignContext: vi.fn().mockResolvedValue(approvedContext) };
    const structureRepo = { getLatestRevision: vi.fn().mockResolvedValue(latest), saveRevision };
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, _request, reply) => reply.status(422).send({ error: { code: (error as any).code, message: error.message, details: (error as any).details } }));
    app.register(courseStructureRoutes, { config: loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test" }), runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, structurePlanner: {} as any });
    await app.ready();

    const invalid = await app.inject({ method: "POST", url: "/api/runs/run-structure/course-structure/revisions", payload: { title: "Loops", summary: "Structure", content: { course: { title: "Loops" }, sections: [{ ...latest.contentJson.sections[0], aligned_outcome_ids: ["outcome-unauthorized"] }] } } });
    expect(invalid.statusCode).toBe(422);
    expect(saveRevision).not.toHaveBeenCalled();

    const valid = await app.inject({ method: "POST", url: "/api/runs/run-structure/course-structure/revisions", payload: { title: "Loops", summary: "Structure", content: { course: { title: "Loops" }, sections: [{ ...latest.contentJson.sections[0], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"] }] } } });
    expect(valid.statusCode).toBe(201);
    expect(saveRevision).toHaveBeenCalledTimes(1);
    expect(saveRevision.mock.calls[0]?.[0]).toMatchObject({ revision: 2, teacherConstraintsJson: { alignment_context_revision: 2, alignment_state: "CURRENT" } });
    await app.close();
  });
});
