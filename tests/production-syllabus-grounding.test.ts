import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import { describe, expect, it, vi } from "vitest";
import { ingestSyllabus } from "../packages/syllabus/src/ingest.js";
import { CourseStructurePlanner } from "../packages/planning/src/planners/course-structure-planner.js";

describe("production syllabus extractor grounding regression", () => {
  it("ingests the production coffee PDF with anchored schedule periods", async () => {
    const filename = "course_syllabus_coffee_science.pdf";
    const content = readFileSync(resolve("packages", "syllabus", "test", "fixtures", filename));
    const syllabus = await ingestSyllabus({ content, filename });

    expect(syllabus.schedule_or_topics).toHaveLength(5);
    expect(syllabus.schedule_or_topics.every((item) => Boolean(item.week_or_unit?.trim()))).toBe(true);
    expect(syllabus.schedule_or_topics[0]).toMatchObject({ week_or_unit: "สัปดาห์ที่ 1" });
    expect(syllabus.schedule_or_topics[0]?.title).toContain("พฤกษศาสตร์ การปลูก และการแปรรูปเมล็ดกาแฟ");

    const modelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "" },
        toolCalls: [],
        rawText: JSON.stringify({
          title: "โครงสร้างรายวิชาวิทยาศาสตร์ของกาแฟ",
          summary: "โครงสร้างจากประมวลรายวิชา",
          warnings: [],
          assumptions: [],
          content: {
            course: { title: syllabus.course_title },
            sections: syllabus.schedule_or_topics.map((item, index) => ({
              ref: `section-${String(index + 1).padStart(2, "0")}`,
              position: index + 1,
              title: index === 0
                ? "Week 1: พฤกษศาสตร์ การปลูกและการแปรรูปเมล็ดกาแฟ"
                : `Week ${index + 1}: ${item.title}`,
              summary: item.title,
              source_refs: [],
              activity_intents: [],
            })),
          },
        }),
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };
    const draft = await new CourseStructurePlanner(modelClient)
      .plan(syllabus, { activityRules: [], warnings: [] }, undefined, undefined, "json");
    expect(draft.content.sections).toHaveLength(5);
    expect(draft.content.sections[0]?.source_refs).toHaveLength(1);
  });

  it.each(["txt", "md", "markdown"])("recognizes the same Thai schedule heading in .%s", async (extension) => {
    const content = Buffer.from([
      "ชื่อรายวิชา: วิทยาศาสตร์ของกาแฟ",
      "กำหนดการสอน",
      "สัปดาห์ หัวข้อ กิจกรรม / งานที่มอบหมาย",
      "1 พฤกษศาสตร์และการปลูก แล็บภาคสนาม",
      "2 เคมีของการคั่ว แล็บการคั่ว",
      "การประเมินผล",
    ].join("\n"));
    const syllabus = await ingestSyllabus({ content, filename: `coffee.${extension}` });
    expect(syllabus.schedule_or_topics.map((item) => item.week_or_unit)).toEqual(["สัปดาห์ที่ 1", "สัปดาห์ที่ 2"]);
  });
  it("ingests all 18 periods and grounds model sections named from the real syllabus topics", async () => {
    const filename = "Course_Syllabus_30700-1004_Tourism_and_Hospitality.docx";
    const content = readFileSync(resolve("packages/syllabus/test/fixtures", filename));
    const syllabus = await ingestSyllabus({ content, filename });

    expect(syllabus.schedule_or_topics).toHaveLength(18);
    expect(syllabus.schedule_or_topics[0]?.title).toBe(
      "ความรู้เบื้องต้นเกี่ยวกับอุตสาหกรรมท่องเที่ยวและการบริการ",
    );

    const modelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "" },
        toolCalls: [],
        rawText: JSON.stringify({
          title: "โครงสร้างรายวิชาอุตสาหกรรมท่องเที่ยวและการบริการ",
          summary: "โครงสร้างจากประมวลรายวิชา",
          warnings: [],
          assumptions: [],
          content: {
            course: { title: syllabus.course_title },
            sections: syllabus.schedule_or_topics.map((item, index) => ({
              ref: `section-${String(index + 1).padStart(2, "0")}`,
              position: index + 1,
              title: item.title,
              summary: item.title,
              source_refs: [],
              activity_intents: [],
            })),
          },
        }),
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const draft = await new CourseStructurePlanner(modelClient)
      .plan(syllabus, { activityRules: [], warnings: [] }, undefined, undefined, "json");

    expect(draft.content.sections).toHaveLength(18);
    expect(draft.content.sections[0]).toMatchObject({
      position: 1,
      title: "ความรู้เบื้องต้นเกี่ยวกับอุตสาหกรรมท่องเที่ยวและการบริการ",
    });
    expect(draft.content.sections[0]?.source_refs).toHaveLength(1);
    expect(draft.content.sections[7]?.source_refs).toHaveLength(1);
    expect(draft.content.sections[17]?.source_refs).toHaveLength(1);
  });
});
