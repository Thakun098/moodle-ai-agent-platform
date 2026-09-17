import {
  ActivityIntentRepository,
  ActivityRevisionRepository,
  CourseStructureRevisionRepository,
  MaterialSnapshotRepository,
  RunRepository,
  type ActivityIntentRecord,
  type ActivityRevisionRecord,
  type MaterialSnapshotRecord,
} from "@moodle-agent-poc/agent-runtime";
import type { CoreCourseDesignContext, NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import {
  BoundedMaterialContextProvider,
  type MaterialSnapshot,
  type MaterialSnapshotFile,
} from "@moodle-agent-poc/materials";
import {
  buildActivityDesignContext,
  resolveActivityGrounding,
  validateTeacherEditedActivity,
  type ActivityDefaultPolicy,
  type CoursePlanningConstraints,
  type SectionStructureDraft,
} from "@moodle-agent-poc/planning";
import type { AppConfig } from "../config/config-loader.js";

export interface ActivityTeacherEditServiceDeps {
  config: AppConfig;
  runRepo: RunRepository;
  structureRevisionRepo: CourseStructureRevisionRepository;
  activityIntentRepo: ActivityIntentRepository;
  activityRevisionRepo: ActivityRevisionRepository;
  snapshotRepo: MaterialSnapshotRepository;
}

export interface SaveTeacherActivityEditInput {
  runId: string;
  sectionRef: string;
  activityRef: string;
  activity: unknown;
  expectedActivityRevision?: number;
  editedByMoodleUserId?: number;
}

export interface ActivityRevisionHistoryResult {
  intent: ActivityIntentRecord;
  revisions: ActivityRevisionRecord[];
}

export interface SaveTeacherActivityEditResult extends ActivityRevisionHistoryResult {
  currentRevision: ActivityRevisionRecord;
}

export class ActivityEditApplicationError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "ActivityEditApplicationError";
  }
}

function fail(statusCode: number, code: string, message: string, details: unknown = null): never {
  throw new ActivityEditApplicationError(statusCode, code, message, details);
}

function policyFromConfig(config: AppConfig): ActivityDefaultPolicy {
  return {
    maxAttempts: config.activityGenerationMaxAttempts,
    quizQuestionCount: config.defaultQuizQuestionCount,
    quizChoiceCount: config.defaultQuizChoiceCount,
    quizCorrectChoiceCount: 1,
    quizDefaultMark: 1,
    assignmentGrade: config.defaultAssignmentGrade,
    syllabusDetailThreshold: config.syllabusActivityDetailThreshold,
  };
}

function constraintsFor(intent: ActivityIntentRecord, sectionPosition: number): CoursePlanningConstraints {
  if (intent.activityType === "quiz") {
    const questionType = typeof intent.optionsJson.question_type === "string"
      ? intent.optionsJson.question_type as "multichoice" | "truefalse" | "shortanswer" | "essay"
      : "multichoice";
    return {
      activityRules: [{
        scope: "specific_sections",
        sectionPositions: [sectionPosition],
        activityType: "quiz",
        activityCount: 1,
        questionType,
        questionsPerActivity: Number(intent.optionsJson.question_count ?? 5),
        ...(questionType === "multichoice" ? {
          choicesPerQuestion: Number(intent.optionsJson.choices_per_question ?? 4),
          correctChoicesPerQuestion: 1,
        } : {}),
      }],
      warnings: [],
    };
  }
  return {
    activityRules: [{ scope: "specific_sections", sectionPositions: [sectionPosition], activityType: "assignment", activityCount: 1 }],
    warnings: [],
  };
}

function titleFor(intent: ActivityIntentRecord, sectionTitle: string): string {
  const configured = intent.optionsJson.title;
  return typeof configured === "string" && configured.trim()
    ? configured.trim()
    : `${intent.activityType === "quiz" ? "Quiz" : "Assignment"}: ${sectionTitle}`;
}

