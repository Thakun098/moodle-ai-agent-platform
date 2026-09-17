import type { CourseDefinition, NormalizedSyllabus, SourceReference } from "@moodle-agent-poc/contracts";
import { PlanningError } from "../errors/planning-errors.js";
import type { CourseStructureDraft } from "../types.js";
import type { CoursePlanningConstraints } from "../instructions/planning-constraints.js";

export interface CourseStructureActivityIntent {
  ref?: string;
  type: "quiz" | "assignment";
  title: string;
  source_refs: SourceReference[];
  origin: "syllabus" | "teacher_instruction";
}

export interface CourseStructureSection {
  ref: string;
  position: number;
  title: string;
  summary: string;
  source_refs: SourceReference[];
  activity_intents: CourseStructureActivityIntent[];
  aligned_objective_ids: string[];
  aligned_outcome_ids: string[];
  alignment_status: "CURRENT" | "STALE_ALIGNMENT";
}

export interface CourseStructureContent {
  course: CourseDefinition;
  sections: CourseStructureSection[];
}

export interface CourseStructureRevision {
  id: string;
  runId: string;
  revision: number;
  title: string;
  summary: string;
  content: CourseStructureContent;
  validationStatus: "valid" | "invalid";
  validationErrors?: string[];
  sourceSyllabus?: string;
  sealedAt?: string;
  sealedByMoodleUserId?: number;
  createdAt: string;
  teacherConstraints: CoursePlanningConstraints;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlank(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PlanningError("STRUCTURE_INVALID", `${path} must be a non-empty string.`);
  }
  return value;
}

function optionalNonBlank(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return nonBlank(value, path);
}

function parseSourceReferences(value: unknown, path: string): SourceReference[] {
  if (!Array.isArray(value)) {
    throw new PlanningError("STRUCTURE_INVALID", `${path} must be an array.`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new PlanningError("STRUCTURE_INVALID", `${path}[${index}] must be an object.`);
    }
    const source = nonBlank(item.source, `${path}[${index}].source`);
    const page = item.page;
    if (page !== undefined && page !== null && (!Number.isSafeInteger(page) || (page as number) < 1)) {
      throw new PlanningError("STRUCTURE_INVALID", `${path}[${index}].page must be a positive integer.`);
    }
    const section = optionalNonBlank(item.section, `${path}[${index}].section`);
    const text = optionalNonBlank(item.text, `${path}[${index}].text`);
    return {
      source,
      ...(page !== undefined && page !== null ? { page: page as number } : {}),
      ...(section !== undefined ? { section } : {}),
      ...(text !== undefined ? { text } : {}),
    };
  });
}

function parseActivityIntents(value: unknown, path: string): CourseStructureActivityIntent[] {
  if (!Array.isArray(value)) {
    throw new PlanningError("STRUCTURE_INVALID", `${path} must be an array.`);
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new PlanningError("STRUCTURE_INVALID", `${path}[${index}] must be an object.`);
    }
    const type = item.type;
    if (type !== "quiz" && type !== "assignment") {
      throw new PlanningError("STRUCTURE_INVALID", `${path}[${index}].type must be quiz or assignment.`);
    }
    const origin = item.origin;
    if (origin !== "syllabus" && origin !== "teacher_instruction") {
      throw new PlanningError("STRUCTURE_INVALID", `${path}[${index}].origin must be syllabus or teacher_instruction.`);
    }
    return {
      ...(item.ref !== undefined ? { ref: nonBlank(item.ref, `${path}[${index}].ref`) } : {}),
      type,
      title: nonBlank(item.title, `${path}[${index}].title`),
      source_refs: parseSourceReferences(item.source_refs, `${path}[${index}].source_refs`),
      origin,
    };
  });
}

