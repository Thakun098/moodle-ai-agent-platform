import {
  validatePlanningContract,
  type ActivityPlan,
  type FileResourcePlan,
  type CoursePlanEnvelope,
  type NormalizedSyllabus,
  type SectionPlan,
  type SourceReference,
} from "@moodle-agent-poc/contracts";
import { buildProvenanceAllowlist, validatePlanningDomainInvariants } from "../domain/planning-domain-validator.js";
import { PlanningError } from "../errors/planning-errors.js";
import { sourceReferenceKeys } from "../grounding/source-reference.js";
import type { CourseStructureRevision } from "../structure/course-structure-revision.js";
import {
  buildTeacherActivityRefMap,
  validateCourseActivityConstraints,
  validateSectionActivityProvenance,
} from "../validators/teacher-constraint-validator.js";

export interface FinalizationActivityDraft {
  activity: ActivityPlan;
  materialSnapshotId: string;
  structureRevision: number;
  status: "generated" | "stale";
}

export type FinalizationSelectedActivityStatus =
  | "selected"
  | "creating"
  | "generated"
  | "insufficient_evidence"
  | "failed"
  | "timed_out"
  | "retry_exhausted"
  | "shell"
  | "removed"
  | "stale";

export interface FinalizationSelectedActivity {
  activityRef: string;
  status: FinalizationSelectedActivityStatus;
  activity?: ActivityPlan;
  groundingMode?: "MATERIAL_GROUNDED" | "SYLLABUS_GROUNDED" | "SYLLABUS_SCOPED_AI" | "INSUFFICIENT_EVIDENCE";
  reviewRequired?: boolean;
  alignmentReviewRequired?: boolean;
  authorizedSources?: readonly SourceReference[];
  currentSourceValid?: boolean;
}

export interface AssembleFinalCoursePlanParams {
  planId: string;
  revision?: number;
  structure: CourseStructureRevision;
  /** Legacy Phase-17 staged drafts. Kept temporarily for regression compatibility. */
  draftsBySection?: ReadonlyMap<string, readonly FinalizationActivityDraft[]>;
  currentSnapshotIds?: ReadonlyMap<string, string>;
  materialSourcesBySection?: ReadonlyMap<string, readonly SourceReference[]>;
  /** ADR-0002 path: post-seal Teacher-Authorized Activity Intents. */
  selectedActivitiesBySection?: ReadonlyMap<string, readonly FinalizationSelectedActivity[]>;
  resourcesBySection?: ReadonlyMap<string, readonly FileResourcePlan[]>;
  syllabus?: NormalizedSyllabus;
}

function assertGeneratedProvenance(activity: ActivityPlan, sectionRef: string): void {
  const activitySourcesValid = Array.isArray(activity.source_refs) && activity.source_refs.length > 0;
  const quizQuestionSourcesValid = activity.type !== "quiz"
    || (Array.isArray(activity.questions) && activity.questions.every((question) => Array.isArray(question.source_refs) && question.source_refs.length > 0));
  if (!activitySourcesValid || !quizQuestionSourcesValid) {
    throw new PlanningError("PLAN_DOMAIN_INVALID", `Generated Activity content in section "${sectionRef}" must cite its authorized grounding scope.`);
  }
}

