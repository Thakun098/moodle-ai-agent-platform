import type { NormalizedSyllabus, SyllabusScheduleItem } from "@moodle-agent-poc/contracts";
import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import { describe, expect, it, vi } from "vitest";
import { buildCoursePlanningSchema } from "../src/prompts/course-planning-prompt.js";
import { buildCourseStructureUserPrompt } from "../src/prompts/course-planning-prompt.js";
import { buildSectionGrounding, buildSectionProvenanceAllowlists, formatSectionGrounding } from "../src/grounding/section-grounding.js";
import { normalizeSourceReference, sourceReferenceFromSyllabusItem, sourceReferenceKeys } from "../src/grounding/source-reference.js";
import { CourseStructurePlanner } from "../src/planners/course-structure-planner.js";

describe("canonical source references", () => {
  it.each([
    [{ title: "Single line", topics: ["A"], source: { kind: "line", start_line: 5 } }, "lines 5-5"],
    [{ title: "Line range", topics: ["B"], source: { kind: "line", start_line: 5, end_line: 8 } }, "lines 5-8"],
    [{ week_or_unit: "Week 5", title: "PDF topic", topics: ["C"], source: { kind: "page", page: 2 } }, "page 2"],
    [{ title: "DOCX topic", topics: ["D"], source: { kind: "paragraph", paragraph_index: 3 } }, "paragraph 3"],
  ] as const)("keeps %s canonical across prompt, schema, grounding, allowlist, and validator normalization", (item, expectedSection) => {
    const syllabus: NormalizedSyllabus = {
      schema_version: "0.1",
      course_title: "Source reference test",
      learning_objectives: [],
      schedule_or_topics: [item as SyllabusScheduleItem],
      raw_text: "Source reference test",
      metadata: { filename: "syllabus.pdf", media_type: "application/pdf", byte_size: 1, sha256: "a".repeat(64) },
    };
    const reference = sourceReferenceFromSyllabusItem(syllabus, syllabus.schedule_or_topics[0]!);
    const section = { ref: "section-01", position: 1, title: item.week_or_unit ?? item.title, source_refs: [] };
    const grounding = buildSectionGrounding(syllabus, section);
    const schema = buildCoursePlanningSchema(syllabus) as any;
    const allowedSections = schema.$defs.groundedSourceReference.properties.section.enum;
    const prompt = formatSectionGrounding(syllabus, section, grounding);
    const allowlist = buildSectionProvenanceAllowlists(syllabus, [section]).get(section.ref)!;
    const normalized = normalizeSourceReference(reference);

    expect(reference.section).toBe(expectedSection);
    expect(grounding.sourceRefs).toEqual([reference]);
    expect(allowedSections).toContain(expectedSection);
    expect(prompt).toContain(JSON.stringify(reference));
    expect(allowlist).toContain(`${reference.source}::section::${expectedSection}`);
    expect(sourceReferenceKeys(normalized)).toContain(`${reference.source}::section::${expectedSection}`);
    expect(normalized).toEqual(reference);
  });

  it("normalizes a page ref with a conflicting semantic section to the canonical page location", () => {
    expect(normalizeSourceReference({ source: "syllabus.pdf", page: 2, section: "Week 5" })).toEqual({ source: "syllabus.pdf", page: 2, section: "page 2" });
  });

  it("uses the canonical single-line location in the Stage 1 prompt", () => {
    const syllabus: NormalizedSyllabus = {
      schema_version: "0.1",
      course_title: "Stage 1 source test",
      learning_objectives: [],
      schedule_or_topics: [{ title: "Topic", topics: ["A"], source: { kind: "line", start_line: 5 } }],
      raw_text: "Stage 1 source test",
      metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 1, sha256: "b".repeat(64) },
    };
    const schema = buildCoursePlanningSchema(syllabus) as any;
    const reference = sourceReferenceFromSyllabusItem(syllabus, syllabus.schedule_or_topics[0]!);
    const prompt = buildCourseStructureUserPrompt(syllabus);
    expect(reference.section).toBe("lines 5-5");
    expect(schema.$defs.groundedSourceReference.properties.section.enum).toContain(reference.section);
    expect(prompt).toContain(`(${JSON.stringify(reference)})`);
  });

  it.each([
    ["page 1", { source: "syllabus.pdf", page: 1, section: "page 1", text: "Topic" }, { kind: "page", page: 1 }],
    [{ source: "page 1" }, { source: "syllabus.pdf", page: 1, section: "page 1", text: "Topic" }, { kind: "page", page: 1 }],
    ["lines 5-7", { source: "syllabus.pdf", section: "lines 5-7", text: "Topic" }, { kind: "line", start_line: 5, end_line: 7 }],
    ["paragraph 3", { source: "syllabus.pdf", section: "paragraph 3", text: "Topic" }, { kind: "paragraph", paragraph_index: 3 }],
  ] as const)("makes location-only model provenance non-authoritative (%s)", async (modelSourceRef, expected, syllabusSource) => {
    const syllabus: NormalizedSyllabus = {
      schema_version: "0.1",
      course_title: "PDF source test",
      learning_objectives: [],
      schedule_or_topics: [{ week_or_unit: "Week 1", title: "Topic", topics: [], source: syllabusSource }],
      raw_text: "Week 1 Topic",
      metadata: { filename: "syllabus.pdf", media_type: "application/pdf", byte_size: 1, sha256: "c".repeat(64) },
    };
    const client: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "" },
        toolCalls: [],
        rawText: JSON.stringify({
          title: "PDF source test",
          summary: "Structure",
          warnings: [],
          assumptions: [],
          content: {
            course: { title: "PDF source test" },
            sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Topic", source_refs: [modelSourceRef], activity_intents: [] }],
          },
        }),
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const draft = await new CourseStructurePlanner(client).plan(syllabus, { activityRules: [], warnings: [] }, undefined, undefined, "json");
    expect(draft.content.sections[0]?.source_refs).toEqual([expected]);
  });

  it("adapts a sparse provider section payload before deterministic PDF grounding", async () => {
    const syllabus: NormalizedSyllabus = {
      schema_version: "0.1",
      course_title: "Sparse PDF source test",
      learning_objectives: [],
      schedule_or_topics: [{ week_or_unit: "Week 1", title: "Topic", topics: [], source: { kind: "page", page: 1 } }],
      raw_text: "Week 1 Topic",
      metadata: { filename: "sparse.pdf", media_type: "application/pdf", byte_size: 1, sha256: "e".repeat(64) },
    };
    const client: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        message: { role: "assistant", content: "" },
        toolCalls: [],
        rawText: JSON.stringify({
          title: "Sparse PDF source test",
          summary: "Structure",
          warnings: [],
          assumptions: [],
          content: { course: { title: "Sparse PDF source test" }, sections: [{ section_title: "Week 1", position: 1, source_refs: ["page 1"], activity_intents: [] }] },
        }),
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const draft = await new CourseStructurePlanner(client).plan(syllabus, { activityRules: [], warnings: [] }, undefined, undefined, "json");
    expect(draft.content.sections[0]).toMatchObject({ title: "Week 1", summary: "Week 1", source_refs: [{ source: "sparse.pdf", page: 1, section: "page 1", text: "Topic" }] });
  });
});
