import type { ActivityPlan } from "@moodle-agent-poc/contracts";
import type { MaterialContext } from "@moodle-agent-poc/materials";
import { describe, expect, it } from "vitest";
import type { ActivityIntent, SectionStructureDraft } from "../src/types.js";
import { determineSectionActivityState, generateSectionActivities, type ActivityDraftStore } from "../src/orchestration/section-activity-orchestrator.js";

const section: SectionStructureDraft = {
  ref: "section-01", position: 1, title: "Week 1", summary: "Basics", source_refs: [], activityIntents: [
    { ref: "assignment-01", type: "assignment", title: "Lab", source_refs: [], origin: "syllabus" },
    { ref: "quiz-01", type: "quiz", title: "Quiz", source_refs: [], origin: "syllabus" },
  ],
};
const context: MaterialContext = { snapshotId: "snapshot-1", sectionRef: "section-01", text: "Material", sourceRefs: [{ source: "lecture.md", section: "section-01" }], estimatedTokens: 2 };
const assignment: ActivityPlan = { ref: "assignment-01", type: "assignment", title: "Lab", description: "Do it", instructions: ["Submit"], learning_objectives: ["Learn"], grade: 100, source_refs: context.sourceRefs };

describe("Section activity orchestration", () => {
  it("derives deterministic completion states", () => {
    expect(determineSectionActivityState({ section, materialSnapshotId: undefined, drafts: [], generating: false })).toBe("BLOCKED_MISSING_MATERIAL");
    expect(determineSectionActivityState({ section: { ...section, activityIntents: [] }, materialSnapshotId: undefined, drafts: [], generating: false })).toBe("NO_ACTIVITY_REQUIRED");
    expect(determineSectionActivityState({ section, materialSnapshotId: "snapshot-1", drafts: [], generating: false })).toBe("READY_TO_GENERATE");
    expect(determineSectionActivityState({ section, materialSnapshotId: "snapshot-1", drafts: [{ activityRef: "assignment-01", materialSnapshotId: "snapshot-1", status: "generated" }, { activityRef: "quiz-01", materialSnapshotId: "snapshot-1", status: "generated" }], generating: false })).toBe("GENERATED");
    expect(determineSectionActivityState({ section, materialSnapshotId: "snapshot-2", drafts: [{ activityRef: "assignment-01", materialSnapshotId: "snapshot-1", status: "generated" }], generating: false })).toBe("STALE");
  });

  it("generates intents sequentially and persists completed drafts immediately", async () => {
    const calls: string[] = [];
    const persisted: string[] = [];
    const store: ActivityDraftStore = { save: async ({ activity }) => { persisted.push(activity.ref); } };
    const result = await generateSectionActivities({
      section,
      materialContext: context,
      constraints: { activityRules: [], warnings: [] },
      store,
      generate: async (intent: ActivityIntent) => {
        calls.push(intent.ref!);
        return { status: "generated", activity: intent.type === "assignment" ? assignment : { ...assignment, ref: "quiz-01", type: "quiz", description: "Quiz" } as ActivityPlan };
      },
    });
    expect(calls).toEqual(["assignment-01", "quiz-01"]);
    expect(persisted).toEqual(["assignment-01", "quiz-01"]);
    expect(result.state).toBe("GENERATED");
  });
});
