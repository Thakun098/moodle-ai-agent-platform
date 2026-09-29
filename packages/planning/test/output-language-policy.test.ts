import { describe, expect, it } from "vitest";
import {
  collectActivityEducationalProse,
  collectStructureEducationalProse,
  inspectPrimaryOutputLanguage,
  primaryOutputLanguageCorrectionPrompt,
} from "../src/language/output-language-policy.js";

describe("Primary Output Language output contract", () => {
  it("accepts Thai educational prose with legitimate English technical terms", () => {
    const inspection = inspectPrimaryOutputLanguage([
      "ให้นักศึกษาออกแบบโปรแกรมด้วย Python และเรียกใช้ REST API จากนั้นอธิบายเหตุผลในการเลือกโครงสร้างข้อมูล",
      "ใช้ SQL เพื่อจัดเก็บข้อมูลและสรุปผลการทดสอบอย่างเป็นระบบ",
    ], { code: "th", derived_from: "SCHEDULE_OR_TOPICS" });
    expect(inspection.valid).toBe(true);
    expect(inspection.thai_signal).toBeGreaterThan(inspection.english_signal);
  });

  it("accepts Thai prose even when common product names occupy substantial Latin text", () => {
    const inspection = inspectPrimaryOutputLanguage([
      "ให้นักศึกษาใช้ Microsoft Excel และ Google Classroom บน Windows เพื่อวิเคราะห์ข้อมูลและนำเสนอผลลัพธ์อย่างเป็นระบบ",
    ], { code: "th", derived_from: "SCHEDULE_OR_TOPICS" });
    expect(inspection.valid).toBe(true);
    expect(inspection.thai_signal).toBeGreaterThan(inspection.english_signal);
  });

  it("rejects material English prose for a Thai authority", () => {
    const inspection = inspectPrimaryOutputLanguage([
      "Explain the design choices, compare the alternatives, and justify the final implementation in a clear written report.",
      "Provide detailed feedback for each answer and discuss the reasoning behind the selected approach.",
    ], { code: "th", derived_from: "SCHEDULE_OR_TOPICS" });
    expect(inspection.valid).toBe(false);
    expect(inspection.expected_label).toBe("Thai");
  });

  it("rejects a substantial wrong-language tail even when the expected language narrowly dominates", () => {
    const inspection = inspectPrimaryOutputLanguage([
      "ก".repeat(60) + " " + "a".repeat(40),
    ], { code: "th", derived_from: "SCHEDULE_OR_TOPICS" });
    expect(inspection.expected_share).toBeCloseTo(0.6);
    expect(inspection.valid).toBe(false);
  });

  it("exempts only verbatim quoted text that exists in authorized source evidence", () => {
    const quote = "Explain the architecture tradeoffs in the existing implementation";
    const thai = "ให้นักศึกษาวิเคราะห์หลักฐานและสรุปเหตุผลของแนวทางที่เลือกอย่างเป็นระบบ";
    const authorized = inspectPrimaryOutputLanguage([
      thai + ' “' + quote + '”',
    ], { code: "th", derived_from: "SCHEDULE_OR_TOPICS" }, [quote]);
    const unauthorized = inspectPrimaryOutputLanguage([
      thai + ' “' + quote + '”',
    ], { code: "th", derived_from: "SCHEDULE_OR_TOPICS" }, ["Different source text"]);
    expect(authorized.valid).toBe(true);
    expect(unauthorized.valid).toBe(false);
  });

  it("rejects material Thai prose for an English authority", () => {
    const inspection = inspectPrimaryOutputLanguage([
      "ให้นักศึกษาอธิบายแนวคิด วิเคราะห์ข้อดีข้อเสีย และสรุปเหตุผลของแนวทางที่เลือกอย่างชัดเจน",
    ], { code: "en", derived_from: "OBJECTIVES_OUTCOMES" });
    expect(inspection.valid).toBe(false);
  });

  it("collects teacher-visible Structure titles/prose while excluding provenance refs", () => {
    const prose = collectStructureEducationalProse({
      summary: "สรุปโครงสร้างรายวิชาและลำดับการเรียนรู้",
      content: {
        course: { title: "CS101 Object-Oriented Programming", summary: "เน้นการวิเคราะห์และออกแบบอย่างเป็นระบบ" },
        sections: [{
          title: "Week 1: OOP API",
          summary: "เรียนรู้แนวคิดพื้นฐานและประยุกต์ใช้กับโจทย์",
          source_refs: [{ source: "syllabus.md", text: "English source quotation remains unchanged." }],
        }],
      },
    });
    expect(prose).toEqual([
      "สรุปโครงสร้างรายวิชาและลำดับการเรียนรู้",
      "เน้นการวิเคราะห์และออกแบบอย่างเป็นระบบ",
      "Week 1: OOP API",
      "เรียนรู้แนวคิดพื้นฐานและประยุกต์ใช้กับโจทย์",
    ]);
  });

  it("allows a source-preserved English Structure title under Thai authority but rejects a newly authored English title", () => {
    const sourceTitle = "Week 1: Introduction to Front Office";
    const thaiSummary = "อธิบายแนวคิดสำคัญและเชื่อมโยงกับการปฏิบัติงานอย่างเป็นระบบ";
    const authorized = inspectPrimaryOutputLanguage(
      [sourceTitle, thaiSummary],
      { code: "th", derived_from: "SCHEDULE_OR_TOPICS" },
      [sourceTitle],
    );
    const invented = inspectPrimaryOutputLanguage(
      ["A newly authored English section title with substantial explanatory wording", thaiSummary],
      { code: "th", derived_from: "SCHEDULE_OR_TOPICS" },
      [sourceTitle],
    );
    expect(authorized.valid).toBe(true);
    expect(invented.valid).toBe(false);
  });

  it("collects Quiz/Assignment educational prose while excluding provenance and copied objective fields", () => {
    const prose = collectActivityEducationalProse({
      type: "quiz",
      description: "แบบทดสอบเพื่อทบทวนแนวคิดสำคัญ",
      learning_objectives: ["Explain OOP in English source wording"],
      source_refs: [{ source: "syllabus.md", text: "Verbatim English source quote" }],
      questions: [{
        question: "ข้อใดอธิบายหลักการนี้ได้เหมาะสมที่สุด",
        choices: [{ text: "ตัวเลือกที่หนึ่ง" }, { text: "ตัวเลือกที่สอง" }],
        feedback: "ทบทวนเหตุผลและเชื่อมโยงกับตัวอย่างในบทเรียน",
      }],
    });
    expect(prose.join(" ")).not.toContain("English source");
    expect(prose).toHaveLength(5);
  });

  it("makes the correction prompt explicit and bounded", () => {
    const prompt = primaryOutputLanguageCorrectionPrompt({ code: "th", derived_from: "COURSE_TITLE" });
    expect(prompt).toContain("single bounded");
    expect(prompt).toContain("Thai");
  });
});
