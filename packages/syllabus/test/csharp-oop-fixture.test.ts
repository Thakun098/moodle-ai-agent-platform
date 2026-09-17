import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ingestSyllabus } from "../src/ingest.js";
import { deriveCoreCourseDesignContext } from "../src/core-course-design-context.js";

describe("CS231 C# OOP Mock Syllabus Real-PDF Fixture Regression", () => {
  const pdfPath = resolve(__dirname, "fixtures", "csharp-oop-10-week-th.pdf");
  const pdfBytes = readFileSync(pdfPath);

  it("extracts complete and accurate Core Course Design Context from real PDF bytes", async () => {
    const syllabus = await ingestSyllabus({
      filename: "CSharp_OOP_10_Week_Mock_Syllabus_TH_FINAL.pdf",
      content: pdfBytes,
    });

    expect(syllabus.metadata.filename).toBe("CSharp_OOP_10_Week_Mock_Syllabus_TH_FINAL.pdf");
    expect(syllabus.course_code).toBe("CS231");
    expect(syllabus.schedule_or_topics).toHaveLength(10);

    const context = deriveCoreCourseDesignContext(syllabus, "pdf-run-1");

    // Extractor version
    expect(context.provenance.extractor_version).toBe("syllabus-semantics.v0.2");

    // Learner Context (F10)
    expect(context.learner_context.status).toBe("PROVIDED_BY_SYLLABUS");
    expect(context.learner_context.education_level.map((f) => f.text)).toContain("ปริญญาตรี");
    expect(context.learner_context.year_level.map((f) => f.text)).toContain("ชั้นปีที่ 2");
    expect(context.learner_context.target_learners).toEqual([]);

    // Prerequisites
    expect(context.learner_context.prerequisites.length).toBeGreaterThanOrEqual(1);
    expect(context.learner_context.prerequisites[0]?.text).toContain("การเขียนโปรแกรมคอมพิวเตอร์เบื้องต้น หรือเทียบเท่า");

    // Duration and Learning Hours (F11)
    expect(context.course.duration?.[0]?.text).toBe("10 สัปดาห์");
    expect(context.course.learning_hours?.[0]?.text).toContain("40 ชั่วโมง");
    expect(context.course.learning_hours?.[0]?.text).toContain("บรรยาย 20 ชั่วโมง / ปฏิบัติ 20 ชั่วโมง");

    // Learning Objectives
    expect(context.learning_objectives).toHaveLength(5);
    expect(context.learning_objectives[0]?.source_text).toContain("เข้าใจแนวคิดพื้นฐานของ Object-Oriented Programming");

    // Learning Outcomes (F5, F13)
    expect(context.source_learning_outcomes).toHaveLength(5);
    const cloTexts = context.source_learning_outcomes.map((o) => o.source_text);
    expect(cloTexts[0]).toContain("CLO1");
    expect(cloTexts[1]).toContain("CLO2");
    expect(cloTexts[2]).toContain("CLO3");
    expect(cloTexts[3]).toContain("CLO4");
    expect(cloTexts[4]).toContain("CLO5");

    // All CLOs are measurable
    for (const outcome of context.source_learning_outcomes) {
      expect(outcome.measurable_status).toBe("MEASURABLE");
    }

    // Explicit negative assertions (F13)
    for (const text of cloTexts) {
      expect(text).not.toContain("แผนการจัดการเรียนรู้รายสัปดาห์");
      expect(text).not.toContain("รายวิชานี้แบ่งเป็น 10 ช่วงเรียน");
      expect(text).not.toContain("OOP จากพื้นฐานไปสู่การประยุกต์ใช้");
      expect(text).not.toContain("CLO ผลลัพธ์การเรียนรู้ที่คาดหวัง");
      expect(text).not.toContain("ช่วงเรียน หัวข้อ");
      expect(text).not.toContain("หน้า 1");
      expect(text).not.toContain("หน้า 2");
      expect(text).not.toContain("หน้า 3");
    }

    // Assessment Requirements vs Grading Policy (F9)
    expect(context.assessment_requirements).toHaveLength(5);
    expect(context.assessment_requirements.some((a) => a.text.includes("20%"))).toBe(true);
    expect(context.assessment_requirements.some((a) => a.text.includes("25%"))).toBe(true);
    expect(context.assessment_requirements.some((a) => a.text.includes("10%"))).toBe(true);
    expect(context.grading_policy).toHaveLength(0);

    // Provenance integrity
    for (const item of [...context.learning_objectives, ...context.source_learning_outcomes]) {
      const ref = item.source_refs[0]!;
      expect(ref.source).toBe("syllabus");
      expect(ref.sha256).toBe(syllabus.metadata.sha256);
      expect(ref.start_line).toBeGreaterThan(0);
      expect(ref.end_line).toBeGreaterThanOrEqual(ref.start_line);
      expect(syllabus.raw_text.split(/\r?\n/)[ref.start_line - 1]).toBe(ref.text);
    }
  });
});
