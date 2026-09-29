import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { PlanningError } from "../errors/planning-errors.js";

export type ActivityPurpose = "PRACTICE" | "FORMATIVE" | "SUMMATIVE";
export type ActivityAlignmentOverrideKind = "OUT_OF_SECTION" | "MISSING_ALIGNMENT";
export interface ActivityAlignmentOverride extends Record<string, unknown> {
  kind?: ActivityAlignmentOverrideKind;
  acknowledged: true;
  reason: string;
}

export interface ActivityIntentSemanticInput {
  activity_type: "quiz" | "assignment";
  purpose: ActivityPurpose;
  selected_objective_ids?: readonly string[];
  selected_outcome_ids?: readonly string[];
  learner_context_revision?: number;
  learner_context_acknowledged?: boolean;
  generation_instruction?: string;
  alignment_override?: ActivityAlignmentOverride;
}

export interface ValidatedActivityIntent extends ActivityIntentSemanticInput {
  selected_objective_ids: string[];
  selected_outcome_ids: string[];
  learner_context_revision: number;
  learner_context_acknowledged: boolean;
  generation_instruction?: string;
  alignment_override?: ActivityAlignmentOverride;
}

function strings(values: readonly string[] | undefined, field: string): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values) || !values.every((value) => typeof value === "string" && value.trim() !== "")) {
    throw new PlanningError("ACTIVITY_INTENT_INVALID", `${field} must contain non-empty strings.`);
  }
  return [...new Set(values.map((value) => value.trim()))].sort();
}

function approvedOutcomeForId(context: CoreCourseDesignContext, id: string) {
  const direct = context.approved_learning_outcomes.find((outcome) => outcome.outcome_id === id);
  if (direct) return direct;
  const matches = context.approved_learning_outcomes.filter((outcome) => outcome.source_outcome_ids.includes(id));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new PlanningError("ACTIVITY_INTENT_INVALID", `Outcome ${id} has ambiguous approved lineage.`);
  return undefined;
}

export function validateActivityIntent(
  context: CoreCourseDesignContext,
  section: { ref: string; aligned_objective_ids?: readonly string[]; aligned_outcome_ids?: readonly string[] },
  input: ActivityIntentSemanticInput,
  options: { allowMissingAlignment?: boolean } = {},
): ValidatedActivityIntent {
  if (!["PRACTICE", "FORMATIVE", "SUMMATIVE"].includes(input.purpose)) {
    throw new PlanningError("ACTIVITY_INTENT_INVALID", "Exactly one Activity Purpose is required: PRACTICE, FORMATIVE, or SUMMATIVE.");
  }
  const objectiveIds = strings(input.selected_objective_ids, "selected_objective_ids");
  const selectedOutcomeIds = strings(input.selected_outcome_ids, "selected_outcome_ids");
  const sectionObjectiveIds = new Set(section.aligned_objective_ids ?? []);
  const sectionOutcomeIds = new Set(section.aligned_outcome_ids ?? []);
  const unauthorizedObjectives = objectiveIds.filter((id) => !sectionObjectiveIds.has(id));
  if (unauthorizedObjectives.length > 0) {
    throw new PlanningError("ACTIVITY_INTENT_ALIGNMENT_INVALID", "Activity Objectives must be aligned to the selected Section.", { unauthorized_objective_ids: unauthorizedObjectives, section_ref: section.ref });
  }

  const normalizedOutcomeIds: string[] = [];
  const outOfSectionOutcomeIds: string[] = [];
  for (const id of selectedOutcomeIds) {
    const approved = approvedOutcomeForId(context, id);
    if (!approved) throw new PlanningError("ACTIVITY_INTENT_OUTCOME_UNAUTHORIZED", `Outcome ${id} is not Teacher-approved.`);
    const normalizedId = approved.outcome_id;
    normalizedOutcomeIds.push(normalizedId);
    const aligned = sectionOutcomeIds.has(id) || sectionOutcomeIds.has(normalizedId) || approved.source_outcome_ids.some((sourceId) => sectionOutcomeIds.has(sourceId));
    if (!aligned) outOfSectionOutcomeIds.push(normalizedId);
  }

  const override = input.alignment_override;
  const overrideReady = override?.acknowledged === true && typeof override.reason === "string" && override.reason.trim() !== "";
  const outOfSectionOverride = overrideReady && override?.kind !== "MISSING_ALIGNMENT";
  const missingAlignmentOverride = overrideReady && override?.kind === "MISSING_ALIGNMENT";
  if (outOfSectionOutcomeIds.length > 0 && !outOfSectionOverride) {
    throw new PlanningError("ACTIVITY_INTENT_ALIGNMENT_OVERRIDE_REQUIRED", "Selecting an Outcome outside the Section requires an explicit Teacher override.", { out_of_section_outcome_ids: [...new Set(outOfSectionOutcomeIds)], section_ref: section.ref });
  }
  const distinctOutcomeIds = [...new Set(normalizedOutcomeIds)].sort();
  if (input.purpose === "PRACTICE" && objectiveIds.length === 0 && distinctOutcomeIds.length === 0 && !missingAlignmentOverride && !options.allowMissingAlignment) {
    throw new PlanningError("ACTIVITY_INTENT_ALIGNMENT_REQUIRED", "PRACTICE requires at least one selected Objective or Outcome.");
  }
  if ((input.purpose === "FORMATIVE" || input.purpose === "SUMMATIVE") && distinctOutcomeIds.length === 0 && !missingAlignmentOverride && !options.allowMissingAlignment) {
    throw new PlanningError("ACTIVITY_INTENT_ALIGNMENT_REQUIRED", `${input.purpose} requires at least one selected Outcome.`);
  }

  const learnerRevision = input.learner_context_revision ?? context.learner_context.revision;
  if (!Number.isSafeInteger(learnerRevision) || learnerRevision < 1 || learnerRevision !== context.learner_context.revision) {
    throw new PlanningError("ACTIVITY_INTENT_LEARNER_CONTEXT_STALE", "Learner Context revision is stale; reload the current Core Context before saving the Activity Intent.", { learner_context_revision: learnerRevision, current_learner_context_revision: context.learner_context.revision });
  }
  const learnerAcknowledged = input.learner_context_acknowledged === true;
  if (context.learner_context.status === "UNSPECIFIED" && !learnerAcknowledged) {
    throw new PlanningError("ACTIVITY_INTENT_LEARNER_ACK_REQUIRED", "Teacher acknowledgment is required before generating with unspecified learner context.");
  }
  const generationInstruction = typeof input.generation_instruction === "string" && input.generation_instruction.trim() !== "" ? input.generation_instruction.trim() : undefined;
  return {
    ...input,
    selected_objective_ids: objectiveIds,
    selected_outcome_ids: distinctOutcomeIds,
    learner_context_revision: learnerRevision,
    learner_context_acknowledged: learnerAcknowledged,
    ...(generationInstruction ? { generation_instruction: generationInstruction } : {}),
    ...(override ? { alignment_override: { ...(override.kind ? { kind: override.kind } : {}), acknowledged: true, reason: override.reason.trim() } } : {}),
  };
}
