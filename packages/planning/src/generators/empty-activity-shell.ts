import type { ActivityPlan } from "@moodle-agent-poc/contracts";
import { activityDefaultPolicy, type ActivityDefaultPolicy } from "../instructions/activity-default-policy.js";

export function createEmptyActivityShell(intent: { ref: string; type: "quiz" | "assignment"; title: string; status: string }, confirmed: boolean, policy: ActivityDefaultPolicy = activityDefaultPolicy()): ActivityPlan {
  if (intent.status !== "insufficient_evidence" || confirmed !== true) throw new Error("An empty shell requires explicit confirmation of an insufficient-evidence intent.");
  const base = { ref: intent.ref, title: intent.title, description: "Content pending teacher input.", source_refs: [] };
  return intent.type === "quiz" ? { ...base, type: "quiz", questions: [] } : {
    ...base, type: "assignment", instructions: ["To be provided by teacher."], learning_objectives: ["To be provided by teacher."], grade: policy.assignmentGrade,
  };
}
