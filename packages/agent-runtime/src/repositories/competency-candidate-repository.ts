import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { CompetencyCandidate, CompetencyCandidateDecision } from "@moodle-agent-poc/contracts";
import type { AppDatabase } from "../db/connection.js";
import { competencyCandidate, type CompetencyCandidateRecord } from "../db/schema/competency-candidates.js";
import { coreCourseDesignContexts } from "../db/schema/core-course-design-contexts.js";
import { pocRun } from "../db/schema/runs.js";

function authorityConflict(message: string, details: Record<string, unknown>): Error & { code: string; statusCode: number; details: Record<string, unknown> } {
  return Object.assign(new Error(message), { code: "COMPETENCY_CANDIDATE_REVISION_CONFLICT", statusCode: 409, details });
}

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
    if (existing.revision !== decision.expected_revision) {
      throw authorityConflict("Competency Candidate changed after the Teacher loaded it. Reload and review the current Candidate before retrying.", {
        expected_revision: decision.expected_revision,
        actual_revision: existing.revision,
      });
    }
    const [updated] = await this.db.update(competencyCandidate).set({
      revision: decision.expected_revision + 1,
      name: decision.name ?? existing.name,
      description: decision.description ?? existing.description,
      rationale: decision.rationale ?? existing.rationale,
      derivedFromOutcomeIdsJson: decision.derived_from_outcome_ids ?? existing.derivedFromOutcomeIdsJson,
      status: decision.status,
      ...(decision.source_refs ? { sourceRefsJson: decision.source_refs } : {}),
      teacherOverrideJson: decision.teacher_override ? decision.teacher_override as unknown as Record<string, unknown> : existing.teacherOverrideJson,
      editedFromCandidateId: existing.editedFromCandidateId ?? existing.candidateId,
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(competencyCandidate.runId, runId),
      eq(competencyCandidate.candidateId, candidateId),
      eq(competencyCandidate.revision, decision.expected_revision),
    )).returning();
    if (!updated) {
      const current = await this.get(runId, candidateId);
      throw authorityConflict("Competency Candidate changed while this decision was being saved. Reload and review before retrying.", {
        expected_revision: decision.expected_revision,
        actual_revision: current?.revision ?? null,
      });
    }
    return updated ?? null;
  }

  /**
   * Applies one Candidate decision against the exact Candidate and Core Context
   * authority the Teacher reviewed, while serializing against every other
   * Instructional Design mutation and Execute claim on the run row.
   */
  async decideAgainstAuthority(
    runId: string,
    candidateId: string,
    decision: CompetencyCandidateDecision & { status: CompetencyCandidate["status"]; source_refs?: unknown[] },
  ): Promise<CompetencyCandidateRecord | null> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, runId)).for("update");
      if (!run) throw Object.assign(new Error(`Run ${runId} not found.`), { code: "NOT_FOUND", statusCode: 404 });
      if (["executing", "awaiting_verification", "completed"].includes(run.status)) {
        throw Object.assign(new Error(`Instructional Design authority cannot change while run ${runId} is ${run.status}.`), { code: "INSTRUCTIONAL_DESIGN_MUTATION_LOCKED", statusCode: 409 });
      }

      const [contextRow] = await tx.select().from(coreCourseDesignContexts)
        .where(eq(coreCourseDesignContexts.runId, runId))
        .orderBy(desc(coreCourseDesignContexts.revision))
        .limit(1)
        .for("share");
      const context = contextRow?.context;
      if (!context || context.revision !== decision.expected_context_revision) {
        throw authorityConflict("Approved Outcome authority changed after the Teacher loaded this Candidate. Reload and review before retrying.", {
          expected_context_revision: decision.expected_context_revision,
          actual_context_revision: context?.revision ?? null,
        });
      }

      const [existing] = await tx.select().from(competencyCandidate).where(and(
        eq(competencyCandidate.runId, runId),
        eq(competencyCandidate.candidateId, candidateId),
      )).for("update");
      if (!existing) return null;
      if (existing.revision !== decision.expected_revision) {
        throw authorityConflict("Competency Candidate changed after the Teacher loaded it. Reload and review before retrying.", {
          expected_revision: decision.expected_revision,
          actual_revision: existing.revision,
        });
      }
      const approvedIds = new Set(context.approved_learning_outcomes.map((outcome) => outcome.outcome_id));
      const derivedIds = decision.derived_from_outcome_ids ?? existing.derivedFromOutcomeIdsJson;
      const unauthorized = derivedIds.filter((id) => !approvedIds.has(id));
      if (unauthorized.length > 0) {
        throw authorityConflict("Approved Outcome authority changed after the Teacher reviewed this Candidate.", {
          unauthorized_outcome_ids: unauthorized,
          actual_context_revision: context.revision,
        });
      }

      const [updated] = await tx.update(competencyCandidate).set({
        revision: decision.expected_revision + 1,
        name: decision.name ?? existing.name,
        description: decision.description ?? existing.description,
        rationale: decision.rationale ?? existing.rationale,
        derivedFromOutcomeIdsJson: derivedIds,
        status: decision.status,
        ...(decision.source_refs ? { sourceRefsJson: decision.source_refs } : {}),
        teacherOverrideJson: decision.teacher_override ? decision.teacher_override as unknown as Record<string, unknown> : existing.teacherOverrideJson,
        editedFromCandidateId: existing.editedFromCandidateId ?? existing.candidateId,
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(competencyCandidate.runId, runId),
        eq(competencyCandidate.candidateId, candidateId),
        eq(competencyCandidate.revision, decision.expected_revision),
      )).returning();
      if (!updated) throw authorityConflict("Competency Candidate changed while this decision was being saved.", { expected_revision: decision.expected_revision });

      await tx.update(pocRun).set({
        ...(["preview", "failed"].includes(run.status) ? { status: "planning" as const, error: null } : {}),
        approvedPlanId: null,
        approvedRevision: null,
        approvedAt: null,
        approvedByMoodleUserId: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(pocRun.runId, runId));
      return updated;
    });
  }
}
