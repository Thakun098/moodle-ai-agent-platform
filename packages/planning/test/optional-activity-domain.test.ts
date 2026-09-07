import { describe, expect, it } from "vitest";
import { activityDefaultPolicy } from "../src/instructions/activity-default-policy.js";
import { resolveActivityGrounding } from "../src/grounding/activity-grounding-resolver.js";
import { createEmptyActivityShell } from "../src/generators/empty-activity-shell.js";
import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";

const syllabus: NormalizedSyllabus = { schema_version: "0.1", learning_objectives: [], schedule_or_topics: [{ week_or_unit: "Week 1", title: "Recursion", topics: [], source: { kind: "page", page: 1 } }], raw_text: "Recursion", metadata: { filename: "course.pdf", media_type: "application/pdf", byte_size: 1, sha256: "a".repeat(64) } };
const section = { ref: "section-01", position: 1, title: "Week 1" };

describe("optional activity domain", () => {
  it("uses deterministic configurable defaults", () => {
    expect(activityDefaultPolicy()).toMatchObject({ maxAttempts: 2, quizQuestionCount: 5, quizChoiceCount: 4, assignmentGrade: 100 });
    expect(activityDefaultPolicy({ ACTIVITY_GENERATION_MAX_ATTEMPTS: "3" }).maxAttempts).toBe(3);
    expect(() => activityDefaultPolicy({ DEFAULT_QUIZ_CHOICE_COUNT: "1" })).toThrow();
  });
  it("prefers current Material", () => {
    expect(resolveActivityGrounding(section, syllabus, { snapshotId: "snapshot", sectionRef: section.ref, text: "Material facts", sourceRefs: [{ source: "material.txt" }], estimatedTokens: 4 }).mode).toBe("MATERIAL_GROUNDED");
  });
  it("requires review for topic-only syllabus scope", () => {
    expect(resolveActivityGrounding(section, syllabus)).toMatchObject({ mode: "SYLLABUS_SCOPED_AI", reviewRequired: true, allowScopedModelKnowledge: true });
  });
  it("uses detailed syllabus evidence directly", () => {
    const detailed = { ...syllabus, schedule_or_topics: [{ ...syllabus.schedule_or_topics[0]!, topics: ["Recursion calls the same function until its base case is satisfied.".repeat(10)] }] };
    expect(resolveActivityGrounding(section, detailed)).toMatchObject({ mode: "SYLLABUS_GROUNDED", reviewRequired: false });
  });
  it("does not treat a generic anchor as meaningful scope", () => {
    const generic = { ...syllabus, schedule_or_topics: [{ ...syllabus.schedule_or_topics[0]!, title: "Week 1" }] };
    expect(resolveActivityGrounding(section, generic).mode).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("allows only explicitly confirmed insufficient-evidence shells", () => {
    expect(createEmptyActivityShell({ ref: "quiz-01", type: "quiz", title: "Quiz", status: "insufficient_evidence" }, true)).toMatchObject({ questions: [] });
    expect(() => createEmptyActivityShell({ ref: "quiz-01", type: "quiz", title: "Quiz", status: "failed" }, true)).toThrow();
    expect(() => createEmptyActivityShell({ ref: "quiz-01", type: "quiz", title: "Quiz", status: "insufficient_evidence" }, false)).toThrow();
  });
});