/** Parse the editable structure boundary without accepting activity bodies. */
export function parseCourseStructureContent(value: unknown): CourseStructureContent {
  if (!isRecord(value)) {
    throw new PlanningError("STRUCTURE_INVALID", "Course structure content must be an object.");
  }
  const courseValue = value.course;
  if (!isRecord(courseValue)) {
    throw new PlanningError("STRUCTURE_INVALID", "content.course must be an object.");
  }
  const courseTitle = nonBlank(courseValue.title, "content.course.title");
  const courseCode = optionalNonBlank(courseValue.course_code, "content.course.course_code");
  const courseSummary = optionalNonBlank(courseValue.summary, "content.course.summary");

  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    throw new PlanningError("STRUCTURE_INVALID", "content.sections must contain at least one section.");
  }

  const positions = new Set<number>();
  const refs = new Set<string>();
  const sections = value.sections.map((item, index) => {
    if (!isRecord(item)) {
      throw new PlanningError("STRUCTURE_INVALID", `content.sections[${index}] must be an object.`);
    }
    const ref = nonBlank(item.ref, `content.sections[${index}].ref`);
    const position = item.position;
    if (!Number.isSafeInteger(position) || (position as number) < 1) {
      throw new PlanningError("STRUCTURE_INVALID", `content.sections[${index}].position must be a positive integer.`);
    }
    if (refs.has(ref)) {
      throw new PlanningError("STRUCTURE_INVALID", `content.sections contains duplicate ref "${ref}".`);
    }
    if (positions.has(position as number)) {
      throw new PlanningError("STRUCTURE_INVALID", `content.sections contains duplicate position ${position}.`);
    }
    refs.add(ref);
    positions.add(position as number);

    const activityIntents = item.activity_intents ?? item.activityIntents;
    const parseAlignmentIds = (value: unknown, path: string): string[] => {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || id.trim() === "")) {
        throw new PlanningError("STRUCTURE_INVALID", path + " must be an array of non-empty strings.");
      }
      return [...new Set(value as string[])];
    };
    const alignmentStatus = item.alignment_status === "STALE_ALIGNMENT" ? "STALE_ALIGNMENT" : "CURRENT";
    return {
      ref,
      position: position as number,
      title: nonBlank(item.title, `content.sections[${index}].title`),
      summary: nonBlank(item.summary, `content.sections[${index}].summary`),
      source_refs: parseSourceReferences(item.source_refs, `content.sections[${index}].source_refs`),
      activity_intents: parseActivityIntents(activityIntents, `content.sections[${index}].activity_intents`),
      aligned_objective_ids: parseAlignmentIds(item.aligned_objective_ids, `content.sections[${index}].aligned_objective_ids`),
      aligned_outcome_ids: parseAlignmentIds(item.aligned_outcome_ids, `content.sections[${index}].aligned_outcome_ids`),
      alignment_status: alignmentStatus as "CURRENT" | "STALE_ALIGNMENT",
    };
  });

  return {
    course: {
      title: courseTitle,
      ...(courseCode !== undefined ? { course_code: courseCode } : {}),
      ...(courseSummary !== undefined ? { summary: courseSummary } : {}),
    },
    sections,
  };
}

function contentFromDraft(draft: CourseStructureDraft): CourseStructureContent {
  return parseCourseStructureContent({
    course: draft.content.course,
    sections: draft.content.sections.map((section) => ({
      ref: section.ref,
      position: section.position,
      title: section.title,
      summary: section.summary,
      source_refs: section.source_refs,
      activity_intents: section.activityIntents,
      aligned_objective_ids: (section as unknown as { aligned_objective_ids?: string[] }).aligned_objective_ids ?? [],
      aligned_outcome_ids: (section as unknown as { aligned_outcome_ids?: string[] }).aligned_outcome_ids ?? [],
    })),
  });
}

export function createCourseStructureRevision(params: {
  id: string;
  runId: string;
  revision: number;
  draft: CourseStructureDraft;
  createdAt?: string;
  syllabus?: NormalizedSyllabus;
  teacherConstraints?: CoursePlanningConstraints;
}): CourseStructureRevision {
  if (!Number.isSafeInteger(params.revision) || params.revision < 1) {
    throw new PlanningError("STRUCTURE_INVALID", "Structure revision must be a positive integer.");
  }
  const content = contentFromDraft(params.draft);
  return createCourseStructureRevisionFromContent({
    id: params.id,
    runId: params.runId,
    revision: params.revision,
    title: params.draft.title,
    summary: params.draft.summary,
    content,
    ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    ...(params.syllabus ? { syllabus: params.syllabus } : {}),
    teacherConstraints: params.teacherConstraints ?? { activityRules: [], warnings: [] },
  });
}

export function createCourseStructureRevisionFromContent(params: {
  id: string;
  runId: string;
  revision: number;
  title: string;
  summary: string;
  content: unknown;
  createdAt?: string;
  syllabus?: NormalizedSyllabus;
  teacherConstraints?: CoursePlanningConstraints;
}): CourseStructureRevision {
  if (!Number.isSafeInteger(params.revision) || params.revision < 1) {
    throw new PlanningError("STRUCTURE_INVALID", "Structure revision must be a positive integer.");
  }
  const content = parseCourseStructureContent(params.content);
  const sourceSyllabus = params.syllabus?.metadata.filename ?? content.sections[0]?.source_refs[0]?.source;
  return {
    id: params.id,
    runId: params.runId,
    revision: params.revision,
    title: nonBlank(params.title, "title"),
    summary: nonBlank(params.summary, "summary"),
    content,
    validationStatus: "valid",
    ...(sourceSyllabus !== undefined ? { sourceSyllabus } : {}),
    createdAt: params.createdAt ?? new Date().toISOString(),
    teacherConstraints: params.teacherConstraints ?? { activityRules: [], warnings: [] },
  };
}
