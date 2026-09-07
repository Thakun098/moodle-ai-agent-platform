import type {
  AssignmentPlan,
  EssayQuestionPlan,
  MultipleChoiceQuestionPlan,
  ShortAnswerQuestionPlan,
  TrueFalseQuestionPlan,
} from "@moodle-agent-poc/contracts";
import { describe, expect, it } from "vitest";
import {
  formatAssignmentIntro,
  formatCourseUrl,
  formatQuestionName,
  generateCourseShortname,
  serializeQuestionToMcpArgs,
} from "../src/serializers.js";
import { CourseExecutionError } from "../src/types.js";

describe("Phase 11 Serializers (P11-D4 to P11-D7, C1 to C5)", () => {
  describe("generateCourseShortname (P11-D4, C4)", () => {
    it("generates deterministic shortname using course_code when provided", () => {
      const s1 = generateCourseShortname("plan-123", 1, "CS101", "Introduction to Computer Science");
      const s2 = generateCourseShortname("plan-123", 1, "CS101", "Introduction to Computer Science");
      expect(s1).toBe(s2);
      expect(s1).toMatch(/^CS101-[A-F0-9]{6}$/);
    });

    it("generates deterministic shortname using course title when course_code is omitted", () => {
      const s1 = generateCourseShortname("plan-456", 2, undefined, "Deep Learning & Neural Networks");
      const s2 = generateCourseShortname("plan-456", 2, undefined, "Deep Learning & Neural Networks");
      expect(s1).toBe(s2);
      expect(s1).toMatch(/^DEEP_LEARNING_NEURAL_NET-[A-F0-9]{6}$/);
    });

    it("produces different hash suffixes for different plan revisions", () => {
      const r1 = generateCourseShortname("plan-123", 1, "CS101", "Intro");
      const r2 = generateCourseShortname("plan-123", 2, "CS101", "Intro");
      expect(r1).not.toBe(r2);
    });
  });

  describe("formatAssignmentIntro (P11-D5)", () => {
    it("composes description, instructions, and learning objectives deterministically", () => {
      const plan: AssignmentPlan = {
        ref: "assign-1",
        type: "assignment",
        title: "Homework 1",
        description: "Submit a comprehensive report on sorting algorithms.",
        instructions: ["Implement quicksort in TypeScript", "Benchmark with 10k items"],
        learning_objectives: ["Understand divide-and-conquer", "Analyze time complexity"],
        grade: 100,
        source_refs: [],
      };
      const intro = formatAssignmentIntro(plan);
      expect(intro).toContain("Submit a comprehensive report on sorting algorithms.");
      expect(intro).toContain("Instructions:\n1. Implement quicksort in TypeScript\n2. Benchmark with 10k items");
      expect(intro).toContain("Learning Objectives:\n- Understand divide-and-conquer\n- Analyze time complexity");
    });
  });

  describe("formatQuestionName (P11-D6)", () => {
    it("generates readable deterministic question name with ordinal and truncated text", () => {
      expect(formatQuestionName(1, "What is polymorphism in OOP?")).toBe("Q1 - What is polymorphism in OOP?");
      const longText = "This is a very long question text that exceeds fifty characters in total length for testing truncation behavior";
      const name = formatQuestionName(2, longText);
      expect(name.startsWith("Q2 - ")).toBe(true);
      expect(name.endsWith("...")).toBe(true);
    });
  });

  describe("serializeQuestionToMcpArgs (T1107, C1, C2, C3, C5, P11-D7)", () => {
    it("serializes multichoice using frozen Phase 9 boolean flags and exactly one fraction 1", () => {
      const mcq: MultipleChoiceQuestionPlan = {
        ref: "mcq-1",
        type: "multichoice",
        question: "Which data structure provides O(1) average lookup?",
        choices: [
          { ref: "c1", text: "Hash Table" },
          { ref: "c2", text: "Binary Search Tree" },
          { ref: "c3", text: "Linked List" },
        ],
        correct_choice_refs: ["c1"],
        feedback: "Hash tables provide average O(1) amortized lookup.",
        default_mark: 2,
        source_refs: [],
      };

      const args = serializeQuestionToMcpArgs(105, mcq, 1) as {
        qtype: string;
        options: {
          single: boolean;
          shuffle_answers: boolean;
          choices: Array<{ text: string; fraction: number }>;
        };
      };
      expect(args.qtype).toBe("multichoice");
      expect(args.options.single).toBe(true);
      expect(args.options.shuffle_answers).toBe(true);
      expect(typeof args.options.single).toBe("boolean");
      expect(typeof args.options.shuffle_answers).toBe("boolean");
      expect(args.options.choices.filter((c) => c.fraction === 1)).toHaveLength(1);
    });

    it("throws if correct_choice_ref is not found in choices", () => {
      const mcq: MultipleChoiceQuestionPlan = {
        ref: "mcq-bad",
        type: "multichoice",
        question: "Sample Question",
        choices: [{ ref: "c1", text: "Choice 1" }, { ref: "c2", text: "Choice 2" }],
        correct_choice_refs: ["c999"],
        feedback: "Feedback",
        default_mark: 1,
        source_refs: [],
      };
      expect(() => serializeQuestionToMcpArgs(105, mcq, 1)).toThrow(CourseExecutionError);
    });

    it("serializes truefalse with boolean correct_answer", () => {
      const tf: TrueFalseQuestionPlan = {
        ref: "tf-1", type: "truefalse", question: "Array index is 0-based.",
        correct_answer: true, feedback: "Correct", default_mark: 1, source_refs: [],
      };
      const args = serializeQuestionToMcpArgs(105, tf, 2) as { options: { correct_answer: boolean } };
      expect(args.options.correct_answer).toBe(true);
      expect(typeof args.options.correct_answer).toBe("boolean");
    });

    it("serializes shortanswer with boolean case_sensitive", () => {
      const sa: ShortAnswerQuestionPlan = {
        ref: "sa-1", type: "shortanswer", question: "Immutable JS keyword?",
        accepted_answers: ["const"], case_sensitive: true, default_mark: 1, source_refs: [],
      };
      const args = serializeQuestionToMcpArgs(105, sa, 3) as { options: { case_sensitive: boolean } };
      expect(args.options.case_sensitive).toBe(true);
      expect(typeof args.options.case_sensitive).toBe("boolean");
    });

    it("serializes essay guidance as numbered text with editor response format", () => {
      const eq: EssayQuestionPlan = {
        ref: "eq-1", type: "essay", question: "Explain processes and threads.",
        grading_guidance: ["Memory sharing", "Context switching"], default_mark: 5, source_refs: [],
      };
      const args = serializeQuestionToMcpArgs(105, eq, 4) as {
        options: { response_format: string; grading_guidance: string };
      };
      expect(args.options.response_format).toBe("editor");
      expect(args.options.grading_guidance).toBe("1. Memory sharing\n2. Context switching");
    });
  });

  describe("formatCourseUrl (T1109)", () => {
    it("formats course view URL and strips trailing slashes", () => {
      expect(formatCourseUrl("http://localhost:8000/", 42)).toBe("http://localhost:8000/course/view.php?id=42");
      expect(formatCourseUrl("http://moodle.example.com///", 100)).toBe("http://moodle.example.com/course/view.php?id=100");
    });
  });
});
