import { describe, expect, it } from "vitest";
import type { NormalizedSyllabus } from "../src/syllabus/contracts.js";
import {
  isNormalizedSyllabus,
  validateNormalizedSyllabus,
} from "../src/validation/syllabus-validator.js";

describe("NormalizedSyllabus Validator", () => {
  const validMetadata = {
    filename: "syllabus.md",
    media_type: "text/markdown",
    byte_size: 1024,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  };

  it("validates a complete NormalizedSyllabus with course_title and source locations", () => {
    const syllabus: NormalizedSyllabus = {
      schema_version: "0.1",
      course_title: "Introduction to Artificial Intelligence",
      course_code: "CS101",
      course_description: "Foundational AI course covering search, logic, and learning.",
      learning_objectives: [
        "Understand basic search algorithms",
        "Apply probabilistic reasoning",
      ],
      schedule_or_topics: [
        {
          week_or_unit: "Week 1",
          title: "Introduction & Intelligent Agents",
          topics: ["History of AI", "Agent architectures"],
          source: { kind: "line", start_line: 10, end_line: 25 },
        },
        {
          week_or_unit: "Week 2",
          title: "Search Algorithms",
          topics: ["BFS", "DFS", "A* search"],
          source: { kind: "paragraph", paragraph_index: 3 },
        },
        {
          week_or_unit: "Week 3",
          title: "Knowledge Representation",
          topics: ["Propositional logic", "First-order logic"],
          source: { kind: "page", page: 2 },
        },
      ],
      assessment_text: "Midterm Exam 40%, Final Project 60%",
      raw_text: "# Introduction to AI\n\n...",
      metadata: validMetadata,
    };

    const result = validateNormalizedSyllabus(syllabus);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(isNormalizedSyllabus(syllabus)).toBe(true);
  });

  it("validates NormalizedSyllabus when course_title is omitted (Decision P4-D1)", () => {
    const syllabus: NormalizedSyllabus = {
      schema_version: "0.1",
      learning_objectives: [],
      schedule_or_topics: [
        {
          week_or_unit: "Week 1",
          title: "Algorithms Overview",
          topics: [],
        },
      ],
      raw_text: "Week 1: Algorithms Overview",
      metadata: validMetadata,
    };

    const result = validateNormalizedSyllabus(syllabus);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validates NormalizedSyllabus with minimal required fields (empty arrays)", () => {
    const syllabus: NormalizedSyllabus = {
      schema_version: "0.1",
      learning_objectives: [],
      schedule_or_topics: [],
      raw_text: "Unstructured syllabus content",
      metadata: validMetadata,
    };

    const result = validateNormalizedSyllabus(syllabus);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts up to 20 course periods and rejects 21 at the contract boundary", () => {
    const build = (count: number): NormalizedSyllabus => ({
      schema_version: "0.1",
      learning_objectives: [],
      schedule_or_topics: Array.from({ length: count }, (_, index) => ({
        week_or_unit: `Week ${index + 1}`,
        title: `Topic ${index + 1}`,
        topics: [],
      })),
      raw_text: "Course schedule",
      metadata: validMetadata,
    });

    expect(validateNormalizedSyllabus(build(20)).valid).toBe(true);
    const overLimit = validateNormalizedSyllabus(build(21));
    expect(overLimit.valid).toBe(false);
    expect(overLimit.errors.some((error) => error.instancePath === "/schedule_or_topics" && /20/iu.test(error.message ?? ""))).toBe(true);
  });

  it("rejects syllabus with missing schema_version or wrong version", () => {
    const invalid: any = {
      schema_version: "0.2",
      learning_objectives: [],
      schedule_or_topics: [],
      raw_text: "Some text",
      metadata: validMetadata,
    };

    const result = validateNormalizedSyllabus(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.instancePath === "/schema_version")).toBe(true);
  });

  it("rejects syllabus with missing raw_text or empty raw_text", () => {
    const invalid: any = {
      schema_version: "0.1",
      learning_objectives: [],
      schedule_or_topics: [],
      raw_text: "",
      metadata: validMetadata,
    };

    const result = validateNormalizedSyllabus(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.instancePath === "/raw_text")).toBe(true);
  });

  it("rejects syllabus with invalid sha256 pattern in metadata", () => {
    const invalid: any = {
      schema_version: "0.1",
      learning_objectives: [],
      schedule_or_topics: [],
      raw_text: "Some text",
      metadata: {
        ...validMetadata,
        sha256: "not-a-valid-64-hex-sha256",
      },
    };

    const result = validateNormalizedSyllabus(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.instancePath === "/metadata/sha256")).toBe(true);
  });
});
