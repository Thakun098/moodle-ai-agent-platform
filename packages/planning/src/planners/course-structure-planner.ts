import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import type { CoreCourseDesignContext, NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { buildCoursePlanningSchema, buildCourseStructureUserPrompt, COURSE_STRUCTURE_SYSTEM_PROMPT } from "../prompts/course-planning-prompt.js";
import type { CoursePlanningConstraints } from "../instructions/planning-constraints.js";
import type { CourseStructureDraft, SectionStructureDraft } from "../types.js";
import { ModelRequestScheduler } from "../scheduling/model-request-scheduler.js";
import { buildSectionGrounding } from "../grounding/section-grounding.js";
import { PlanningError } from "../errors/planning-errors.js";
import { buildProvenanceAllowlist, validateSourceReferences } from "../domain/planning-domain-validator.js";
import { courseStructureSectionCoversAnchor, inspectCourseStructureCoverage } from "../validators/course-structure-coverage-validator.js";
import { formatCoreCourseDesignProjection } from "../structure/instructional-design-alignment.js";

const nonBlank = { type: "string", minLength: 1, pattern: "\\S" };
// Groq's structured-output validator rejects the provider-generated nullable
// form it derives from the shared grounded $ref for this optional intent field.
// Keep the wire schema provider-compatible; deterministic source validation
// remains downstream at structure/finalization boundaries.
const structureSourceReference = {
  type: "object",
  properties: {
    source: nonBlank,
    page: { type: "integer", minimum: 1 },
    section: nonBlank,
    text: nonBlank,
  },
  required: ["source"],
  additionalProperties: false,
};

function normalizeModelSourceRefs(value: unknown, filename: string): import("@moodle-agent-poc/contracts").SourceReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") {
      const lineAnchor = item.match(/^(.+?)#L(\d+)(?:-L?(\d+))?$/i);
      if (lineAnchor) {
        const source = lineAnchor[1]!.trim();
        if (!source || ["undefined", "null"].includes(source.toLowerCase())) return [];
        return [{ source, section: `lines ${lineAnchor[2]}-${lineAnchor[3] ?? lineAnchor[2]}` }];
      }
      const separator = item.indexOf(":");
      const source = separator > 0 ? item.slice(0, separator).trim() : item.trim();
      const location = separator > 0 ? item.slice(separator + 1).trim() : "";
      if (!source || ["undefined", "null"].includes(source.toLowerCase())) return [];
      return [{ source, ...(location && !["undefined", "null"].includes(location.toLowerCase()) ? { section: location } : {}) }];
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const sourceRecord = item as Record<string, unknown>;
    const rawSource = typeof sourceRecord.source === "string" ? sourceRecord.source.trim() : "";
    const source = rawSource === "" || rawSource.toLowerCase() === "undefined" || rawSource.toLowerCase() === "null" ? filename : rawSource;
    const page = typeof sourceRecord.page === "number" && Number.isSafeInteger(sourceRecord.page) && sourceRecord.page > 0 ? sourceRecord.page : undefined;
    const section = typeof sourceRecord.section === "string" && sourceRecord.section.trim() && !["undefined", "null"].includes(sourceRecord.section.trim().toLowerCase()) ? sourceRecord.section : undefined;
    const text = typeof sourceRecord.text === "string" && sourceRecord.text.trim() && !["undefined", "null"].includes(sourceRecord.text.trim().toLowerCase()) ? sourceRecord.text : undefined;
    return [{ source, ...(page !== undefined ? { page } : {}), ...(section !== undefined ? { section } : {}), ...(text !== undefined ? { text } : {}) }];
  });
}

