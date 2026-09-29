import { describe, expect, it } from "vitest";
import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { derivePrimaryOutputLanguage } from "../src/primary-output-language.js";

function syllabus(overrides: Partial<NormalizedSyllabus> = {}): NormalizedSyllabus {
  return {
    schema_version: "0.1",
    course_title: "Course",
    course_code: "CS101",
    learning_objectives: [],
    schedule_or_topics: [],
    raw_text: "",
    metadata: {
      filename: "syllabus.md",
      media_type: "text/markdown",
      byte_size: 10,
      sha256: "a".repeat(64),
    },
    ...overrides,
  };
}

describe("Primary Output Language derivation", () => {
  it("derives Thai from Thai-dominant schedule prose while ignoring technical English tokens", () => {
    const result = derivePrimaryOutputLanguage(syllabus({
      course_title: "การพัฒนาโปรแกรม",
      schedule_or_topics: [{
        week_or_unit: "Week 1",
        title: "การออกแบบโปรแกรมด้วย Python FastAPI PostgreSQL OpenAI API และ SQL",
        topics: ["ฝึกวิเคราะห์ปัญหาและเขียนขั้นตอนวิธีอย่างเป็นระบบ"],
      }],
    }));
    expect(result).toEqual({ code: "th", derived_from: "SCHEDULE_OR_TOPICS" });
  });

  it("derives English from English-dominant schedule prose", () => {
    const result = derivePrimaryOutputLanguage(syllabus({
      schedule_or_topics: [{
        week_or_unit: "Week 1",
        title: "Design reliable software systems",
        topics: ["Analyze requirements and explain implementation tradeoffs with Python"],
      }],
    }));
    expect(result).toEqual({ code: "en", derived_from: "SCHEDULE_OR_TOPICS" });
  });

  it("uses Objectives/Outcomes as the deterministic tie-break when schedule Thai and English signal are tied", () => {
    const result = derivePrimaryOutputLanguage(syllabus({
      course_title: "English Course Title",
      learning_objectives: ["อธิบายหลักการ วิเคราะห์ทางเลือก และสรุปเหตุผลอย่างเป็นระบบ"],
      schedule_or_topics: [{
        week_or_unit: "1",
        title: "กา",
        topics: ["aa"],
      }],
    }));
    expect(result).toEqual({ code: "th", derived_from: "OBJECTIVES_OUTCOMES" });
  });

  it("uses Objectives/Outcomes when schedule content contains only technical tokens", () => {
    const result = derivePrimaryOutputLanguage(syllabus({
      course_title: "Software Design",
      learning_objectives: ["อธิบายหลักการออกแบบและประยุกต์ใช้เพื่อแก้ปัญหา"],
      schedule_or_topics: [{ week_or_unit: "1", title: "API SQL JSON", topics: ["Docker MCP"] }],
    }), ["วิเคราะห์ผลลัพธ์และสื่อสารเหตุผลอย่างชัดเจน"]);
    expect(result).toEqual({ code: "th", derived_from: "OBJECTIVES_OUTCOMES" });
  });

  it("uses the course title only after schedule and objective/outcome tiers cannot decide", () => {
    const result = derivePrimaryOutputLanguage(syllabus({
      course_title: "การคิดเชิงระบบ",
      learning_objectives: ["API SQL"],
      schedule_or_topics: [{ week_or_unit: "1", title: "JSON MCP", topics: ["Docker"] }],
    }));
    expect(result).toEqual({ code: "th", derived_from: "COURSE_TITLE" });
  });

  it("never consults UI locale and uses a deterministic compatibility default for degenerate semantic input", () => {
    const result = derivePrimaryOutputLanguage(syllabus({
      course_title: "API",
      learning_objectives: ["SQL"],
      schedule_or_topics: [{ week_or_unit: "1", title: "JSON", topics: ["MCP"] }],
    }));
    expect(result).toEqual({ code: "en", derived_from: "DETERMINISTIC_DEFAULT" });
  });
});
