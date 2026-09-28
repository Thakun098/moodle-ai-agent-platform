import { CompetencyCandidateRepository, RunRepository, type CompetencyCandidateRecord } from "@moodle-agent-poc/agent-runtime";
import type { CompetencyCandidateDecision, CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { beginInstructionalDesignMutation } from "./instructional-design-run-lifecycle-service.js";

export interface CompetencyCandidateDecisionDependencies {
  runRepo: RunRepository;
  candidateRepo: CompetencyCandidateRepository;
}

export interface ApplyCompetencyCandidateDecisionInput {
  runId: string;
  candidateId: string;
  body: unknown;
}

function fail(statusCode: number, code: string, message: string, details: unknown = null): never {
  throw Object.assign(new Error(message), { statusCode, code, details });
}

function asContext(value: unknown): CoreCourseDesignContext | null {
  return value && typeof value === "object" ? value as CoreCourseDesignContext : null;
}

function sourceRefsForApprovedOutcomes(context: CoreCourseDesignContext, outcomeIds: readonly string[]): unknown[] {
  const refs = outcomeIds.flatMap((outcomeId) => context.approved_learning_outcomes.find((outcome) => outcome.outcome_id === outcomeId)?.source_refs ?? []);
  const seen = new Set<string>();
  return refs.filter((ref) => { const key = JSON.stringify(ref); if (seen.has(key)) return false; seen.add(key); return true; });
}

/**
 * Validates and applies one Teacher Candidate decision against the exact
 * Candidate/Core Context authority that was reviewed. The production adapter
 * performs the write atomically; the fallback preserves injected test doubles.
 */
export async function applyCompetencyCandidateDecision(
  dependencies: CompetencyCandidateDecisionDependencies,
  input: ApplyCompetencyCandidateDecisionInput,
): Promise<CompetencyCandidateRecord> {
  const run = await dependencies.runRepo.getRun(input.runId);
  if (!run) fail(404, "NOT_FOUND", "Run not found.");
  const existing = await dependencies.candidateRepo.get(input.runId, input.candidateId);
  if (!existing) fail(404, "COMPETENCY_CANDIDATE_NOT_FOUND", "Competency Candidate not found.");
  const context = asContext(await dependencies.runRepo.getCoreCourseDesignContext(input.runId));
  if (!context) fail(404, "CORE_CONTEXT_NOT_FOUND", "Core Course Design Context is not available.");

  const body = input.body && typeof input.body === "object" ? input.body as Record<string, unknown> : {};
  const expectedRevision = body.expected_revision;
  const expectedContextRevision = body.expected_context_revision;
  if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) <= 0 || !Number.isSafeInteger(expectedContextRevision) || Number(expectedContextRevision) <= 0) {
    fail(422, "COMPETENCY_DECISION_REVISION_REQUIRED", "Candidate decisions require positive expected_revision and expected_context_revision values.");
  }
  if (existing.revision !== expectedRevision || context.revision !== expectedContextRevision) {
    fail(409, "COMPETENCY_CANDIDATE_REVISION_CONFLICT", "Candidate or approved Outcome authority changed. Reload and review before retrying.", {
      expected_revision: expectedRevision, actual_revision: existing.revision,
      expected_context_revision: expectedContextRevision, actual_context_revision: context.revision,
    });
  }

  const actionValue = typeof body.action === "string" ? body.action : "";
  if (!["approve", "reject", "defer", "edit"].includes(actionValue)) fail(422, "COMPETENCY_DECISION_INVALID", "Candidate decision must be approve, reject, defer, or edit.");
  const action = actionValue as CompetencyCandidateDecision["action"];
  const rawIds = body.derived_from_outcome_ids === undefined ? existing.derivedFromOutcomeIdsJson : body.derived_from_outcome_ids;
  if (!Array.isArray(rawIds) || !rawIds.every((id) => typeof id === "string")) fail(422, "COMPETENCY_OUTCOME_INVALID", "derived_from_outcome_ids must be an array of approved Outcome IDs.");
  const derivedIds = [...new Set(rawIds as string[])];
  const approvedIds = new Set(context.approved_learning_outcomes.map((outcome) => outcome.outcome_id));
  const unauthorized = derivedIds.filter((id) => !approvedIds.has(id));
  if (unauthorized.length > 0) fail(422, "COMPETENCY_OUTCOME_UNAUTHORIZED", "Candidate may derive only from approved Outcomes.", { unauthorized_outcome_ids: unauthorized });
  const aligned = derivedIds.length > 0;
  const override = body.teacher_override && typeof body.teacher_override === "object" && !Array.isArray(body.teacher_override) ? body.teacher_override as Record<string, unknown> : undefined;
  const hasOverride = override?.acknowledged === true && typeof override.reason === "string" && override.reason.trim() !== "";
  if (action === "approve" && !aligned && !hasOverride) fail(422, "COMPETENCY_ALIGNMENT_OVERRIDE_REQUIRED", "An unaligned Candidate requires an explicit Teacher override before approval.");
  const status = action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : action === "defer" ? "DEFERRED" : aligned ? "PROPOSED" : "UNALIGNED";
  const decision: CompetencyCandidateDecision & { status: "PROPOSED" | "APPROVED" | "REJECTED" | "DEFERRED" | "UNALIGNED"; source_refs?: unknown[] } = {
    action,
    status,
    expected_revision: expectedRevision as number,
    expected_context_revision: expectedContextRevision as number,
    derived_from_outcome_ids: derivedIds,
    source_refs: sourceRefsForApprovedOutcomes(context, derivedIds),
    ...(typeof body.name === "string" ? { name: body.name } : {}),
    ...(typeof body.description === "string" ? { description: body.description } : {}),
    ...(typeof body.rationale === "string" ? { rationale: body.rationale } : {}),
    ...(hasOverride ? { teacher_override: { acknowledged: true, reason: (override!.reason as string).trim(), ...(typeof body.teacher_id === "number" ? { teacher_id: body.teacher_id } : {}) } } : {}),
  };

  const atomicDecision = (dependencies.candidateRepo as CompetencyCandidateRepository & {
    decideAgainstAuthority?: (runId: string, candidateId: string, value: typeof decision) => Promise<CompetencyCandidateRecord | null>;
  }).decideAgainstAuthority;
  let updated: CompetencyCandidateRecord | null;
  if (typeof atomicDecision === "function") {
    updated = await atomicDecision.call(dependencies.candidateRepo, input.runId, input.candidateId, decision);
  } else {
    await beginInstructionalDesignMutation(dependencies.runRepo, input.runId);
    const currentContext = asContext(await dependencies.runRepo.getCoreCourseDesignContext(input.runId));
    if (!currentContext || currentContext.revision !== decision.expected_context_revision) {
      fail(409, "COMPETENCY_CANDIDATE_REVISION_CONFLICT", "Approved Outcome authority changed while the Candidate decision was being saved. Reload and retry.", {
        expected_context_revision: decision.expected_context_revision,
        actual_context_revision: currentContext?.revision ?? null,
      });
    }
    updated = await dependencies.candidateRepo.decide(input.runId, input.candidateId, decision);
  }
  if (!updated) fail(404, "COMPETENCY_CANDIDATE_NOT_FOUND", "Competency Candidate not found.");
  return updated;
}
