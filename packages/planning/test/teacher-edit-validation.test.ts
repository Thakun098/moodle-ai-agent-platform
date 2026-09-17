import { describe, expect, it } from "vitest";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { buildActivityDesignContext, validateTeacherEditedActivity } from "../src/index.js";

const sourceRef = { source: "syllabus", sha256: "a".repeat(64), start_line: 1, end_line: 1, text: "Week 1" };
const groundingRef = { source: "lecture.md", section: "section-01" };

function coreContext(): CoreCourseDesignContext {
  return {
    schema_version: "0.1",
    policy_version: "instructional-design.v0.1",
    revision: 3,
    run_id: "run-1",
    source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "b".repeat(64), text_sha256: "c".repeat(64) },
    course: {},
    learner_context: { revision: 2, status: "PROVIDED_BY_SYLLABUS", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
    learning_objectives: [{ objective_id: "objective-1", source_text: "Explain BFS", source_refs: [sourceRef], status: "SOURCE" }],
    source_learning_outcomes: [{ source_outcome_id: "source-1", source_text: "Explain BFS", source_refs: [sourceRef], measurable_status: "MEASURABLE", review_required: false }],
    approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Explain BFS", source_outcome_ids: ["source-1"], source_refs: [sourceRef], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 2 }],
    schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [],
    provenance: { extractor_version: "syllabus-semantics.v0.2", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
  };
}

const section = { ref: "section-01", position: 1, title: "Week 1", summary: "BFS", source_refs: [groundingRef], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["outcome-1"] };
const grounding = { mode: "MATERIAL_GROUNDED" as const, sectionRef: "section-01", text: "Breadth-first search uses a FIFO queue.", sourceRefs: [groundingRef], reviewRequired: false, allowScopedModelKnowledge: false, materialSnapshotId: "snapshot-1" };

function design(type: "quiz" | "assignment") {
  return buildActivityDesignContext({
    coreContext: coreContext(), structureRevision: 1, section,
    intent: {
      id: "intent-1", ref: type === "quiz" ? "quiz-01" : "assignment-01", type, title: type === "quiz" ? "Quiz" : "Assignment",
      purpose: "FORMATIVE", intent_revision: 4, selected_objective_ids: ["objective-1"], selected_outcome_ids: ["outcome-1"], learner_context_revision: 2,
      learner_context_acknowledged: false,
      options: type === "quiz" ? { question_count: 1, question_type: "multichoice", choices_per_question: 2, correct_choices_per_question: 1, default_mark: 1 } : { grade: 100 },
    }, grounding,
  });
}

const quizConstraints = { activityRules: [{ scope: "specific_sections" as const, sectionPositions: [1], activityType: "quiz" as const, activityCount: 1, questionType: "multichoice" as const, questionsPerActivity: 1, choicesPerQuestion: 2, correctChoicesPerQuestion: 1 }], warnings: [] };
const assignmentConstraints = { activityRules: [{ scope: "specific_sections" as const, sectionPositions: [1], activityType: "assignment" as const, activityCount: 1 }], warnings: [] };

function quizBody(question = "Teacher revised BFS question") {
  return { ref: "quiz-01", type: "quiz", title: "Quiz", description: "BFS practice", source_refs: [groundingRef], questions: [{ ref: "q1", type: "multichoice", question, choices: [{ ref: "a", text: "FIFO" }, { ref: "b", text: "LIFO" }], correct_choice_refs: ["a"], feedback: "Review BFS", default_mark: 1, source_refs: [groundingRef] }] };
}

function assignmentBody() {
  return { ref: "assignment-01", type: "assignment", title: "Assignment", description: "Explain BFS", instructions: ["Teacher revised instruction"], learning_objectives: ["Explain BFS"], grade: 100, source_refs: [groundingRef] };
}

describe("Ticket 22 Teacher edit deterministic validation", () => {
  it("accepts representative Quiz wording edits without changing deterministic structure", () => {
    expect(validateTeacherEditedActivity({ activity: quizBody(), context: design("quiz"), section, constraints: quizConstraints, authorizedSourceRefs: [groundingRef] })).toMatchObject({ type: "quiz", questions: [{ question: "Teacher revised BFS question" }] });
  });

  it("rejects invalid Quiz edits with broken correct-choice references", () => {
    const invalid = quizBody() as any;
    invalid.questions[0].correct_choice_refs = ["missing"];
    expect(() => validateTeacherEditedActivity({ activity: invalid, context: design("quiz"), section, constraints: quizConstraints, authorizedSourceRefs: [groundingRef] })).toThrow(/exactly one valid correct choice/iu);
  });

  it("accepts Assignment instruction edits but rejects changed authorized learning objectives", () => {
    expect(validateTeacherEditedActivity({ activity: assignmentBody(), context: design("assignment"), section, constraints: assignmentConstraints, authorizedSourceRefs: [groundingRef] })).toMatchObject({ type: "assignment", instructions: ["Teacher revised instruction"] });
    const invalid = assignmentBody();
    invalid.learning_objectives = ["Invent DFS"];
    expect(() => validateTeacherEditedActivity({ activity: invalid, context: design("assignment"), section, constraints: assignmentConstraints, authorizedSourceRefs: [groundingRef] })).toThrow(/cannot change the authorized Assignment learning objectives/iu);
  });

  it("rejects provenance outside the authorized source allowlist", () => {
    const invalid = quizBody() as any;
    invalid.questions[0].source_refs = [{ source: "other.md", section: "section-01" }];
    expect(() => validateTeacherEditedActivity({ activity: invalid, context: design("quiz"), section, constraints: quizConstraints, authorizedSourceRefs: [groundingRef] })).toThrow(/deterministic validation/iu);
  });
});
