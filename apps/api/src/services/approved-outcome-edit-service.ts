import {
  ActivityIntentRepository,
  CompetencyCandidateRepository,
  CourseStructureRevisionRepository,
  OutcomeReviewRepository,
  RunRepository,
  type OutcomeReviewStateRecord,
} from "@moodle-agent-poc/agent-runtime";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { invalidateApprovedLearningOutcome } from "@moodle-agent-poc/planning";
import { beginInstructionalDesignMutation } from "./instructional-design-run-lifecycle-service.js";

export interface ApprovedOutcomeEditServiceDeps {
  runRepo: RunRepository;
  structureRevisionRepo: CourseStructureRevisionRepository;
  candidateRepo: CompetencyCandidateRepository;
  reviewRepo: OutcomeReviewRepository;
  activityIntentRepo: ActivityIntentRepository;
}

export interface EditApprovedOutcomeInput {
  runId: string;
  sourceOutcomeId: string;
  teacherText: string;
  confirmed: boolean;
  teacherId?: number;
}

export interface EditApprovedOutcomeResult {
  context: CoreCourseDesignContext;
  review: OutcomeReviewStateRecord;
  invalidatedOutcomeIds: string[];
  stale: {
    structureAlignment: boolean;
    activityCount: number;
    competencyCandidateCount: number;
  };
}

export class ApprovedOutcomeEditApplicationError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "ApprovedOutcomeEditApplicationError";
  }
}

function fail(statusCode: number, code: string, message: string, details: unknown = null): never {
  throw new ApprovedOutcomeEditApplicationError(statusCode, code, message, details);
}

export async function editApprovedOutcome(
  deps: ApprovedOutcomeEditServiceDeps,
  input: EditApprovedOutcomeInput,
): Promise<EditApprovedOutcomeResult> {
  const run = await deps.runRepo.getRun(input.runId);
  if (!run) fail(404, "NOT_FOUND", "Run not found.");

  const sourceOutcomeId = input.sourceOutcomeId.trim();
  const teacherText = input.teacherText.trim();
  if (!sourceOutcomeId || !teacherText || !input.confirmed) {
    fail(
      422,
      "APPROVED_OUTCOME_EDIT_CONFIRMATION_REQUIRED",
      "Approved CLO edit requires explicit confirmation, source_outcome_id, and non-empty teacher_text.",
    );
  }

  const context = await deps.runRepo.getCoreCourseDesignContext(input.runId);
  if (!context) fail(404, "CORE_CONTEXT_NOT_FOUND", "Core Course Design Context is not available.");
  if (!context.source_learning_outcomes.some((outcome) => outcome.source_outcome_id === sourceOutcomeId)) {
    fail(422, "OUTCOME_INVALID", "Unknown source Learning Outcome.");
  }

  const currentApprovals = context.approved_learning_outcomes.filter((outcome) =>
    outcome.source_outcome_ids.includes(sourceOutcomeId),
  );
  if (currentApprovals.length === 0) {
    fail(409, "OUTCOME_NOT_APPROVED", "Only a currently approved CLO can use the approved-outcome edit safety flow.");
  }
  if (currentApprovals.every((outcome) => outcome.text.trim() === teacherText)) {
    fail(422, "APPROVED_OUTCOME_EDIT_NO_CHANGE", "The edited CLO wording is unchanged.");
  }

  await beginInstructionalDesignMutation(deps.runRepo, input.runId);
  const { context: nextContext, invalidatedOutcomes } = invalidateApprovedLearningOutcome(context, sourceOutcomeId);

  // Persist the Teacher's confirmed wording as a recoverable review state first.
  // Authority stays on the old Core Context until every dependent stale transition
  // succeeds, so a failed attempt remains safe to retry.
  const review = await deps.reviewRepo.upsert({
    runId: input.runId,
    itemType: "CLO",
    itemId: sourceOutcomeId,
    status: "REVIEWED",
    draftText: teacherText,
    updatedByMoodleUserId: input.teacherId === undefined ? null : String(input.teacherId),
  });

  let competencyCandidateCount = 0;
  for (const outcome of invalidatedOutcomes) {
    competencyCandidateCount += await deps.candidateRepo.invalidateApprovedForOutcome(input.runId, outcome.outcome_id);
  }

  const structure = await deps.structureRevisionRepo.getLatestRevision(input.runId);
  if (structure) await deps.structureRevisionRepo.markAlignmentStale(input.runId, nextContext.revision);

  const sealed = await deps.structureRevisionRepo.getSealedRevision(input.runId);
  const activityCount = sealed
    ? await deps.activityIntentRepo.markStaleForContext(input.runId, sealed.revision, nextContext.revision)
    : 0;

  // Publish the authority withdrawal last. Any failure above leaves the previous
  // CLO approval current and makes the request safely retryable; premature stale
  // markers are conservative and idempotent.
  await deps.runRepo.saveCoreCourseDesignContextRevision(nextContext);

  return {
    context: nextContext,
    review,
    invalidatedOutcomeIds: invalidatedOutcomes.map((outcome) => outcome.outcome_id),
    stale: {
      structureAlignment: Boolean(structure),
      activityCount,
      competencyCandidateCount,
    },
  };
}
