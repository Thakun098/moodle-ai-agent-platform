import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { CourseStructurePlanner } from "../src/planners/course-structure-planner.js";
import { buildCourseStructureSchema } from "../src/planners/course-structure-planner.js";
import { buildCourseStructureUserPrompt } from "../src/prompts/course-planning-prompt.js";
import { validateCourseStructureCoverage } from "../src/validators/course-structure-coverage-validator.js";

function tenWeekSyllabus(): NormalizedSyllabus {
  return {
    schema_version: "0.1",
    course_title: "C# OOP",
    learning_objectives: [],
    schedule_or_topics: Array.from({ length: 10 }, (_, index) => ({
      week_or_unit: `สัปดาห์ที่ ${index + 1}`,
      title: `หัวข้อสัปดาห์ที่ ${index + 1}`,
      topics: [`เนื้อหา ${index + 1}`],
      source: { kind: "page" as const, page: index < 5 ? 1 : 2 },
    })),
    raw_text: "Mock 10 week syllabus",
    metadata: {
      filename: "csharp-oop.pdf",
      media_type: "application/pdf",
      byte_size: 100,
      sha256: "a".repeat(64),
    },
  };
}

function modelClientWithSections(weeks: number[]): ModelClient {
  return {
    chat: vi.fn().mockResolvedValue({
      message: { role: "assistant", content: "" },
      toolCalls: [],
      rawText: JSON.stringify({
        title: "C# OOP Structure",
        summary: "โครงสร้างรายวิชา",
        warnings: [],
        assumptions: [],
        content: {
          course: { title: "C# OOP" },
          sections: weeks.map((week, index) => ({
            ref: `section-${String(index + 1).padStart(2, "0")}`,
            position: index + 1,
            title: `สัปดาห์ที่ ${week}`,
            summary: `สรุปจากโมเดล ${week}`,
            source_refs: [],
            activity_intents: [],
          })),
        },
      }),
    }),
    listModels: vi.fn(),
    ping: vi.fn(),
  };
}

describe("Course Structure deterministic coverage repair", () => {
  it("repairs an omitted Week 10 from syllabus evidence instead of failing coverage", async () => {
    const syllabus = tenWeekSyllabus();
    const planner = new CourseStructurePlanner(modelClientWithSections([1,2,3,4,5,6,7,8,9]));

    const draft = await planner.plan(syllabus, { activityRules: [], warnings: [] }, undefined, undefined, "json");

    expect(draft.content.sections).toHaveLength(10);
    expect(draft.content.sections.map((section) => section.ref)).toEqual(
      Array.from({ length: 10 }, (_, index) => `section-${String(index + 1).padStart(2, "0")}`),
    );
    expect(draft.content.sections.map((section) => section.position)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(draft.content.sections[9]).toMatchObject({
      title: "สัปดาห์ที่ 10",
      summary: "หัวข้อสัปดาห์ที่ 10; เนื้อหา 10",
    });
    expect(draft.content.sections[9]?.source_refs).toHaveLength(1);
    expect(draft.warnings.join(" ")).toContain("สัปดาห์ที่ 10");
    expect(() => validateCourseStructureCoverage(syllabus, draft.content.sections)).not.toThrow();
  });

  it("repairs a missing middle period, canonicalizes order, and drops unanchored model extras", async () => {
    const syllabus = tenWeekSyllabus();
    const client = modelClientWithSections([1,2,3,4,6,7,8,9,10,99]);
    const draft = await new CourseStructurePlanner(client).plan(syllabus, { activityRules: [], warnings: [] }, undefined, undefined, "json");

    expect(draft.content.sections).toHaveLength(10);
    expect(draft.content.sections[4]).toMatchObject({
      ref: "section-05",
      position: 5,
      title: "สัปดาห์ที่ 5",
      summary: "หัวข้อสัปดาห์ที่ 5; เนื้อหา 5",
    });
    expect(draft.content.sections.some((section) => /99/.test(section.title))).toBe(false);
    expect(draft.warnings.join(" ")).toMatch(/Ignored 1 unanchored model section/);
    expect(() => validateCourseStructureCoverage(syllabus, draft.content.sections)).not.toThrow();
  });

  it("requests and constrains exactly one Structure section per syllabus course period", () => {
    const syllabus = tenWeekSyllabus();
    const prompt = buildCourseStructureUserPrompt(syllabus);
    const schema = buildCourseStructureSchema(syllabus) as any;
    expect(prompt).toContain("exactly 10 anchored section(s)");
    expect(schema.properties.content.properties.sections.minItems).toBe(10);
    expect(schema.properties.content.properties.sections.maxItems).toBe(10);
  });
});
