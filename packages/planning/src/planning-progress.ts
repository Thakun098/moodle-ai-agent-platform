export type PlanningStage =
  | "normalizing_syllabus"
  | "interpreting_teacher_instruction"
  | "planning_structure"
  | "generating_activities"
  | "assembling_plan"
  | "validating_teacher_constraints"
  | "validating_contract"
  | "ready_for_preview";

export interface PlanningProgress {
  stage: PlanningStage;
  completedChunks?: number;
  totalChunks?: number;
  completedSections?: number;
  totalSections?: number;
  currentSectionRefs?: string[];
}

const progressByRun = new Map<string, PlanningProgress>();

export function setPlanningProgress(runId: string | undefined, progress: PlanningProgress): void {
  if (runId) progressByRun.set(runId, { ...progress, ...(progress.currentSectionRefs ? { currentSectionRefs: [...progress.currentSectionRefs] } : {}) });
}

export function getPlanningProgress(runId: string): PlanningProgress | undefined {
  const progress = progressByRun.get(runId);
  return progress ? { ...progress, ...(progress.currentSectionRefs ? { currentSectionRefs: [...progress.currentSectionRefs] } : {}) } : undefined;
}

export function clearPlanningProgress(runId: string | undefined): void {
  if (runId) progressByRun.delete(runId);
}