function normalizeStructureModelPayload(raw: any, filename: string, allowSparseSectionFields = false): any {
  const rawContent = raw && typeof raw.content === "object" && raw.content !== null ? raw.content : raw;
  const rawCourse = rawContent?.course && typeof rawContent.course === "object" ? rawContent.course : {};
  const courseTitle = rawCourse.title || rawContent?.course_title || raw?.course_title || raw?.title || "Untitled Course";
  const courseCode = rawCourse.course_code || rawContent?.course_code || raw?.course_code;
  const courseSummary = rawCourse.summary || rawContent?.course_summary || raw?.course_summary;
  const sections = Array.isArray(rawContent?.sections) ? rawContent.sections.map((section: any, index: number) => {
    const position = allowSparseSectionFields
      ? Number.isSafeInteger(section?.position) && section.position > 0 ? section.position : index + 1
      : section?.position;
    const title = allowSparseSectionFields
      ? [section?.title, section?.section_title, section?.name, section?.week_or_unit]
        .find((value): value is string => typeof value === "string" && value.trim() !== "") ?? `Section ${index + 1}`
      : section?.title;
    const summary = allowSparseSectionFields
      ? [section?.summary, section?.section_summary, section?.description, title]
        .find((value): value is string => typeof value === "string" && value.trim() !== "") ?? `Section ${index + 1}`
      : section?.summary;
    return {
      ...section,
      position,
      title,
      summary,
      ref: typeof section?.ref === "string" && section.ref.trim() ? section.ref : `section-${String(position).padStart(2, "0")}`,
      source_refs: normalizeModelSourceRefs(section?.source_refs, filename),
      activity_intents: Array.isArray(section?.activity_intents) ? section.activity_intents.map((intent: any) => ({
        ...intent,
        source_refs: normalizeModelSourceRefs(intent.source_refs, filename),
        origin: intent.origin,
      })) : [],
    };
  }) : [];
  return {
    ...raw,
    title: raw?.title || courseTitle,
    summary: raw?.summary || courseSummary || `Course structure generated from ${filename}.`,
    content: {
      course: {
        title: courseTitle,
        ...(courseCode ? { course_code: courseCode } : {}),
        ...(courseSummary ? { summary: courseSummary } : {}),
      },
      sections,
    },
  };
}

function uniqueScheduleAnchors(syllabus: NormalizedSyllabus): string[] {
  return [...new Set(
    syllabus.schedule_or_topics
      .map((item) => item.week_or_unit?.trim())
      .filter((value): value is string => Boolean(value)),
  )];
}

function scheduleItemsByAnchor(syllabus: NormalizedSyllabus): Map<string, NormalizedSyllabus["schedule_or_topics"][number][]> {
  const groups = new Map<string, NormalizedSyllabus["schedule_or_topics"][number][]>();
  let currentAnchor: string | undefined;
  for (const item of syllabus.schedule_or_topics) {
    if (item.week_or_unit?.trim()) currentAnchor = item.week_or_unit.trim();
    if (!currentAnchor) continue;
    const group = groups.get(currentAnchor) ?? [];
    group.push(item);
    groups.set(currentAnchor, group);
  }
  return groups;
}

function deterministicSectionSummary(anchor: string, items: readonly NormalizedSyllabus["schedule_or_topics"][number][]): string {
  const fragments = [...new Set(
    items.flatMap((item) => [item.title, ...item.topics])
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  )];
  return fragments.length > 0 ? fragments.join("; ") : anchor;
}

