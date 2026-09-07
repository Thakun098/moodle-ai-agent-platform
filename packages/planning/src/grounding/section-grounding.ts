import type {
  NormalizedSyllabus,
  SourceReference,
  SyllabusScheduleItem,
} from "@moodle-agent-poc/contracts";
import {
  formatSourceReferenceLocation,
  sourceReferenceFromSyllabusItem,
  sourceReferenceKeys,
} from "./source-reference.js";

export interface SectionGrounding {
  readonly scheduleItems: readonly SyllabusScheduleItem[];
  readonly learningObjectives: readonly string[];
  readonly sourceRefs: readonly SourceReference[];
  readonly courseAssessmentText?: string;
}

export interface SectionGroundingTarget {
  readonly ref: string;
  readonly position: number;
  readonly title: string;
  readonly source_refs?: readonly SourceReference[];
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function scheduleAnchorKey(value: string): string | undefined {
  const match = normalized(value).match(/(week|สัปดาห์|unit|หน่วย)\s*(?:ที่\s*)?(\d+)/iu);
  if (!match) return undefined;
  const kind = match[1] === "unit" || match[1] === "หน่วย" ? "unit" : "week";
  return `${kind}:${Number(match[2])}`;
}

function groupedSchedule(syllabus: NormalizedSyllabus): Map<string, SyllabusScheduleItem[]> {
  const groups = new Map<string, SyllabusScheduleItem[]>();
  let currentGroup = "General context";
  for (const item of syllabus.schedule_or_topics) {
    if (item.week_or_unit?.trim()) currentGroup = item.week_or_unit.trim();
    const group = groups.get(currentGroup) ?? [];
    group.push(item);
    groups.set(currentGroup, group);
  }
  return groups;
}

function uniqueAnchors(syllabus: NormalizedSyllabus): string[] {
  return [...new Set(
    syllabus.schedule_or_topics
      .map((item) => item.week_or_unit?.trim())
      .filter((value): value is string => Boolean(value)),
  )];
}

function sectionHints(section: SectionGroundingTarget): string[] {
  return [
    section.title,
    ...(section.source_refs ?? []).flatMap((ref) => [ref.section ?? "", ref.text ?? ""]),
  ].map(normalized).filter(Boolean);
}

function findRelevantScheduleItems(
  syllabus: NormalizedSyllabus,
  section: SectionGroundingTarget,
  allowPositionFallback = true,
): SyllabusScheduleItem[] {
  const groups = groupedSchedule(syllabus);
  const anchors = uniqueAnchors(syllabus);
  const hints = sectionHints(section);
  const hintAnchorKeys = hints.map(scheduleAnchorKey).filter((value): value is string => Boolean(value));
  const matchingAnchors = anchors.filter((anchor) => {
    const key = scheduleAnchorKey(anchor);
    if (key && hintAnchorKeys.length > 0) return hintAnchorKeys.includes(key);
    const candidate = normalized(anchor);
    return hints.some((hint) => hint.includes(candidate) || candidate.includes(hint));
  });

  if (matchingAnchors.length > 0) {
    return matchingAnchors.flatMap((anchor) => groups.get(anchor) ?? []);
  }

  const matchingItems = syllabus.schedule_or_topics.filter((item) => {
    const candidates = [item.title, ...item.topics].map(normalized);
    return candidates.some((candidate) => hints.some((hint) => hint.includes(candidate) || candidate.includes(hint)));
  });
  if (matchingItems.length > 0) return matchingItems;

  if (allowPositionFallback) {
    const fallbackAnchor = anchors[section.position - 1];
    if (fallbackAnchor) return groups.get(fallbackAnchor) ?? [];
  }

  return [];
}

function relevantObjectives(
  syllabus: NormalizedSyllabus,
  items: readonly SyllabusScheduleItem[],
  section: SectionGroundingTarget,
): string[] {
  const terms = [section.title, ...items.flatMap((item) => [item.title, ...item.topics])]
    .map(normalized)
    .filter((term) => term.length >= 3);
  const matched = syllabus.learning_objectives.filter((objective) => {
    const candidate = normalized(objective);
    return terms.some((term) => candidate.includes(term) || term.includes(candidate));
  });
  return matched;
}

export function buildSectionGrounding(
  syllabus: NormalizedSyllabus,
  section: SectionGroundingTarget,
  options: { allowPositionFallback?: boolean } = {},
): SectionGrounding {
  const scheduleItems = findRelevantScheduleItems(syllabus, section, options.allowPositionFallback ?? true);
  const sourceRefs = scheduleItems.map((item) => sourceReferenceFromSyllabusItem(syllabus, item));
  return {
    scheduleItems,
    learningObjectives: relevantObjectives(syllabus, scheduleItems, section),
    sourceRefs,
    ...(syllabus.assessment_text?.trim() ? { courseAssessmentText: syllabus.assessment_text.trim() } : {}),
  };
}

export function formatSectionGrounding(
  syllabus: NormalizedSyllabus,
  section: SectionGroundingTarget,
  grounding = buildSectionGrounding(syllabus, section),
): string {
  const schedule = grounding.scheduleItems.length > 0
    ? grounding.scheduleItems.map((item) => {
      const source = formatSourceReferenceLocation(sourceReferenceFromSyllabusItem(syllabus, item));
      return `- ${item.title} (${source})${item.topics.length > 0 ? `: ${item.topics.join("; ")}` : ""}`;
    }).join("\n")
    : "- No matching schedule item was found; use only the section metadata above.";
  const objectives = grounding.learningObjectives.length > 0
    ? grounding.learningObjectives.map((objective) => `- ${objective}`).join("\n")
    : "- None";
  return [
    `Section ${section.position}: ${section.title}`,
    "Original syllabus grounding:",
    schedule,
    "Relevant objectives:",
    objectives,
    ...(grounding.courseAssessmentText ? ["Course-global assessment context (applies to the entire syllabus; it is not section-specific):", grounding.courseAssessmentText] : []),
    `Authorized source references: ${JSON.stringify(grounding.sourceRefs)}`,
  ].join("\n");
}

export function buildSectionProvenanceAllowlists(
  syllabus: NormalizedSyllabus,
  sections: readonly SectionGroundingTarget[],
): Map<string, Set<string>> {
  return new Map(sections.map((section) => {
    const grounding = buildSectionGrounding(syllabus, section);
    const allowed = new Set<string>();
    for (const ref of grounding.sourceRefs) {
      for (const key of sourceReferenceKeys(ref)) allowed.add(key);
    }
    for (const item of grounding.scheduleItems) {
      for (const section of [item.week_or_unit, item.title]) {
        if (section?.trim()) allowed.add(`${syllabus.metadata.filename}::section::${section.trim()}`);
      }
    }
    return [section.ref, allowed];
  }));
}
