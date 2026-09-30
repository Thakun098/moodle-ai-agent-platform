import type { PocRunRecord, RunRepository } from "@moodle-agent-poc/agent-runtime";

function lifecycleError(code: string, message: string, statusCode = 409): Error & { code: string; statusCode: number } {
  return Object.assign(new Error(message), { code, statusCode });
}

export function assertInstructionalDesignMutationState(run: PocRunRecord): void {
  if (["executing", "awaiting_verification", "completed"].includes(run.status)) {
    throw lifecycleError(
      "INSTRUCTIONAL_DESIGN_MUTATION_LOCKED",
      `Instructional Design authority cannot change while run ${run.runId} is ${run.status}.`,
    );
  }
}

/**
 * Production repositories provide an atomic row-lock implementation. The
 * fallback keeps injected route-test doubles compatible while enforcing the
 * same visible state rule.
 */
export async function beginInstructionalDesignMutation(runRepo: RunRepository, runId: string): Promise<PocRunRecord> {
  const atomic = (runRepo as RunRepository & { beginInstructionalDesignMutation?: (id: string) => Promise<PocRunRecord> }).beginInstructionalDesignMutation;
  if (typeof atomic === "function") return atomic.call(runRepo, runId);

  const run = await runRepo.getRun(runId);
  if (!run) throw lifecycleError("NOT_FOUND", `Run ${runId} not found.`, 404);
  assertInstructionalDesignMutationState(run);
  return run;
}

/** Claims the exact approval immediately before the first Moodle mutation. */
export async function claimApprovedExecution(
  runRepo: RunRepository,
  input: { runId: string; planId: string; revision: number; competencyParticipationRevision?: number },
): Promise<PocRunRecord> {
  const atomic = (runRepo as RunRepository & { claimApprovedExecution?: (value: typeof input) => Promise<PocRunRecord> }).claimApprovedExecution;
  if (typeof atomic === "function") return atomic.call(runRepo, input);

  const run = await runRepo.getRun(input.runId);
  if (!run) throw lifecycleError("NOT_FOUND", `Run ${input.runId} not found.`, 404);
  if (run.approvedPlanId !== input.planId || run.approvedRevision !== input.revision) {
    throw lifecycleError("PLAN_NOT_APPROVED", `Plan revision ${input.revision} is not the current approved authority.`);
  }
  if (input.competencyParticipationRevision !== undefined && run.competencyParticipation?.revision !== input.competencyParticipationRevision) throw lifecycleError("COMPETENCY_EXECUTION_SNAPSHOT_STALE", "Competency participation changed before Execute.");
  if (!["preview", "failed"].includes(run.status)) {
    throw lifecycleError("RUN_STATE_INVALID", `Run ${input.runId} cannot start execution from ${run.status}.`);
  }
  return runRepo.updateStatus(input.runId, "executing");
}
