import type {
  CoreCourseDesignContext,
  DesignSourceRef,
  LearningOutcomeProposal,
  OutcomeCoverage,
  OutcomeApprovalOrigin,
} from "@moodle-agent-poc/contracts";
import { PlanningError } from "../errors/planning-errors.js";

export interface AlignedStructureSection {
  ref: string;
  position: number;
  title: string;
  summary: string;
  source_refs: readonly unknown[];
  activity_intents?: readonly unknown[];
  aligned_objective_ids: string[];
  aligned_outcome_ids: string[];
  alignment_status: "CURRENT" | "STALE_ALIGNMENT";
}

export interface ExternalCoverageOverride {
  outcome_id: string;
  acknowledged: true;
  reason: string;
  teacher_id?: number;
}

export interface OutcomeApprovalInput {
  source_outcome_id: string;
  use_source_as_is?: boolean;
  recommended_text?: string;
  teacher_text?: string;
  teacher_id?: number;
}

const nonBlank = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PlanningError("STRUCTURE_INVALID", field + " must be a non-empty string.");
  }
  return value.trim();
};

function proposalText(source: string): string {
  const value = source.trim().replace(/[.!?。！？]+$/u, "");
  if (/[\u0E00-\u0E7F]/u.test(value)) {
    return /^\s*(?:เข้าใจ|เรียนรู้|รู้จัก|ตระหนัก|ทราบ)\s*/iu.test(value)
      ? value.replace(/^\s*(?:เข้าใจ|เรียนรู้|รู้จัก|ตระหนัก|ทราบ)\s*/iu, "อธิบายและประยุกต์ใช้")
      : "อธิบายและปฏิบัติ: " + value;
  }
  return /^\s*(identify|explain|understand|know)\b/iu.test(value)
    ? "Demonstrate the ability to " + value.toLowerCase()
    : "Demonstrate: " + value;
}

function stableProposalId(sourceId: string): string {
  return "proposal-" + sourceId;
}

export function buildLearningOutcomeProposals(
  context: CoreCourseDesignContext,
): LearningOutcomeProposal[] {
  return context.source_learning_outcomes
    .filter((outcome) => outcome.measurable_status === "WEAK_OR_AMBIGUOUS")
    .map((outcome) => ({
      proposal_id: stableProposalId(outcome.source_outcome_id),
      source_outcome_id: outcome.source_outcome_id,
      recommended_text: proposalText(outcome.source_text),
      rationale: "The source wording is retained and a measurable observable verb is proposed for Teacher review.",
      source_refs: outcome.source_refs,
    }));
}

function sourceOutcomeIds(context: CoreCourseDesignContext): string[] {
  return context.source_learning_outcomes.map((outcome) => outcome.source_outcome_id);
}

function approvedOutcomeIds(context: CoreCourseDesignContext): string[] {
  return context.approved_learning_outcomes.map((outcome) => outcome.outcome_id);
}

export function unapprovedSourceOutcomeIds(context: CoreCourseDesignContext): string[] {
  const approvedSourceIds = new Set(
    context.approved_learning_outcomes.flatMap((outcome) => outcome.source_outcome_ids),
  );
  return context.source_learning_outcomes
    .map((outcome) => outcome.source_outcome_id)
    .filter((sourceOutcomeId) => !approvedSourceIds.has(sourceOutcomeId));
}

export function assertRequiredOutcomeApprovals(context: CoreCourseDesignContext): void {
  const unapproved = unapprovedSourceOutcomeIds(context);
  if (unapproved.length > 0) {
    throw new PlanningError(
      "STRUCTURE_OUTCOME_COVERAGE_REQUIRED",
      "Teacher approval is required for every source Learning Outcome before Structure sealing.",
      { unapproved_source_outcome_ids: unapproved },
    );
  }
}

function explicitCloNumbers(text: string): number[] {
  const numbers = new Set<number>();
  for (const match of text.matchAll(/CLO\s*0*(\d+)\s*-\s*(?:CLO\s*)?0*(\d+)/giu)) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start > 100) continue;
    for (let value = start; value <= end; value += 1) numbers.add(value);
  }
  for (const match of text.matchAll(/CLO\s*0*(\d+)/giu)) {
    const value = Number(match[1]);
    if (Number.isSafeInteger(value) && value > 0) numbers.add(value);
  }
  return [...numbers].sort((a, b) => a - b);
}

function coursePeriodNumber(value: string): number | null {
  const labelled = value.match(/(?:week|unit|section|สัปดาห์(?:ที่)?|ช่วงเรียน(?:ที่)?)\s*[-_:]?\s*0*(\d+)/iu);
  if (labelled) return Number(labelled[1]);
  const ref = value.match(/(?:^|-)0*(\d+)$/u);
  return ref ? Number(ref[1]) : null;
}

