
import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { courseStructureRoutes } from "../src/routes/course-structure.js";
import { loadConfig } from "../src/config/config-loader.js";

const context: CoreCourseDesignContext = {
  schema_version: "0.1", policy_version: "instructional-design.v0.1", revision: 2, run_id: "run-coverage",
  source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) },
  course: {}, learner_context: { revision: 1, status: "UNSPECIFIED", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [], source_learning_outcomes: [{ source_outcome_id: "source-outcome-1", source_text: "explain loops", source_refs: [], measurable_status: "WEAK_OR_AMBIGUOUS", review_required: true }],
  approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Explain loops", source_outcome_ids: ["source-outcome-1"], source_refs: [], approval_origin: "TEACHER_EDITED", approved_by_teacher: true, revision: 2 }],
  schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [], provenance: { extractor_version: "syllabus-semantics.v0.1", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
};
const run = { runId: "run-coverage", status: "planning", normalizedSyllabus: { schema_version: "0.1", metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 1, sha256: "a".repeat(64) }, course_title: "Loops", learning_objectives: [], schedule_or_topics: [], raw_text: "Loops" } };
const baseStructure = (constraints: any = {}) => ({ id: "structure-1", runId: "run-coverage", revision: 1, title: "Loops", summary: "Structure", validationStatus: "valid", validationErrors: null, sealedAt: null, sealedByMoodleUserId: null, createdAt: "2026-09-14T00:00:00Z", teacherConstraintsJson: constraints, contentJson: { course: { title: "Loops" }, sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Loops", source_refs: [], activity_intents: [], aligned_objective_ids: [], aligned_outcome_ids: ["source-outcome-1"], alignment_status: "CURRENT" }] } });

describe("Ticket 18 Outcome coverage gate", () => {
  it("blocks sealing while source Outcomes still await Teacher approval", async () => {
    const unapprovedContext: CoreCourseDesignContext = {
      ...context,
      revision: 1,
      approved_learning_outcomes: [],
    };
    const structure = baseStructure({ alignment_context_revision: 1, alignment_state: "CURRENT" });
    const sealRevision = vi.fn();
    const runRepo = { getRun: vi.fn().mockResolvedValue(run), getCoreCourseDesignContext: vi.fn().mockResolvedValue(unapprovedContext), updateStatus: vi.fn() };
    const structureRepo = { getRevision: vi.fn().mockResolvedValue(structure), sealRevision, getLatestRevision: vi.fn().mockResolvedValue(structure) };
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, _request, reply) => reply.status(422).send({ error: { code: (error as any).code, details: (error as any).details, message: error.message } }));
    app.register(courseStructureRoutes, { config: loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test" }), runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, structurePlanner: {} as any });
    await app.ready();

    const response = await app.inject({ method: "POST", url: "/api/runs/run-coverage/course-structure/seal", payload: { revision: 1 } });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatchObject({ code: "STRUCTURE_OUTCOME_COVERAGE_REQUIRED", details: { unapproved_source_outcome_ids: ["source-outcome-1"] } });
    expect(sealRevision).not.toHaveBeenCalled();
    await app.close();
  });
  it("blocks sealing an uncovered approved Outcome and allows an explicit external override", async () => {
    const structure = baseStructure();
    structure.contentJson.sections[0].aligned_outcome_ids = [];
    const sealRevision = vi.fn().mockResolvedValue({ ...structure, sealedAt: "2026-09-14T01:00:00Z" });
    const runRepo = { getRun: vi.fn().mockResolvedValue(run), getCoreCourseDesignContext: vi.fn().mockResolvedValue(context), updateStatus: vi.fn() };
    const structureRepo = { getRevision: vi.fn().mockResolvedValue(structure), sealRevision, getLatestRevision: vi.fn().mockResolvedValue(structure) };
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, _request, reply) => reply.status(422).send({ error: { code: (error as any).code, details: (error as any).details, message: error.message } }));
    app.register(courseStructureRoutes, { config: loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test" }), runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, structurePlanner: {} as any });
    await app.ready();
    const blocked = await app.inject({ method: "POST", url: "/api/runs/run-coverage/course-structure/seal", payload: { revision: 1 } });
    expect(blocked.statusCode).toBe(422);
    expect(sealRevision).not.toHaveBeenCalled();
    structure.teacherConstraintsJson = { coverage_overrides: [{ outcome_id: "outcome-1", acknowledged: true, reason: "External lab evidence." }] };
    const allowed = await app.inject({ method: "POST", url: "/api/runs/run-coverage/course-structure/seal", payload: { revision: 1 } });
    expect(allowed.statusCode).toBe(200);
    expect(sealRevision).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("blocks a stale aligned section until a new Structure alignment revision is created", async () => {
    const structure = baseStructure();
    structure.contentJson.sections[0].alignment_status = "STALE_ALIGNMENT";
    const runRepo = { getRun: vi.fn().mockResolvedValue(run), getCoreCourseDesignContext: vi.fn().mockResolvedValue(context), updateStatus: vi.fn() };
    const structureRepo = { getRevision: vi.fn().mockResolvedValue(structure), getLatestRevision: vi.fn().mockResolvedValue(structure), sealRevision: vi.fn() };
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, _request, reply) => reply.status(422).send({ error: { code: (error as any).code, details: (error as any).details, message: error.message } }));
    app.register(courseStructureRoutes, { config: loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test" }), runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, structurePlanner: {} as any });
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/api/runs/run-coverage/course-structure/seal", payload: { revision: 1 } });
    expect(response.statusCode).toBe(422);
    expect((structureRepo.sealRevision as any).mock.calls).toHaveLength(0);
    await app.close();
  });
});
