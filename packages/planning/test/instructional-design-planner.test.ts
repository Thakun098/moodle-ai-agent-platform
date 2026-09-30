import { describe, expect, it, vi } from "vitest";
import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import type { CoreCourseDesignContext, NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { CourseStructurePlanner, buildCourseStructureSchema } from "../src/index.js";

const syllabus: NormalizedSyllabus = {
  schema_version: "0.1",
  course_title: "Loops",
  learning_objectives: ["Explain loops"],
  schedule_or_topics: [{ week_or_unit: "Week 1", title: "Loops", topics: ["iteration"], source: { kind: "line", start_line: 3, end_line: 4 } }],
  raw_text: "# Loops\n## Schedule\nWeek 1: Loops\n- iteration",
  metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 20, sha256: "a".repeat(64) },
};

const context: CoreCourseDesignContext = {
  schema_version: "0.1",
  policy_version: "instructional-design.v0.1",
  revision: 1,
  run_id: "run-1",
  source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) },
  primary_output_language: { code: "en", derived_from: "SCHEDULE_OR_TOPICS" },
  course: {},
  learner_context: { revision: 1, status: "UNSPECIFIED", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [{ objective_id: "objective-1", source_text: "Explain loops", source_refs: [], status: "SOURCE" }],
  source_learning_outcomes: [{ source_outcome_id: "source-outcome-1", source_text: "explain loops", source_refs: [], measurable_status: "WEAK_OR_AMBIGUOUS", review_required: true }],
  approved_learning_outcomes: [],
  schedule_or_topics: syllabus.schedule_or_topics,
  assessment_requirements: [],
  grading_policy: [],
  constraints: [],
  missing_information: [],
  provenance: { extractor_version: "syllabus-semantics.v0.1", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
};

describe("Ticket 18 DESIGN_STRUCTURE prompt", () => {
  it("sends the Core Context projection and preserves authorized mapping fields", async () => {
    let captured: any;
    const client: ModelClient = {
      chat: vi.fn().mockImplementation(async (params) => {
        captured = params;
        return {
          message: { role: "assistant", content: "" },
          toolCalls: [],
          rawText: JSON.stringify({
            title: "Loops",
            summary: "Structure",
            warnings: [],
            assumptions: [],
            content: {
              course: { title: "Loops" },
              sections: [{
                ref: "section-01",
                position: 1,
                title: "Week 1",
                summary: "Loops",
                source_refs: [],
                aligned_objective_ids: ["objective-1"],
                aligned_outcome_ids: ["source-outcome-1"],
                activity_intents: [],
              }],
            },
          }),
        };
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };
    const draft = await new CourseStructurePlanner(client).plan(syllabus, { activityRules: [], warnings: [] }, "test", undefined, "json", context);
    expect(captured.messages[0].content).toContain("Instructional Designer");
    expect(captured.messages[0].content).toContain("DESIGN_STRUCTURE");
    expect(captured.messages[1].content).toContain("objective-1");
    expect(captured.messages[1].content).toContain("source-outcome-1");
    expect(captured.messages[1].content).toContain("No Quiz, Assignment");
    expect(draft.content.sections[0]).toMatchObject({ aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["source-outcome-1"], activityIntents: [] });
    expect((buildCourseStructureSchema(syllabus) as any).properties.content.properties.sections.items.properties.aligned_outcome_ids).toBeDefined();
  });

  it("projects one Primary Output Language authority and performs only one Structure correction attempt", async () => {
    const thaiContext: CoreCourseDesignContext = {
      ...context,
      primary_output_language: { code: "th", derived_from: "SCHEDULE_OR_TOPICS" },
    };
    const wrong = {
      title: "Loops",
      summary: "Explain the course structure and organize the learning sequence in a clear progression for learners.",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "Loops", summary: "Describe the learning progression and connect each section to the course goals." },
        sections: [{
          ref: "section-01", position: 1, title: "Week 1",
          summary: "Introduce the core ideas and explain how learners will apply them in practical exercises.",
          source_refs: [], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["source-outcome-1"], activity_intents: [],
        }],
      },
    };
    const corrected = {
      ...wrong,
      summary: "จัดโครงสร้างรายวิชาให้ผู้เรียนค่อย ๆ พัฒนาความเข้าใจและเชื่อมโยงแนวคิดอย่างเป็นระบบ",
      content: {
        ...wrong.content,
        course: { title: "Loops", summary: "วางลำดับการเรียนรู้และเชื่อมโยงแต่ละส่วนกับเป้าหมายของรายวิชา" },
        sections: [{ ...wrong.content.sections[0], summary: "แนะนำแนวคิดหลักและให้ผู้เรียนประยุกต์ใช้ผ่านกิจกรรมที่สอดคล้องกับเนื้อหา" }],
      },
    };
    const client: ModelClient = {
      chat: vi.fn()
        .mockResolvedValueOnce({ message: { role: "assistant", content: "" }, toolCalls: [], rawText: JSON.stringify(wrong) })
        .mockResolvedValueOnce({ message: { role: "assistant", content: "" }, toolCalls: [], rawText: JSON.stringify(corrected) }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };
    const draft = await new CourseStructurePlanner(client).plan(syllabus, { activityRules: [], warnings: [] }, "test", undefined, "json", thaiContext);
    expect(draft.summary).toContain("จัดโครงสร้าง");
    expect(client.chat).toHaveBeenCalledTimes(2);
    const firstRequest = (client.chat as any).mock.calls[0][0];
    const secondRequest = (client.chat as any).mock.calls[1][0];
    expect(firstRequest.messages[0].content).toContain("Primary Output Language authority: Thai");
    expect(secondRequest.messages.some((message: { content: string }) => message.content.includes("single bounded language-correction attempt"))).toBe(true);
  });

  it("fails Structure generation when the bounded language correction remains wrong", async () => {
    const thaiContext: CoreCourseDesignContext = {
      ...context,
      primary_output_language: { code: "th", derived_from: "SCHEDULE_OR_TOPICS" },
    };
    const wrong = {
      title: "Loops",
      summary: "Explain the course structure and organize the learning sequence in a clear progression for learners.",
      warnings: [],
      assumptions: [],
      content: {
        course: { title: "Loops", summary: "Describe the learning progression and connect each section to the course goals." },
        sections: [{
          ref: "section-01", position: 1, title: "Week 1",
          summary: "Introduce the core ideas and explain how learners will apply them in practical exercises.",
          source_refs: [], aligned_objective_ids: ["objective-1"], aligned_outcome_ids: ["source-outcome-1"], activity_intents: [],
        }],
      },
    };
    const client: ModelClient = {
      chat: vi.fn().mockResolvedValue({ message: { role: "assistant", content: "" }, toolCalls: [], rawText: JSON.stringify(wrong) }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };
    await expect(new CourseStructurePlanner(client).plan(syllabus, { activityRules: [], warnings: [] }, "test", undefined, "json", thaiContext))
      .rejects.toMatchObject({ code: "OUTPUT_LANGUAGE_POLICY_VIOLATION" });
    expect(client.chat).toHaveBeenCalledTimes(2);
  });
});
