import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import { describe, expect, it, vi } from "vitest";
import { ingestSyllabus } from "../packages/syllabus/src/ingest.js";
import { CourseStructurePlanner } from "../packages/planning/src/planners/course-structure-planner.js";

describe("production table-based DOCX grounding regression", () => {
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
