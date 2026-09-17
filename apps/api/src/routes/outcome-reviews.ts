import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import {
  getDatabase,
  OutcomeReviewRepository,
  RunRepository,
  type OutcomeReviewItemType,
  type OutcomeReviewStateRecord,
  type OutcomeReviewStatus,
} from "@moodle-agent-poc/agent-runtime";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";

export interface OutcomeReviewRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository;
  reviewRepo?: OutcomeReviewRepository;
}

type ReviewProjectionStatus = OutcomeReviewStatus | "APPROVED";

function authorize(
  request: { headers: Record<string, unknown> },
  config: AppConfig,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): boolean {
  const configured = config.instructionalDesignServiceKey;
  const supplied = request.headers["x-agentpoc-instructional-design-key"];
  if (!configured || typeof supplied !== "string" || supplied !== configured) {
    reply.status(401).send({ error: { code: "INSTRUCTIONAL_DESIGN_UNAUTHORIZED", message: "Instructional Design service authorization is required." } });
    return false;
  }
  return true;
}

function asContext(value: unknown): CoreCourseDesignContext | null {
  return value && typeof value === "object" ? value as CoreCourseDesignContext : null;
}

function storedReviewMap(records: readonly OutcomeReviewStateRecord[]): Map<string, OutcomeReviewStateRecord> {
  return new Map(records.map((record) => [`${record.itemType}:${record.itemId}`, record]));
}

function serializeStoredReview(record: OutcomeReviewStateRecord): Record<string, unknown> {
  return {
    item_type: record.itemType,
    item_id: record.itemId,
    status: record.status,
    draft_text: record.draftText,
    updated_by_moodle_user_id: record.updatedByMoodleUserId,
    updated_at: record.updatedAt,
  };
}

function projectReviewItems(context: CoreCourseDesignContext, records: readonly OutcomeReviewStateRecord[]): Array<Record<string, unknown>> {
  const stored = storedReviewMap(records);
  const approvedBySource = new Map<string, CoreCourseDesignContext["approved_learning_outcomes"][number]>();
  context.approved_learning_outcomes.forEach((outcome) => {
    outcome.source_outcome_ids.forEach((sourceId) => approvedBySource.set(sourceId, outcome));
  });

  const objectives = context.learning_objectives.map((objective) => {
    const review = stored.get(`LO:${objective.objective_id}`);
    return {
      item_type: "LO",
      item_id: objective.objective_id,
      status: (review?.status ?? "PENDING_REVIEW") as ReviewProjectionStatus,
      source_text: objective.source_text,
      authoritative_text: objective.source_text,
      draft_text: review?.draftText ?? null,
      source_refs: objective.source_refs,
      updated_at: review?.updatedAt ?? null,
    };
  });

  const outcomes = context.source_learning_outcomes.map((source) => {
    const approved = approvedBySource.get(source.source_outcome_id);
    const review = stored.get(`CLO:${source.source_outcome_id}`);
    return {
      item_type: "CLO",
      item_id: source.source_outcome_id,
      status: (approved ? "APPROVED" : review?.status ?? "PENDING_REVIEW") as ReviewProjectionStatus,
      source_text: source.source_text,
      authoritative_text: approved?.text ?? source.source_text,
      draft_text: review?.draftText ?? null,
      source_refs: source.source_refs,
      measurable_status: source.measurable_status,
      approved_outcome_id: approved?.outcome_id ?? null,
      updated_at: review?.updatedAt ?? null,
    };
  });

  return [...objectives, ...outcomes];
}

export const outcomeReviewRoutes: FastifyPluginAsync<OutcomeReviewRoutesOptions> = async (fastify, options) => {
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getReviewRepo = () => options.reviewRepo ?? new OutcomeReviewRepository(getDatabase());

  fastify.get<{ Params: { runId: string } }>("/api/runs/:runId/outcome-reviews", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    const runRepo = getRunRepo();
    const run = await runRepo.getRun(request.params.runId);
    if (!run) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Run not found." } });
    const context = asContext(await runRepo.getCoreCourseDesignContext(request.params.runId));
    if (!context) return reply.status(404).send({ error: { code: "CORE_CONTEXT_NOT_FOUND", message: "Core Course Design Context is not available." } });
    const records = await getReviewRepo().list(request.params.runId);
    return {
      run_id: request.params.runId,
      core_context_revision: context.revision,
      items: projectReviewItems(context, records),
    };
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/outcome-reviews", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    const runRepo = getRunRepo();
    const run = await runRepo.getRun(request.params.runId);
    if (!run) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Run not found." } });
    const context = asContext(await runRepo.getCoreCourseDesignContext(request.params.runId));
    if (!context) return reply.status(404).send({ error: { code: "CORE_CONTEXT_NOT_FOUND", message: "Core Course Design Context is not available." } });

    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const itemType = body.item_type === "LO" || body.item_type === "CLO" ? body.item_type as OutcomeReviewItemType : null;
    const itemId = typeof body.item_id === "string" ? body.item_id : "";
    const status = ["PENDING_REVIEW", "REVIEWED", "NEEDS_REVISION"].includes(String(body.status))
      ? String(body.status) as OutcomeReviewStatus
      : null;
    if (!itemType || !status || !itemId) {
      return reply.status(422).send({ error: { code: "OUTCOME_REVIEW_INVALID", message: "Outcome review requires item_type LO/CLO, a valid item_id, and status Pending/Reviewed/Needs revision." } });
    }

    const exists = itemType === "LO"
      ? context.learning_objectives.some((item) => item.objective_id === itemId)
      : context.source_learning_outcomes.some((item) => item.source_outcome_id === itemId);
    if (!exists) {
      return reply.status(422).send({ error: { code: "OUTCOME_REVIEW_ITEM_NOT_FOUND", message: `${itemType} ${itemId} is not part of the current Core Course Design Context.` } });
    }

    if (itemType === "CLO" && context.approved_learning_outcomes.some((outcome) => outcome.source_outcome_ids.includes(itemId))) {
      return reply.status(409).send({ error: { code: "APPROVED_OUTCOME_EDIT_REQUIRES_CONFIRMATION", message: "Approved CLO changes use the approved-outcome safety flow." } });
    }

    const draftText = typeof body.draft_text === "string" && body.draft_text.trim() !== "" ? body.draft_text.trim() : null;
    const record = await getReviewRepo().upsert({
      runId: request.params.runId,
      itemType,
      itemId,
      status,
      draftText,
      updatedByMoodleUserId: typeof body.teacher_id === "number" ? String(body.teacher_id) : null,
    });

    return {
      run_id: request.params.runId,
      core_context_revision: context.revision,
      review: serializeStoredReview(record),
    };
  });
};
