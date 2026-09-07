import type {
  AssignmentPlan,
  CoursePlanContent,
  NormalizedSyllabus,
  PlanEnvelope,
  QuestionPlan,
  QuizUpdateContent,
  SourceReference,
} from "@moodle-agent-poc/contracts";
import { PlanningError } from "../errors/planning-errors.js";
import { normalizeSourceReference, sourceReferenceFromSyllabusItem, sourceReferenceKeys } from "../grounding/source-reference.js";

export function buildProvenanceAllowlist(
  syllabus: NormalizedSyllabus
): Set<string> {
  const allowlist = new Set<string>();
  const filename = syllabus.metadata.filename;

  // Base filename is always allowed
  allowlist.add(filename);

  // Add the canonical source-qualified locations and the semantic syllabus labels.
  for (const item of syllabus.schedule_or_topics) {
    for (const key of sourceReferenceKeys(sourceReferenceFromSyllabusItem(syllabus, item))) allowlist.add(key);
    if (item.week_or_unit) {
      allowlist.add(`${filename}::section::${item.week_or_unit}`);
      if (item.title) {
        allowlist.add(`${filename}::section::[${item.week_or_unit}] ${item.title}`);
        allowlist.add(`${filename}::section::${item.week_or_unit}: ${item.title}`);
        allowlist.add(`${filename}::section::${item.week_or_unit} - ${item.title}`);
      }
    }
    if (item.title) {
      allowlist.add(`${filename}::section::${item.title}`);
    }

    if (item.source) {
      if (item.source.kind === "line") {
        // Location aliases are normalized by validateSourceReferences.
      }
    }
  }

  return allowlist;
}

export function buildProvenanceAllowlistFromSources(
  sources: readonly SourceReference[]
): Set<string> {
  const allowlist = new Set<string>();

  for (const src of sources) {
    if (!src || !src.source) continue;
    allowlist.add(src.source);

    for (const key of sourceReferenceKeys(src)) allowlist.add(key);
  }

  return allowlist;
}

export function validateSourceReferences(
  sourceRefs: readonly SourceReference[] | undefined,
  allowlist?: ReadonlySet<string>
): void {
  if (!sourceRefs || sourceRefs.length === 0 || !allowlist) {
    return;
  }

  for (const ref of sourceRefs) {
    const normalizedRef = normalizeSourceReference(ref);
    // 1. Filename must match allowlist (R11)
    if (!allowlist.has(normalizedRef.source)) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `SourceReference source "${normalizedRef.source}" is not among the grounded source locations.`
      );
    }

    // 2. If page is supplied, check source-qualified allowlist key
    if (normalizedRef.page !== undefined) {
      const pageKey = `${normalizedRef.source}::page::${normalizedRef.page}`;
      if (!allowlist.has(pageKey)) {
        throw new PlanningError(
          "PLAN_DOMAIN_INVALID",
          `SourceReference page ${normalizedRef.page} for "${normalizedRef.source}" is not among the grounded source locations.`
        );
      }
    }

    // 3. If section is supplied, check source-qualified allowlist key
    if (normalizedRef.section !== undefined) {
      const sectionKey = `${normalizedRef.source}::section::${normalizedRef.section}`;
      if (!allowlist.has(sectionKey)) {
        throw new PlanningError(
          "PLAN_DOMAIN_INVALID",
          `SourceReference section "${normalizedRef.section}" for "${normalizedRef.source}" is not among the grounded source locations.`
        );
      }
    }
  }
}