function scheduleOutcomeIdsForSection(
  context: CoreCourseDesignContext,
  section: Pick<AlignedStructureSection, "ref" | "position" | "title">,
): string[] {
  const periodNumber = coursePeriodNumber(section.title) ?? coursePeriodNumber(section.ref) ?? section.position;
  const scheduleItems = context.schedule_or_topics.filter((item, index) => {
    const scheduleNumber = coursePeriodNumber(item.week_or_unit ?? "") ?? index + 1;
    return scheduleNumber === periodNumber;
  });
  if (scheduleItems.length === 0) return [];

  const explicitNumbers = new Set(scheduleItems.flatMap((item) =>
    explicitCloNumbers([item.title, ...(item.topics ?? [])].join(" ")),
  ));
  const ids: string[] = [];
  for (const sourceOutcome of context.source_learning_outcomes) {
    const sourceNumbers = explicitCloNumbers(sourceOutcome.source_text);
    if (sourceNumbers.length !== 1 || !explicitNumbers.has(sourceNumbers[0]!)) continue;
    const successors = context.approved_learning_outcomes.filter((approved) =>
      approved.source_outcome_ids.includes(sourceOutcome.source_outcome_id),
    );
    if (successors.length === 0) ids.push(sourceOutcome.source_outcome_id);
    if (successors.length === 1) ids.push(successors[0]!.outcome_id);
  }
  return ids;
}
export function alignStructureSections(
  context: CoreCourseDesignContext,
  sections: readonly Omit<AlignedStructureSection, "aligned_objective_ids" | "aligned_outcome_ids" | "alignment_status">[],
  options: { preserveExplicitScheduleMappings?: boolean } = {},
): AlignedStructureSection[] {
  const objectiveIds = context.learning_objectives.map((objective) => objective.objective_id);
  const outcomeIds = sourceOutcomeIds(context);
  return sections.map((section, index) => {
    const provided = section as Omit<AlignedStructureSection, "aligned_objective_ids" | "aligned_outcome_ids" | "alignment_status"> & {
      aligned_objective_ids?: unknown;
      aligned_outcome_ids?: unknown;
    };
    const validObjectives = Array.isArray(provided.aligned_objective_ids)
      ? provided.aligned_objective_ids.filter((id): id is string => typeof id === "string" && objectiveIds.includes(id))
      : [];
    const validOutcomes = Array.isArray(provided.aligned_outcome_ids)
      ? provided.aligned_outcome_ids.filter((id): id is string => typeof id === "string" && [...outcomeIds, ...approvedOutcomeIds(context)].includes(id))
      : [];
    const sourceGroundedOutcomes = options.preserveExplicitScheduleMappings === false
      ? []
      : scheduleOutcomeIdsForSection(context, section);
    return {
      ...section,
      aligned_objective_ids: [...new Set(validObjectives)],
      aligned_outcome_ids: [...new Set([...validOutcomes, ...sourceGroundedOutcomes])],
      alignment_status: "CURRENT",
    };
  });
}

export function deriveOutcomeCoverage(
  context: CoreCourseDesignContext,
  sections: readonly AlignedStructureSection[],
  overrides: readonly ExternalCoverageOverride[] = [],
): OutcomeCoverage[] {
  const overrideMap = new Map(overrides.map((override) => [override.outcome_id, override]));
  return context.approved_learning_outcomes.map((outcome) => {
    const matched = sections.filter((section) =>
      section.aligned_outcome_ids.includes(outcome.outcome_id) ||
      outcome.source_outcome_ids.some((sourceId) => section.aligned_outcome_ids.includes(sourceId)),
    );
    const override = overrideMap.get(outcome.outcome_id);
    if (matched.some((section) => section.alignment_status === "STALE_ALIGNMENT")) {
      return {
        outcome_id: outcome.outcome_id,
        source_outcome_ids: [...outcome.source_outcome_ids],
        state: "STALE_ALIGNMENT",
        section_refs: matched.map((section) => section.ref),
      };
    }
    if (matched.length > 0) {
      return {
        outcome_id: outcome.outcome_id,
        source_outcome_ids: [...outcome.source_outcome_ids],
        state: "COVERED_BY_SECTION",
        section_refs: matched.map((section) => section.ref),
      };
    }
    if (override) {
      return {
        outcome_id: outcome.outcome_id,
        source_outcome_ids: [...outcome.source_outcome_ids],
        state: "EXTERNAL_TEACHER_CONFIRMED",
        section_refs: [],
        override_reason: override.reason,
      };
    }
    return {
      outcome_id: outcome.outcome_id,
      source_outcome_ids: [...outcome.source_outcome_ids],
      state: "UNCOVERED",
      section_refs: [],
    };
  });
}

