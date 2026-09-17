import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { CompetencyCandidate, CompetencyCandidateDecision } from "@moodle-agent-poc/contracts";
import type { AppDatabase } from "../db/connection.js";
import { competencyCandidate, type CompetencyCandidateRecord } from "../db/schema/competency-candidates.js";

export class CompetencyCandidateRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(runId: string): Promise<CompetencyCandidateRecord[]> {
    return this.db.select().from(competencyCandidate).where(eq(competencyCandidate.runId, runId));
  }

  async get(runId: string, candidateId: string): Promise<CompetencyCandidateRecord | null> {
    const [record] = await this.db.select().from(competencyCandidate).where(and(
      eq(competencyCandidate.runId, runId),
      eq(competencyCandidate.candidateId, candidateId),
    ));
    return record ?? null;
  }

  async saveProposed(runId: string, candidates: readonly CompetencyCandidate[]): Promise<CompetencyCandidateRecord[]> {
    const saved: CompetencyCandidateRecord[] = [];
    for (const candidate of candidates) {
      const existing = await this.get(runId, candidate.candidate_id);
      if (existing) {
        saved.push(existing);
        continue;
      }
      const [created] = await this.db.insert(competencyCandidate).values({
        id: randomUUID(),
        runId,
        candidateId: candidate.candidate_id,
        revision: candidate.revision,
        name: candidate.name,
        description: candidate.description,
        derivedFromOutcomeIdsJson: candidate.derived_from_outcome_ids,
        rationale: candidate.rationale,
        sourceRefsJson: candidate.source_refs,
        status: candidate.status,
        teacherOverrideJson: candidate.teacher_override ? candidate.teacher_override as unknown as Record<string, unknown> : null,
        editedFromCandidateId: candidate.edited_from_candidate_id ?? null,
      }).returning();
      if (!created) throw new Error("Failed to persist Competency Candidate.");
      saved.push(created);
    }
    return saved;
  }

  /**
   * A Teacher-approved Candidate is academic authority derived from the exact
   * approved Outcome wording it was reviewed against. Re-approving/editing
   * that Outcome returns only dependent approved Candidates to review.
   */
  async invalidateApprovedForOutcome(runId: string, outcomeId: string): Promise<number> {
    const candidates = await this.list(runId);
    const affected = candidates.filter((candidate) =>
      candidate.status === "APPROVED" && candidate.derivedFromOutcomeIdsJson.includes(outcomeId),
    );
    let changed = 0;
    for (const candidate of affected) {
      const [updated] = await this.db.update(competencyCandidate).set({
        revision: candidate.revision + 1,
        status: "PROPOSED",
        teacherOverrideJson: null,
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(competencyCandidate.id, candidate.id),
        eq(competencyCandidate.status, "APPROVED"),
      )).returning();
      if (updated) changed += 1;
    }
    return changed;
  }

  async decide(runId: string, candidateId: string, decision: CompetencyCandidateDecision & { status: CompetencyCandidate["status"]; source_refs?: unknown[] }): Promise<CompetencyCandidateRecord | null> {
    const existing = await this.get(runId, candidateId);
    if (!existing) return null;
    const [updated] = await this.db.update(competencyCandidate).set({
      revision: existing.revision + 1,
      name: decision.name ?? existing.name,
      description: decision.description ?? existing.description,
      rationale: decision.rationale ?? existing.rationale,
      derivedFromOutcomeIdsJson: decision.derived_from_outcome_ids ?? existing.derivedFromOutcomeIdsJson,
      status: decision.status,
      ...(decision.source_refs ? { sourceRefsJson: decision.source_refs } : {}),
      teacherOverrideJson: decision.teacher_override ? decision.teacher_override as unknown as Record<string, unknown> : existing.teacherOverrideJson,
      editedFromCandidateId: existing.editedFromCandidateId ?? existing.candidateId,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(competencyCandidate.runId, runId), eq(competencyCandidate.candidateId, candidateId))).returning();
    return updated ?? null;
  }
}
