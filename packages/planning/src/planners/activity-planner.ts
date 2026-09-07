import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import type { ActivityPlan, CoursePlanContent, QuestionPlan, SectionPlan } from "@moodle-agent-poc/contracts";
import type { CoursePlanningConstraints } from "../instructions/planning-constraints.js";
import { validateActivityConstraints, validateSectionActivityProvenance, type TeacherConstraintViolation } from "../validators/teacher-constraint-validator.js";
import type { SectionStructureDraft } from "../types.js";
import { ModelRequestScheduler } from "../scheduling/model-request-scheduler.js";
import { buildCoursePlanningSchema } from "../prompts/course-planning-prompt.js";
import { buildSectionGrounding, buildSectionProvenanceAllowlists, formatSectionGrounding } from "../grounding/section-grounding.js";
import { buildTeacherActivityRefMap, type ActivityRuleScopeMap, resolveActivityRuleScopes } from "../validators/teacher-constraint-validator.js";

export const MAX_SECTIONS_PER_ACTIVITY_CHUNK = 2;

export interface ActivityChunkResult { sections: Array<{ section_ref: string; activities: ActivityPlan[] }>; }

export function splitActivityChunks<T>(sections: readonly T[], chunkSize = MAX_SECTIONS_PER_ACTIVITY_CHUNK): T[][] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error("chunkSize must be a positive integer");
  const chunks: T[][] = [];
  for (let i = 0; i < sections.length; i += chunkSize) chunks.push([...sections.slice(i, i + chunkSize)]);
  return chunks;
}

function activitySchemas(syllabus: Parameters<typeof buildCoursePlanningSchema>[0]): Record<string, unknown> {
  const full: any = buildCoursePlanningSchema(syllabus);
  const section: any = full.properties.content.properties.sections.items;
  const activity = section.properties.activities.items;
  return {
    $defs: full.$defs,
    type: "object",
    properties: {
      sections: {
        type: "array", minItems: 1,
        items: { type: "object", properties: { section_ref: { type: "string", pattern: "^section-[a-z0-9-]+$" }, activities: { type: "array", items: activity } }, required: ["section_ref", "activities"], additionalProperties: false },
      },
    },
    required: ["sections"], additionalProperties: false,
  };
}

function sourceContext(
  syllabus: Parameters<typeof buildCoursePlanningSchema>[0],
  section: SectionStructureDraft,
): string {
  const grounding = section.grounding ?? buildSectionGrounding(syllabus, section);
  return [
    JSON.stringify({ section_ref: section.ref, title: section.title, summary: section.summary, activity_intents: section.activityIntents }, null, 2),
    formatSectionGrounding(syllabus, section, grounding),
  ].join("\n");
}

function repairPrompt(
  syllabus: Parameters<typeof buildCoursePlanningSchema>[0],
  violations: TeacherConstraintViolation[],
  sections: readonly SectionStructureDraft[],
): string {
  return `The previous activity output violated deterministic teacher constraints. Regenerate the complete requested chunk, preserving exactly one result for each requested section and no other sections.\nViolations:\n${JSON.stringify(violations, null, 2)}\nRequested chunk sections:\n${sections.map((section) => sourceContext(syllabus, section)).join("\n")}`;
}

function normalizeActivityIdentity(
  section: SectionStructureDraft,
  activities: ActivityPlan[],
): ActivityPlan[] {
  const remainingByType = new Map<string, number>();
  for (const intent of section.activityIntents) remainingByType.set(intent.type, (remainingByType.get(intent.type) ?? 0) + 1);
  const boundedActivities = activities.filter((activity) => {
    const remaining = remainingByType.get(activity.type) ?? 0;
    if (remaining === 0) return false;
    remainingByType.set(activity.type, remaining - 1);
    return true;
  });
  const nextIntentByType = new Map<string, number>();
  return boundedActivities.map((activity, activityIndex) => {
    const start = nextIntentByType.get(activity.type) ?? 0;
    const intentIndex = section.activityIntents.findIndex(
      (intent, index) => index >= start && intent.type === activity.type,
    );
    const intent = intentIndex >= 0 ? section.activityIntents[intentIndex] : undefined;
    if (intent) nextIntentByType.set(activity.type, intentIndex + 1);
    const activityRef = intent?.ref ?? activity.ref;
    const title = intent?.title || activity.title;
    if (activity.type !== "quiz") return { ...activity, ref: activityRef, title };

    const questionRefs = new Map<string, string>();
    const questions: QuestionPlan[] = activity.questions.map((question, questionIndex): QuestionPlan => {
      const questionRef = `question-${String(section.position).padStart(2, "0")}-${String(activityIndex + 1).padStart(2, "0")}-${String(questionIndex + 1).padStart(2, "0")}`;
      if (question.type !== "multichoice") return { ...question, ref: questionRef };
      const choices = question.choices.map((choice, choiceIndex) => {
        const choiceRef = `choice-${String(section.position).padStart(2, "0")}-${String(activityIndex + 1).padStart(2, "0")}-${String(questionIndex + 1).padStart(2, "0")}-${String(choiceIndex + 1).padStart(2, "0")}`;
        questionRefs.set(choice.ref, choiceRef);
        return { ...choice, ref: choiceRef };
      });
      return {
        ...question,
        ref: questionRef,
        choices: choices as unknown as [typeof choices[0], typeof choices[1], ...typeof choices],
        correct_choice_refs: question.correct_choice_refs.map((ref) => questionRefs.get(ref) ?? ref) as [string],
      };
    });
    return { ...activity, ref: activityRef, title, questions };
  });
}

export class ActivityPlanner {
  constructor(private readonly modelClient: ModelClient, private readonly scheduler = new ModelRequestScheduler(), private readonly maxRepairAttempts = 2) {}

