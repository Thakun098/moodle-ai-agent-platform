import type { NormalizedSyllabus, SourceReference } from "@moodle-agent-poc/contracts";
import type { MaterialContext } from "@moodle-agent-poc/materials";
import { buildSectionGrounding, type SectionGroundingTarget } from "./section-grounding.js";
import { activityDefaultPolicy, type ActivityDefaultPolicy } from "../instructions/activity-default-policy.js";

export type ActivityGroundingMode = "MATERIAL_GROUNDED" | "SYLLABUS_GROUNDED" | "SYLLABUS_SCOPED_AI" | "INSUFFICIENT_EVIDENCE";
export interface ActivityGenerationContext {
  mode: ActivityGroundingMode;
  sectionRef: string;
  text: string;
  sourceRefs: SourceReference[];
  reviewRequired: boolean;
  allowScopedModelKnowledge: boolean;
  materialSnapshotId?: string;
}

function meaningful(text: string): boolean {
  const scope = text.replace(/(?:week|unit|topic|module|section|สัปดาห์|หน่วย|บท|หัวข้อ)\s*(?:ที่\s*)?\d*/giu, "").replace(/[\d\s:.,()\-–—]/gu, "");
  return scope.length >= 3;
}

/** Resolves authority before any model call; never fabricates a snapshot for syllabus sources. */
export function resolveActivityGrounding(section: SectionGroundingTarget, syllabus: NormalizedSyllabus, material?: MaterialContext, policy: ActivityDefaultPolicy = activityDefaultPolicy()): ActivityGenerationContext {
  if (material) {
    if (material.sectionRef !== section.ref || !material.text.trim() || !material.sourceRefs.length) throw new Error("Current material context is invalid for this section.");
    return { mode: "MATERIAL_GROUNDED", sectionRef: section.ref, text: material.text, sourceRefs: [...material.sourceRefs], reviewRequired: false, allowScopedModelKnowledge: false, materialSnapshotId: material.snapshotId };
  }
  // Do not use a position fallback or teacher-authored source hints as evidence.
  const grounding = buildSectionGrounding(syllabus, { ref: section.ref, position: section.position, title: section.title, source_refs: [] }, { allowPositionFallback: false });
  const items = grounding.scheduleItems;
  const text = items.map((item) => [item.title, ...item.topics].join("\n")).join("\n\n");
  const hasScope = items.some((item) => [item.title, ...item.topics].some(meaningful));
  if (!hasScope) return { mode: "INSUFFICIENT_EVIDENCE", sectionRef: section.ref, text: "", sourceRefs: [], reviewRequired: false, allowScopedModelKnowledge: false };
  const detail = items.flatMap((item) => item.topics).join("\n").trim();
  const direct = detail.length >= policy.syllabusDetailThreshold;
  return { mode: direct ? "SYLLABUS_GROUNDED" : "SYLLABUS_SCOPED_AI", sectionRef: section.ref, text, sourceRefs: [...grounding.sourceRefs], reviewRequired: !direct, allowScopedModelKnowledge: !direct };
}
