import type {
  AssignmentPlanEnvelope,
  CoursePlanEnvelope,
  QuizCreatePlanEnvelope,
  QuizUpdatePlanEnvelope,
} from "@moodle-agent-poc/contracts";
import { describe, expect, it } from "vitest";
import {
  buildPlanPreview,
  extractPlanSourceReferences,
} from "../src/preview/plan-preview.js";

describe("PlanPreview Projection Service (T0601â€“T0604)", () => {
  const sampleCourseEnvelope: CoursePlanEnvelope = {
    schema_version: "0.1",
    plan_id: "11111111-1111-1111-1111-111111111111",
    revision: 1,
    plan_type: "course",
    operation: "create",
    title: "Introduction to Computer Science",
    summary: "Complete foundational course",
    warnings: ["Schedule contains 1 unassigned topic."],
    assumptions: ["Assumes 14-week standard semester."],
    content: {
      course: {
        title: "Introduction to Computer Science",
        course_code: "CS101",
        summary: "Covers programming and data structures.",
      },
      sections: [
        {
          ref: "section-01",
          position: 1,
          title: "Week 1: Basics",
          summary: "Introductory concepts.",
          source_refs: [
            { source: "syllabus.md", page: 1, section: "Week 1", text: "Introduction" },
          ],
          activities: [
            {
              ref: "assignment-01",
              type: "assignment",
              title: "Hello World Assignment",
              description: "Write your first program.",
              instructions: ["Install IDE", "Write main function"],
              learning_objectives: ["Understand compilation"],
              grade: 100,
              source_refs: [
                { source: "syllabus.md", page: 1, section: "Week 1", text: "Lab 1" },
              ],
            },
            {
              ref: "quiz-01",
              type: "quiz",
              title: "Week 1 Knowledge Check",
              description: "Assess understanding of basic terminology.",
              source_refs: [
                { source: "syllabus.md", page: 1, section: "Week 1", text: "Quiz info" },
              ],
              questions: [
                {
                  ref: "q-01",
                  type: "multichoice",
                  question: "What is an algorithm?",
                  choices: [
                    { ref: "c1", text: "A step by step procedure" },
                    { ref: "c2", text: "A hardware component" },
                  ],
                  correct_choice_refs: ["c1"],
                  feedback: "Algorithms are step-by-step procedures.",
                  default_mark: 1,
                  source_refs: [
                    { source: "syllabus.md", page: 1, section: "Week 1", text: "Quiz info" },
                  ],
                },
                {
                  ref: "q-02",
                  type: "truefalse",
                  question: "Compilers translate code to machine instructions.",
                  correct_answer: true,
                  feedback: "Yes, that is what compilers do.",
                  default_mark: 1,
                  source_refs: [],
                },
                {
                  ref: "q-03",
                  type: "shortanswer",
                  question: "What does CPU stand for?",
                  accepted_answers: ["Central Processing Unit"],
                  case_sensitive: false,
                  default_mark: 1,
                  source_refs: [],
                },
                {
                  ref: "q-04",
                  type: "essay",
                  question: "Explain the difference between compiled and interpreted languages.",
                  grading_guidance: ["Defines compiled languages", "Defines interpreted languages"],
                  default_mark: 5,
                  source_refs: [],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  it("builds pure CoursePlan preview without mutating input envelope", () => {
    const originalJson = JSON.stringify(sampleCourseEnvelope);
    const preview = buildPlanPreview(sampleCourseEnvelope);

    // Purity check: input envelope was not modified
    expect(JSON.stringify(sampleCourseEnvelope)).toBe(originalJson);

    // Structure checks
    expect(preview.plan_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(preview.revision).toBe(1);
    expect(preview.plan_type).toBe("course");
    expect(preview.operation).toBe("create");
    expect(preview.title).toBe("Introduction to Computer Science");
    expect(preview.summary).toBe("Complete foundational course");

    // Warnings and assumptions
    expect(preview.warnings).toEqual(["Schedule contains 1 unassigned topic."]);
    expect(preview.assumptions).toEqual(["Assumes 14-week standard semester."]);

    // Metrics
    expect(preview.metrics.sections).toBe(1);
    expect(preview.metrics.assignments).toBe(1);
    expect(preview.metrics.quizzes).toBe(1);
    expect(preview.metrics.questions).toBe(4);
    expect(preview.metrics.questions_by_type).toEqual({
      multichoice: 1,
      truefalse: 1,
      shortanswer: 1,
      essay: 1,
    });

    // Structure details
    expect(preview.structure.type).toBe("course");
    if (preview.structure.type === "course") {
      expect(preview.structure.course_title).toBe("Introduction to Computer Science");
      expect(preview.structure.course_code).toBe("CS101");
      expect(preview.structure.sections).toHaveLength(1);
      expect(preview.structure.sections[0]?.activities).toHaveLength(2);
    }

    // Source reference deduplication
    expect(preview.source_refs).toHaveLength(3);
  });

  it("builds AssignmentPlan preview correctly", () => {
    const assignmentEnvelope: AssignmentPlanEnvelope = {
      schema_version: "0.1",
      plan_id: "22222222-2222-2222-2222-222222222222",
      revision: 1,
      plan_type: "assignment",
      operation: "update",
      title: "Updated Lab Assignment",
      summary: "Make the assignment more practical",
      warnings: [],
      assumptions: [],
      content: {
        ref: "assignment-01",
        type: "assignment",
        title: "Updated Lab 1",
        description: "Hands-on coding assignment",
        instructions: ["Step 1", "Step 2"],
        learning_objectives: ["Objective 1"],
        grade: 50,
        source_refs: [
          { source: "syllabus.md", page: 2, section: "Week 2", text: "Lab info" },
        ],
      },
    };

    const preview = buildPlanPreview(assignmentEnvelope);
    expect(preview.plan_type).toBe("assignment");
    expect(preview.operation).toBe("update");
    expect(preview.metrics.assignments).toBe(1);
    expect(preview.structure.type).toBe("assignment");
    if (preview.structure.type === "assignment") {
      expect(preview.structure.title).toBe("Updated Lab 1");
      expect(preview.structure.grade).toBe(50);
    }
    expect(preview.source_refs).toHaveLength(1);
  });

  it("builds QuizUpdatePlan preview correctly with questions_to_add and questions_to_update", () => {
    const quizEnvelope: QuizUpdatePlanEnvelope = {
      schema_version: "0.1",
      plan_id: "33333333-3333-3333-3333-333333333333",
      revision: 2,
      plan_type: "quiz",
      operation: "update",
      title: "Expand Quiz 1",
      summary: "Add 2 new questions",
      warnings: ["Added questions exceed recommended time."],
      assumptions: [],
      content: {
        title: "Expanded Quiz 1",
        description: "Updated description",
        source_refs: [
          { source: "syllabus.md", page: 3, section: "Week 3", text: "Quiz update" },
        ],
        questions_to_add: [
          {
            ref: "q-add-01",
            type: "truefalse",
            question: "Is Python dynamically typed?",
            correct_answer: true,
            feedback: "Python uses dynamic typing.",
            default_mark: 1,
            source_refs: [],
          },
        ],
        questions_to_update: [
          {
            ref: "q-upd-01",
            type: "shortanswer",
            question: "Name the creator of Python.",
            accepted_answers: ["Guido van Rossum"],
            case_sensitive: false,
            default_mark: 2,
            source_refs: [],
          },
        ],
      },
    };

    const preview = buildPlanPreview(quizEnvelope);
    expect(preview.plan_type).toBe("quiz");
    expect(preview.operation).toBe("update");
    expect(preview.metrics.quizzes).toBe(1);
    expect(preview.metrics.questions).toBe(2);
    expect(preview.metrics.questions_by_type).toEqual({
      multichoice: 0,
      truefalse: 1,
      shortanswer: 1,
      essay: 0,
    });
    expect(preview.warnings).toHaveLength(1);
    expect(preview.structure.type).toBe("quiz");
    if (preview.structure.type === "quiz") {
      expect(preview.structure.questions_to_add).toHaveLength(1);
      expect(preview.structure.questions_to_update).toHaveLength(1);
    }
  });

  it("deduplicates identical source references across content hierarchy", () => {
    const sources = extractPlanSourceReferences(sampleCourseEnvelope);
    const keys = sources.map((s) => `${s.source}|${s.page}|${s.section}|${s.text}`);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it("returns a detached preview so mutating nested source refs cannot mutate the canonical envelope", () => {
    const envelope = structuredClone(sampleCourseEnvelope);
    const preview = buildPlanPreview(envelope);

    expect(preview.structure.type).toBe("course");
    if (preview.structure.type !== "course") {
      throw new Error("Expected course preview");
    }

    preview.structure.sections[0]!.source_refs[0]!.section = "Changed in preview";
    const originalSectionRef = envelope.content.sections[0]!.source_refs[0]!;
    expect(originalSectionRef.section).toBe("Week 1");
  });});

