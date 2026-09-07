import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { describe, expect, it } from "vitest";
import { PlanningError } from "../src/errors/planning-errors.js";
import {
  createCourseStructureRevision,
  parseCourseStructureContent,
  type CourseStructureRevision,
} from "../src/structure/course-structure-revision.js";
import type { CourseStructureDraft } from "../src/types.js";

const syllabus: NormalizedSyllabus = {
  schema_version: "0.1",
  metadata: {
    filename: "syllabus.md",
    media_type: "text/markdown",
    byte_size: 100,
    sha256: "sha",
  },
  course_title: "Introduction to AI",
  learning_objectives: ["Explain search"],
  schedule_or_topics: [
    {
      week_or_unit: "Week 1",
      title: "Search",
      topics: ["BFS"],
      source: { kind: "line", start_line: 1, end_line: 4 },
    },
  ],
  raw_text: "Week 1: Search",
};

const draft: CourseStructureDraft = {
  title: "AI Structure",
  summary: "A syllabus-grounded structure.",
  warnings: [],
  assumptions: [],
  content: {
    course: { title: "Introduction to AI" },
    sections: [
      {
        ref: "section-01",
        position: 1,
        title: "Week 1: Search",
        summary: "Search fundamentals.",
        source_refs: [{ source: "syllabus.md", section: "Week 1" }],
        activityIntents: [
          {
            type: "quiz",
            title: "Search check",
            source_refs: [{ source: "syllabus.md", section: "Week 1" }],
            origin: "syllabus",
          },
        ],
      },
    ],
  },
};

describe("Course Structure Revision", () => {
  it("creates a valid immutable revision from a structure draft without creating a CoursePlan", () => {
    const revision = createCourseStructureRevision({
      id: "structure-rev-1",
      runId: "run-1",
      revision: 1,
      draft,
      createdAt: "2026-09-04T00:00:00.000Z",
    });

    expect(revision).toMatchObject({
      id: "structure-rev-1",
      runId: "run-1",
      revision: 1,
      title: "AI Structure",
      validationStatus: "valid",
    });
    expect(revision.content.sections[0]?.activity_intents[0]?.origin).toBe("syllabus");
    expect(revision.content.sections[0]?.activities).toBeUndefined();
    expect(revision.sourceSyllabus).toBe("syllabus.md");
  });

  it("rejects invalid structure content before persistence", () => {
    expect(() => parseCourseStructureContent({
      course: { title: " " },
      sections: [],
    })).toThrowError(PlanningError);

    try {
      parseCourseStructureContent({ course: { title: " " }, sections: [] });
    } catch (error) {
      expect(error).toMatchObject({ code: "STRUCTURE_INVALID" });
    }
  });

  it("rejects duplicate section positions and unknown activity origins", () => {
    expect(() => parseCourseStructureContent({
      course: { title: "AI" },
      sections: [
        {
          ref: "section-01",
          position: 1,
          title: "One",
          summary: "One",
          source_refs: [{ source: "syllabus.md" }],
          activity_intents: [{ type: "quiz", title: "Q", source_refs: [], origin: "syllabus" }],
        },
        {
          ref: "section-02",
          position: 1,
          title: "Two",
          summary: "Two",
          source_refs: [{ source: "syllabus.md" }],
          activity_intents: [],
        },
      ],
    })).toThrow(/position/);

    expect(() => parseCourseStructureContent({
      course: { title: "AI" },
      sections: [{
        ref: "section-01",
        position: 1,
        title: "One",
        summary: "One",
        source_refs: [{ source: "syllabus.md" }],
        activity_intents: [{ type: "quiz", title: "Q", source_refs: [], origin: "model_generated" }],
      }],
    })).toThrow(/origin/);
  });

  it("preserves the source filename as structure provenance", () => {
    const revision: CourseStructureRevision = createCourseStructureRevision({
      id: "structure-rev-1",
      runId: "run-1",
      revision: 1,
      draft,
      createdAt: "2026-09-04T00:00:00.000Z",
      syllabus,
    });

    expect(revision.sourceSyllabus).toBe("syllabus.md");
  });

  it("preserves resolved teacher intent refs across the revision round trip", () => {
    const content = parseCourseStructureContent({
      course: { title: "AI" },
      sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Basics", source_refs: [], activity_intents: [{ ref: "quiz-01", type: "quiz", title: "Weekly quiz", source_refs: [], origin: "teacher_instruction" }] }],
    });
    expect(content.sections[0]?.activity_intents[0]).toMatchObject({ ref: "quiz-01", origin: "teacher_instruction" });
  });
});