function reconcileStructureSectionsToSyllabus(
  syllabus: NormalizedSyllabus,
  sections: readonly SectionStructureDraft[],
): { sections: SectionStructureDraft[]; warnings: string[] } {
  const anchors = uniqueScheduleAnchors(syllabus);
  if (anchors.length === 0) return { sections: [...sections], warnings: [] };

  const remaining = [...sections];
  const grouped = scheduleItemsByAnchor(syllabus);
  const repairedAnchors: string[] = [];
  const reconciled = anchors.map((anchor, index): SectionStructureDraft => {
    const matchIndex = remaining.findIndex((section) =>
      courseStructureSectionCoversAnchor(anchor, section, syllabus),
    );
    const ref = `section-${String(index + 1).padStart(2, "0")}`;
    if (matchIndex >= 0) {
      const matched = remaining.splice(matchIndex, 1)[0]!;
      return {
        ...matched,
        ref,
        position: index + 1,
        activityIntents: [],
      };
    }

    repairedAnchors.push(anchor);
    return {
      ref,
      position: index + 1,
      title: anchor,
      summary: deterministicSectionSummary(anchor, grouped.get(anchor) ?? []),
      source_refs: [],
      activityIntents: [],
    };
  });

  const warnings: string[] = [];
  if (repairedAnchors.length > 0) {
    warnings.push(`Course Structure coverage repaired deterministically from syllabus for: ${repairedAnchors.join(", ")}.`);
  }
  if (remaining.length > 0) {
    warnings.push(`Ignored ${remaining.length} unanchored model section(s); Course Structure is one section per syllabus course period.`);
  }
  const report = inspectCourseStructureCoverage(syllabus, reconciled);
  if (report.missingAnchors.length > 0) {
    throw new PlanningError(
      "PLAN_SCHEMA_INVALID",
      `Course Structure repair could not cover syllabus anchors: ${report.missingAnchors.join(", ")}`,
      { missingAnchors: report.missingAnchors },
    );
  }
  return { sections: reconciled, warnings };
}

function applyDeterministicStructureGrounding(
  syllabus: NormalizedSyllabus,
  section: SectionStructureDraft,
): SectionStructureDraft {
  // Stage 1 only asks the model for section identity (title/position). The
  // syllabus is the sole authority for provenance, so discard model refs
  // before resolving the anchored schedule items.
  const provisional = {
    ...section,
    source_refs: [],
    activityIntents: section.activityIntents.map((intent) => ({ ...intent, source_refs: [] })),
  };
  const grounding = buildSectionGrounding(syllabus, provisional);
  if (grounding.scheduleItems.length === 0) {
    throw new PlanningError(
      "PLAN_DOMAIN_INVALID",
      `Generated section "${section.title}" at position ${section.position} could not be grounded to a syllabus schedule item.`,
    );
  }
  const sourceRefs = [...grounding.sourceRefs];
  return {
    ...section,
    source_refs: sourceRefs,
    activityIntents: section.activityIntents.map((intent) => ({
      ...intent,
      source_refs: intent.origin === "syllabus" ? [...sourceRefs] : [],
    })),
    grounding,
  };
}

export function buildCourseStructureSchema(syllabus: NormalizedSyllabus): Record<string, unknown> {
  const full = buildCoursePlanningSchema(syllabus) as Record<string, any>;
  const section = full.properties.content.properties.sections.items;
  const sectionProperties = { ...section.properties };
  delete sectionProperties.activities;
  sectionProperties.source_refs = { type: "array", items: structureSourceReference };
  sectionProperties.aligned_objective_ids = { type: "array", items: nonBlank };
  sectionProperties.aligned_outcome_ids = { type: "array", items: nonBlank };
  sectionProperties.activity_intents = {
    type: "array",
    items: {
      type: "object",
      properties: {
        ref: { type: "string", pattern: "^(assignment|quiz)-[a-z0-9-]+$" },
        type: { type: "string", enum: ["quiz", "assignment"] },
        title: nonBlank,
        source_refs: { type: "array", items: structureSourceReference },
        origin: { type: "string", const: "syllabus" },
      },
      required: ["type", "title", "source_refs", "origin"],
      additionalProperties: false,
    },
  };
  const sectionSchema = { ...section, properties: sectionProperties, required: [...section.required.filter((name: string) => name !== "activities"), "activity_intents"] };
  return {
    $defs: full.$defs,
    type: "object",
    properties: {
      title: full.properties.title,
      summary: full.properties.summary,
      warnings: full.properties.warnings,
      assumptions: full.properties.assumptions,
      content: {
        type: "object",
        properties: {
          course: full.properties.content.properties.course,
          sections: { type: "array", minItems: full.properties.content.properties.sections.minItems, maxItems: full.properties.content.properties.sections.minItems, items: sectionSchema },
        },
        required: ["course", "sections"],
        additionalProperties: false,
      },
    },
    required: ["title", "summary", "warnings", "assumptions", "content"],
    additionalProperties: false,
  };
}

