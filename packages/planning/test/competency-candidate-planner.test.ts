import { describe, expect, it, vi } from "vitest";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { buildCompetencyDerivationPrompt, deriveCompetencyCandidates, normalizeCompetencyCandidates } from "../src/competency/competency-candidate-planner.js";

const context = (approved = true): CoreCourseDesignContext => ({
  schema_version: "0.1", policy_version: "instructional-design.v0.1", revision: 4, run_id: "run-competency",
  source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) },
  course: {},
  learner_context: { revision: 1, status: "UNSPECIFIED", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [{ objective_id: "objective-1", source_text: "Design programs", source_refs: [], status: "SOURCE" }],
  source_learning_outcomes: [
    { source_outcome_id: "source-outcome-1", source_text: "Unapproved source wording", source_refs: [], measurable_status: "MEASURABLE", review_required: false },
    { source_outcome_id: "source-outcome-2", source_text: "Second source wording", source_refs: [], measurable_status: "MEASURABLE", review_required: false },
  ],
  approved_learning_outcomes: approved ? [
    { outcome_id: "outcome-1", text: "Approved outcome one", source_outcome_ids: ["source-outcome-1"], source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 2 },
    { outcome_id: "outcome-2", text: "Approved outcome two", source_outcome_ids: ["source-outcome-2"], source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 3 },
  ] : [],
  schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [],
  provenance: { extractor_version: "syllabus-semantics.v0.2", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
});

describe("Ticket 19 competency candidate derivation", () => {
  it("projects approved Outcomes only and preserves many-to-many relationships", async () => {
    const c = context();
    const prompt = buildCompetencyDerivationPrompt(c);
    expect(prompt).toContain("DERIVE_COMPETENCIES");
    expect(prompt).toContain("outcome-1: Approved outcome one");
    expect(prompt).not.toContain("Unapproved source wording");
    const model = { chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({ candidates: [
      { name: "Program design", description: "Design maintainable programs", rationale: "Combines both approved outcomes.", derived_from_outcome_ids: ["outcome-1", "outcome-2"] },
      { name: "Outcome practice", description: "Apply approved program outcomes", rationale: "Reinforces both outcomes.", derived_from_outcome_ids: ["outcome-1", "outcome-2"] },
    ] }) }), listModels: vi.fn(), ping: vi.fn() };
    const candidates = await deriveCompetencyCandidates(c, model as any);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ status: "PROPOSED", derived_from_outcome_ids: ["outcome-1", "outcome-2"], revision: 1 });
    expect(candidates[0]?.candidate_id).toMatch(/^competency-candidate-/u);
    expect(candidates[0]?.source_refs).toEqual([]);
    expect(model.chat).toHaveBeenCalledTimes(1);
  });

  it("rejects an unapproved Outcome reference and blocks derivation with no approvals", async () => {
    expect(() => normalizeCompetencyCandidates(context(), { candidates: [{ name: "Bad", description: "Bad", rationale: "Bad", derived_from_outcome_ids: ["source-outcome-1"] }] })).toThrow(/unapproved Outcome/iu);
    await expect(deriveCompetencyCandidates(context(false), { chat: vi.fn(), listModels: vi.fn(), ping: vi.fn() } as any)).rejects.toThrow(/Teacher-approved/iu);
  });
});