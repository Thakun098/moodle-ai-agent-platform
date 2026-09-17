import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import {
  alignStructureSections,
  approveLearningOutcome,
  assertAuthorizedAlignment,
  assertOutcomeCoverage,
  buildLearningOutcomeProposals,
  deriveOutcomeCoverage,
  formatCoreCourseDesignProjection,
  markAlignedSectionsStale,
  type AlignedStructureSection,
} from "@moodle-agent-poc/planning";
import { instructionalDesignRoutes } from "../src/routes/instructional-design.js";
import { registerErrorHandler } from "../src/plugins/error-handler.js";
import { loadConfig } from "../src/config/config-loader.js";

const ref = { source: "syllabus.md" as const, sha256: "a".repeat(64), start_line: 3, end_line: 3, text: "- explain loops" };
const context = (): CoreCourseDesignContext => ({
  schema_version: "0.1",
  policy_version: "instructional-design.v0.1",
  revision: 1,
  run_id: "run-1",
  source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) },
  course: {},
  learner_context: { revision: 1, status: "UNSPECIFIED", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [{ objective_id: "objective-1", source_text: "Explain loops", source_refs: [ref], status: "SOURCE" }],
  source_learning_outcomes: [{ source_outcome_id: "source-outcome-1", source_text: "explain loops", source_refs: [ref], measurable_status: "WEAK_OR_AMBIGUOUS", review_required: true }],
  approved_learning_outcomes: [],
  schedule_or_topics: [],
  assessment_requirements: [],
  grading_policy: [],
  constraints: [],
  missing_information: [],
  provenance: { extractor_version: "syllabus-semantics.v0.1", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
});
const section = (extra: Record<string, unknown> = {}): any => ({ ref: "section-01", position: 1, title: "Week 1", summary: "Loops", source_refs: [], activity_intents: [], ...extra });

