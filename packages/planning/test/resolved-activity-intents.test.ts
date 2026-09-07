import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { describe, expect, it } from "vitest";
import { interpretTeacherInstruction } from "../src/instructions/teacher-instruction-interpreter.js";
import { resolveActivityIntentsForStructure } from "../src/instructions/resolved-activity-intents.js";
import type { SectionStructureDraft } from "../src/types.js";

const syllabus: NormalizedSyllabus = {
  schema_version: "0.1",
  metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 10, sha256: "sha" },
  learning_objectives: [],
  schedule_or_topics: [
    { week_or_unit: "Week 1", title: "Intro", topics: [], source: { kind: "line", start_line: 1, end_line: 2 } },
    { week_or_unit: "Week 2", title: "Search", topics: [], source: { kind: "line", start_line: 3, end_line: 4 } },
  ],
  raw_text: "Weeks",
};

const sections: SectionStructureDraft[] = [
  { ref: "section-01", position: 1, title: "Week 1: Intro", summary: "Intro", source_refs: [], activityIntents: [] },
  { ref: "section-02", position: 2, title: "Week 2: Search", summary: "Search", source_refs: [], activityIntents: [] },
];

describe("resolved teacher activity intents", () => {
  it("creates stable teacher Quiz intents before material generation", () => {
    const constraints = interpretTeacherInstruction("ทุกสัปดาห์สร้าง Quiz 1 ชุด");
    const resolved = resolveActivityIntentsForStructure(sections, constraints, syllabus);
    expect(resolved.flatMap((section) => section.activityIntents)).toMatchObject([
      { ref: "quiz-01", type: "quiz", origin: "teacher_instruction" },
      { ref: "quiz-02", type: "quiz", origin: "teacher_instruction" },
    ]);
  });

  it("resolves a specific Week scope only to the target section", () => {
    const constraints = interpretTeacherInstruction("สัปดาห์ที่ 2 สร้าง Quiz 1 ชุด");
    const resolved = resolveActivityIntentsForStructure(sections, constraints, syllabus);
    expect(resolved[0]?.activityIntents).toHaveLength(0);
    expect(resolved[1]?.activityIntents).toMatchObject([{ ref: "quiz-01", type: "quiz", origin: "teacher_instruction" }]);
  });

  it("re-resolves weekly rules after adding and deleting sections without orphan intents", () => {
    const constraints = interpretTeacherInstruction("ทุกสัปดาห์สร้าง Quiz 1 ชุด");
    const withAddedSection = resolveActivityIntentsForStructure([
      ...sections,
      { ref: "section-03", position: 3, title: "Week 3: Practice", summary: "Practice", source_refs: [], activityIntents: [] },
    ], constraints, {
      ...syllabus,
      schedule_or_topics: [...syllabus.schedule_or_topics, { week_or_unit: "Week 3", title: "Practice", topics: [], source: { kind: "line", start_line: 5, end_line: 6 } }],
    });
    expect(withAddedSection[2]?.activityIntents).toMatchObject([{ ref: "quiz-03", origin: "teacher_instruction" }]);

    const afterDelete = resolveActivityIntentsForStructure(sections.slice(0, 1), constraints, syllabus);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]?.activityIntents).toMatchObject([{ ref: "quiz-01", origin: "teacher_instruction" }]);
  });

  it("re-resolves specific Week rules against semantic anchors after section reorder", () => {
    const constraints = interpretTeacherInstruction("สัปดาห์ที่ 2 สร้าง Quiz 1 ชุด");
    const reordered = resolveActivityIntentsForStructure([
      { ...sections[1]!, position: 1 },
      { ...sections[0]!, position: 2 },
    ], constraints, syllabus);
    expect(reordered[0]?.activityIntents).toHaveLength(1);
    expect(reordered[0]?.activityIntents[0]).toMatchObject({ ref: "quiz-01", origin: "teacher_instruction" });
    expect(reordered[1]?.activityIntents).toHaveLength(0);
  });

  it("materializes mixed Quiz-every-week and Assignment-Week-2/4 rules", () => {
    const fourWeekSyllabus: NormalizedSyllabus = {
      ...syllabus,
      schedule_or_topics: Array.from({ length: 4 }, (_, index) => ({ week_or_unit: `Week ${index + 1}`, title: `Topic ${index + 1}`, topics: [], source: { kind: "line" as const, start_line: index + 1 } })),
    };
    const fourSections: SectionStructureDraft[] = Array.from({ length: 4 }, (_, index) => ({
      ref: `section-0${index + 1}`, position: index + 1, title: `Week ${index + 1}`, summary: `Topic ${index + 1}`, source_refs: [], activityIntents: [],
    }));
    const constraints = interpretTeacherInstruction("ขอให้ในทุก week มี quiz และใน week ที่ 2 และ 4 เป็น assignment 1 เรื่อง");
    const resolved = resolveActivityIntentsForStructure(fourSections, constraints, fourWeekSyllabus);
    expect(resolved.map((section) => section.activityIntents.map((intent) => intent.type))).toEqual([
      ["quiz"], ["quiz", "assignment"], ["quiz"], ["quiz", "assignment"],
    ]);
    expect(new Set(resolved.flatMap((section) => section.activityIntents.map((intent) => intent.ref))).size).toBe(6);
  });
});
