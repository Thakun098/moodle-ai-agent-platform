import { createHash } from "node:crypto";
import type {
  ActivityIntentRepository,
  CompetencyCandidateRepository,
  CompetencyExecutionSnapshot,
  CompetencyExecutionSnapshotRepository,
  CompetencyMappingReviewRepository,
} from "@moodle-agent-poc/agent-runtime";
import { competencyMappingSignature, reviewCompetencyMappings } from "./competency-mapping-review-service.js";

export interface CompetencyExecutionSnapshotDependencies {
  candidateRepo: CompetencyCandidateRepository;
  activityIntentRepo: ActivityIntentRepository;
  reviewRepo: CompetencyMappingReviewRepository;
  snapshotRepo: CompetencyExecutionSnapshotRepository;
}

function competencyIdnumber(runId: string, candidateId: string): string {
  const digest = createHash("sha256").update(`${runId}:${candidateId}`).digest("hex").slice(0, 24).toUpperCase();
  return `AGENTPOC-${digest}`;
}

function mappingKey(mapping: { activityIntentId: string; competencyId: string }): string {
  return `${mapping.activityIntentId}\u0000${mapping.competencyId}`;
}

export async function captureCompetencyExecutionSnapshot(input: {
  runId: string;
  planId: string;
  revision: number;
  frameworkId: number | null;
  dependencies: CompetencyExecutionSnapshotDependencies;
}): Promise<CompetencyExecutionSnapshot> {
  const review = await reviewCompetencyMappings(input.dependencies.reviewRepo, input.runId);
  const candidates = await input.dependencies.candidateRepo.list(input.runId);
  const approved = candidates.filter((candidate) => candidate.status === "APPROVED").sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  if (approved.length > 0 && (!Number.isSafeInteger(input.frameworkId) || Number(input.frameworkId) <= 0)) {
    throw Object.assign(new Error("Select a Moodle Competency Framework before Course approval."), { code: "COMPETENCY_FRAMEWORK_REQUIRED", statusCode: 422 });
  }
  const approvedIds = new Set(approved.map((candidate) => candidate.candidateId));
  const mappings = review.mappings
    .filter((entry) => entry.available && entry.mapping === "CONFIRMED" && approvedIds.has(entry.competencyId))
    .map((entry) => ({
      activityIntentId: entry.activityId,
      activityRef: entry.activityRef,
      competencyId: entry.competencyId,
      intentRevision: entry.intentRevision,
      activityRevision: entry.activityRevision,
      competencyRevision: entry.competencyRevision,
      evidence: entry.evidence === "CONFIRMED" || entry.evidence === "DECLINED" ? entry.evidence : "UNDECIDED" as const,
    }))
    .sort((a, b) => mappingKey(a).localeCompare(mappingKey(b)));
  const snapshot: CompetencyExecutionSnapshot = {
    runId: input.runId,
    planId: input.planId,
    revision: input.revision,
    mappingReviewRevision: review.revision,
    frameworkId: input.frameworkId,
    capturedAt: new Date().toISOString(),
    competencies: approved.map((candidate) => ({
      candidateId: candidate.candidateId,
      competencyRevision: candidate.revision,
      name: candidate.name,
      description: candidate.description,
      outcomeIds: [...candidate.derivedFromOutcomeIdsJson].sort(),
      idnumber: competencyIdnumber(input.runId, candidate.candidateId),
    })),
    mappings,
  };
  return input.dependencies.snapshotRepo.save(snapshot);
}

export async function assertCompetencyExecutionSnapshotCurrent(
  snapshot: CompetencyExecutionSnapshot,
  dependencies: Omit<CompetencyExecutionSnapshotDependencies, "snapshotRepo">,
): Promise<void> {
  const currentCandidates = await dependencies.candidateRepo.list(snapshot.runId);
  const approved = currentCandidates.filter((candidate) => candidate.status === "APPROVED");
  const snapshotById = new Map(snapshot.competencies.map((competency) => [competency.candidateId, competency]));
  if (approved.length !== snapshot.competencies.length) {
    throw Object.assign(new Error("Approved Competency state changed after Course approval. Re-approve the current Course revision before Execute."), { code: "COMPETENCY_EXECUTION_SNAPSHOT_STALE" });
  }
  for (const candidate of approved) {
    const captured = snapshotById.get(candidate.candidateId);
    if (!captured || captured.competencyRevision !== candidate.revision || captured.name !== candidate.name || captured.description !== candidate.description
      || JSON.stringify(captured.outcomeIds) !== JSON.stringify([...candidate.derivedFromOutcomeIdsJson].sort())) {
      throw Object.assign(new Error("Approved Competency state changed after Course approval. Re-approve the current Course revision before Execute."), { code: "COMPETENCY_EXECUTION_SNAPSHOT_STALE" });
    }
  }

  const review = await reviewCompetencyMappings(dependencies.reviewRepo, snapshot.runId);
  if (review.revision !== snapshot.mappingReviewRevision) {
    throw Object.assign(new Error("Competency mapping/evidence authority changed after Course approval. Re-approve before Execute."), { code: "COMPETENCY_EXECUTION_SNAPSHOT_STALE" });
  }
  const approvedIds = new Set(approved.map((candidate) => candidate.candidateId));
  const currentMappings = review.mappings
    .filter((entry) => entry.available && entry.mapping === "CONFIRMED" && approvedIds.has(entry.competencyId))
    .map((entry) => ({ activityIntentId: entry.activityId, activityRef: entry.activityRef, competencyId: entry.competencyId, intentRevision: entry.intentRevision, activityRevision: entry.activityRevision, competencyRevision: entry.competencyRevision, evidence: entry.evidence === "CONFIRMED" || entry.evidence === "DECLINED" ? entry.evidence : "UNDECIDED" as const }))
    .sort((a, b) => mappingKey(a).localeCompare(mappingKey(b)));
  if (competencyMappingSignature(currentMappings) !== competencyMappingSignature(snapshot.mappings)) {
    throw Object.assign(new Error("Competency mapping/evidence authority changed after Course approval. Re-approve before Execute."), { code: "COMPETENCY_EXECUTION_SNAPSHOT_STALE" });
  }

  for (const mapping of snapshot.mappings) {
    const activity = await dependencies.activityIntentRepo.get(mapping.activityIntentId);
    if (!activity || activity.status !== "generated" || activity.activityRef !== mapping.activityRef || activity.intentRevision !== mapping.intentRevision || activity.activityRevision !== mapping.activityRevision) {
      throw Object.assign(new Error(`Activity ${mapping.activityRef} changed after Course approval. Re-approve before Execute.`), { code: "COMPETENCY_EXECUTION_SNAPSHOT_STALE" });
    }
  }
}
