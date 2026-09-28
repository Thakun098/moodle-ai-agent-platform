import {
  ActivityIntentRepository,
  CompetencyCandidateRepository,
  CourseStructureRevisionRepository,
  OutcomeReviewRepository,
  RunRepository,
} from "@moodle-agent-poc/agent-runtime";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { approveLearningOutcome } from "@moodle-agent-poc/planning";
import { beginInstructionalDesignMutation } from "./instructional-design-run-lifecycle-service.js";

export interface LearningOutcomeApprovalDependencies {
  runRepo: RunRepository;
  candidateRepo: CompetencyCandidateRepository;
  structureRepo: CourseStructureRevisionRepository;
  activityIntentRepo: ActivityIntentRepository;
  reviewRepo: OutcomeReviewRepository;
}

export interface ApproveLearningOutcomeInput {
  runId: string;
  body: unknown;
  enforceOutcomeReview: boolean;
}

function fail(statusCode: number, code: string, message: string, details: unknown = null): never {
  throw Object.assign(new Error(message), { statusCode, code, details });
}

function asContext(value: unknown): CoreCourseDesignContext | null {
  return value && typeof value === "object" ? value as CoreCourseDesignContext : null;
}

/** Publishes one reviewed Outcome authority change and stales every dependent artifact before publication. */
export async function approveReviewedLearningOutcome(
  dependencies: LearningOutcomeApprovalDependencies,
  input: ApproveLearningOutcomeInput,
): Promise<{ context: CoreCourseDesignContext; alignmentStatus: "STALE_ALIGNMENT" }> {
  const run = await dependencies.runRepo.getRun(input.runId);
  if (!run) fail(404, "NOT_FOUND", "Run not found.");
  const context = asContext(await dependencies.runRepo.getCoreCourseDesignContext(input.runId));
  if (!context) fail(404, "CORE_CONTEXT_NOT_FOUND", "Core Course Design Context is not available.");
  if (typeof (dependencies.runRepo as { saveCoreCourseDesignContextRevision?: unknown }).saveCoreCourseDesignContextRevision !== "function") {
    fail(501, "OUTCOME_PERSISTENCE_UNAVAILABLE", "Outcome revision persistence is not configured.");
  }
  const body = input.body && typeof input.body === "object" ? input.body as Record<string, unknown> : {};
  const sourceOutcomeId = String(body.source_outcome_id ?? "");
  const sourceOutcome = context.source_learning_outcomes.find((outcome) => outcome.source_outcome_id === sourceOutcomeId);
  let reviewedApprovalText: string | null = null;
  if (input.enforceOutcomeReview) {
    const review = await dependencies.reviewRepo.get(input.runId, "CLO", sourceOutcomeId);
    if (!review || review.status !== "REVIEWED") fail(409, "OUTCOME_REVIEW_REQUIRED", "A CLO must be explicitly Reviewed before it can be approved.");
    if (!sourceOutcome) fail(422, "OUTCOME_INVALID", "Unknown source Learning Outcome.");
    reviewedApprovalText = review.draftText?.trim() || sourceOutcome.source_text.trim();
    const requestedApprovalText = body.use_source_as_is === true
      ? sourceOutcome.source_text.trim()
      : typeof body.teacher_text === "string" && body.teacher_text.trim() !== ""
        ? body.teacher_text.trim()
        : typeof body.recommended_text === "string" && body.recommended_text.trim() !== ""
          ? body.recommended_text.trim()
          : null;
    if (requestedApprovalText !== reviewedApprovalText) fail(409, "OUTCOME_REVIEW_TEXT_MISMATCH", "CLO approval must use the exact wording from the persisted Reviewed state.");
  }

  await beginInstructionalDesignMutation(dependencies.runRepo, input.runId);
  const updated = approveLearningOutcome(context, reviewedApprovalText !== null && sourceOutcome ? {
    source_outcome_id: sourceOutcomeId,
    use_source_as_is: reviewedApprovalText === sourceOutcome.source_text.trim(),
    ...(reviewedApprovalText !== sourceOutcome.source_text.trim() ? { teacher_text: reviewedApprovalText } : {}),
    ...(typeof body.teacher_id === "number" ? { teacher_id: body.teacher_id } : {}),
  } : {
    source_outcome_id: sourceOutcomeId,
    use_source_as_is: body.use_source_as_is === true,
    ...(typeof body.recommended_text === "string" ? { recommended_text: body.recommended_text } : {}),
    ...(typeof body.teacher_text === "string" ? { teacher_text: body.teacher_text } : {}),
    ...(typeof body.teacher_id === "number" ? { teacher_id: body.teacher_id } : {}),
  });

  const changedOutcome = updated.approved_learning_outcomes.find((outcome) => outcome.source_outcome_ids.includes(sourceOutcomeId));
  if (changedOutcome) await dependencies.candidateRepo.invalidateApprovedForOutcome(input.runId, changedOutcome.outcome_id);
  const sealedStructure = await dependencies.structureRepo.getSealedRevision(input.runId);
  if (sealedStructure) await dependencies.activityIntentRepo.markStaleForContext(input.runId, sealedStructure.revision, updated.revision);
  await dependencies.runRepo.saveCoreCourseDesignContextRevision(updated);
  await dependencies.structureRepo.markAlignmentStale(input.runId, updated.revision);
  return { context: updated, alignmentStatus: "STALE_ALIGNMENT" };
}