export class CourseStructurePlanner {
  constructor(private readonly modelClient: ModelClient, private readonly scheduler = new ModelRequestScheduler()) {}

  async plan(syllabus: NormalizedSyllabus, _constraints: CoursePlanningConstraints, model?: string, timeoutMs?: number, outputMode: "schema" | "json" = "schema", coreContext?: CoreCourseDesignContext): Promise<CourseStructureDraft> {
    const userPrompt = [buildCourseStructureUserPrompt(syllabus, _constraints.originalInstruction), coreContext ? formatCoreCourseDesignProjection(coreContext) : ""].filter(Boolean).join("\n\n");
    const response = await this.scheduler.chat(this.modelClient, {
      ...(model ? { model } : {}),
      messages: [
        { role: "system", content: `${COURSE_STRUCTURE_SYSTEM_PROMPT}\nEvery section MUST include activity_intents (an array; use [] when there are no intents).` },
        { role: "user", content: userPrompt },
      ],
      format: outputMode === "json" ? "json" : buildCourseStructureSchema(syllabus),
      ...(timeoutMs ? { options: { timeoutMs } } : {}),
    });
    let parsed: any;
    try { parsed = JSON.parse(response.rawText); } catch (error) { throw new Error(`Structure planner returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
    parsed = normalizeStructureModelPayload(parsed, syllabus.metadata.filename, outputMode === "json");
    const content = parsed.content;
    if (!content || typeof content !== "object" || Array.isArray(content) || !content.course || !Array.isArray(content.sections)) {
      throw new PlanningError(
        "MODEL_RESPONSE_INVALID",
        `Structure planner returned an unexpected JSON shape. Expected course and sections; received: ${JSON.stringify(parsed).slice(0, 2000)}`,
      );
    }
    const modelSections: SectionStructureDraft[] = (content.sections ?? []).map((section: any, index: number): SectionStructureDraft => ({
      ref: section.ref,
      position: section.position ?? index + 1,
      title: section.title,
      summary: section.summary,
      source_refs: normalizeModelSourceRefs(section.source_refs, syllabus.metadata.filename),
      activityIntents: [],
      ...(Array.isArray(section.aligned_objective_ids) ? { aligned_objective_ids: section.aligned_objective_ids } : {}),
      ...(Array.isArray(section.aligned_outcome_ids) ? { aligned_outcome_ids: section.aligned_outcome_ids } : {}),
    }));
    const reconciled = reconcileStructureSectionsToSyllabus(syllabus, modelSections);
    const sections = reconciled.sections.map((section) => applyDeterministicStructureGrounding(syllabus, section));

    const missingSectionSummary = sections.findIndex((section) => typeof section.summary !== "string" || section.summary.trim() === "");
    if (missingSectionSummary >= 0) {
      throw new PlanningError(
        "PLAN_SCHEMA_INVALID",
        `Generated CoursePlan section at index ${missingSectionSummary} must include a non-empty summary.`,
      );
    }
    const syllabusAllowlist = buildProvenanceAllowlist(syllabus);
    for (const section of sections) {
      validateSourceReferences(section.source_refs, syllabusAllowlist);
      for (const intent of section.activityIntents) validateSourceReferences(intent.source_refs, syllabusAllowlist);
    }

    const ignoredActivityPayload = (content.sections ?? []).some((section: any) => Array.isArray(section.activities));
    return {
      title: parsed.title,
      summary: parsed.summary,
      warnings: [
        ...(parsed.warnings ?? []),
        ...reconciled.warnings,
        ...(ignoredActivityPayload ? ["Stage 1 activity bodies were ignored; activities are generated only by the staged activity planner."] : []),
      ],
      assumptions: parsed.assumptions ?? [],
      content: {
        course: content.course,
        sections,
      },
    };
  }
}