function toMaterialSnapshot(record: MaterialSnapshotRecord): MaterialSnapshot {
  const files = Array.isArray(record.filesJson) ? record.filesJson as MaterialSnapshotFile[] : [];
  return {
    id: record.id,
    runId: record.runId,
    structureRevision: record.structureRevision,
    sectionRef: record.sectionRef,
    revision: record.revision,
    files,
    extractorVersion: record.extractorVersion,
    normalizedText: record.normalizedText,
    normalizedTextHash: record.normalizedTextHash,
    estimatedTokens: record.estimatedTokens,
    createdByMoodleUserId: record.createdByMoodleUserId,
    createdAt: record.createdAt,
  };
}

async function resolveContext(
  deps: ActivityTeacherEditServiceDeps,
  runId: string,
  structureRevision: number,
  section: SectionStructureDraft,
  syllabus: NormalizedSyllabus,
) {
  const snapshotRecord = await deps.snapshotRepo.getLatestSnapshot(runId, structureRevision, section.ref);
  let materialContext;
  if (snapshotRecord) {
    const provider = new BoundedMaterialContextProvider({
      getSnapshot: async (snapshotId) => {
        const record = await deps.snapshotRepo.getSnapshot(snapshotId);
        return record ? toMaterialSnapshot(record) : null;
      },
    }, deps.config.activityContextTokenBudget);
    materialContext = await provider.getContext(snapshotRecord.id);
  }
  return resolveActivityGrounding(section, syllabus, materialContext, policyFromConfig(deps.config));
}