  async generateChunk(syllabus: Parameters<typeof buildCoursePlanningSchema>[0], sections: readonly SectionStructureDraft[], constraints: CoursePlanningConstraints, model?: string, timeoutMs?: number, ruleScopes?: ActivityRuleScopeMap): Promise<ActivityChunkResult> {
    const sectionAllowlists = buildSectionProvenanceAllowlists(syllabus, sections);
    const resolvedRuleScopes = ruleScopes ?? resolveActivityRuleScopes(constraints.activityRules, sections, syllabus);
    const teacherActivityRefs = buildTeacherActivityRefMap(sections);
    let prompt = `Generate activity bodies for exactly these sections. Use only the original syllabus grounding shown for each section. Do not add sections. Create one activity for each activity_intent and no activities for sections without intents. Use the deterministic activity ref and title supplied by each intent. Every activity and question source_refs entry MUST use only that section's authorized source references.\nTeacher constraints:\n${JSON.stringify(constraints.activityRules)}\nSections:\n${sections.map((section) => sourceContext(syllabus, section)).join("\n")}`;
    for (let attempt = 0; attempt <= this.maxRepairAttempts; attempt++) {
      const response = await this.scheduler.chat(this.modelClient, {
        ...(model ? { model } : {}),
        messages: [{ role: "system", content: "You generate only bounded Moodle activity JSON. All human-readable content must preserve the syllabus language. Do not invent facts." }, { role: "user", content: prompt }],
        format: activitySchemas(syllabus),
        ...(timeoutMs ? { options: { timeoutMs } } : {}),
      });
      let parsed: any;
      try { parsed = JSON.parse(response.rawText); } catch (error) { throw new Error(`Activity planner returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
      const activitiesByRef = new Map<string, ActivityPlan[]>((parsed.sections ?? []).map((section: any) => [section.section_ref, section.activities ?? []]));
      const normalizedActivitiesByRef = new Map<string, ActivityPlan[]>(
        sections.map((section) => [section.ref, normalizeActivityIdentity(section, activitiesByRef.get(section.ref) ?? [])]),
      );
      const sectionsWithActivities: SectionPlan[] = sections.map((section) => ({ ref: section.ref, position: section.position, title: section.title, summary: section.summary, source_refs: section.source_refs, activities: normalizedActivitiesByRef.get(section.ref) ?? [] }));
      const requestedRefs = new Set(sections.map((section) => section.ref));
      const returnedSections: any[] = Array.isArray(parsed.sections) ? parsed.sections : [];
      const returnedRefs = returnedSections.map((section: any) => section.section_ref).filter((ref: unknown): ref is string => typeof ref === "string");
      const duplicateReturnedRefs = returnedRefs.filter((ref, index) => returnedRefs.indexOf(ref) !== index);
      const sectionShapeViolations: TeacherConstraintViolation[] = [
        ...(returnedSections.length !== sections.length ? [{ code: "TEACHER_CONSTRAINT_VIOLATION" as const, section_ref: "__chunk__", constraint: "activity_chunk_cardinality", expected: sections.length, actual: returnedSections.length }] : []),
        ...duplicateReturnedRefs.map((ref) => ({ code: "TEACHER_CONSTRAINT_VIOLATION" as const, section_ref: ref, constraint: "activity_chunk_duplicate_section_ref", expected: "unique section_ref", actual: ref })),
        ...returnedRefs.filter((ref: string) => !requestedRefs.has(ref)).map((ref: string) => ({ code: "TEACHER_CONSTRAINT_VIOLATION" as const, section_ref: ref, constraint: "activity_chunk_scope", expected: [...requestedRefs].join(", "), actual: ref })),
        ...sections.filter((section) => !returnedRefs.includes(section.ref)).map((section) => ({ code: "TEACHER_CONSTRAINT_VIOLATION" as const, section_ref: section.ref, constraint: "activity_chunk_scope", expected: section.ref, actual: "missing" })),
      ];
      const violations = [
        ...sectionShapeViolations,
        ...sectionsWithActivities.flatMap((section) => [
        ...validateActivityConstraints(section, constraints, undefined, syllabus, resolvedRuleScopes, teacherActivityRefs),
        ...validateSectionActivityProvenance(section, sectionAllowlists.get(section.ref)),
        ]),
      ];
      if (violations.length === 0) return { sections: sections.map((section) => ({ section_ref: section.ref, activities: normalizedActivitiesByRef.get(section.ref) ?? [] })) };
      if (attempt === this.maxRepairAttempts) {
        const error = new Error(`Teacher constraints failed after ${this.maxRepairAttempts} repair attempts: ${JSON.stringify(violations)}`);
        (error as any).code = "TEACHER_CONSTRAINT_VIOLATION";
        (error as any).details = violations;
        throw error;
      }
      prompt = repairPrompt(syllabus, violations, sections);
    }
    throw new Error("Unreachable activity generation state");
  }
}

export function assembleCoursePlanContent(structure: CoursePlanContent, chunks: readonly ActivityChunkResult[]): CoursePlanContent {
  const activities = new Map<string, ActivityPlan[]>();
  for (const chunk of chunks) for (const section of chunk.sections) activities.set(section.section_ref, section.activities);
  const assembled = structure.sections.map((section) => ({
    ref: section.ref,
    position: section.position,
    title: section.title,
    ...(section.summary ? { summary: section.summary } : {}),
    source_refs: section.source_refs,
    activities: activities.get(section.ref) ?? [],
  }));
  return {
    course: structure.course,
    sections: (assembled.length > 0 ? [assembled[0]!, ...assembled.slice(1)] : []) as CoursePlanContent["sections"],
  };
}
