import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { ActivityIntentRepository, CompetencyCandidateRepository, CourseStructureRevisionRepository, projectWeekReviews, getDatabase, OutcomeReviewRepository, RunRepository, type CompetencyCandidateRecord, type ModelClient } from "@moodle-agent-poc/agent-runtime";
import {
  assertOutcomeCoverage,
  assertRequiredOutcomeApprovals,
  buildLearningOutcomeProposals,
  deriveOutcomeCoverage,
  deriveCompetencyCandidates,
  rebaseStructureSections,
  type AlignedStructureSection,
  type ExternalCoverageOverride,
} from "@moodle-agent-poc/planning";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { editApprovedOutcome } from "../services/approved-outcome-edit-service.js";
import { applyCompetencyCandidateDecision } from "../services/competency-candidate-decision-service.js";
import { approveReviewedLearningOutcome } from "../services/learning-outcome-approval-service.js";
import { beginInstructionalDesignMutation } from "../services/instructional-design-run-lifecycle-service.js";

export interface InstructionalDesignRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository;
  structureRevisionRepo?: CourseStructureRevisionRepository;
  candidateRepo?: CompetencyCandidateRepository;
  reviewRepo?: OutcomeReviewRepository;
  activityIntentRepo?: ActivityIntentRepository;
  enforceOutcomeReview?: boolean;
  modelClient?: ModelClient;
}

function serializeStructureRevision(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (!("contentJson" in record)) return value;
  return { id: record.id, run_id: record.runId, revision: record.revision, title: record.title, summary: record.summary, content: record.contentJson, teacher_constraints: record.teacherConstraintsJson, week_reviews: projectWeekReviews(record as any), validation_status: record.validationStatus, validation_errors: record.validationErrors ?? null, sealed_at: record.sealedAt ?? null, sealed_by_moodle_user_id: record.sealedByMoodleUserId ?? null, created_at: record.createdAt };
}

