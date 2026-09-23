import { createHash } from "node:crypto";
import type { CompetencyMappingReviewRepository, MappingReviewSources } from "@moodle-agent-poc/agent-runtime";
import { decideCompetencyMapping, deriveCompetencyMappings, type CompetencyMapping } from "@moodle-agent-poc/planning";

export interface CompetencyMappingReviewEntry extends CompetencyMapping {
  sourceKey: string;
  available: boolean;
  activityRef: string;
  activityTitle: string;
  competencyTitle: string;
  outcomes: { id: string; text: string }[];
  decidedBy?: number;
  decidedAt?: string;
}

export interface CompetencyMappingDecisionRequest {
  activity_id: string;
  competency_id: string;
  kind: "mapping" | "evidence";
  decision: "CONFIRMED" | "DECLINED";
  confirmed: true;
  expected_revision: number;
  teacher_id: number;
}

function key(pair: Pick<CompetencyMapping, "activityId" | "competencyId">): string {
  return JSON.stringify([pair.activityId, pair.competencyId]);
}

export function competencyMappingSignature(value: unknown): string {
  function sorted(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, item]) => [k, sorted(item)]));
    }
    return v;
  }
  return createHash("sha256").update(JSON.stringify(sorted(value))).digest("hex");
}

export function deriveCompetencyMappingReviewEntries(sources: MappingReviewSources): CompetencyMappingReviewEntry[] {
  const context = sources.context;
  if (!context || !sources.structureRevision) return [];
  const activities = sources.activities.filter((activity) =>
    activity.structureRevision === sources.structureRevision
    && activity.contextRevision === context.revision
    && activity.contentJson
    && (activity.groundingMode !== "MATERIAL_GROUNDED" || activity.materialSnapshotId === sources.materialIds[activity.sectionRef])
  );
  return deriveCompetencyMappings({
    approvedOutcomeIds: context.approved_learning_outcomes.map((outcome) => outcome.outcome_id),
    activities: activities.map((activity) => ({
      id: activity.id,
      status: activity.status,
      outcomeIds: activity.selectedOutcomeIdsJson,
      intentRevision: activity.intentRevision,
      activityRevision: activity.activityRevision,
    })),
    competencies: sources.competencies.map((competency) => ({
      id: competency.candidateId,
      status: competency.status,
      outcomeIds: competency.derivedFromOutcomeIdsJson,
      revision: competency.revision,
    })),
  }).map((pair) => {
    const activity = activities.find((candidate) => candidate.id === pair.activityId)!;
    const competency = sources.competencies.find((candidate) => candidate.candidateId === pair.competencyId)!;
    const outcomes = context.approved_learning_outcomes.filter((outcome) => pair.sharedOutcomeIds.includes(outcome.outcome_id));
    return {
      ...pair,
      sourceKey: competencyMappingSignature({ pair, content: activity.contentJson, contextRevision: context.revision, outcomes, material: activity.materialSnapshotId, purpose: activity.purpose }),
      available: true,
      activityRef: activity.activityRef,
      activityTitle: String(activity.contentJson?.title ?? activity.activityRef),
      competencyTitle: competency.name,
      outcomes: outcomes.map((outcome) => ({ id: outcome.outcome_id, text: outcome.text })),
    };
  });
}

export async function reviewCompetencyMappings(
  repo: CompetencyMappingReviewRepository,
  runId: string,
  decision?: CompetencyMappingDecisionRequest,
): Promise<{ revision: number; mappings: CompetencyMappingReviewEntry[] }> {
  return repo.review<CompetencyMappingReviewEntry>(runId, (sources, saved, revision, applyDecision) => {
    const derived = deriveCompetencyMappingReviewEntries(sources);
    const current = new Map(derived.map((candidate) => [key(candidate), candidate]));
    const previous = new Map(saved.map((candidate) => [key(candidate), candidate]));
    const entries = derived.map((candidate) => {
      const old = previous.get(key(candidate));
      if (!old) return candidate;
      if (old.sourceKey !== candidate.sourceKey || old.mapping === "STALE") {
        return {
          ...candidate,
          mapping: "STALE" as const,
          evidence: "STALE" as const,
          ...(old.decidedBy ? { decidedBy: old.decidedBy, decidedAt: old.decidedAt } : {}),
        };
      }
      return { ...candidate, ...old, activityRef: candidate.activityRef, available: true };
    });
    for (const old of saved) {
      if (!current.has(key(old))) entries.push({ ...old, available: false, mapping: "STALE", evidence: "STALE" });
    }
    entries.sort((a, b) => key(a).localeCompare(key(b)));
    if (decision && applyDecision) {
      if (revision !== decision.expected_revision) {
        throw Object.assign(new Error("Mapping sources or decisions changed. Reload before confirming."), { code: "MAPPING_STALE" });
      }
      const index = entries.findIndex((candidate) => candidate.activityId === decision.activity_id && candidate.competencyId === decision.competency_id);
      const entry = entries[index];
      if (!entry?.available) {
        throw Object.assign(new Error("A current generated Activity and approved Competency with a shared Outcome are required."), { code: "MAPPING_UNAVAILABLE" });
      }
      const source = decision.kind === "mapping" && entry.mapping === "STALE" ? current.get(key(entry))! : entry;
      entries[index] = {
        ...source,
        ...decideCompetencyMapping(source, decision.kind, decision.decision),
        decidedBy: decision.teacher_id,
        decidedAt: new Date().toISOString(),
      };
    }
    return entries;
  }, Boolean(decision));
}
