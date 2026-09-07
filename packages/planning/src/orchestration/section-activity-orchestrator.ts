import type { ActivityPlan } from "@moodle-agent-poc/contracts";
import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import type { MaterialContext } from "@moodle-agent-poc/materials";
import type { CoursePlanningConstraints } from "../instructions/planning-constraints.js";
import { generateActivity, type ActivityGenerationResult } from "../generators/material-activity-generator.js";
import type { ActivityIntent, SectionStructureDraft } from "../types.js";

export type SectionActivityState =
  | "NO_ACTIVITY_REQUIRED"
  | "BLOCKED_MISSING_MATERIAL"
  | "READY_TO_GENERATE"
  | "GENERATING"
  | "GENERATED"
  | "STALE";

export interface SectionActivityDraftSummary {
  activityRef: string;
  materialSnapshotId: string;
  status: "generated" | "stale";
}

export interface ActivityDraftStore {
  save(input: { sectionRef: string; materialSnapshotId: string; activity: ActivityPlan }): Promise<void>;
}

export function determineSectionActivityState(params: {
  section: Pick<SectionStructureDraft, "activityIntents">;
  materialSnapshotId?: string;
  drafts: readonly SectionActivityDraftSummary[];
  generating: boolean;
}): SectionActivityState {
  if (params.section.activityIntents.length === 0) return "NO_ACTIVITY_REQUIRED";
  if (!params.materialSnapshotId) return "BLOCKED_MISSING_MATERIAL";
  if (params.generating) return "GENERATING";
  if (params.drafts.some((draft) => draft.status === "stale" || draft.materialSnapshotId !== params.materialSnapshotId)) return "STALE";
  const requiredRefs = new Set(params.section.activityIntents.map((intent) => intent.ref).filter((ref): ref is string => Boolean(ref)));
  const generatedRefs = new Set(params.drafts.filter((draft) => draft.status === "generated").map((draft) => draft.activityRef));
  if (requiredRefs.size > 0 && [...requiredRefs].every((ref) => generatedRefs.has(ref))) return "GENERATED";
  return "READY_TO_GENERATE";
}

export async function generateSectionActivities(params: {
  section: SectionStructureDraft;
  materialContext: MaterialContext | undefined;
  constraints: CoursePlanningConstraints;
  store: ActivityDraftStore;
  modelClient?: ModelClient;
  generate?: (intent: ActivityIntent) => Promise<ActivityGenerationResult>;
}): Promise<{ state: SectionActivityState; activities: ActivityPlan[]; blocked?: Extract<ActivityGenerationResult, { status: "blocked" }> }> {
  if (params.section.activityIntents.length === 0) return { state: "NO_ACTIVITY_REQUIRED", activities: [] };
  if (!params.materialContext) return { state: "BLOCKED_MISSING_MATERIAL", activities: [] };

  const generated: ActivityPlan[] = [];
  if (!params.generate && !params.modelClient) throw new Error("A modelClient is required when generate is not injected.");
  const generateOne = params.generate ?? ((intent) => generateActivity({
    modelClient: params.modelClient!,
    section: params.section,
    intent,
    materialContext: params.materialContext!,
    constraints: params.constraints,
  }));

  for (const intent of params.section.activityIntents) {
    const result = await generateOne(intent);
    if (result.status === "blocked") {
      return { state: "BLOCKED_MISSING_MATERIAL", activities: generated, blocked: result };
    }
    generated.push(result.activity);
    await params.store.save({ sectionRef: params.section.ref, materialSnapshotId: params.materialContext.snapshotId, activity: result.activity });
  }
  return { state: "GENERATED", activities: generated };
}
