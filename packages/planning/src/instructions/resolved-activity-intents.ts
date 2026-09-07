import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import type { ActivityRule, CoursePlanningConstraints } from "./planning-constraints.js";
import { resolveActivityRuleScopes } from "../validators/teacher-constraint-validator.js";
import type { ActivityIntent, SectionStructureDraft } from "../types.js";

function appliesToSection(rule: ActivityRule, section: SectionStructureDraft, scopes: ReadonlyMap<ActivityRule, ReadonlySet<number>>): boolean {
  if (rule.scope === "specific_sections") return scopes.get(rule)?.has(section.position) ?? false;
  if (rule.scope === "every_n_sections") return Boolean(rule.interval && section.position % rule.interval === 0);
  return true;
}

function assignDeterministicRefs(sections: readonly SectionStructureDraft[]): SectionStructureDraft[] {
  const used = new Set<string>();
  const nextByType = new Map<ActivityIntent["type"], number>();
  return sections.map((section) => ({
    ...section,
    activityIntents: section.activityIntents.map((intent) => {
      let ref = intent.ref;
      if (ref && !used.has(ref)) {
        used.add(ref);
        return { ...intent, ref };
      }
      let next = nextByType.get(intent.type) ?? 1;
      do {
        ref = `${intent.type}-${String(next).padStart(2, "0")}`;
        next += 1;
      } while (used.has(ref));
      nextByType.set(intent.type, next);
      used.add(ref);
      return { ...intent, ref };
    }),
  }));
}

/**
 * Resolves teacher instructions into immutable expected activity identities.
 * This runs after structure planning and before material generation, so neither
 * Learning Material nor the model decides whether a teacher-requested activity exists.
 */
export function resolveActivityIntentsForStructure(
  sections: readonly SectionStructureDraft[],
  constraints: CoursePlanningConstraints,
  syllabus: NormalizedSyllabus,
): SectionStructureDraft[] {
  const scopes = resolveActivityRuleScopes(constraints.activityRules, sections, syllabus);
  const resolved = sections.map((section) => {
    const intents: ActivityIntent[] = section.activityIntents
      .filter((intent) => intent.origin === "syllabus")
      .map((intent) => ({ ...intent }));
    for (const rule of constraints.activityRules) {
      if (!appliesToSection(rule, section, scopes)) continue;
      const count = rule.activityCount ?? 1;
      for (let index = 0; index < count; index += 1) {
        const label = rule.activityType === "quiz" ? "Quiz" : "Assignment";
        intents.push({
          type: rule.activityType,
          title: `${label}${count > 1 ? ` ${index + 1}` : ""}: ${section.title}`,
          source_refs: [],
          origin: "teacher_instruction",
        });
      }
    }
    return { ...section, activityIntents: intents };
  });
  return assignDeterministicRefs(resolved);
}