function assembleOptionalActivitySections(
  params: AssembleFinalCoursePlanParams,
): {
  sections: CoursePlanEnvelope["content"]["sections"];
  warnings: string[];
  activityAllowlists: Map<string, ReadonlySet<string>>;
  shellActivityRefs: Set<string>;
} {
  const activityAllowlists = new Map<string, ReadonlySet<string>>();
  const shellActivityRefs = new Set<string>();
  const warnings: string[] = [];

  const sections = params.structure.content.sections.map((section) => {
    const selections = (params.selectedActivitiesBySection?.get(section.ref) ?? []).filter((selection) => selection.status !== "removed");
    if (selections.length === 0) {
      return {
        ref: section.ref,
        position: section.position,
        title: section.title,
        summary: section.summary,
        source_refs: section.source_refs,
        activities: [],
        ...(params.resourcesBySection?.has(section.ref) ? { resources: [...(params.resourcesBySection.get(section.ref) ?? [])] } : {}),
      };
    }

    const activities = selections.map((selection) => {
      if (selection.status !== "generated" && selection.status !== "shell") {
        throw new PlanningError(
          "COURSE_NOT_READY_FOR_FINALIZATION",
          `Activity "${selection.activityRef}" in section "${section.ref}" is not ready for Finalization (state: ${selection.status}).`,
          { activity_ref: selection.activityRef, status: selection.status },
        );
      }
      if (!selection.activity) {
        throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Activity "${selection.activityRef}" has no persisted Activity content.`);
      }
      if (selection.activity.ref !== selection.activityRef) {
        throw new PlanningError("PLAN_DOMAIN_INVALID", `Persisted Activity ref "${selection.activity.ref}" does not match selected intent "${selection.activityRef}".`);
      }

      if (selection.status === "shell") {
        shellActivityRefs.add(selection.activityRef);
        warnings.push(`Empty Activity Shell: ${selection.activityRef} contains placeholder content pending teacher completion.`);
        return selection.activity;
      }

      if (selection.currentSourceValid === false) {
        throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Activity "${selection.activityRef}" is stale because its grounding source is no longer current.`);
      }
      if (!selection.groundingMode || selection.groundingMode === "INSUFFICIENT_EVIDENCE") {
        throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Generated Activity "${selection.activityRef}" has no valid grounding mode.`);
      }
      const sources = selection.authorizedSources ?? [];
      if (sources.length === 0) {
        throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Generated Activity "${selection.activityRef}" has no authoritative provenance allowlist.`);
      }
      assertGeneratedProvenance(selection.activity, section.ref);
      activityAllowlists.set(selection.activityRef, new Set(sources.flatMap((source) => sourceReferenceKeys(source))));
      if (selection.groundingMode === "SYLLABUS_SCOPED_AI" || (selection.reviewRequired && !selection.alignmentReviewRequired)) {
        warnings.push(`Teacher Review Required: ${selection.activityRef} includes AI-expanded content constrained to syllabus scope.`);
      }
      if (selection.alignmentReviewRequired) warnings.push(`Teacher Review Required: ${selection.activityRef} was generated without a selected Objective or Outcome alignment.`);
      return selection.activity;
    });

    return {
      ref: section.ref,
      position: section.position,
      title: section.title,
      summary: section.summary,
      source_refs: section.source_refs,
      activities,
      ...(params.resourcesBySection?.has(section.ref) ? { resources: [...(params.resourcesBySection.get(section.ref) ?? [])] } : {}),
    };
  }) as CoursePlanEnvelope["content"]["sections"];

  return { sections, warnings: [...new Set(warnings)], activityAllowlists, shellActivityRefs };
}

