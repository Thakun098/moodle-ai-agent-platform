import { randomUUID } from "node:crypto";
import {
  getDatabase,
  ActivityIntentRepository,
  CourseStructureRevisionRepository,
  MaterialSnapshotRepository,
  PlanRepository,
  RunRepository,
  SectionActivityDraftRepository,
  type MaterialSnapshotRecord,
  type SectionActivityDraftRecord,
} from "@moodle-agent-poc/agent-runtime";
import type { ActivityPlan, AnyPlanEnvelope } from "@moodle-agent-poc/contracts";
import {
  BoundedMaterialContextProvider,
  type MaterialSnapshot,
  type MaterialSnapshotFile,
} from "@moodle-agent-poc/materials";
import {
  assembleFinalCoursePlan,
  buildSectionGrounding,
  createCourseStructureRevisionFromContent,
  determineSectionActivityState,
  generateSectionActivities,
  generateActivity,
  resolveActivityRuleScopes,
  PlanningError,
  type CourseStructureRevision,
  type FinalizationSelectedActivity,
  type SectionActivityDraftSummary,
  type SectionStructureDraft,
} from "@moodle-agent-poc/planning";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { createConfiguredModelClient } from "../config/model-client-factory.js";

export interface SectionGenerationRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository | undefined;
  structureRevisionRepo?: import("@moodle-agent-poc/agent-runtime").CourseStructureRevisionRepository | undefined;
  snapshotRepo?: MaterialSnapshotRepository | undefined;
  draftRepo?: SectionActivityDraftRepository | undefined;
  activityIntentRepo?: ActivityIntentRepository | undefined;
  planRepo?: PlanRepository | undefined;
  modelClient?: import("@moodle-agent-poc/agent-runtime").ModelClient | undefined;
}

function toStructure(record: { id: string; runId: string; revision: number; title: string; summary: string; contentJson: Record<string, unknown>; teacherConstraintsJson: unknown; validationStatus: "valid" | "invalid"; validationErrors: unknown; sealedAt: string | null; sealedByMoodleUserId: number | null; createdAt: string }): CourseStructureRevision {
  const content = record.contentJson;
  const parsed = createCourseStructureRevisionFromContent({ id: record.id, runId: record.runId, revision: record.revision, title: record.title, summary: record.summary, content, createdAt: record.createdAt, teacherConstraints: record.teacherConstraintsJson as import("@moodle-agent-poc/planning").CoursePlanningConstraints });
  return {
    ...parsed,
    validationStatus: record.validationStatus,
    ...(record.validationErrors ? { validationErrors: Array.isArray(record.validationErrors) ? record.validationErrors.map(String) : [String(record.validationErrors)] } : {}),
    ...(record.sealedAt ? { sealedAt: record.sealedAt } : {}),
    ...(record.sealedByMoodleUserId !== null ? { sealedByMoodleUserId: record.sealedByMoodleUserId } : {}),
  };
}

function toSection(structure: CourseStructureRevision, sectionRef: string): SectionStructureDraft {
  const section = structure.content.sections.find((candidate) => candidate.ref === sectionRef);
  if (!section) throw new PlanningError("PLAN_DOMAIN_INVALID", `Section "${sectionRef}" was not found in sealed Course Structure revision ${structure.revision}.`);
  return {
    ref: section.ref,
    position: section.position,
    title: section.title,
    summary: section.summary,
    source_refs: section.source_refs,
    activityIntents: section.activity_intents,
  };
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

function draftSummaries(records: readonly SectionActivityDraftRecord[]): SectionActivityDraftSummary[] {
  return records.map((record) => ({ activityRef: record.activityRef, materialSnapshotId: record.materialSnapshotId, status: record.status }));
}

const MAX_GENERATION_INSTRUCTION_CHARS = 4000;

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, canonicalizeJson(record[key])]),
  );
}

function canonicalJsonSignature(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

function parseGenerationInstruction(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new PlanningError("GENERATION_INSTRUCTION_INVALID", "Request body must be an object.");
  }
  const value = (body as Record<string, unknown>).generation_instruction;
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new PlanningError("GENERATION_INSTRUCTION_INVALID", "generation_instruction must be a string.");
  }
  const instruction = value.trim();
  if (!instruction) return undefined;
  if (instruction.length > MAX_GENERATION_INSTRUCTION_CHARS) {
    throw new PlanningError("GENERATION_INSTRUCTION_INVALID", `generation_instruction must not exceed ${MAX_GENERATION_INSTRUCTION_CHARS} characters.`);
  }
  return instruction;
}

