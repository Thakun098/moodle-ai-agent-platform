import type { ActivityPlan, CoursePlanEnvelope, FileResourcePlan, QuizPlan } from "@moodle-agent-poc/contracts";
import { describe, expect, it } from "vitest";
import { PlanningError } from "../src/errors/planning-errors.js";
import { assembleFinalCoursePlan } from "../src/finalization/course-plan-finalizer.js";
import type { CourseStructureRevision } from "../src/structure/course-structure-revision.js";

const structure: CourseStructureRevision = {
  id: "structure-1", runId: "run-1", revision: 2, title: "AI Structure", summary: "Grounded structure",
  validationStatus: "valid", createdAt: "2026-09-04T00:00:00.000Z", teacherConstraints: { activityRules: [], warnings: [] },
  content: { course: { title: "AI" }, sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Search", source_refs: [{ source: "syllabus.md", section: "Week 1" }], activity_intents: [{ type: "assignment", title: "Lab", source_refs: [], origin: "syllabus" }] }] },
};
const assignment: ActivityPlan = { ref: "assignment-01", type: "assignment", title: "Lab", description: "Do it", instructions: ["Submit"], learning_objectives: ["Learn"], grade: 100, source_refs: [{ source: "lecture.md", section: "section-01" }] };
const resource: FileResourcePlan = { ref: "resource-01-01", type: "resource", title: "CS231_Week_01_Material", filename: "CS231_Week_01_Material.pdf", moodle_material_id: 77, source_run_id: "run-1", source_structure_revision: 2, source_section_ref: "section-01", source_material_revision: 1, source_refs: [{ source: "CS231_Week_01_Material.pdf", section: "section-01" }] };

describe("final CoursePlan assembly", () => {
  it("assembles a frozen CoursePlan only from a sealed structure and current generated drafts", () => {
    const plan = assembleFinalCoursePlan({
      planId: "00000000-0000-4000-8000-000000000001",
      structure: { ...structure, sealedAt: "2026-09-04T01:00:00.000Z", sealedByMoodleUserId: 42 },
      draftsBySection: new Map([["section-01", [{ activity: assignment, materialSnapshotId: "snapshot-1", structureRevision: 2, status: "generated" }]]]),
    });
    expect(plan).toMatchObject({ plan_id: "00000000-0000-4000-8000-000000000001", revision: 1, plan_type: "course", operation: "create" });
    expect(plan.content.sections[0]?.activities[0]?.source_refs[0]?.source).toBe("lecture.md");
  });

  it("blocks finalization for an unsealed structure or stale activity draft", () => {
    expect(() => assembleFinalCoursePlan({ planId: "00000000-0000-4000-8000-000000000001", structure, draftsBySection: new Map() })).toThrowError(PlanningError);
    expect(() => assembleFinalCoursePlan({
      planId: "00000000-0000-4000-8000-000000000001", structure: { ...structure, sealedAt: "2026-09-04T01:00:00.000Z" },
      draftsBySection: new Map([["section-01", [{ activity: assignment, materialSnapshotId: "snapshot-1", structureRevision: 2, status: "stale" }]]]),
    })).toThrow(/not ready|stale/i);
  });

  it("includes deterministic File Resources in the finalized section without an AI activity", () => {
    const plan = assembleFinalCoursePlan({
      planId: "00000000-0000-4000-8000-000000000001",
      structure: { ...structure, sealedAt: "2026-09-04T01:00:00.000Z", sealedByMoodleUserId: 42 },
      selectedActivitiesBySection: new Map([['section-01', []]]),
      resourcesBySection: new Map([['section-01', [resource]]]),
    });
    expect(plan.content.sections[0]?.resources).toEqual([resource]);
    expect(plan.content.sections[0]?.activities).toEqual([]);
  });

  it("enforces aggregate teacher cardinality and strict material location provenance", () => {
    const twoQuizStructure: CourseStructureRevision = {
      ...structure,
      teacherConstraints: { activityRules: [{ scope: "each_section", activityType: "quiz", activityCount: 2 }], warnings: [] },
      content: { ...structure.content, sections: [{ ...structure.content.sections[0]!, activity_intents: [{ ref: "quiz-01", type: "quiz", title: "Quiz A", source_refs: [], origin: "teacher_instruction" }, { ref: "quiz-02", type: "quiz", title: "Quiz B", source_refs: [], origin: "teacher_instruction" }] }] },
    };
    const quizA = { ref: "quiz-01", type: "quiz" as const, title: "Quiz A", description: "Quiz", source_refs: [], questions: [] } satisfies QuizPlan;
    const quizB = { ref: "quiz-02", type: "quiz" as const, title: "Quiz B", description: "Quiz", source_refs: [], questions: [] } satisfies QuizPlan;
    const validArgs = {
      planId: "00000000-0000-4000-8000-000000000001",
      structure: { ...twoQuizStructure, sealedAt: "2026-09-04T01:00:00.000Z" },
      draftsBySection: new Map([["section-01", [
        { activity: quizA, materialSnapshotId: "snapshot-1", structureRevision: 2, status: "generated" as const },
        { activity: quizB, materialSnapshotId: "snapshot-1", structureRevision: 2, status: "generated" as const },
      ]]]),
      currentSnapshotIds: new Map([["section-01", "snapshot-1"]]),
      materialSourcesBySection: new Map([["section-01", [{ source: "lecture.md", section: "section-01" }]]]),
    };
    expect(() => assembleFinalCoursePlan(validArgs)).toThrow(/must cite/);

    const sourcedA = { ...quizA, source_refs: [{ source: "lecture.md", section: "section-01" }] } as ActivityPlan;
    const sourcedB = { ...quizB, source_refs: [{ source: "lecture.md", section: "section-01" }] } as ActivityPlan;
    const sourcedPlan = assembleFinalCoursePlan({
      ...validArgs,
      draftsBySection: new Map([["section-01", [
        { activity: sourcedA, materialSnapshotId: "snapshot-1", structureRevision: 2, status: "generated" as const },
        { activity: sourcedB, materialSnapshotId: "snapshot-1", structureRevision: 2, status: "generated" as const },
      ]]]),
    }) as unknown as CoursePlanEnvelope;
    expect(sourcedPlan.content.sections[0]?.activities).toHaveLength(2);
    expect(() => assembleFinalCoursePlan({
      ...validArgs,
      draftsBySection: new Map([["section-01", [
        { activity: { ...sourcedA, source_refs: [{ source: "lecture.md", section: "section-99" }] }, materialSnapshotId: "snapshot-1", structureRevision: 2, status: "generated" as const },
        { activity: sourcedB, materialSnapshotId: "snapshot-1", structureRevision: 2, status: "generated" as const },
      ]]]),
    })).toThrow(/provenance|MaterialSnapshot/);
  });
});
