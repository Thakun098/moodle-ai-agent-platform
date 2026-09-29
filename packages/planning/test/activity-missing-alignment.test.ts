import { describe, expect, it } from "vitest";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { buildActivityDesignContext, buildActivityGenerationMetadata, formatActivityDesignPrompt } from "../src/activity/activity-design.js";

const coreContext: CoreCourseDesignContext = {
  schema_version: "0.1", policy_version: "instructional-design.v0.1", revision: 3, run_id: "run-missing-alignment",
  source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) }, course: {},
  learner_context: { revision: 2, status: "PROVIDED_BY_SYLLABUS", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [], source_learning_outcomes: [], approved_learning_outcomes: [], schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [],
  provenance: { extractor_version: "syllabus-semantics.v0.2", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
};

describe("missing Activity alignment review policy", () => {
  it("propagates the Teacher-confirmed exception into warnings, prompt, and generation metadata", () => {
    const context = buildActivityDesignContext({
      coreContext, structureRevision: 1,
      section: { ref: "section-01", position: 1, title: "Week 1", summary: "Introduction" },
      intent: { ref: "assignment-01", type: "assignment", title: "Assignment", purpose: "FORMATIVE", intent_revision: 1, selected_objective_ids: [], selected_outcome_ids: [], learner_context_revision: 2, learner_context_acknowledged: true, options: {}, alignment_override: { kind: "MISSING_ALIGNMENT", acknowledged: true, reason: "Generate for Teacher review without a selected CLO." } },
      grounding: { mode: "SYLLABUS_GROUNDED", sectionRef: "section-01", text: "Introduction", sourceRefs: [{ source: "syllabus.md", section: "Week 1" }], reviewRequired: false, allowScopedModelKnowledge: false },
    });
    expect(context.alignment_review_required).toBe(true);
    expect(context.warnings).toContain("ALIGNMENT_REVIEW_REQUIRED");
    expect(formatActivityDesignPrompt(context)).toContain("Do not infer alignment");
    expect(buildActivityGenerationMetadata(context, { generated_at: "2026-09-29T00:00:00Z" })).toMatchObject({ alignment_review_required: true, selected_objective_ids: [], selected_outcome_ids: [] });
  });
});
