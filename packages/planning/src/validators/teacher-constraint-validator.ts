import type { ActivityPlan, CoursePlanContent, MultipleChoiceQuestionPlan, NormalizedSyllabus, SectionPlan } from "@moodle-agent-poc/contracts";
import type { ActivityRule, CoursePlanningConstraints } from "../instructions/planning-constraints.js";
import { buildSectionGrounding } from "../grounding/section-grounding.js";
import { sourceReferenceKeys } from "../grounding/source-reference.js";

export type ActivityRuleScopeMap = ReadonlyMap<ActivityRule, ReadonlySet<number>>;
export type TeacherActivityRefMap = ReadonlyMap<string, ReadonlySet<string>>;

type SectionTarget = { ref: string; position: number; title: string; source_refs?: readonly { source: string; page?: number; section?: string; text?: string }[] };

type SectionWithActivityIntents = {
  ref: string;
  activityIntents: readonly { ref?: string; origin: "syllabus" | "teacher_instruction" }[];
};

export function buildTeacherActivityRefMap(sections: readonly SectionWithActivityIntents[]): TeacherActivityRefMap {
  return new Map(sections.map((section) => [
    section.ref,
    new Set(section.activityIntents.filter((intent) => intent.origin === "teacher_instruction" && intent.ref).map((intent) => intent.ref!)),
  ]));
}

function semanticAnchorMatches(value: string, anchor: string): boolean {
  const normalizedValue = value.trim().toLocaleLowerCase();
  const normalizedAnchor = anchor.trim().toLocaleLowerCase();
  if (normalizedValue.includes(normalizedAnchor)) return true;
  const valueWeek = normalizedValue.match(/(?:week|สัปดาห์)\s*(?:ที่\s*)?(\d+)/iu);
  const anchorWeek = normalizedAnchor.match(/(?:week|สัปดาห์)\s*(?:ที่\s*)?(\d+)/iu);
  return valueWeek?.[1] !== undefined && valueWeek[1] === anchorWeek?.[1];
}

function matchesSemanticAnchor(rule: ActivityRule, section: SectionTarget, syllabus: NormalizedSyllabus): boolean {
  const anchors = rule.anchors ?? [];
  const title = section.title.trim().toLocaleLowerCase();
  if (anchors.some((anchor) => semanticAnchorMatches(title, anchor))) return true;
  return anchors.some((anchor) => buildSectionGrounding(syllabus, section, { allowPositionFallback: false }).scheduleItems.some((item) => item.week_or_unit ? semanticAnchorMatches(item.week_or_unit, anchor) : false));
}

export function resolveActivityRuleScopes(
  rules: readonly ActivityRule[],
  sections: readonly SectionTarget[],
  syllabus: NormalizedSyllabus,
): ActivityRuleScopeMap {
  const scopes = new Map<ActivityRule, ReadonlySet<number>>();
  for (const rule of rules) {
    if (rule.scope !== "specific_sections") continue;
    const semanticPositions = sections.filter((section) => matchesSemanticAnchor(rule, section, syllabus)).map((section) => section.position);
    const positions = semanticPositions.length > 0
      ? semanticPositions
      : (rule.sectionPositions ?? []).filter((position) => sections.some((section) => section.position === position));
    scopes.set(rule, new Set(positions));
  }
  return scopes;
}

export interface TeacherConstraintViolation {
  code: "TEACHER_CONSTRAINT_VIOLATION";
  section_ref: string;
  constraint: string;
  expected: number | string;
  actual: number | string;
}

function applies(rule: ActivityRule, section: SectionPlan, index: number, syllabus?: NormalizedSyllabus, ruleScopes?: ActivityRuleScopeMap): boolean {
  if (rule.scope === "specific_sections") {
    if (ruleScopes?.has(rule)) return ruleScopes.get(rule)?.has(section.position) ?? false;
    if (rule.sectionPositions?.includes(section.position)) return true;
    const anchors = rule.anchors ?? [];
    if (anchors.some((anchor) => semanticAnchorMatches(section.title, anchor))) return true;
    return syllabus
      ? anchors.some((anchor) => buildSectionGrounding(syllabus, section, { allowPositionFallback: false }).scheduleItems.some((item) => item.week_or_unit ? semanticAnchorMatches(item.week_or_unit, anchor) : false))
      : false;
  }
  if (rule.scope === "every_n_sections") return Boolean(rule.interval && section.position % rule.interval === 0);
  return true;
}