export function assertOutcomeCoverage(
  coverage: readonly OutcomeCoverage[],
): void {
  const uncovered = coverage.filter((item) => item.state === "UNCOVERED" || item.state === "STALE_ALIGNMENT");
  if (uncovered.length > 0) {
    throw new PlanningError(
      "STRUCTURE_OUTCOME_COVERAGE_REQUIRED",
      "Approved Outcomes are not covered by a Section.",
      { uncovered_outcome_ids: uncovered.map((item) => item.outcome_id) },
    );
  }
}

export function approveLearningOutcome(
  context: CoreCourseDesignContext,
  input: OutcomeApprovalInput,
): CoreCourseDesignContext {
  const source = context.source_learning_outcomes.find(
    (outcome) => outcome.source_outcome_id === input.source_outcome_id,
  );
  if (!source) {
    throw new PlanningError("OUTCOME_INVALID", "Unknown source Learning Outcome.");
  }
  const recommended = input.recommended_text?.trim() || proposalText(source.source_text);
  const text = input.use_source_as_is
    ? source.source_text
    : nonBlank(input.teacher_text || recommended, "approved outcome text");
  const approval_origin: OutcomeApprovalOrigin = input.use_source_as_is
    ? "SOURCE_AS_IS"
    : input.teacher_text && input.teacher_text.trim() !== recommended
      ? "TEACHER_EDITED"
      : "TEACHER_APPROVED_AI_PROPOSAL";
  const outcomeId = "outcome-" + source.source_outcome_id.replace(/^source-outcome-/u, "");
  const nextApproved = context.approved_learning_outcomes
    .filter((outcome) => !outcome.source_outcome_ids.includes(source.source_outcome_id))
    .concat([{
      outcome_id: outcomeId,
      text,
      source_outcome_ids: [source.source_outcome_id],
      source_refs: source.source_refs,
      approval_origin,
      approved_by_teacher: true,
      revision: context.revision + 1,
    }]);
  const allSourceOutcomesApproved = context.source_learning_outcomes.every((sourceOutcome) =>
    nextApproved.some((approved) => approved.source_outcome_ids.includes(sourceOutcome.source_outcome_id)),
  );
  const nextMissing = context.missing_information.filter((item) =>
    item.code !== "APPROVED_OUTCOMES_REQUIRED" || !allSourceOutcomesApproved,
  );
  return {
    ...context,
    revision: context.revision + 1,
    approved_learning_outcomes: nextApproved,
    missing_information: nextMissing,
  };
}

export function markAlignedSectionsStale(
  sections: readonly AlignedStructureSection[],
): AlignedStructureSection[] {
  return sections.map((section) => ({ ...section, alignment_status: "STALE_ALIGNMENT" }));
}

export function assertAuthorizedAlignment(
  context: CoreCourseDesignContext,
  sections: readonly AlignedStructureSection[],
): void {
  const allowed = new Set([
    ...context.learning_objectives.map((objective) => objective.objective_id),
    ...context.source_learning_outcomes.map((outcome) => outcome.source_outcome_id),
    ...context.approved_learning_outcomes.map((outcome) => outcome.outcome_id),
  ]);
  for (const section of sections) {
    for (const id of [...section.aligned_objective_ids, ...section.aligned_outcome_ids]) {
      if (!allowed.has(id)) {
        throw new PlanningError("STRUCTURE_ALIGNMENT_UNAUTHORIZED", "Structure contains an unauthorized Objective/Outcome ID.", { section_ref: section.ref, id });
      }
    }
  }
}

export function sourceRefsForOutcome(context: CoreCourseDesignContext, sourceOutcomeId: string): DesignSourceRef[] {
  return context.source_learning_outcomes.find((outcome) => outcome.source_outcome_id === sourceOutcomeId)?.source_refs ?? [];
}