async function getCoreContext(runRepo: RunRepository, runId: string): Promise<CoreCourseDesignContext | null> {
  if (typeof (runRepo as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext !== "function") return null;
  return (runRepo as RunRepository & { getCoreCourseDesignContext: (id: string) => Promise<CoreCourseDesignContext | null> }).getCoreCourseDesignContext(runId);
}

export async function getActivityRevisionHistory(
  deps: ActivityTeacherEditServiceDeps,
  input: { runId: string; sectionRef: string; activityRef: string },
): Promise<ActivityRevisionHistoryResult> {
  const sealed = await deps.structureRevisionRepo.getSealedRevision(input.runId);
  if (!sealed) fail(409, "STRUCTURE_NOT_SEALED", "Activity revision history requires a sealed Course Structure.");
  const intent = await deps.activityIntentRepo.getByRef(input.runId, sealed.revision, input.activityRef);
  if (!intent || intent.sectionRef !== input.sectionRef || intent.status === "removed") {
    fail(404, "ACTIVITY_INTENT_NOT_FOUND", `Activity Intent ${input.activityRef} not found.`);
  }
  const current = intent.status === "generated" && intent.contentJson
    ? await deps.activityRevisionRepo.recordGeneratedFromIntent(intent)
    : intent;
  return { intent: current, revisions: await deps.activityRevisionRepo.list(intent.id) };
}

export async function saveTeacherActivityEdit(
  deps: ActivityTeacherEditServiceDeps,
  input: SaveTeacherActivityEditInput,
): Promise<SaveTeacherActivityEditResult> {
  const run = await deps.runRepo.getRun(input.runId);
  if (!run) fail(404, "NOT_FOUND", `Run ${input.runId} not found.`);
  if (!run.normalizedSyllabus) fail(422, "SYLLABUS_REQUIRED", "Teacher edit revalidation requires the normalized syllabus.");

  const sealed = await deps.structureRevisionRepo.getSealedRevision(input.runId);
  if (!sealed) fail(409, "STRUCTURE_NOT_SEALED", "Teacher edit revalidation requires a sealed Course Structure.");
  const sectionRecord = (Array.isArray(sealed.contentJson.sections) ? sealed.contentJson.sections as Array<Record<string, unknown>> : [])
    .find((candidate) => candidate.ref === input.sectionRef);
  if (!sectionRecord) fail(404, "SECTION_NOT_FOUND", `Section ${input.sectionRef} not found.`);

  const intent = await deps.activityIntentRepo.getByRef(input.runId, sealed.revision, input.activityRef);
  if (!intent || intent.sectionRef !== input.sectionRef || intent.status === "removed") {
    fail(404, "ACTIVITY_INTENT_NOT_FOUND", `Activity Intent ${input.activityRef} not found.`);
  }
  if (intent.status !== "generated" || !intent.contentJson) {
    fail(409, "ACTIVITY_EDIT_STATE_INVALID", "Only a currently generated Activity can be content-edited.", { status: intent.status });
  }

  const coreContext = await getCoreContext(deps.runRepo, input.runId);
  if (!coreContext) fail(409, "ACTIVITY_EDIT_CONTEXT_UNAVAILABLE", "Current Core Course Design Context is unavailable.");
  if (intent.contextRevision !== coreContext.revision || intent.learnerContextRevision !== coreContext.learner_context.revision) {
    fail(409, "ACTIVITY_EDIT_STALE", "Activity dependencies changed. Regenerate from the current Activity Intent before editing content.", {
      activity_context_revision: intent.contextRevision,
      current_context_revision: coreContext.revision,
    });
  }

  const section: SectionStructureDraft = {
    ref: input.sectionRef,
    position: Number(sectionRecord.position),
    title: String(sectionRecord.title ?? input.sectionRef),
    summary: String(sectionRecord.summary ?? sectionRecord.title ?? input.sectionRef),
    source_refs: Array.isArray(sectionRecord.source_refs) ? sectionRecord.source_refs as SectionStructureDraft["source_refs"] : [],
    activityIntents: [],
    ...(Array.isArray(sectionRecord.aligned_objective_ids) ? { aligned_objective_ids: sectionRecord.aligned_objective_ids.filter((id): id is string => typeof id === "string") } : {}),
    ...(Array.isArray(sectionRecord.aligned_outcome_ids) ? { aligned_outcome_ids: sectionRecord.aligned_outcome_ids.filter((id): id is string => typeof id === "string") } : {}),
  };
  const grounding = await resolveContext(deps, input.runId, sealed.revision, section, run.normalizedSyllabus as NormalizedSyllabus);
  if (intent.groundingMode !== grounding.mode || (intent.groundingMode === "MATERIAL_GROUNDED" && intent.materialSnapshotId !== grounding.materialSnapshotId)) {
    fail(409, "ACTIVITY_EDIT_STALE", "Activity grounding source changed. Regenerate before editing content.");
  }

  const designContext = buildActivityDesignContext({
    coreContext,
    structureRevision: sealed.revision,
    section,
    intent: {
      id: intent.id,
      ref: intent.activityRef,
      type: intent.activityType,
      title: titleFor(intent, section.title),
      purpose: intent.purpose,
      intent_revision: intent.intentRevision,
      selected_objective_ids: intent.selectedObjectiveIdsJson,
      selected_outcome_ids: intent.selectedOutcomeIdsJson,
      learner_context_revision: intent.learnerContextRevision ?? coreContext.learner_context.revision,
      learner_context_acknowledged: intent.learnerContextAcknowledged,
      options: intent.optionsJson,
      generation_instruction: intent.generationInstruction,
      ...(intent.alignmentOverrideJson ? { alignment_override: intent.alignmentOverrideJson as { acknowledged: true; reason: string } } : {}),
    },
    grounding,
  });
  const validated = validateTeacherEditedActivity({
    activity: input.activity,
    context: designContext,
    section: { ref: section.ref, position: section.position, title: section.title, summary: section.summary, source_refs: section.source_refs },
    constraints: constraintsFor(intent, section.position),
    authorizedSourceRefs: grounding.sourceRefs,
  });

  const seeded = await deps.activityRevisionRepo.recordGeneratedFromIntent(intent);
  const expected = input.expectedActivityRevision === 0 && seeded.activityRevision === 1 ? 1 : input.expectedActivityRevision;
  const saved = await deps.activityRevisionRepo.saveTeacherEdit({
    activityIntentId: intent.id,
    contentJson: validated as unknown as Record<string, unknown>,
    ...(expected !== undefined ? { expectedActivityRevision: expected } : {}),
    ...(input.editedByMoodleUserId !== undefined ? { editedByMoodleUserId: input.editedByMoodleUserId } : {}),
  });
  return {
    intent: saved.intent,
    currentRevision: saved.revision,
    revisions: await deps.activityRevisionRepo.list(intent.id),
  };
}
