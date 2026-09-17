export interface MappingActivity {
  id: string;
  status: string;
  outcomeIds: readonly string[];
  intentRevision: number;
  activityRevision: number;
}
export interface MappingCompetency {
  id: string;
  status: string;
  outcomeIds: readonly string[];
  revision: number;
}
export interface CompetencyMapping {
  activityId: string;
  competencyId: string;
  sharedOutcomeIds: string[];
  intentRevision: number;
  activityRevision: number;
  competencyRevision: number;
  mapping: "PROPOSED" | "CONFIRMED" | "DECLINED" | "STALE";
  evidence: "UNDECIDED" | "CONFIRMED" | "DECLINED" | "STALE";
}
/** Alignment produces proposals only. Purpose never grants evidence authority. */
export function deriveCompetencyMappings(input: {
  approvedOutcomeIds: readonly string[];
  activities: readonly MappingActivity[];
  competencies: readonly MappingCompetency[];
}): CompetencyMapping[] {
  const approved = new Set(input.approvedOutcomeIds);
  const result: CompetencyMapping[] = [];
  for (const activity of input.activities) {
    if (activity.status !== "generated") continue;
    for (const competency of input.competencies) {
      if (competency.status !== "APPROVED") continue;
      const sharedOutcomeIds = [...new Set(activity.outcomeIds.filter(id => approved.has(id) && competency.outcomeIds.includes(id)))].sort();
      if (!sharedOutcomeIds.length) continue;
      result.push({ activityId: activity.id, competencyId: competency.id, sharedOutcomeIds,
        intentRevision: activity.intentRevision, activityRevision: activity.activityRevision,
        competencyRevision: competency.revision, mapping: "PROPOSED", evidence: "UNDECIDED" });
    }
  }
  return result.sort((a, b) => a.activityId.localeCompare(b.activityId) || a.competencyId.localeCompare(b.competencyId));
}

export function reconcileCompetencyMapping(saved: CompetencyMapping, current: CompetencyMapping | undefined): CompetencyMapping {
  const changed = !current || saved.intentRevision !== current.intentRevision || saved.activityRevision !== current.activityRevision
    || saved.competencyRevision !== current.competencyRevision
    || JSON.stringify(saved.sharedOutcomeIds) !== JSON.stringify(current.sharedOutcomeIds);
  return changed ? { ...saved, mapping: "STALE", evidence: "STALE" } : { ...saved };
}

export function decideCompetencyMapping(current: CompetencyMapping, kind: "mapping" | "evidence", decision: "CONFIRMED" | "DECLINED"): CompetencyMapping {
  if (kind !== "mapping" && kind !== "evidence" || decision !== "CONFIRMED" && decision !== "DECLINED") throw new Error("Invalid mapping decision.");
  if (kind === "evidence") {
    if (current.mapping !== "CONFIRMED") throw new Error("Confirm the current mapping before deciding evidence eligibility.");
    return { ...current, evidence: decision };
  }
  return { ...current, mapping: decision, evidence: decision === current.mapping ? current.evidence : "UNDECIDED" };
}
