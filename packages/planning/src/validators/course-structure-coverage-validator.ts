import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { PlanningError } from "../errors/planning-errors.js";
import { buildSectionGrounding } from "../grounding/section-grounding.js";

export interface CourseStructureCoverageSection {
  readonly ref: string;
  readonly position: number;
  readonly title: string;
  readonly source_refs?: readonly { source: string; page?: number; section?: string; text?: string }[];
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function anchorKey(value: string): string | undefined {
  const match = normalized(value).match(/(week|สัปดาห์|unit|หน่วย)\s*(?:ที่\s*)?(\d+)/iu);
  if (!match) return undefined;
  const kind = match[1] === "unit" || match[1] === "หน่วย" ? "unit" : "week";
  return `${kind}:${Number(match[2])}`;
}

function syllabusAnchors(syllabus: NormalizedSyllabus): string[] {
  return [...new Set(
    syllabus.schedule_or_topics
      .map((item) => item.week_or_unit?.trim())
      .filter((value): value is string => Boolean(value)),
  )];
}

export function courseStructureSectionCoversAnchor(
  anchor: string,
  section: CourseStructureCoverageSection,
  syllabus: NormalizedSyllabus,
): boolean {
  const expectedKey = anchorKey(anchor);
  const titleKey = anchorKey(section.title);
  if (expectedKey && titleKey) return titleKey === expectedKey;
  if (!expectedKey) {
    const anchorText = normalized(anchor);
    const titleText = normalized(section.title);
    if (titleText.includes(anchorText) || anchorText.includes(titleText)) return true;
  }
  return buildSectionGrounding(syllabus, section, { allowPositionFallback: false }).scheduleItems.some((item) => {
    if (!item.week_or_unit) return false;
    const itemKey = anchorKey(item.week_or_unit);
    return expectedKey ? itemKey === expectedKey : normalized(item.week_or_unit) === normalized(anchor);
  });
}

export function inspectCourseStructureCoverage(
  syllabus: NormalizedSyllabus,
  sections: readonly CourseStructureCoverageSection[],
): { coveredAnchors: string[]; missingAnchors: string[] } {
  const anchors = syllabusAnchors(syllabus);
  const coveredAnchors = anchors.filter((anchor) =>
    sections.some((section) => courseStructureSectionCoversAnchor(anchor, section, syllabus)),
  );
  const covered = new Set(coveredAnchors);
  return { coveredAnchors, missingAnchors: anchors.filter((anchor) => !covered.has(anchor)) };
}

export function validateCourseStructureCoverage(
  syllabus: NormalizedSyllabus,
  sections: readonly CourseStructureCoverageSection[],
): { coveredAnchors: string[]; missingAnchors: string[] } {
  const { coveredAnchors, missingAnchors } = inspectCourseStructureCoverage(syllabus, sections);
  if (missingAnchors.length > 0) {
    throw new PlanningError(
      "PLAN_SCHEMA_INVALID",
      `Course Structure omitted syllabus coverage anchors: ${missingAnchors.join(", ")}`,
      { missingAnchors },
    );
  }
  return { coveredAnchors, missingAnchors };
}
