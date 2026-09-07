import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { describe, expect, it } from "vitest";
import { validateCourseStructureCoverage } from "../src/validators/course-structure-coverage-validator.js";
import type { SectionStructureDraft } from "../src/types.js";

const syllabus: NormalizedSyllabus = {
  schema_version: "0.1",
  course_title: "CS231",
  learning_objectives: [],
  schedule_or_topics: Array.from({ length: 15 }, (_, index) => ({
    week_or_unit: `Week ${index + 1}`,
    title: `Topic ${index + 1}`,
    topics: [`Content ${index + 1}`],
    source: { kind: "page" as const, page: index + 1 },
  })),
  raw_text: "15-week syllabus",
  metadata: { filename: "cs231.pdf", media_type: "application/pdf", byte_size: 1, sha256: "f".repeat(64) },
};

function section(week: number, position: number): SectionStructureDraft {
  return { ref: `section-${String(position).padStart(2, "0")}`, position, title: `Week ${week}: Topic ${week}`, summary: `Topic ${week}`, source_refs: [], activityIntents: [] };
}

describe("Course Structure syllabus coverage", () => {
  it("rejects a 15-week syllabus when the Structure omits Week 4 and Week 11-15", () => {
    const weeks = [1, 2, 3, 5, 6, 7, 8, 9, 10];
    expect(() => validateCourseStructureCoverage(syllabus, weeks.map((week, index) => section(week, index + 1))))
      .toThrowError(expect.objectContaining({
        code: "PLAN_SCHEMA_INVALID",
        details: { missingAnchors: ["Week 4", "Week 11", "Week 12", "Week 13", "Week 14", "Week 15"] },
      }));
  });

  it("accepts one semantically matched Section for every syllabus Week anchor", () => {
    expect(validateCourseStructureCoverage(syllabus, Array.from({ length: 15 }, (_, index) => section(index + 1, index + 1))))
      .toMatchObject({ coveredAnchors: syllabus.schedule_or_topics.map((item) => item.week_or_unit) });
  });
});
