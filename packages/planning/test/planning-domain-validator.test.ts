import { randomUUID } from "node:crypto";
import type {
  CoursePlanEnvelope,
  NormalizedSyllabus,
  QuizUpdatePlanEnvelope,
} from "@moodle-agent-poc/contracts";
import { describe, expect, it } from "vitest";
import {
  buildProvenanceAllowlist,
  validatePlanningDomainInvariants,
} from "../src/domain/planning-domain-validator.js";
import { PlanningError } from "../src/errors/planning-errors.js";

describe("PlanningDomainValidator (Remediated R4, R5, R6, R11)", () => {
  const sampleSyllabus: NormalizedSyllabus = {
    schema_version: "0.1",
    course_title: "Sample Course",
    learning_objectives: ["Learn TS"],
    schedule_or_topics: [
      {
        title: "Introduction",
        topics: ["Basics"],
        source: { kind: "line", start_line: 1, end_line: 10 },
      },
    ],
    raw_text: "Raw text content",
    metadata: {
      filename: "syllabus.md",
      media_type: "text/markdown",
      byte_size: 100,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
  };

  it("builds provenance allowlist with source-qualified keys only (R11)", () => {
    const allowlist = buildProvenanceAllowlist(sampleSyllabus);
    expect(allowlist.has("syllabus.md")).toBe(true);
    expect(allowlist.has("syllabus.md::section::lines 1-10")).toBe(true);
    expect(allowlist.has("syllabus.md::section::1-10")).toBe(true);
    // Generic non-namespaced keys must NOT be present
    expect(allowlist.has("lines 1-10")).toBe(false);
    expect(allowlist.has("1-10")).toBe(false);
    expect(allowlist.has("syllabus.md::page::999")).toBe(false);
  });

  it("accepts valid CoursePlanEnvelope with unique refs, positive positions, and grounded question sources", () => {
    const envelope: CoursePlanEnvelope = {
      schema_version: "0.1",
      plan_id: randomUUID(),
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Course Plan",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "Introduction to CS" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Week 1",
            source_refs: [{ source: "syllabus.md", section: "lines 1-10" }],
            activities: [
              {
                ref: "quiz-01",
                type: "quiz",
                title: "Quiz 1",
                description: "Description",
                source_refs: [{ source: "syllabus.md" }],
                questions: [
                  {
                    ref: "question-01",
                    type: "truefalse",
                    question: "Is TypeScript typed?",
                    correct_answer: true,
                    feedback: "Yes it is.",
                    default_mark: 1,
                    source_refs: [{ source: "syllabus.md", section: "lines 1-10" }],
                  },
                ],
              },
            ],
          },
          {
            ref: "section-02",
            position: 2,
            title: "Week 2",
            source_refs: [{ source: "syllabus.md" }],
            activities: [],
          },
        ],
      },
    };

    const allowlist = buildProvenanceAllowlist(sampleSyllabus);
    expect(() => validatePlanningDomainInvariants(envelope, allowlist)).not.toThrow();
  });

  it("rejects ungrounded question-level source references (R4)", () => {
    const ungroundedQuestionEnvelope: CoursePlanEnvelope = {
      schema_version: "0.1",
      plan_id: randomUUID(),
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Course Plan",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "Intro" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "W1",
            source_refs: [{ source: "syllabus.md" }],
            activities: [
              {
                ref: "quiz-01",
                type: "quiz",
                title: "Quiz 1",
                description: "Desc",
                source_refs: [{ source: "syllabus.md" }],
                questions: [
                  {
                    ref: "question-01",
                    type: "truefalse",
                    question: "Q1",
                    correct_answer: true,
                    feedback: "F",
                    default_mark: 1,
                    source_refs: [{ source: "invented-fake-file.pdf" }], // Ungrounded source
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const allowlist = buildProvenanceAllowlist(sampleSyllabus);
    expect(() => validatePlanningDomainInvariants(ungroundedQuestionEnvelope, allowlist)).toThrow(
      PlanningError
    );
  });

  it("rejects duplicate question ref across different quizzes in same CoursePlan (R5)", () => {
    const duplicateQuestionAcrossQuizzes: CoursePlanEnvelope = {
      schema_version: "0.1",
      plan_id: randomUUID(),
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Course Plan",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "Intro" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "W1",
            source_refs: [{ source: "syllabus.md" }],
            activities: [
              {
                ref: "quiz-01",
                type: "quiz",
                title: "Quiz 1",
                description: "Desc",
                source_refs: [{ source: "syllabus.md" }],
                questions: [
                  {
                    ref: "question-01", // duplicate ref
                    type: "truefalse",
                    question: "Q1",
                    correct_answer: true,
                    feedback: "F",
                    default_mark: 1,
                    source_refs: [{ source: "syllabus.md" }],
                  },
                ],
              },
              {
                ref: "quiz-02",
                type: "quiz",
                title: "Quiz 2",
                description: "Desc",
                source_refs: [{ source: "syllabus.md" }],
                questions: [
                  {
                    ref: "question-01", // duplicate ref across quizzes
                    type: "truefalse",
                    question: "Q2",
                    correct_answer: false,
                    feedback: "F",
                    default_mark: 1,
                    source_refs: [{ source: "syllabus.md" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const allowlist = buildProvenanceAllowlist(sampleSyllabus);
    expect(() => validatePlanningDomainInvariants(duplicateQuestionAcrossQuizzes, allowlist)).toThrow(
      PlanningError
    );
  });

  it("rejects quiz update with overlapping questions in add and update sets (R6)", () => {
    const overlappingQuizEnvelope: QuizUpdatePlanEnvelope = {
      schema_version: "0.1",
      plan_id: randomUUID(),
      revision: 1,
      plan_type: "quiz",
      operation: "update",
      title: "Quiz Update",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {
        title: "Quiz",
        description: "Desc",
        source_refs: [{ source: "syllabus.md" }],
        questions_to_add: [
          {
            ref: "question-01", // overlapping ref
            type: "truefalse",
            question: "Q1",
            correct_answer: true,
            feedback: "F",
            default_mark: 1,
            source_refs: [{ source: "syllabus.md" }],
          },
        ],
        questions_to_update: [
          {
            ref: "question-01", // overlapping ref
            type: "truefalse",
            question: "Q1 Updated",
            correct_answer: false,
            feedback: "F",
            default_mark: 1,
            source_refs: [{ source: "syllabus.md" }],
          },
        ],
      },
    };

    const allowlist = buildProvenanceAllowlist(sampleSyllabus);
    expect(() => validatePlanningDomainInvariants(overlappingQuizEnvelope, allowlist)).toThrow(
      PlanningError
    );
  });
});