export function validateActivityConstraints(
  section: SectionPlan,
  constraints: CoursePlanningConstraints,
  sectionIndex = Math.max(0, section.position - 1),
  syllabus?: NormalizedSyllabus,
  ruleScopes?: ActivityRuleScopeMap,
  teacherActivityRefs?: TeacherActivityRefMap,
): TeacherConstraintViolation[] {
  const violations: TeacherConstraintViolation[] = [];
  for (const rule of constraints.activityRules) {
    if (!applies(rule, section, sectionIndex, syllabus, ruleScopes)) continue;
    const ownedRefs = teacherActivityRefs?.get(section.ref);
    const activities = section.activities.filter((activity) =>
      activity.type === rule.activityType && (ownedRefs === undefined || ownedRefs.has(activity.ref)),
    );
    const expectedActivityCount = rule.activityCount ?? 0;
    if (activities.length !== expectedActivityCount) {
      violations.push({ code: "TEACHER_CONSTRAINT_VIOLATION", section_ref: section.ref, constraint: "activity_count", expected: expectedActivityCount, actual: activities.length });
      continue;
    }
    for (const activity of activities) {
      if (activity.type !== "quiz") continue;
      if (rule.questionsPerActivity !== undefined && activity.questions.length !== rule.questionsPerActivity) {
        violations.push({ code: "TEACHER_CONSTRAINT_VIOLATION", section_ref: section.ref, constraint: "questions_per_activity", expected: rule.questionsPerActivity, actual: activity.questions.length });
      }
      for (const question of activity.questions) {
        if (rule.questionType && question.type !== rule.questionType) {
          violations.push({ code: "TEACHER_CONSTRAINT_VIOLATION", section_ref: section.ref, constraint: "question_type", expected: rule.questionType, actual: question.type });
        }
        if (rule.choicesPerQuestion !== undefined && question.type === "multichoice" && question.choices.length !== rule.choicesPerQuestion) {
          violations.push({ code: "TEACHER_CONSTRAINT_VIOLATION", section_ref: section.ref, constraint: "choices_per_question", expected: rule.choicesPerQuestion, actual: question.choices.length });
        }
        if (rule.correctChoicesPerQuestion !== undefined && question.type === "multichoice" && question.correct_choice_refs.length !== rule.correctChoicesPerQuestion) {
          violations.push({ code: "TEACHER_CONSTRAINT_VIOLATION", section_ref: section.ref, constraint: "correct_choices_per_question", expected: rule.correctChoicesPerQuestion, actual: question.correct_choice_refs.length });
        }
      }
    }
  }
  return violations;
}

export function validateCourseActivityConstraints(content: CoursePlanContent, constraints: CoursePlanningConstraints, syllabus?: NormalizedSyllabus, ruleScopes?: ActivityRuleScopeMap, teacherActivityRefs?: TeacherActivityRefMap): TeacherConstraintViolation[] {
  const resolvedRuleScopes = ruleScopes ?? (syllabus ? resolveActivityRuleScopes(constraints.activityRules, content.sections, syllabus) : undefined);
  return content.sections.flatMap((section, index) => validateActivityConstraints(section, constraints, index, syllabus, resolvedRuleScopes, teacherActivityRefs));
}

/**
 * Validates only the shape of one generated activity. Aggregate activity-count
 * checks belong to validateCourseActivityConstraints after every intent exists.
 */
export function validateActivityShapeConstraints(
  section: SectionPlan,
  activity: ActivityPlan,
  constraints: CoursePlanningConstraints,
  syllabus?: NormalizedSyllabus,
  ruleScopes?: ActivityRuleScopeMap,
): TeacherConstraintViolation[] {
  const violations: TeacherConstraintViolation[] = [];
  for (const rule of constraints.activityRules) {
    if (rule.activityType !== activity.type || !applies(rule, section, Math.max(0, section.position - 1), syllabus, ruleScopes)) continue;
    if (activity.type !== "quiz") continue;
    if (rule.questionsPerActivity !== undefined && activity.questions.length !== rule.questionsPerActivity) {
      violations.push({ code: "TEACHER_CONSTRAINT_VIOLATION", section_ref: section.ref, constraint: "questions_per_activity", expected: rule.questionsPerActivity, actual: activity.questions.length });
    }
    for (const question of activity.questions) {
      if (rule.questionType && question.type !== rule.questionType) {
        violations.push({ code: "TEACHER_CONSTRAINT_VIOLATION", section_ref: section.ref, constraint: "question_type", expected: rule.questionType, actual: question.type });
      }
      if (rule.choicesPerQuestion !== undefined && question.type === "multichoice" && question.choices.length !== rule.choicesPerQuestion) {
        violations.push({ code: "TEACHER_CONSTRAINT_VIOLATION", section_ref: section.ref, constraint: "choices_per_question", expected: rule.choicesPerQuestion, actual: question.choices.length });
      }
      if (rule.correctChoicesPerQuestion !== undefined && question.type === "multichoice" && question.correct_choice_refs.length !== rule.correctChoicesPerQuestion) {
        violations.push({ code: "TEACHER_CONSTRAINT_VIOLATION", section_ref: section.ref, constraint: "correct_choices_per_question", expected: rule.correctChoicesPerQuestion, actual: question.correct_choice_refs.length });
      }
    }
  }
  return violations;
}

export function validateSectionActivityProvenance(
  section: SectionPlan,
  allowlist: ReadonlySet<string> | undefined,
  requireGranularLocation = false,
): TeacherConstraintViolation[] {
  if (!allowlist || allowlist.size === 0) return [];
  const violations: TeacherConstraintViolation[] = [];
  const hasGranularLocations = allowlist.size > 1;
  const check = (sourceRefs: readonly { source: string; page?: number; section?: string }[], location: string) => {
    for (const ref of sourceRefs) {
      const keys = sourceReferenceKeys(ref);
      const granularKeys = keys.filter((key) => key !== ref.source);
      if (!keys.some((key) => allowlist.has(key)) ||
        (hasGranularLocations && (ref.page === undefined && ref.section === undefined)) ||
        (requireGranularLocation && hasGranularLocations && !granularKeys.some((key) => allowlist.has(key)))) {
        violations.push({
          code: "TEACHER_CONSTRAINT_VIOLATION",
          section_ref: section.ref,
          constraint: "section_specific_provenance",
          expected: location,
          actual: `${ref.source}${ref.section ? `::${ref.section}` : ref.page !== undefined ? `::page::${ref.page}` : ""}`,
        });
      }
    }
  };
  for (const activity of section.activities) {
    check(activity.source_refs, `activity ${activity.ref}`);
    if (activity.type === "quiz") {
      for (const question of activity.questions) check(question.source_refs, `question ${question.ref}`);
    }
  }
  return violations;
}