export const sectionGenerationRoutes: FastifyPluginAsync<SectionGenerationRoutesOptions> = async (fastify, options) => {
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getStructureRepo = () => options.structureRevisionRepo ?? new CourseStructureRevisionRepository(getDatabase());
  const getSnapshotRepo = () => options.snapshotRepo ?? new MaterialSnapshotRepository(getDatabase());
  const getDraftRepo = () => options.draftRepo ?? new SectionActivityDraftRepository(getDatabase());
  const getIntentRepo = () => options.activityIntentRepo ?? new ActivityIntentRepository(getDatabase());
  const getModelClient = () => options.modelClient ?? createConfiguredModelClient(options.config);

  fastify.get<{ Params: { runId: string; sectionRef: string } }>("/api/runs/:runId/sections/:sectionRef/generation-status", async (request, reply) => {
    const { runId, sectionRef } = request.params;
    const run = await getRunRepo().getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    const structureRecord = await getStructureRepo().getSealedRevision(runId);
    if (!structureRecord) throw new PlanningError("STRUCTURE_NOT_SEALED", `Run ${runId} has no sealed Course Structure.`);
    const structure = toStructure(structureRecord);
    const section = toSection(structure, sectionRef);
    const snapshot = await getSnapshotRepo().getLatestSnapshot(runId, structure.revision, sectionRef);
    const drafts = await getDraftRepo().listSectionDrafts(runId, sectionRef);
    const state = determineSectionActivityState({ section, ...(snapshot?.id ? { materialSnapshotId: snapshot.id } : {}), drafts: draftSummaries(drafts), generating: false });
    const materialFiles = snapshot && Array.isArray(snapshot.filesJson)
      ? (snapshot.filesJson as MaterialSnapshotFile[]).map((file) => ({ filename: file.filename, sha256: file.sha256 }))
      : [];
    reply.send({ run_id: runId, section_ref: sectionRef, state, material_snapshot_id: snapshot?.id ?? null, material_files: materialFiles, drafts });
  });

  fastify.post<{ Params: { runId: string; sectionRef: string } }>("/api/runs/:runId/sections/:sectionRef/generate", async (request, reply) => {
    const { runId, sectionRef } = request.params;
    const generationInstruction = parseGenerationInstruction(request.body);
    const run = await getRunRepo().getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    const structureRecord = await getStructureRepo().getSealedRevision(runId);
    if (!structureRecord) throw new PlanningError("STRUCTURE_NOT_SEALED", `Run ${runId} has no sealed Course Structure.`);
    const structure = toStructure(structureRecord);
    const section = toSection(structure, sectionRef);
    if (section.activityIntents.length === 0) {
      reply.send({ run_id: runId, section_ref: sectionRef, state: "NO_ACTIVITY_REQUIRED", activities: [] });
      return;
    }
    const snapshotRecord = await getSnapshotRepo().getLatestSnapshot(runId, structure.revision, sectionRef);
    if (!snapshotRecord) {
      reply.status(409).send({ run_id: runId, section_ref: sectionRef, state: "BLOCKED_MISSING_MATERIAL", error: { code: "MATERIAL_REQUIRED", message: `No sealed Learning Material exists for section "${sectionRef}".`, details: { section_ref: sectionRef }, request_id: request.id } });
      return;
    }
    const snapshot = toMaterialSnapshot(snapshotRecord);
    const draftRepo = getDraftRepo();
    await draftRepo.markStaleForSnapshot(runId, sectionRef, snapshot.id);
    const contextProvider = new BoundedMaterialContextProvider({ getSnapshot: async (snapshotId) => {
      const record = await getSnapshotRepo().getSnapshot(snapshotId);
      return record ? toMaterialSnapshot(record) : null;
    } }, options.config.activityContextTokenBudget);
    const context = await contextProvider.getContext(snapshot.id);
    const constraints = structure.teacherConstraints;
    const ruleScopes = run.normalizedSyllabus
      ? resolveActivityRuleScopes(constraints.activityRules, structure.content.sections, run.normalizedSyllabus)
      : undefined;
    const result = await generateSectionActivities({
      section,
      materialContext: context,
      constraints,
      generate: (intent) => generateActivity({
        modelClient: getModelClient(),
        section,
        intent,
        materialContext: context,
        constraints,
        ...(run.normalizedSyllabus ? { syllabus: run.normalizedSyllabus } : {}),
        ...(ruleScopes ? { ruleScopes } : {}),
        ...(generationInstruction ? { generationInstruction } : {}),
      }),
      store: {
        save: async ({ sectionRef: savedSectionRef, materialSnapshotId, activity }) => {
          await draftRepo.saveDraft({ id: randomUUID(), runId, structureRevision: structure.revision, sectionRef: savedSectionRef, activityRef: activity.ref, activityType: activity.type, materialSnapshotId, ...(generationInstruction ? { generationInstruction } : {}), content: activity as unknown as Record<string, unknown> });
        },
      },
    });
    reply.send({ run_id: runId, section_ref: sectionRef, state: result.state, material_snapshot_id: snapshot.id, activities: result.activities, blocked: result.blocked ?? null });
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/plans/course/finalize", async (request, reply) => {
    const { runId } = request.params;
    const runRepo = getRunRepo();
    const structureRepo = getStructureRepo();
    const planRepo = options.planRepo ?? new PlanRepository(getDatabase());
    const run = await runRepo.getRun(runId);
    if (!run) {
      reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
      return;
    }
    const structureRecord = await structureRepo.getSealedRevision(runId);
    if (!structureRecord) throw new PlanningError("STRUCTURE_NOT_SEALED", `Run ${runId} has no sealed Course Structure.`);
    const existingInitialPlan = (await planRepo.listRunPlans(runId)).find((record) => record.planType === "course" && record.operation === "create");
    const latestPlanRevision = existingInitialPlan ? await planRepo.getLatestRevision(existingInitialPlan.planId) : null;
    const targetPlanId = latestPlanRevision?.planId ?? randomUUID();
    const targetPlanRevision = (latestPlanRevision?.revision ?? 0) + 1;
    const structure = toStructure(structureRecord);
    const persistedIntents = (await getIntentRepo().list(runId, structure.revision)).filter((record) => record.status !== "removed");
    const useOptionalActivityPath = persistedIntents.length > 0 || structure.content.sections.every((section) => section.activity_intents.length === 0);
    let plan;
    let reviewRequirements: Array<{ code: string; activity_ref?: string }> = [];
    if (useOptionalActivityPath) {
      const selectedActivitiesBySection = new Map<string, FinalizationSelectedActivity[]>();
      for (const record of persistedIntents) {
        const section = structure.content.sections.find((candidate) => candidate.ref === record.sectionRef);
        if (!section) {
          throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Activity Intent "${record.activityRef}" belongs to a section outside the sealed Structure revision.`);
        }
        let authorizedSources: import("@moodle-agent-poc/contracts").SourceReference[] = [];
        let currentSourceValid = true;
        if (record.status === "generated") {
          if (record.groundingMode === "MATERIAL_GROUNDED") {
            if (!record.materialSnapshotId) {
              currentSourceValid = false;
            } else {
              const sourceSnapshot = await getSnapshotRepo().getSnapshot(record.materialSnapshotId);
              const latestSnapshot = await getSnapshotRepo().getLatestSnapshot(runId, structure.revision, section.ref);
              currentSourceValid = Boolean(sourceSnapshot && latestSnapshot && latestSnapshot.id === record.materialSnapshotId);
              if (sourceSnapshot) {
                const files = Array.isArray(sourceSnapshot.filesJson) ? sourceSnapshot.filesJson as MaterialSnapshotFile[] : [];
                authorizedSources = files
                  .filter((file) => file.useForGrounding && file.extractionStatus === "success")
                  .map((file) => ({ source: file.filename, section: section.ref }));
              }
            }
          } else if ((record.groundingMode === "SYLLABUS_GROUNDED" || record.groundingMode === "SYLLABUS_SCOPED_AI") && run.normalizedSyllabus) {
            const grounding = buildSectionGrounding(run.normalizedSyllabus, {
              ref: section.ref,
              position: section.position,
              title: section.title,
              source_refs: [],
            }, { allowPositionFallback: false });
            authorizedSources = [...grounding.sourceRefs];
          }
        }
        const selection: FinalizationSelectedActivity = {
          activityRef: record.activityRef,
          status: record.status as FinalizationSelectedActivity["status"],
          ...(record.contentJson ? { activity: record.contentJson as unknown as ActivityPlan } : {}),
          ...(record.groundingMode && ["MATERIAL_GROUNDED", "SYLLABUS_GROUNDED", "SYLLABUS_SCOPED_AI", "INSUFFICIENT_EVIDENCE"].includes(record.groundingMode)
            ? { groundingMode: record.groundingMode as NonNullable<FinalizationSelectedActivity["groundingMode"]> }
            : {}),
          reviewRequired: record.reviewRequired,
          authorizedSources,
          currentSourceValid,
        };
        const current = selectedActivitiesBySection.get(section.ref) ?? [];
        current.push(selection);
        selectedActivitiesBySection.set(section.ref, current);
      }
      reviewRequirements = persistedIntents
        .filter((record) => record.status === "generated" && record.reviewRequired)
        .map((record) => ({ code: "AI_EXPANDED_CONTENT", activity_ref: record.activityRef }));
      plan = assembleFinalCoursePlan({
        planId: targetPlanId,
        revision: targetPlanRevision,
        structure,
        selectedActivitiesBySection,
        ...(run.normalizedSyllabus ? { syllabus: run.normalizedSyllabus } : {}),
      });
    } else {
      // Compatibility path for pre-ADR-0002 Phase-17 runs whose Activity Intents were sealed inside Structure.
      const draftsBySection = new Map<string, Array<{ activity: ActivityPlan; materialSnapshotId: string; structureRevision: number; status: "generated" | "stale" }>>();
      const currentSnapshotIds = new Map<string, string>();
      const materialSourcesBySection = new Map<string, import("@moodle-agent-poc/contracts").SourceReference[]>();
      for (const section of structure.content.sections) {
        const records = await getDraftRepo().listSectionDrafts(runId, section.ref);
        draftsBySection.set(section.ref, records.map((record) => ({ activity: record.contentJson as unknown as ActivityPlan, materialSnapshotId: record.materialSnapshotId, structureRevision: record.structureRevision, status: record.status })));
        if (section.activity_intents.length > 0) {
          const snapshot = await getSnapshotRepo().getLatestSnapshot(runId, structure.revision, section.ref);
          if (snapshot) {
            currentSnapshotIds.set(section.ref, snapshot.id);
            const files = Array.isArray(snapshot.filesJson) ? snapshot.filesJson as MaterialSnapshotFile[] : [];
            materialSourcesBySection.set(section.ref, files.filter((file) => file.useForGrounding && file.extractionStatus === "success").map((file) => ({ source: file.filename, section: section.ref })));
          }
        }
      }
      plan = assembleFinalCoursePlan({ planId: targetPlanId, revision: targetPlanRevision, structure, draftsBySection, currentSnapshotIds, materialSourcesBySection, ...(run.normalizedSyllabus ? { syllabus: run.normalizedSyllabus } : {}) });
    }
    if (latestPlanRevision) {
      const candidateSignature = canonicalJsonSignature({ title: plan.title, summary: plan.summary, warnings: plan.warnings, assumptions: plan.assumptions, content: plan.content, reviewRequirements });
      const latestEnvelope = latestPlanRevision.rawEnvelope as AnyPlanEnvelope;
      const latestSignature = canonicalJsonSignature({ title: latestEnvelope.title, summary: latestEnvelope.summary, warnings: latestEnvelope.warnings, assumptions: latestEnvelope.assumptions, content: latestEnvelope.content, reviewRequirements: latestPlanRevision.reviewRequirements ?? [] });
      if (candidateSignature === latestSignature) {
        await runRepo.updateStatus(runId, "preview");
        reply.send({ run_id: runId, status: "preview", plan: latestPlanRevision, reused: true });
        return;
      }
    }
    const saved = await planRepo.savePlanRevision({ id: randomUUID(), planId: plan.plan_id, runId, planType: "course", operation: "create", revision: plan.revision, title: plan.title, summary: plan.summary, content: plan.content as unknown as Record<string, unknown>, rawEnvelope: plan as unknown as AnyPlanEnvelope, validationStatus: "valid", reviewRequirements });
    await runRepo.updateStatus(runId, "preview");
    reply.status(201).send({ run_id: runId, status: "preview", plan: saved });
  });
};