describe("Ticket 18 instructional design alignment", () => {
  it("recovers explicit schedule CLO mappings omitted by the model", () => {
    const outcomes = [1, 2, 3, 4, 5].map((number) => ({
      source_outcome_id: `source-outcome-${number}`,
      source_text: `CLO${number} Outcome ${number}`,
      source_refs: [],
      measurable_status: "MEASURABLE" as const,
      review_required: false,
    }));
    const c: CoreCourseDesignContext = {
      ...context(),
      source_learning_outcomes: outcomes,
      schedule_or_topics: [
        { week_or_unit: "Week 8", title: "Exceptions", topics: ["CLO4"], source: { kind: "page", page: 2 } },
        { week_or_unit: "Week 9", title: "File I/O", topics: ["CLO4,", "CLO5"], source: { kind: "page", page: 2 } },
        { week_or_unit: "Week 10", title: "Project", topics: ["CLO1-", "CLO5"], source: { kind: "page", page: 2 } },
      ],
    };

    const aligned = alignStructureSections(c, [
      section({ ref: "section-08", position: 8, title: "Week 8", aligned_outcome_ids: [] }),
      section({ ref: "section-09", position: 9, title: "Week 9", aligned_outcome_ids: [] }),
      section({ ref: "section-10", position: 10, title: "Week 10", aligned_outcome_ids: [] }),
    ]);

    expect(aligned[0]?.aligned_outcome_ids).toEqual(["source-outcome-4"]);
    expect(aligned[1]?.aligned_outcome_ids).toEqual(["source-outcome-4", "source-outcome-5"]);
    expect(aligned[2]?.aligned_outcome_ids).toEqual(outcomes.map((outcome) => outcome.source_outcome_id));
  });
  it("creates stable weak-outcome proposals and maps only authorized IDs", () => {
    const c = context();
    const proposals = buildLearningOutcomeProposals(c);
    expect(proposals[0]).toMatchObject({ source_outcome_id: "source-outcome-1", recommended_text: "Demonstrate the ability to explain loops" });
    expect(proposals[0]?.source_refs).toEqual([ref]);
    const aligned = alignStructureSections(c, [section({ aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["source-outcome-1"] })]);
    expect(aligned[0]?.aligned_objective_ids).toEqual(["objective-1"]);
    expect(aligned[0]?.aligned_outcome_ids).toEqual(["source-outcome-1"]);
    expect(formatCoreCourseDesignProjection(c)).toContain("OPERATION: DESIGN_STRUCTURE");
    expect(formatCoreCourseDesignProjection(c)).toContain("No Quiz, Assignment");
  });

  it("preserves source wording and creates teacher-approved outcome revision", () => {
    const approved = approveLearningOutcome(context(), { source_outcome_id: "source-outcome-1", recommended_text: "Demonstrate the ability to explain loops", teacher_text: "Implement and test loops", teacher_id: 7 });
    expect(approved.revision).toBe(2);
    expect(approved.source_learning_outcomes[0]?.source_text).toBe("explain loops");
    expect(approved.approved_learning_outcomes[0]).toMatchObject({ text: "Implement and test loops", approval_origin: "TEACHER_EDITED", approved_by_teacher: true, revision: 2 });
    expect(approved.approved_learning_outcomes[0]?.source_outcome_ids).toEqual(["source-outcome-1"]);
  });

  it("derives coverage and blocks uncovered approved outcomes until external Teacher override", () => {
    const approved = approveLearningOutcome(context(), { source_outcome_id: "source-outcome-1", use_source_as_is: true });
    const aligned = alignStructureSections(approved, [section()]);
    aligned[0]!.aligned_outcome_ids = [];
    const uncovered = deriveOutcomeCoverage(approved, aligned);
    expect(uncovered[0]?.state).toBe("UNCOVERED");
    expect(() => assertOutcomeCoverage(uncovered)).toThrow(/not covered/);
    const external = deriveOutcomeCoverage(approved, aligned, [{ outcome_id: approved.approved_learning_outcomes[0]!.outcome_id, acknowledged: true, reason: "Covered by an external lab.", teacher_id: 7 }]);
    expect(external[0]).toMatchObject({ state: "EXTERNAL_TEACHER_CONFIRMED", override_reason: "Covered by an external lab." });
    expect(() => assertOutcomeCoverage(external)).not.toThrow();
  });

  it("marks alignment stale without rewriting Structure prose and rejects unauthorized IDs", () => {
    const c = context();
    const aligned = alignStructureSections(c, [section()]);
    const stale = markAlignedSectionsStale(aligned);
    expect(stale[0]).toMatchObject({ title: "Week 1", summary: "Loops", alignment_status: "STALE_ALIGNMENT" });
    expect(() => assertAuthorizedAlignment(c, [section({ aligned_objective_ids: ["objective-unknown"], aligned_outcome_ids: [] })])).toThrow(/unauthorized/);
  });

  it("serves authenticated projection, outcome approval, stale transition and external coverage", async () => {
    let current = context();
    const structure = { contentJson: { course: { title: "Loops" }, sections: [section()] }, teacherConstraintsJson: { coverage_overrides: [] }, revision: 1 };
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", normalizedSyllabus: {} }), getCoreCourseDesignContext: vi.fn().mockImplementation(async () => current), saveCoreCourseDesignContextRevision: vi.fn().mockImplementation(async (value: CoreCourseDesignContext) => { current = value; }) };
    const structureRepo = { getLatestRevision: vi.fn().mockResolvedValue(structure), markAlignmentStale: vi.fn(), setExternalCoverageOverride: vi.fn().mockImplementation(async (_run: string, value: any) => ({ ...structure, teacherConstraintsJson: { coverage_overrides: [value] } })) };
    const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
    const app = Fastify({ logger: false });
    app.register(instructionalDesignRoutes, { config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any });
    await app.ready();
    expect((await app.inject({ method: "GET", url: "/api/runs/run-1/instructional-design" })).statusCode).toBe(401);
    const headers = { "x-agentpoc-instructional-design-key": "test-key" };
    const projection = await app.inject({ method: "GET", url: "/api/runs/run-1/instructional-design", headers });
    expect(projection.statusCode).toBe(200);
    expect(projection.json()).toMatchObject({ role: "Instructional Designer", operation: "DESIGN_STRUCTURE", outcome_proposals: [{ source_outcome_id: "source-outcome-1" }] });
    const approval = await app.inject({ method: "POST", url: "/api/runs/run-1/outcomes/approve", headers, payload: { source_outcome_id: "source-outcome-1", teacher_text: "Implement and test loops", recommended_text: "Demonstrate loops", teacher_id: 7 } });
    expect(approval.statusCode).toBe(200);
    expect(approval.json().core_context.revision).toBe(2);
    expect(structureRepo.markAlignmentStale).toHaveBeenCalledWith("run-1", 2);
    current = approval.json().core_context;
    const override = await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure/coverage-overrides", headers, payload: { outcome_id: current.approved_learning_outcomes[0].outcome_id, acknowledged: true, reason: "External assessment evidence.", teacher_id: 7 } });
    expect(override.statusCode).toBe(200);
    const invalid = await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure/validate-coverage", headers });
    expect(invalid.statusCode).toBe(422);
    await app.close();
  });

  it("enforces token-bounded projection without dumping empty arrays (F12)", () => {
    const c = context();
    const proj = formatCoreCourseDesignProjection(c);
    expect(proj).toContain("OPERATION: DESIGN_STRUCTURE");
    expect(proj).toContain("Objectives:");
    expect(proj).toContain("Learning Outcomes");
    // Does not dump empty arrays
    expect(proj).not.toContain("Grading Policy: []");
    expect(proj).not.toContain("Constraints: []");
    expect(proj).not.toContain("Schedule/Topics: []");
  });

  it("runs full deterministic lifecycle: Context rev 1 -> Structure rev 1 -> Approve -> STALE -> Rebase -> rev 2 -> Seal", async () => {
    const ref1 = { source: "syllabus.md" as const, sha256: "a".repeat(64), start_line: 1, end_line: 1, text: "CLO1" };
    const ref2 = { source: "syllabus.md" as const, sha256: "a".repeat(64), start_line: 2, end_line: 2, text: "CLO2" };

    let currentContext: CoreCourseDesignContext = {
      ...context(),
      source_learning_outcomes: [
        { source_outcome_id: "source-outcome-1", source_text: "CLO1 loops", source_refs: [ref1], measurable_status: "MEASURABLE", review_required: false },
        { source_outcome_id: "source-outcome-2", source_text: "CLO2 classes", source_refs: [ref2], measurable_status: "MEASURABLE", review_required: false },
      ],
      approved_learning_outcomes: [],
    };

    const initialSections = [
      { ref: "section-01", position: 1, title: "Week 1", summary: "Loops", source_refs: [], activity_intents: [], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["source-outcome-1"], alignment_status: "CURRENT" as const },
      { ref: "section-02", position: 2, title: "Week 2", summary: "Classes", source_refs: [], activity_intents: [], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["source-outcome-2"], alignment_status: "CURRENT" as const },
    ];

    const revisions: any[] = [
      {
        id: "rev-1",
        runId: "run-lifecycle",
        revision: 1,
        title: "Course Structure",
        summary: "Initial",
        contentJson: { course: { title: "OOP" }, sections: initialSections },
        teacherConstraintsJson: { alignment_context_revision: 1, alignment_state: "CURRENT", coverage_overrides: [] },
        validationStatus: "valid",
        validationErrors: null,
        sealedAt: null,
        sealedByMoodleUserId: null,
        createdAt: new Date().toISOString(),
      },
    ];

    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-lifecycle", status: "pending", normalizedSyllabus: { schema_version: "0.1", metadata: { filename: "syllabus.md" }, course_title: "OOP", learning_objectives: ["Explain loops"], schedule_or_topics: [], raw_text: "OOP" } }),
      getCoreCourseDesignContext: vi.fn().mockImplementation(async () => currentContext),
      saveCoreCourseDesignContextRevision: vi.fn().mockImplementation(async (c: CoreCourseDesignContext) => { currentContext = c; }),
      updateStatus: vi.fn(),
    };

    const structureRepo = {
      getLatestRevision: vi.fn().mockImplementation(async () => revisions[revisions.length - 1]),
      getRevision: vi.fn().mockImplementation(async (_runId: string, rev: number) => revisions.find((r) => r.revision === rev)),
      markAlignmentStale: vi.fn().mockImplementation(async (_runId: string, _rev: number) => {
        const latest = revisions[revisions.length - 1];
        latest.teacherConstraintsJson = { ...latest.teacherConstraintsJson, alignment_state: "STALE_ALIGNMENT" };
      }),
      createRebasedStructureRevision: vi.fn().mockImplementation(async (runId: string, currentContextRevision: number, rebasedSections: any[]) => {
        const latest = revisions[revisions.length - 1];
        const newRecord = {
          id: `rev-${latest.revision + 1}`,
          runId,
          revision: latest.revision + 1,
          title: latest.title,
          summary: latest.summary,
          contentJson: { ...latest.contentJson, sections: rebasedSections },
          teacherConstraintsJson: {
            ...latest.teacherConstraintsJson,
            alignment_state: "CURRENT",
            alignment_context_revision: currentContextRevision,
            stale_from_context_revision: null,
          },
          validationStatus: "valid",
          validationErrors: null,
          sealedAt: null,
          sealedByMoodleUserId: null,
          createdAt: new Date().toISOString(),
        };
        revisions.push(newRecord);
        return newRecord;
      }),
      sealRevision: vi.fn().mockImplementation(async ({ runId, revision }: { runId: string; revision: number }) => {
        const target = revisions.find((r) => r.revision === revision);
        target.sealedAt = new Date().toISOString();
        return target;
      }),
    };

    const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.register(instructionalDesignRoutes, { config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any });
    // Also register courseStructureRoutes to test sealing
    const { courseStructureRoutes } = await import("../src/routes/course-structure.js");
    app.register(courseStructureRoutes, { config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any });
    await app.ready();

    const headers = { "x-agentpoc-instructional-design-key": "test-key" };

    // 1. Approve outcome 1
    const app1 = await app.inject({
      method: "POST",
      url: "/api/runs/run-lifecycle/outcomes/approve",
      headers,
      payload: { source_outcome_id: "source-outcome-1", use_source_as_is: true },
    });
    expect(app1.statusCode).toBe(200);
    expect(currentContext.revision).toBe(2);
    expect(revisions[0].teacherConstraintsJson.alignment_state).toBe("STALE_ALIGNMENT");

    // 2. Attempting to seal rev 1 while STALE fails (F1 / F3)
    const sealStale = await app.inject({
      method: "POST",
      url: "/api/runs/run-lifecycle/course-structure/seal",
      payload: { revision: 1 },
    });
    expect(sealStale.statusCode).toBe(422);
    expect(sealStale.json().error.code).toBe("STRUCTURE_INVALID");

    // 3. Approve outcome 2
    const app2 = await app.inject({
      method: "POST",
      url: "/api/runs/run-lifecycle/outcomes/approve",
      headers,
      payload: { source_outcome_id: "source-outcome-2", use_source_as_is: true },
    });
    expect(app2.statusCode).toBe(200);
    expect(currentContext.revision).toBe(3);

    // 4. Rebase alignment
    const rebaseRes = await app.inject({
      method: "POST",
      url: "/api/runs/run-lifecycle/course-structure/rebase-alignment",
      headers,
    });
    expect(rebaseRes.statusCode).toBe(200);
    const rebaseData = rebaseRes.json();
    expect(rebaseData.structure_revision.revision).toBe(2);
    expect(rebaseData.alignment_status).toBe("CURRENT");
    // Verify rev 1 was NOT mutated (F1)
    expect(revisions[0].revision).toBe(1);
    expect(revisions[0].sealedAt).toBeNull();
    // Verify rev 2 was created
    expect(revisions.length).toBe(2);
    expect(revisions[1].revision).toBe(2);
    expect(revisions[1].teacherConstraintsJson.alignment_context_revision).toBe(3);

    // 5. Seal rev 2 succeeds!
    const sealSuccess = await app.inject({
      method: "POST",
      url: "/api/runs/run-lifecycle/course-structure/seal",
      payload: { revision: 2 },
    });
    expect(sealSuccess.statusCode).toBe(200);
    expect(revisions[1].sealedAt).not.toBeNull();

    await app.close();
  });

  it("rejects rebase with AMBIGUOUS_ALIGNMENT when 1 source maps to >1 approved outcomes (F2)", async () => {
    const c: CoreCourseDesignContext = {
      ...context(),
      source_learning_outcomes: [
        { source_outcome_id: "source-outcome-1", source_text: "Ambiguous CLO", source_refs: [], measurable_status: "MEASURABLE", review_required: false },
      ],
      approved_learning_outcomes: [
        { outcome_id: "approved-1", source_outcome_ids: ["source-outcome-1"], text: "Part A", approval_origin: "TEACHER_EDITED", approved_by_teacher: true, revision: 2 },
        { outcome_id: "approved-2", source_outcome_ids: ["source-outcome-1"], text: "Part B", approval_origin: "TEACHER_EDITED", approved_by_teacher: true, revision: 2 },
      ],
      revision: 2,
    };

    const structure = {
      contentJson: {
        sections: [
          { ref: "section-01", position: 1, title: "Week 1", summary: "Summary", source_refs: [], activity_intents: [], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["source-outcome-1"], alignment_status: "STALE_ALIGNMENT" },
        ],
      },
      teacherConstraintsJson: { alignment_context_revision: 1, alignment_state: "STALE_ALIGNMENT", coverage_overrides: [] },
      revision: 1,
    };

    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-ambiguous" }),
      getCoreCourseDesignContext: vi.fn().mockResolvedValue(c),
    };
    const structureRepo = {
      getLatestRevision: vi.fn().mockResolvedValue(structure),
      createRebasedStructureRevision: vi.fn(),
    };

    const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
    const app = Fastify({ logger: false });
    app.register(instructionalDesignRoutes, { config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/runs/run-ambiguous/course-structure/rebase-alignment",
      headers: { "x-agentpoc-instructional-design-key": "test-key" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("AMBIGUOUS_ALIGNMENT");
    expect(structureRepo.createRebasedStructureRevision).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects rebase candidate on coverage failure and preserves prior Structure authority (F1 / F2)", async () => {
    // 2 approved outcomes, but structure only aligns 1 of them (no override)
    const c: CoreCourseDesignContext = {
      ...context(),
      source_learning_outcomes: [
        { source_outcome_id: "source-outcome-1", source_text: "CLO1", source_refs: [], measurable_status: "MEASURABLE", review_required: false },
        { source_outcome_id: "source-outcome-2", source_text: "CLO2", source_refs: [], measurable_status: "MEASURABLE", review_required: false },
      ],
      approved_learning_outcomes: [
        { outcome_id: "approved-1", source_outcome_ids: ["source-outcome-1"], text: "Approved CLO1", approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 2 },
        { outcome_id: "approved-2", source_outcome_ids: ["source-outcome-2"], text: "Approved CLO2", approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 2 },
      ],
      revision: 2,
    };

    const structure = {
      contentJson: {
        sections: [
          // Only aligns source-outcome-1, leaving approved-2 uncovered!
          { ref: "section-01", position: 1, title: "Week 1", summary: "Summary", source_refs: [], activity_intents: [], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["source-outcome-1"], alignment_status: "STALE_ALIGNMENT" },
        ],
      },
      teacherConstraintsJson: { alignment_context_revision: 1, alignment_state: "STALE_ALIGNMENT", coverage_overrides: [] },
      revision: 1,
    };

    const runRepo = {
      getRun: vi.fn().mockResolvedValue({ runId: "run-uncovered" }),
      getCoreCourseDesignContext: vi.fn().mockResolvedValue(c),
    };
    const structureRepo = {
      getLatestRevision: vi.fn().mockResolvedValue(structure),
      createRebasedStructureRevision: vi.fn(),
    };

    const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });
    const app = Fastify({ logger: false });
    app.register(instructionalDesignRoutes, { config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any });
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/runs/run-uncovered/course-structure/rebase-alignment",
      headers: { "x-agentpoc-instructional-design-key": "test-key" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("STRUCTURE_OUTCOME_COVERAGE_REQUIRED");
    // Prior structure authority preserved: no new revision saved
    expect(structureRepo.createRebasedStructureRevision).not.toHaveBeenCalled();

    await app.close();
  });
});