export function validateQuestionsDomain(
  questions: readonly QuestionPlan[],
  allowlist?: ReadonlySet<string>,
  globalQuestionRefs?: Set<string>
): void {
  const localRefs = new Set<string>();

  for (const q of questions) {
    // Question ref uniqueness within local quiz
    if (localRefs.has(q.ref)) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Duplicate question ref "${q.ref}" within quiz plan.`
      );
    }
    localRefs.add(q.ref);

    // Question ref uniqueness globally across course plan (R5)
    if (globalQuestionRefs) {
      if (globalQuestionRefs.has(q.ref)) {
        throw new PlanningError(
          "PLAN_DOMAIN_INVALID",
          `Duplicate question ref "${q.ref}" across course plan.`
        );
      }
      globalQuestionRefs.add(q.ref);
    }

    // Validate question-level source references (R4)
    validateSourceReferences(q.source_refs, allowlist);

    if (q.type === "multichoice") {
      const choiceRefs = new Set(q.choices.map((c) => c.ref));
      if (choiceRefs.size !== q.choices.length) {
        throw new PlanningError(
          "PLAN_DOMAIN_INVALID",
          `Multiple choice question "${q.ref}" contains duplicate choice refs.`
        );
      }
      for (const correctRef of q.correct_choice_refs) {
        if (!choiceRefs.has(correctRef)) {
          throw new PlanningError(
            "PLAN_DOMAIN_INVALID",
            `Multiple choice question "${q.ref}" references non-existent choice ref "${correctRef}" in correct_choice_refs.`
          );
        }
      }
    }
  }
}

export function validatePlanningDomainInvariants(
  envelope: PlanEnvelope<any, any, any>,
  allowlist?: Set<string>,
  sectionAllowlists?: ReadonlyMap<string, ReadonlySet<string>>,
  activityAllowlists?: ReadonlyMap<string, ReadonlySet<string>>,
  shellActivityRefs?: ReadonlySet<string>,
): void {
  if (envelope.plan_type === "course") {
    if (envelope.operation !== "create") {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `CoursePlanner must produce operation "create", received "${envelope.operation}".`
      );
    }

    const content = envelope.content as unknown as CoursePlanContent;
    if (!content || !Array.isArray(content.sections) || content.sections.length === 0) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        "Course plan must contain at least one section."
      );
    }

    const sectionRefs = new Set<string>();
    const sectionPositions = new Set<number>();
    const activityRefs = new Set<string>();
    const globalQuestionRefs = new Set<string>(); // R5

    for (const section of content.sections) {
      // Unique section refs
      if (sectionRefs.has(section.ref)) {
        throw new PlanningError(
          "PLAN_DOMAIN_INVALID",
          `Duplicate section ref "${section.ref}" in course plan.`
        );
      }
      sectionRefs.add(section.ref);

      // Section positions > 0 and unique (Correction 5: no contiguous constraint)
      if (typeof section.position !== "number" || section.position <= 0) {
        throw new PlanningError(
          "PLAN_DOMAIN_INVALID",
          `Section position must be a positive integer, received ${section.position} for section "${section.ref}".`
        );
      }
      if (sectionPositions.has(section.position)) {
        throw new PlanningError(
          "PLAN_DOMAIN_INVALID",
          `Duplicate section position ${section.position} for section "${section.ref}".`
        );
      }
      sectionPositions.add(section.position);

      // Source refs check
      validateSourceReferences(section.source_refs, allowlist);

      // Activities check
      if (Array.isArray(section.activities)) {
        const sectionAllowlist = sectionAllowlists?.get(section.ref);
        const validateActivitySources = (sourceRefs: readonly SourceReference[], label: string, scopedAllowlist: ReadonlySet<string> | undefined = sectionAllowlist ?? allowlist) => {
          validateSourceReferences(sourceRefs, scopedAllowlist);
          if (!scopedAllowlist || scopedAllowlist.size <= 1) return;
          for (const ref of sourceRefs) {
            const keys = sourceReferenceKeys(ref);
            if (ref.page === undefined && ref.section === undefined) {
              throw new PlanningError(
                "PLAN_DOMAIN_INVALID",
                `Activity source reference for ${label} must identify a section-specific page or section location.`,
              );
            }
            const granularKeys = keys.filter((key) => key !== ref.source);
            if (!granularKeys.some((key) => scopedAllowlist.has(key))) {
              throw new PlanningError(
                "PLAN_DOMAIN_INVALID",
                `Activity source reference for ${label} is not authorized for section "${section.ref}".`,
              );
            }
          }
        };
        for (const act of section.activities) {
          if (activityRefs.has(act.ref)) {
            throw new PlanningError(
              "PLAN_DOMAIN_INVALID",
              `Duplicate activity ref "${act.ref}" across course plan.`
            );
          }
          activityRefs.add(act.ref);

          const isShell = shellActivityRefs?.has(act.ref) ?? false;
          const activityAllowlist = activityAllowlists?.get(act.ref) ?? sectionAllowlist ?? allowlist;
          if (!isShell) validateActivitySources(act.source_refs, `activity "${act.ref}"`, activityAllowlist);

          if (act.type === "quiz") {
            validateQuestionsDomain(act.questions, isShell ? undefined : activityAllowlist, globalQuestionRefs);
            if (!isShell) {
              for (const question of act.questions) {
                validateActivitySources(question.source_refs, `question "${question.ref}"`, activityAllowlist);
              }
            }
          }
        }
      }
    }
  } else if (envelope.plan_type === "assignment") {
    if (envelope.operation !== "update") {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `AssignmentPlanner must produce operation "update", received "${envelope.operation}".`
      );
    }

    const content = envelope.content as unknown as AssignmentPlan;
    if (content && content.source_refs) {
      validateSourceReferences(content.source_refs, allowlist);
    }
  } else if (envelope.plan_type === "quiz") {
    if (envelope.operation !== "update") {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `QuizPlanner must produce operation "update", received "${envelope.operation}".`
      );
    }

    const content = envelope.content as unknown as QuizUpdateContent;
    if (content) {
      if (content.source_refs) {
        validateSourceReferences(content.source_refs, allowlist);
      }

      const addList = content.questions_to_add || [];
      const updateList = content.questions_to_update || [];

      // R6: Disjoint check between questions_to_add and questions_to_update
      const addRefs = new Set(addList.map((q) => q.ref));
      for (const q of updateList) {
        if (addRefs.has(q.ref)) {
          throw new PlanningError(
            "PLAN_DOMAIN_INVALID",
            `Question ref "${q.ref}" cannot appear in both questions_to_add and questions_to_update.`
          );
        }
      }

      if (addList.length > 0) {
        validateQuestionsDomain(addList, allowlist);
      }
      if (updateList.length > 0) {
        validateQuestionsDomain(updateList, allowlist);
      }
    }
  }
}
