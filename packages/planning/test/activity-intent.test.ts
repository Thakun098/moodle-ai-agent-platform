import { describe, expect, it } from "vitest";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { validateActivityIntent } from "../src/activity/activity-intent.js";

const context = (status: "UNSPECIFIED" | "PROVIDED_BY_SYLLABUS" = "PROVIDED_BY_SYLLABUS", acknowledged = false): CoreCourseDesignContext => ({
  schema_version: "0.1", policy_version: "instructional-design.v0.1", revision: 3, run_id: "run-intent",
  source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) }, course: {},
  learner_context: { revision: 2, status, target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: acknowledged },
  learning_objectives: [{ objective_id: "objective-1", source_text: "Design", source_refs: [], status: "SOURCE" }],
  source_learning_outcomes: [{ source_outcome_id: "source-1", source_text: "Source", source_refs: [], measurable_status: "MEASURABLE", review_required: false }, { source_outcome_id: "source-2", source_text: "Source 2", source_refs: [], measurable_status: "MEASURABLE", review_required: false }],
  approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Approved", source_outcome_ids: ["source-1"], source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 2 }, { outcome_id: "outcome-2", text: "Approved 2", source_outcome_ids: ["source-2"], source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 3 }],
  schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [], provenance: { extractor_version: "syllabus-semantics.v0.2", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
});
const section = { ref: "section-01", aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"] };

describe("Ticket 20 Activity Intent validator", () => {
  it("enforces purpose minimums and normalizes source lineage to approved IDs", () => {
    expect(validateActivityIntent(context(), section, { activity_type: "quiz", purpose: "PRACTICE", selected_objective_ids: ["objective-1"], selected_outcome_ids: ["source-1"], learner_context_revision: 2 }).selected_outcome_ids).toEqual(["outcome-1"]);
    expect(() => validateActivityIntent(context(), section, { activity_type: "quiz", purpose: "FORMATIVE", selected_objective_ids: ["objective-1"], selected_outcome_ids: [], learner_context_revision: 2 })).toThrow(/requires at least one selected Outcome/iu);
    expect(() => validateActivityIntent(context(), section, { activity_type: "quiz", purpose: "PRACTICE", selected_objective_ids: [], selected_outcome_ids: [], learner_context_revision: 2 })).toThrow(/requires at least one selected Objective or Outcome/iu);
    expect(validateActivityIntent(context(), section, { activity_type: "quiz", purpose: "PRACTICE", selected_objective_ids: [], selected_outcome_ids: [], learner_context_revision: 2 }, { allowMissingAlignment: true })).toMatchObject({ selected_objective_ids: [], selected_outcome_ids: [] });
  });

  it("requires explicit out-of-section override and derives learner acknowledgment from Core Context", () => {
    expect(() => validateActivityIntent(context(), section, { activity_type: "assignment", purpose: "FORMATIVE", selected_outcome_ids: ["outcome-2"], learner_context_revision: 2 })).toThrow(/outside the Section/iu);
    const override = validateActivityIntent(context(), section, { activity_type: "assignment", purpose: "FORMATIVE", selected_outcome_ids: ["outcome-2"], learner_context_revision: 2, alignment_override: { acknowledged: true, reason: "Teacher intentionally targets a cross-section Outcome." } });
    expect(override.alignment_override?.acknowledged).toBe(true);
    expect(() => validateActivityIntent(context("UNSPECIFIED"), section, { activity_type: "quiz", purpose: "PRACTICE", selected_objective_ids: ["objective-1"], learner_context_revision: 2, learner_context_acknowledged: true })).toThrow(/acknowledgment/iu);
    expect(validateActivityIntent(context("UNSPECIFIED", true), section, { activity_type: "quiz", purpose: "PRACTICE", selected_objective_ids: ["objective-1"], learner_context_revision: 2, learner_context_acknowledged: false })).toMatchObject({
      learner_context_revision: 2,
      learner_context_acknowledged: true,
    });
  });

  it("allows an unacknowledged unspecified learner context only for explicit draft-save validation", () => {
    const input = {
      activity_type: "quiz" as const,
      purpose: "PRACTICE" as const,
      selected_objective_ids: ["objective-1"],
      learner_context_revision: 2,
      learner_context_acknowledged: false,
    };
    expect(() => validateActivityIntent(context("UNSPECIFIED"), section, input)).toThrow(/acknowledgment/iu);
    expect(validateActivityIntent(context("UNSPECIFIED"), section, input, {
      allowUnacknowledgedLearnerContext: true,
    })).toMatchObject({
      learner_context_revision: 2,
      learner_context_acknowledged: false,
    });
  });

  it("allows a Teacher-confirmed missing alignment but never uses it for an out-of-section Outcome", () => {
    const missing = validateActivityIntent(context(), section, {
      activity_type: "assignment", purpose: "FORMATIVE", selected_outcome_ids: [], learner_context_revision: 2,
      alignment_override: { kind: "MISSING_ALIGNMENT", acknowledged: true, reason: "Generate for Teacher review without a selected CLO." },
    });
    expect(missing).toMatchObject({ selected_objective_ids: [], selected_outcome_ids: [], alignment_override: { kind: "MISSING_ALIGNMENT", acknowledged: true } });
    expect(() => validateActivityIntent(context(), section, {
      activity_type: "assignment", purpose: "FORMATIVE", selected_outcome_ids: ["outcome-2"], learner_context_revision: 2,
      alignment_override: { kind: "MISSING_ALIGNMENT", acknowledged: true, reason: "This is only a missing-alignment acknowledgment." },
    })).toThrow(/outside the Section/iu);
  });
});