function assembleLegacySections(params: AssembleFinalCoursePlanParams): CoursePlanEnvelope["content"]["sections"] {
  const draftsBySection = params.draftsBySection ?? new Map<string, readonly FinalizationActivityDraft[]>();
  return params.structure.content.sections.map((section) => {
    const drafts = draftsBySection.get(section.ref) ?? [];
    if (section.activity_intents.length === 0) {
      return { ref: section.ref, position: section.position, title: section.title, summary: section.summary, source_refs: section.source_refs, activities: [], ...(params.resourcesBySection?.has(section.ref) ? { resources: [...(params.resourcesBySection.get(section.ref) ?? [])] } : {}) };
    }
    if (drafts.length !== section.activity_intents.length) {
      throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Section "${section.ref}" is not ready for finalization: expected ${section.activity_intents.length} activity drafts, found ${drafts.length}.`);
    }
    if (drafts.some((draft) => draft.status === "stale")) {
      throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Section "${section.ref}" contains a stale activity draft.`);
    }
    if (drafts.some((draft) => draft.structureRevision !== params.structure.revision)) {
      throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Section "${section.ref}" contains an activity draft from an older Course Structure revision.`);
    }
    if (params.currentSnapshotIds && !params.currentSnapshotIds.has(section.ref)) {
      throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Section "${section.ref}" has no current MaterialSnapshot.`);
    }
    const currentSnapshotId = params.currentSnapshotIds?.get(section.ref);
    if (currentSnapshotId && drafts.some((draft) => draft.materialSnapshotId !== currentSnapshotId)) {
      throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Section "${section.ref}" contains an activity draft from an older MaterialSnapshot.`);
    }
    const snapshotIds = new Set(drafts.map((draft) => draft.materialSnapshotId));
    if (snapshotIds.size !== 1) {
      throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Section "${section.ref}" activity drafts do not share one MaterialSnapshot.`);
    }
    const activities = drafts.map((draft) => draft.activity);
    const materialSources = params.materialSourcesBySection?.get(section.ref);
    if (params.materialSourcesBySection && !materialSources) {
      throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Section "${section.ref}" has no material provenance allowlist.`);
    }
    if (materialSources && materialSources.length === 0) {
      throw new PlanningError("COURSE_NOT_READY_FOR_FINALIZATION", `Section "${section.ref}" has no grounding-enabled MaterialSnapshot files.`);
    }
    if (materialSources) {
      const allowlist = new Set(materialSources.flatMap((source) => sourceReferenceKeys(source)));
      const sectionPlan: SectionPlan = { ref: section.ref, position: section.position, title: section.title, summary: section.summary, source_refs: section.source_refs, activities };
      for (const activity of activities) assertGeneratedProvenance(activity, section.ref);
      const provenanceViolations = validateSectionActivityProvenance(sectionPlan, allowlist, true);
      if (provenanceViolations.length > 0) {
        throw new PlanningError("PLAN_DOMAIN_INVALID", `Activity provenance is outside the current MaterialSnapshot for section "${section.ref}".`, provenanceViolations);
      }
    }
    return { ref: section.ref, position: section.position, title: section.title, summary: section.summary, source_refs: section.source_refs, activities, ...(params.resourcesBySection?.has(section.ref) ? { resources: [...(params.resourcesBySection.get(section.ref) ?? [])] } : {}) };
  }) as CoursePlanEnvelope["content"]["sections"];
}

export function assembleFinalCoursePlan(params: AssembleFinalCoursePlanParams): CoursePlanEnvelope {
  if (params.structure.validationStatus !== "valid") {
    throw new PlanningError("STRUCTURE_INVALID", `Cannot finalize invalid Course Structure revision ${params.structure.revision}.`);
  }
  if (!params.structure.sealedAt) {
    throw new PlanningError("STRUCTURE_NOT_SEALED", `Course Structure revision ${params.structure.revision} must be sealed before finalization.`);
  }

  const optionalPath = params.selectedActivitiesBySection !== undefined;
  const optional = optionalPath ? assembleOptionalActivitySections(params) : undefined;
  const sections = optional?.sections ?? assembleLegacySections(params);

  const envelope: CoursePlanEnvelope = {
    schema_version: "0.1",
    plan_id: params.planId,
    revision: params.revision ?? 1,
    plan_type: "course",
    operation: "create",
    title: params.structure.title,
    summary: params.structure.summary,
    warnings: optional?.warnings ?? [],
    assumptions: [],
    content: { course: params.structure.content.course, sections },
  };

  const validation = validatePlanningContract(envelope);
  if (!validation.valid) {
    throw new PlanningError("PLAN_SCHEMA_INVALID", `Final CoursePlan failed frozen contract validation: ${validation.errors.map((error) => `${error.instancePath || "/"}: ${error.message}`).join("; ")}`, validation.errors);
  }

  if (!optionalPath) {
    const teacherActivityRefs = buildTeacherActivityRefMap(params.structure.content.sections.map((section) => ({ ref: section.ref, activityIntents: section.activity_intents })));
    const teacherViolations = validateCourseActivityConstraints(
      envelope.content,
      params.structure.teacherConstraints,
      params.syllabus,
      undefined,
      teacherActivityRefs,
    );
    if (teacherViolations.length > 0) {
      throw new PlanningError("TEACHER_CONSTRAINT_VIOLATION", `Final CoursePlan failed aggregate teacher constraints: ${JSON.stringify(teacherViolations)}`, teacherViolations);
    }
  }

  if (params.syllabus) {
    if (optionalPath && optional) {
      validatePlanningDomainInvariants(
        envelope,
        buildProvenanceAllowlist(params.syllabus),
        undefined,
        optional.activityAllowlists,
        optional.shellActivityRefs,
      );
    } else {
      const materialAllowlists = new Map<string, ReadonlySet<string>>();
      for (const [sectionRef, sources] of params.materialSourcesBySection ?? []) {
        materialAllowlists.set(sectionRef, new Set(sources.flatMap((source) => sourceReferenceKeys(source))));
      }
      validatePlanningDomainInvariants(envelope, buildProvenanceAllowlist(params.syllabus), materialAllowlists);
    }
  }

  return envelope;
}