function serializeCompetencyCandidate(record: CompetencyCandidateRecord): Record<string, unknown> {
  return {
    candidate_id: record.candidateId,
    revision: record.revision,
    name: record.name,
    description: record.description,
    derived_from_outcome_ids: record.derivedFromOutcomeIdsJson,
    rationale: record.rationale,
    source_refs: record.sourceRefsJson,
    status: record.status,
    teacher_override: record.teacherOverrideJson ?? undefined,
    edited_from_candidate_id: record.editedFromCandidateId ?? undefined,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function candidateError(error: unknown): { message: string; details?: unknown } {
  return { message: error instanceof Error ? error.message : String(error), ...((error && typeof error === "object" && "details" in error) ? { details: (error as { details?: unknown }).details } : {}) };
}
function asContext(value: unknown): CoreCourseDesignContext | null {
  return value && typeof value === "object" ? value as CoreCourseDesignContext : null;
}

function sendCodedApplicationError(reply: FastifyReply, error: unknown): never | FastifyReply {
  const coded = error as { statusCode?: unknown; code?: unknown; details?: unknown };
  if (typeof coded.statusCode === "number" && coded.statusCode >= 400 && coded.statusCode < 600 && typeof coded.code === "string") {
    return reply.status(coded.statusCode).send({ error: { code: coded.code, message: error instanceof Error ? error.message : String(error), details: coded.details ?? null } });
  }
  throw error;
}

function alignedSections(value: unknown, contextRevision?: number): AlignedStructureSection[] {
  if (!value || typeof value !== "object") return [];
  const content = value as { contentJson?: unknown; content?: unknown };
  const raw = content.contentJson ?? content.content;
  const record = value as Record<string, unknown>;
  const constraints = (record.teacherConstraintsJson ?? record.teacher_constraints) as Record<string, unknown> | undefined;
  const staleByContext = contextRevision !== undefined && constraints?.alignment_context_revision !== undefined && Number(constraints.alignment_context_revision) !== contextRevision;
  const sections = raw && typeof raw === "object" && Array.isArray((raw as { sections?: unknown }).sections)
    ? (raw as { sections: unknown[] }).sections
    : [];
  return sections.map((item, index) => {
    const section = item as Record<string, unknown>;
    return {
      ref: typeof section.ref === "string" ? section.ref : "section-" + String(index + 1).padStart(2, "0"),
      position: typeof section.position === "number" ? section.position : index + 1,
      title: typeof section.title === "string" ? section.title : "Section " + (index + 1),
      summary: typeof section.summary === "string" ? section.summary : "Section " + (index + 1),
      source_refs: Array.isArray(section.source_refs) ? section.source_refs : [],
      activity_intents: Array.isArray(section.activity_intents) ? section.activity_intents : [],
      aligned_objective_ids: Array.isArray(section.aligned_objective_ids) ? section.aligned_objective_ids.filter((id): id is string => typeof id === "string") : [],
      aligned_outcome_ids: Array.isArray(section.aligned_outcome_ids) ? section.aligned_outcome_ids.filter((id): id is string => typeof id === "string") : [],
      alignment_status: staleByContext || section.alignment_status === "STALE_ALIGNMENT" ? "STALE_ALIGNMENT" : "CURRENT",
    };
  });
}

function overrides(value: unknown): ExternalCoverageOverride[] {
  if (!value || typeof value !== "object") return [];
  const constraints = value as { teacherConstraintsJson?: unknown; teacher_constraints?: unknown };
  const raw = constraints.teacherConstraintsJson ?? constraints.teacher_constraints;
  const list = raw && typeof raw === "object" && Array.isArray((raw as { coverage_overrides?: unknown }).coverage_overrides)
    ? (raw as { coverage_overrides: unknown[] }).coverage_overrides
    : [];
  return list.filter((item): item is ExternalCoverageOverride => {
    if (!item || typeof item !== "object") return false;
    const itemRecord = item as Record<string, unknown>;
    return itemRecord.acknowledged === true && typeof itemRecord.outcome_id === "string" && typeof itemRecord.reason === "string";
  });
}

function authorize(request: { headers: Record<string, unknown> }, config: AppConfig, reply: { status: (code: number) => { send: (body: unknown) => unknown } }): boolean {
  const configured = config.instructionalDesignServiceKey;
  const supplied = request.headers["x-agentpoc-instructional-design-key"];
  if (!configured || typeof supplied !== "string" || supplied !== configured) {
    reply.status(401).send({ error: { code: "INSTRUCTIONAL_DESIGN_UNAUTHORIZED", message: "Instructional Design service authorization is required." } });
    return false;
  }
  return true;
}

export const instructionalDesignRoutes: FastifyPluginAsync<InstructionalDesignRoutesOptions> = async (fastify, options) => {
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getStructureRepo = () => options.structureRevisionRepo ?? new CourseStructureRevisionRepository(getDatabase());

  fastify.get<{ Params: { runId: string } }>("/api/runs/:runId/instructional-design", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    const run = await getRunRepo()?.getRun(request.params.runId);
    if (!run) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Run not found." } });
    const repo = getRunRepo();
    const context = repo && typeof (repo as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext === "function"
      ? asContext(await (repo as RunRepository & { getCoreCourseDesignContext: (id: string) => Promise<unknown> }).getCoreCourseDesignContext(request.params.runId))
      : null;
    if (!context) return reply.status(404).send({ error: { code: "CORE_CONTEXT_NOT_FOUND", message: "Core Course Design Context is not available." } });
    const structure = await getStructureRepo()?.getLatestRevision(request.params.runId);
    const sections = alignedSections(structure, context.revision);
    const coverage = deriveOutcomeCoverage(context, sections, overrides(structure));
    const competencyCandidates = options.candidateRepo ? (await options.candidateRepo.list(request.params.runId)).map(serializeCompetencyCandidate) : [];
    return {
      role: "Instructional Designer",
      operation: "DESIGN_STRUCTURE",
      core_context: context,
      structure_revision: serializeStructureRevision(structure),
      outcome_proposals: buildLearningOutcomeProposals(context),
      coverage,
      alignment_matrix: coverage.map((item) => ({ outcome_id: item.outcome_id, state: item.state, section_refs: item.section_refs })),
      competency_candidates: competencyCandidates,
    };
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/outcomes/approve", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    try {
      const result = await approveReviewedLearningOutcome({
        runRepo: getRunRepo(),
        candidateRepo: options.candidateRepo ?? new CompetencyCandidateRepository(getDatabase()),
        structureRepo: getStructureRepo(),
        activityIntentRepo: options.activityIntentRepo ?? new ActivityIntentRepository(getDatabase()),
        reviewRepo: options.reviewRepo ?? new OutcomeReviewRepository(getDatabase()),
      }, { runId: request.params.runId, body: request.body, enforceOutcomeReview: options.enforceOutcomeReview === true });
      return { run_id: request.params.runId, core_context: result.context, alignment_status: result.alignmentStatus };
    } catch (error) {
      return sendCodedApplicationError(reply, error);
    }
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/outcomes/edit-approved", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const result = await editApprovedOutcome({
      runRepo: getRunRepo(),
      structureRevisionRepo: getStructureRepo(),
      candidateRepo: options.candidateRepo ?? new CompetencyCandidateRepository(getDatabase()),
      reviewRepo: options.reviewRepo ?? new OutcomeReviewRepository(getDatabase()),
      activityIntentRepo: options.activityIntentRepo ?? new ActivityIntentRepository(getDatabase()),
    }, {
      runId: request.params.runId,
      sourceOutcomeId: typeof body.source_outcome_id === "string" ? body.source_outcome_id : "",
      teacherText: typeof body.teacher_text === "string" ? body.teacher_text : "",
      confirmed: body.confirmed === true,
      ...(typeof body.teacher_id === "number" ? { teacherId: body.teacher_id } : {}),
    });

    return {
      run_id: request.params.runId,
      core_context: result.context,
      review: {
        item_type: result.review.itemType, item_id: result.review.itemId, status: result.review.status, draft_text: result.review.draftText,
        updated_by_moodle_user_id: result.review.updatedByMoodleUserId, updated_at: result.review.updatedAt,
      },
      invalidated_clo_approval: {
        outcome_id: result.invalidatedOutcomeIds[0] ?? null,
        outcome_ids: result.invalidatedOutcomeIds,
        source_outcome_id: typeof body.source_outcome_id === "string" ? body.source_outcome_id.trim() : "",
      },
      stale: {
        structure_alignment: result.stale.structureAlignment,
        activity_count: result.stale.activityCount,
        competency_candidate_count: result.stale.competencyCandidateCount,
      },
    };
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/course-structure/coverage-overrides", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    const repo = getRunRepo();
    const structureRepo = getStructureRepo();
    const run = await repo?.getRun(request.params.runId);
    if (!run || !repo || !structureRepo) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Run or Structure not found." } });
    const context = typeof (repo as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext === "function"
      ? asContext(await (repo as RunRepository & { getCoreCourseDesignContext: (id: string) => Promise<unknown> }).getCoreCourseDesignContext(request.params.runId))
      : null;
    if (!context) return reply.status(404).send({ error: { code: "CORE_CONTEXT_NOT_FOUND", message: "Core Course Design Context is not available." } });
    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const outcomeId = typeof body.outcome_id === "string" ? body.outcome_id : "";
    if (!context.approved_learning_outcomes.some((item) => item.outcome_id === outcomeId)) {
      return reply.status(422).send({ error: { code: "OUTCOME_INVALID", message: "External coverage requires an approved Outcome." } });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (body.acknowledged !== true || reason === "") {
      return reply.status(422).send({ error: { code: "COVERAGE_OVERRIDE_REQUIRED", message: "Teacher acknowledgment and a reason are required." } });
    }
    const override: ExternalCoverageOverride = { outcome_id: outcomeId, acknowledged: true, reason, ...(typeof body.teacher_id === "number" ? { teacher_id: body.teacher_id } : {}) };
    if (typeof (structureRepo as { setExternalCoverageOverride?: unknown }).setExternalCoverageOverride !== "function") {
      return reply.status(501).send({ error: { code: "COVERAGE_PERSISTENCE_UNAVAILABLE", message: "Coverage override persistence is not configured." } });
    }
    await beginInstructionalDesignMutation(repo, request.params.runId);
    const structure = await (structureRepo as CourseStructureRevisionRepository & { setExternalCoverageOverride: (runId: string, value: ExternalCoverageOverride) => Promise<unknown> }).setExternalCoverageOverride(request.params.runId, override);
    const coverage = deriveOutcomeCoverage(context, alignedSections(structure, context.revision), [override]);
    return { run_id: request.params.runId, structure_revision: serializeStructureRevision(structure), coverage };
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/course-structure/validate-coverage", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    const repo = getRunRepo();
    const structureRepo = getStructureRepo();
    const run = await repo?.getRun(request.params.runId);
    if (!run || !repo || !structureRepo) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Run or Structure not found." } });
    const context = typeof (repo as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext === "function"
      ? asContext(await (repo as RunRepository & { getCoreCourseDesignContext: (id: string) => Promise<unknown> }).getCoreCourseDesignContext(request.params.runId))
      : null;
    const structure = await structureRepo.getLatestRevision(request.params.runId);
    if (!context || !structure) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Core Context or Structure not found." } });
    try { assertRequiredOutcomeApprovals(context); } catch (error) {
      return reply.status(422).send({ error: { code: "APPROVED_OUTCOMES_REQUIRED", message: error instanceof Error ? error.message : String(error), details: (error as { details?: unknown }).details } });
    }
    const coverage = deriveOutcomeCoverage(context, alignedSections(structure, context.revision), overrides(structure));
    try { assertOutcomeCoverage(coverage); } catch (error) {
      return reply.status(422).send({ error: { code: "STRUCTURE_OUTCOME_COVERAGE_REQUIRED", message: error instanceof Error ? error.message : String(error), details: { coverage } } });
    }
    return { run_id: request.params.runId, coverage, approval_ready: true };
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/course-structure/rebase-alignment", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    const repo = getRunRepo();
    const structureRepo = getStructureRepo();
    const run = await repo?.getRun(request.params.runId);
    if (!run || !repo || !structureRepo) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Run or Structure not found." } });
    const context = typeof (repo as { getCoreCourseDesignContext?: unknown }).getCoreCourseDesignContext === "function"
      ? asContext(await (repo as RunRepository & { getCoreCourseDesignContext: (id: string) => Promise<unknown> }).getCoreCourseDesignContext(request.params.runId))
      : null;
    const structure = await structureRepo.getLatestRevision(request.params.runId);
    if (!context || !structure) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Core Context or Structure not found." } });

    try { assertRequiredOutcomeApprovals(context); } catch (error) {
      return reply.status(422).send({ error: { code: "APPROVED_OUTCOMES_REQUIRED", message: error instanceof Error ? error.message : String(error), details: (error as { details?: unknown }).details } });
    }

    const rawSections = alignedSections(structure, context.revision);
    const rebaseResult = rebaseStructureSections(context, rawSections);

    if (rebaseResult.ambiguousOutcomeIds.length > 0) {
      return reply.status(422).send({
        error: {
          code: "AMBIGUOUS_ALIGNMENT",
          message: "Ambiguous outcome mapping detected during rebase. Teacher resolution required.",
          details: { ambiguous_outcome_ids: rebaseResult.ambiguousOutcomeIds },
        },
      });
    }

    // Validate coverage before committing any change to preserve prior Structure authority
    const coverage = deriveOutcomeCoverage(context, rebaseResult.rebasedSections, overrides(structure));
    try {
      assertOutcomeCoverage(coverage);
    } catch (error) {
      return reply.status(422).send({
        error: {
          code: "STRUCTURE_OUTCOME_COVERAGE_REQUIRED",
          message: error instanceof Error ? error.message : String(error),
          details: { coverage },
        },
      });
    }

    if (typeof (structureRepo as { createRebasedStructureRevision?: unknown }).createRebasedStructureRevision !== "function") {
      return reply.status(501).send({ error: { code: "REBASE_PERSISTENCE_UNAVAILABLE", message: "Structure rebase persistence is not configured." } });
    }

    await beginInstructionalDesignMutation(repo, request.params.runId);
    const rebasedStructure = await (structureRepo as CourseStructureRevisionRepository & {
      createRebasedStructureRevision: (runId: string, currentContextRevision: number, rebasedSections: unknown[]) => Promise<unknown>;
    }).createRebasedStructureRevision(request.params.runId, context.revision, rebaseResult.rebasedSections);

    const updatedSections = alignedSections(rebasedStructure, context.revision);
    const finalCoverage = deriveOutcomeCoverage(context, updatedSections, overrides(rebasedStructure));

    return {
      run_id: request.params.runId,
      structure_revision: serializeStructureRevision(rebasedStructure),
      coverage: finalCoverage,
      alignment_status: "CURRENT",
    };
  });


  fastify.get<{ Params: { runId: string } }>("/api/runs/:runId/competency-candidates", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    const runRepo = getRunRepo();
    if (!(await runRepo.getRun(request.params.runId))) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Run not found." } });
    const repo = options.candidateRepo ?? new CompetencyCandidateRepository(getDatabase());
    return { run_id: request.params.runId, candidates: (await repo.list(request.params.runId)).map(serializeCompetencyCandidate) };
  });

  fastify.post<{ Params: { runId: string } }>("/api/runs/:runId/competency-candidates/derive", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    const runRepo = getRunRepo();
    if (!(await runRepo.getRun(request.params.runId))) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Run not found." } });
    const repo = options.candidateRepo ?? new CompetencyCandidateRepository(getDatabase());
    const context = asContext(await (runRepo as RunRepository & { getCoreCourseDesignContext: (id: string) => Promise<unknown> }).getCoreCourseDesignContext(request.params.runId));
    if (!context) return reply.status(404).send({ error: { code: "CORE_CONTEXT_NOT_FOUND", message: "Core Course Design Context is not available." } });
    if (context.approved_learning_outcomes.length === 0) return reply.status(422).send({ error: { code: "APPROVED_OUTCOMES_REQUIRED", message: "Competency derivation requires at least one Teacher-approved Learning Outcome." } });
    try {
      const candidates = await deriveCompetencyCandidates(context, options.modelClient ?? (await import("../config/model-client-factory.js")).createConfiguredModelClient(options.config), { model: options.config.modelName, timeoutMs: options.config.agentModelTimeoutMs });
      await beginInstructionalDesignMutation(runRepo, request.params.runId);
      const saved = await repo.saveProposed(request.params.runId, candidates);
      return { run_id: request.params.runId, context_revision: context.revision, candidates: saved.map(serializeCompetencyCandidate), operation: "DERIVE_COMPETENCIES" };
    } catch (error) {
      const details = candidateError(error);
      return reply.status(422).send({ error: { code: "COMPETENCY_DERIVATION_INVALID", ...details } });
    }
  });

  fastify.post<{ Params: { runId: string; candidateId: string } }>("/api/runs/:runId/competency-candidates/:candidateId/decision", async (request, reply) => {
    if (!authorize(request, options.config, reply)) return;
    const runRepo = getRunRepo();
    const repo = options.candidateRepo ?? new CompetencyCandidateRepository(getDatabase());
    try {
      const updated = await applyCompetencyCandidateDecision({ runRepo, candidateRepo: repo }, {
        runId: request.params.runId,
        candidateId: request.params.candidateId,
        body: request.body,
      });
      return { run_id: request.params.runId, candidate: serializeCompetencyCandidate(updated) };
    } catch (error) {
      return sendCodedApplicationError(reply, error);
    }
  });
};