export function formatCoreCourseDesignProjection(context: CoreCourseDesignContext): string {
  const parts: string[] = [
    "ROLE: Instructional Designer",
    "OPERATION: DESIGN_STRUCTURE",
    "Core Course Design Context revision " + context.revision + " is authoritative.",
  ];

  if (context.course.title?.length) parts.push("Course Title: " + context.course.title.map((f) => f.text).join(" / "));
  if (context.course.code?.length) parts.push("Course Code: " + context.course.code.map((f) => f.text).join(", "));
  if (context.course.duration?.length) parts.push("Duration: " + context.course.duration.map((f) => f.text).join(", "));
  if (context.course.learning_hours?.length) parts.push("Learning Hours: " + context.course.learning_hours.map((f) => f.text).join(", "));
  if (context.course.delivery_mode?.length) parts.push("Delivery Mode: " + context.course.delivery_mode.map((f) => f.text).join(", "));

  const learnerLevels: string[] = [];
  if (context.learner_context.education_level?.length) learnerLevels.push(...context.learner_context.education_level.map((f) => f.text));
  if (context.learner_context.year_level?.length) learnerLevels.push(...context.learner_context.year_level.map((f) => f.text));
  if (context.learner_context.target_learners?.length) learnerLevels.push(...context.learner_context.target_learners.map((f) => f.text));
  if (learnerLevels.length) parts.push("Target Learners: " + learnerLevels.join(" · "));
  if (context.learner_context.prerequisites?.length) parts.push("Prerequisites: " + context.learner_context.prerequisites.map((f) => f.text).join(", "));
  if (context.learner_context.prior_knowledge?.length) parts.push("Prior Knowledge: " + context.learner_context.prior_knowledge.map((f) => f.text).join(", "));

  parts.push("Authorized Learning Objectives:");
  for (const item of context.learning_objectives) {
    parts.push("- " + item.objective_id + ": " + item.source_text);
  }

  parts.push("Authorized source Learning Outcomes (immutable source wording):");
  for (const item of context.source_learning_outcomes) {
    parts.push("- " + item.source_outcome_id + " [" + item.measurable_status + "]: " + item.source_text);
  }

  if (context.approved_learning_outcomes?.length) {
    parts.push("Approved Learning Outcomes (authoritative):");
    for (const item of context.approved_learning_outcomes) {
      parts.push("- " + item.outcome_id + ": " + item.text);
    }
  }

  if (context.assessment_requirements?.length) {
    parts.push("Assessment Requirements:");
    for (const item of context.assessment_requirements) {
      parts.push("- " + item.text);
    }
  }

  if (context.constraints?.length) {
    parts.push("Constraints:");
    for (const item of context.constraints) {
      parts.push("- " + item.text);
    }
  }

  parts.push("No Quiz, Assignment, Activity Intent, or Moodle entity may be created in this operation.");
  return parts.join("\n");
}

export interface RebaseResult {
  rebasedSections: AlignedStructureSection[];
  ambiguousOutcomeIds: string[];
  unresolvedOutcomeIds: string[];
}

export function rebaseStructureSections(
  context: CoreCourseDesignContext,
  sections: readonly AlignedStructureSection[],
): RebaseResult {
  const approvedOutcomes = context.approved_learning_outcomes;
  const sourceToApproved = new Map<string, string[]>();

  for (const approved of approvedOutcomes) {
    for (const sourceId of approved.source_outcome_ids) {
      const list = sourceToApproved.get(sourceId) ?? [];
      list.push(approved.outcome_id);
      sourceToApproved.set(sourceId, list);
    }
  }

  const ambiguousOutcomeIds: string[] = [];
  const unresolvedOutcomeIds: string[] = [];

  const rebasedSections = sections.map((section) => {
    const nextOutcomeIds: string[] = [];
    for (const id of section.aligned_outcome_ids) {
      // If already an approved outcome ID present in current context
      if (approvedOutcomes.some((a) => a.outcome_id === id)) {
        nextOutcomeIds.push(id);
        continue;
      }
      // If a source outcome ID, check successors
      const successors = sourceToApproved.get(id);
      if (!successors || successors.length === 0) {
        // 0 approved successors: keep ID, mark unresolved
        nextOutcomeIds.push(id);
        if (!unresolvedOutcomeIds.includes(id)) unresolvedOutcomeIds.push(id);
      } else if (successors.length === 1) {
        // 1 approved successor: deterministic translation
        nextOutcomeIds.push(successors[0]!);
      } else {
        // >1 approved successors: ambiguous!
        if (!ambiguousOutcomeIds.includes(id)) ambiguousOutcomeIds.push(id);
        nextOutcomeIds.push(...successors);
      }
    }

    const isCurrent = ambiguousOutcomeIds.length === 0 && unresolvedOutcomeIds.length === 0;
    return {
      ...section,
      aligned_outcome_ids: [...new Set(nextOutcomeIds)],
      alignment_status: (isCurrent ? "CURRENT" : "STALE_ALIGNMENT") as "CURRENT" | "STALE_ALIGNMENT",
    };
  });

  return {
    rebasedSections,
    ambiguousOutcomeIds,
    unresolvedOutcomeIds,
  };
}

