import { createHash } from "node:crypto";
import type { CompetencyParticipation } from "../competency-participation.js";
import { assertInitialCoreCourseDesignContext, derivePrimaryOutputLanguageAuthority } from "@moodle-agent-poc/contracts";
import { coreCourseDesignContexts } from "../db/schema/core-course-design-contexts.js";
import { competencyCandidate } from "../db/schema/competency-candidates.js";
import { activityIntent } from "../db/schema/activity-intents.js";
import type { CoreCourseDesignContext, NormalizedSyllabus, PrimaryOutputLanguageAuthority } from "@moodle-agent-poc/contracts";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  pocRun,
  type NewPocRunRecord,
  type PocRunRecord,
  type PocRunStatus,
  type SyllabusMetadata,
} from "../db/schema/runs.js";

function codedError(code: string, message: string, statusCode = code === "NOT_FOUND" ? 404 : 409): Error & { code: string; statusCode: number } {
  return Object.assign(new Error(message), { code, statusCode });
}

function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sort(entry)]));
    }
    return item;
  };
  return JSON.stringify(sort(value));
}

function learnerContextSemanticShape(context: CoreCourseDesignContext["learner_context"]): Omit<CoreCourseDesignContext["learner_context"], "revision" | "teacher_acknowledged_unspecified"> {
  const { revision: _revision, teacher_acknowledged_unspecified: _acknowledged, ...semantic } = context;
  return semantic;
}

function deriveLegacyPrimaryOutputLanguage(context: CoreCourseDesignContext): PrimaryOutputLanguageAuthority {
  return derivePrimaryOutputLanguageAuthority({
    schedule_or_topics: (context.schedule_or_topics ?? []).flatMap((item) => [item.title, ...(item.topics ?? [])]),
    objectives_outcomes: [
      ...(context.learning_objectives ?? []).map((item) => item.source_text),
      ...(context.source_learning_outcomes ?? []).map((item) => item.source_text),
    ],
    course_title: (context.course?.title ?? []).map((item) => item.text),
  });
}

function normalizePrimaryOutputLanguage(context: CoreCourseDesignContext): CoreCourseDesignContext {
  if (context.primary_output_language) return context;
  return {
    ...context,
    primary_output_language: deriveLegacyPrimaryOutputLanguage(context),
  };
}

export class RunRepository {
  constructor(private readonly db: AppDatabase) {}

  async createRun(data: {
    runId: string;
    model: string;
    status?: PocRunStatus;
    syllabusMetadata?: SyllabusMetadata;
    normalizedSyllabus?: NormalizedSyllabus;
  }): Promise<PocRunRecord> {
    const insertData: NewPocRunRecord = {
      runId: data.runId,
      model: data.model,
      status: data.status ?? "pending",
      syllabusMetadata: data.syllabusMetadata,
      normalizedSyllabus: data.normalizedSyllabus,
    };
    const [created] = await this.db.insert(pocRun).values(insertData).returning();
    if (!created) throw new Error(`Failed to create run with id ${data.runId}`);
    return created;
  }

  async getRun(runId: string): Promise<PocRunRecord | null> {
    const [record] = await this.db.select().from(pocRun).where(eq(pocRun.runId, runId)).limit(1);
    return record ?? null;
  }

  async getCoreCourseDesignContext(runId: string): Promise<CoreCourseDesignContext | null> {
    const [row] = await this.db.select().from(coreCourseDesignContexts)
      .where(eq(coreCourseDesignContexts.runId, runId)).orderBy(desc(coreCourseDesignContexts.revision)).limit(1);
    return row?.context ? normalizePrimaryOutputLanguage(row.context) : null;
  }

  async saveCompetencyParticipation(runId: string, value: CompetencyParticipation, expectedRevision: number): Promise<CompetencyParticipation> {
    return this.db.transaction(async tx => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, runId)).for("update");
      if (!run) throw codedError("NOT_FOUND", `Run ${runId} not found.`, 404);
      if (["executing", "awaiting_verification", "completed"].includes(run.status)) throw codedError("INSTRUCTIONAL_DESIGN_MUTATION_LOCKED", "Competency participation cannot change during or after Execute.");
      if ((run.competencyParticipation?.revision ?? 0) !== expectedRevision) throw codedError("COMPETENCY_PARTICIPATION_CONFLICT", "Competency participation changed; reload before retrying.");
      const authority = (state: CompetencyParticipation | null) => state ? { status: state.status, reason: state.status === "BYPASSED" ? state.reason : null, framework_id: state.framework_id, framework_signature: state.framework_signature } : null;
      const previous = authority(run.competencyParticipation);
      const next = authority(value);
      const authorityChanged = canonicalJson(previous) !== canonicalJson(next);
      const saved = { ...value, revision: expectedRevision + (authorityChanged ? 1 : 0) };
      await tx.update(pocRun).set({ competencyParticipation: saved, ...(authorityChanged ? { approvedPlanId: null, approvedRevision: null, approvedAt: null, approvedByMoodleUserId: null } : {}), updatedAt: new Date().toISOString() }).where(eq(pocRun.runId, runId));
      return saved;
    });
  }

  async acknowledgeUnspecifiedLearnerContext(runId: string, expectedLearnerContextRevision: number): Promise<CoreCourseDesignContext> {
    return this.db.transaction(async tx => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, runId)).for("update");
      if (!run) throw codedError("NOT_FOUND", `Run ${runId} not found.`);
      const [latest] = await tx.select().from(coreCourseDesignContexts)
        .where(eq(coreCourseDesignContexts.runId, runId)).orderBy(desc(coreCourseDesignContexts.revision)).limit(1);
      if (!latest) throw codedError("CORE_CONTEXT_NOT_FOUND", "No persisted Core Course Design Context for this run.", 404);
      const latestContext = normalizePrimaryOutputLanguage(latest.context);
      if (latestContext.learner_context.revision !== expectedLearnerContextRevision) {
        throw codedError("LEARNER_CONTEXT_STALE", "Learner Context revision is stale; reload the current Core Context before acknowledging.");
      }
      if (latestContext.learner_context.status !== "UNSPECIFIED") {
        throw codedError("LEARNER_CONTEXT_ACK_NOT_REQUIRED", "Learner Context acknowledgment is only valid while learner context is UNSPECIFIED.");
      }
      if (latestContext.learner_context.teacher_acknowledged_unspecified) return latestContext;
      if (["executing", "awaiting_verification", "completed"].includes(run.status)) {
        throw codedError(
          "INSTRUCTIONAL_DESIGN_MUTATION_LOCKED",
          `Instructional Design authority cannot change while run ${runId} is ${run.status}.`,
        );
      }
      const next: CoreCourseDesignContext = {
        ...latestContext,
        revision: latestContext.revision + 1,
        learner_context: {
          ...latestContext.learner_context,
          teacher_acknowledged_unspecified: true,
        },
      };
      await tx.insert(coreCourseDesignContexts).values({ runId, revision: next.revision, context: next });
      const shouldEnterPlanning = run.status === "preview" || run.status === "failed";
      await tx.update(pocRun).set({
        ...(shouldEnterPlanning ? { status: "planning" as const, error: null } : {}),
        approvedPlanId: null,
        approvedRevision: null,
        approvedAt: null,
        approvedByMoodleUserId: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(pocRun.runId, runId));
      return next;
    });
  }

  /**
   * Serializes any Instructional Design authority mutation against Execute.
   * The mutation itself may happen after this transaction, but approval is
   * invalidated first. An Execute claim racing this call therefore either
   * wins the row lock (and freezes later mutation) or observes no approval.
   */
  async beginInstructionalDesignMutation(runId: string): Promise<PocRunRecord> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, runId)).for("update");
      if (!run) throw codedError("NOT_FOUND", `Run ${runId} not found.`);
      if (["executing", "awaiting_verification", "completed"].includes(run.status)) {
        throw codedError(
          "INSTRUCTIONAL_DESIGN_MUTATION_LOCKED",
          `Instructional Design authority cannot change while run ${runId} is ${run.status}.`,
        );
      }
      const shouldEnterPlanning = run.status === "preview" || run.status === "failed";
      const approvalIsAlreadyClear = !run.approvedPlanId && run.approvedRevision === null && run.approvedAt === null && run.approvedByMoodleUserId === null;
      if (!shouldEnterPlanning && approvalIsAlreadyClear) return run;
      const [updated] = await tx.update(pocRun).set({
        ...(shouldEnterPlanning ? { status: "planning" as const, error: null } : {}),
        approvedPlanId: null,
        approvedRevision: null,
        approvedAt: null,
        approvedByMoodleUserId: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(pocRun.runId, runId)).returning();
      if (!updated) throw codedError("NOT_FOUND", `Run ${runId} not found.`);
      return updated;
    });
  }

  /** Atomically claims the exact current approval for Course execution. */
  async claimApprovedExecution(data: { runId: string; planId: string; revision: number; competencyParticipationRevision?: number }): Promise<PocRunRecord> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, data.runId)).for("update");
      if (!run) throw codedError("NOT_FOUND", `Run ${data.runId} not found.`);
      if (data.competencyParticipationRevision !== undefined && run.competencyParticipation?.revision !== data.competencyParticipationRevision) throw codedError("COMPETENCY_EXECUTION_SNAPSHOT_STALE", "Competency participation changed before Execute.");
      if (run.approvedPlanId !== data.planId || run.approvedRevision !== data.revision) {
        throw codedError(
          "PLAN_NOT_APPROVED",
          `Plan revision ${data.revision} for plan ${data.planId} is not the current approved authority for run ${data.runId}.`,
        );
      }
      if (!["preview", "failed"].includes(run.status)) {
        throw codedError(
          "RUN_STATE_INVALID",
          `Run ${data.runId} cannot start execution from ${run.status}.`,
        );
      }
      const [updated] = await tx.update(pocRun).set({
        status: "executing",
        error: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(pocRun.runId, data.runId)).returning();
      if (!updated) throw codedError("NOT_FOUND", `Run ${data.runId} not found.`);
      return updated;
    });
  }

  /** Atomically verifies that read-back is for the exact execution authority awaiting verification. */
  async assertApprovedVerification(data: { runId: string; planId: string; revision: number }): Promise<PocRunRecord> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, data.runId)).for("update");
      if (!run) throw codedError("NOT_FOUND", `Run ${data.runId} not found.`);
      if (run.approvedPlanId !== data.planId || run.approvedRevision !== data.revision) {
        throw codedError("VERIFICATION_AUTHORITY_STALE", `Plan revision ${data.revision} for plan ${data.planId} is not the current approved verification authority for run ${data.runId}.`);
      }
      if (run.status !== "awaiting_verification") {
        throw codedError("VERIFICATION_STATE_INVALID", `Run ${data.runId} cannot be verified from ${run.status}; expected awaiting_verification.`);
      }
      return run;
    });
  }

  /** Finalizes verification only if the exact approved execution authority is still current. */
  async finishApprovedVerification(data: { runId: string; planId: string; revision: number; passed: boolean; finalResult?: Record<string, unknown>; error?: string }): Promise<PocRunRecord> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, data.runId)).for("update");
      if (!run) throw codedError("NOT_FOUND", `Run ${data.runId} not found.`);
      if (run.approvedPlanId !== data.planId || run.approvedRevision !== data.revision) {
        throw codedError("VERIFICATION_AUTHORITY_STALE", `Plan revision ${data.revision} for plan ${data.planId} is no longer the approved verification authority for run ${data.runId}.`);
      }
      if (run.status !== "awaiting_verification") {
        throw codedError("VERIFICATION_STATE_INVALID", `Run ${data.runId} cannot finish verification from ${run.status}; expected awaiting_verification.`);
      }
      const [updated] = await tx.update(pocRun).set(data.passed ? {
        status: "completed" as const,
        finalResult: data.finalResult ?? null,
        error: null,
        updatedAt: new Date().toISOString(),
      } : {
        status: "failed" as const,
        error: data.error ?? "Verification failed.",
        updatedAt: new Date().toISOString(),
      }).where(eq(pocRun.runId, data.runId)).returning();
      if (!updated) throw codedError("NOT_FOUND", `Run ${data.runId} not found.`);
      return updated;
    });
  }

  /** Publish the initial semantic revision and its immutable source atomically. */
  async initializeCoreCourseDesignContext(runId: string, syllabus: NormalizedSyllabus, context: CoreCourseDesignContext): Promise<void> {
    assertInitialCoreCourseDesignContext(context);
    if (context.source_syllabus.text_sha256 !== createHash("sha256").update(syllabus.raw_text).digest("hex")) throw new Error("Core Context text source mismatch");
    if (context.run_id !== runId || context.revision !== 1 || context.source_syllabus.sha256 !== syllabus.metadata.sha256) throw new Error("Core Context source or identity mismatch");
    await this.db.transaction(async tx => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, runId)).for("update");
      if (!run) throw new Error("Run not found for Core Context initialization");
      const [existing] = await tx.select().from(coreCourseDesignContexts).where(eq(coreCourseDesignContexts.runId, runId)).limit(1);
      if (existing) {
        if (existing.context.source_syllabus.sha256 !== context.source_syllabus.sha256 || existing.context.source_syllabus.text_sha256 !== context.source_syllabus.text_sha256) throw new Error("Core Context source is immutable");
        return;
      }
      await tx.update(pocRun).set({ normalizedSyllabus: syllabus, updatedAt: new Date().toISOString() }).where(eq(pocRun.runId, runId));
      await tx.insert(coreCourseDesignContexts).values({ runId, revision: 1, context });
    });
  }

  async saveCoreCourseDesignContextRevision(context: CoreCourseDesignContext): Promise<void> {
    await this.db.transaction(async tx => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, context.run_id)).for("update");
      if (!run) throw new Error("Run not found for Core Context revision");
      const [latest] = await tx.select().from(coreCourseDesignContexts).where(eq(coreCourseDesignContexts.runId, context.run_id)).orderBy(desc(coreCourseDesignContexts.revision)).limit(1);
      if (!latest || context.revision !== latest.revision + 1) throw new Error("Core Context revision must advance from the current revision");
      if (latest.context.source_syllabus.sha256 !== context.source_syllabus.sha256 || latest.context.source_syllabus.text_sha256 !== context.source_syllabus.text_sha256) throw new Error("Core Context source is immutable");
      const latestContext = normalizePrimaryOutputLanguage(latest.context);
      const latestLearnerContext = latestContext.learner_context;
      const requestedLearnerContext = context.learner_context;
      let normalizedLearnerContext = requestedLearnerContext;
      if (latestLearnerContext && requestedLearnerContext) {
        const learnerContextChanged = canonicalJson(learnerContextSemanticShape(latestLearnerContext))
          !== canonicalJson(learnerContextSemanticShape(requestedLearnerContext));
        normalizedLearnerContext = learnerContextChanged
          ? {
              ...requestedLearnerContext,
              revision: latestLearnerContext.revision + 1,
              teacher_acknowledged_unspecified: false,
            }
          : {
              ...requestedLearnerContext,
              revision: latestLearnerContext.revision,
              teacher_acknowledged_unspecified: latestLearnerContext.teacher_acknowledged_unspecified,
            };
      } else if (latestLearnerContext && !requestedLearnerContext) {
        normalizedLearnerContext = latestLearnerContext;
      }
      const authoritativePrimaryOutputLanguage = latestContext.primary_output_language;
      const normalizedContext: CoreCourseDesignContext = {
        ...context,
        primary_output_language: authoritativePrimaryOutputLanguage,
        ...(normalizedLearnerContext ? { learner_context: normalizedLearnerContext } : {}),
      };
      const previousOutcomes = new Map(latestContext.approved_learning_outcomes.map((outcome) => [outcome.outcome_id, canonicalJson(outcome)]));
      const nextOutcomes = new Map(normalizedContext.approved_learning_outcomes.map((outcome) => [outcome.outcome_id, canonicalJson(outcome)]));
      const changedOutcomeIds = new Set([...new Set([...previousOutcomes.keys(), ...nextOutcomes.keys()])]
        .filter((outcomeId) => previousOutcomes.get(outcomeId) !== nextOutcomes.get(outcomeId)));
      const candidates = changedOutcomeIds.size > 0
        ? await tx.select().from(competencyCandidate).where(eq(competencyCandidate.runId, normalizedContext.run_id)).for("update")
        : [];
      await tx.insert(coreCourseDesignContexts).values({ runId: normalizedContext.run_id, revision: normalizedContext.revision, context: normalizedContext });
      for (const candidate of candidates) {
        if (candidate.status !== "APPROVED" || !candidate.derivedFromOutcomeIdsJson.some((outcomeId) => changedOutcomeIds.has(outcomeId))) continue;
        await tx.update(competencyCandidate).set({
          revision: candidate.revision + 1,
          status: "PROPOSED",
          teacherOverrideJson: null,
          updatedAt: new Date().toISOString(),
        }).where(eq(competencyCandidate.id, candidate.id));
      }
      await tx.update(activityIntent).set({
        status: "stale",
        attemptCount: 0,
        error: "Core Course Design Context changed. Regenerate this Activity before finalization.",
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(activityIntent.runId, normalizedContext.run_id),
        inArray(activityIntent.status, ["generated", "shell", "creating"]),
        or(isNull(activityIntent.contextRevision), ne(activityIntent.contextRevision, normalizedContext.revision)),
      ));
      await tx.update(pocRun).set({ updatedAt: new Date().toISOString() }).where(eq(pocRun.runId, normalizedContext.run_id));
    });
  }

  async setNormalizedSyllabus(runId: string, normalizedSyllabus: NormalizedSyllabus): Promise<PocRunRecord> {
    return this.db.transaction(async tx => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, runId)).for("update");
      if (!run) throw new Error("Run not found for syllabus update: " + runId);
      const [context] = await tx.select().from(coreCourseDesignContexts).where(eq(coreCourseDesignContexts.runId, runId)).limit(1);
      if (context && (context.context.source_syllabus.sha256 !== normalizedSyllabus.metadata.sha256 || context.context.source_syllabus.text_sha256 !== createHash("sha256").update(normalizedSyllabus.raw_text).digest("hex"))) throw new Error("Cannot replace immutable Core Context source");
      const [updated] = await tx.update(pocRun).set({ normalizedSyllabus, updatedAt: new Date().toISOString() }).where(eq(pocRun.runId, runId)).returning();
      return updated!;
    });
  }

  async setResourcePublication(runId: string, sectionRef: string, publish: boolean): Promise<PocRunRecord> {
    const current = await this.getRun(runId);
    if (!current) throw new Error(`Run not found for resource publication update: ${runId}`);
    const metadata = current.syllabusMetadata ?? {};
    const publication = { ...(metadata.resource_publication ?? {}), [sectionRef]: publish };
    const [updated] = await this.db.update(pocRun).set({ syllabusMetadata: { ...metadata, resource_publication: publication }, updatedAt: new Date().toISOString() }).where(eq(pocRun.runId, runId)).returning();
    if (!updated) throw new Error(`Run not found for resource publication update: ${runId}`);
    return updated;
  }

  async updateStatus(runId: string, status: PocRunStatus, error?: string): Promise<PocRunRecord> {
    const [updated] = await this.db.update(pocRun).set({ status, error: error ?? null, updatedAt: new Date().toISOString() }).where(eq(pocRun.runId, runId)).returning();
    if (!updated) throw new Error(`Run not found for update: ${runId}`);
    return updated;
  }

  async completeRun(runId: string, finalResult?: Record<string, unknown>): Promise<PocRunRecord> {
    const [updated] = await this.db.update(pocRun).set({ status: "completed", finalResult: finalResult ?? null, updatedAt: new Date().toISOString() }).where(eq(pocRun.runId, runId)).returning();
    if (!updated) throw new Error(`Run not found for completion: ${runId}`);
    return updated;
  }

  async approvePlan(data: { runId: string; planId: string; revision: number; approvedByMoodleUserId?: string | undefined; competencyParticipationRevision?: number }): Promise<PocRunRecord> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, data.runId)).for("update");
      if (!run) throw codedError("NOT_FOUND", `Run not found for approval: ${data.runId}`);
      if (data.competencyParticipationRevision !== undefined && run.competencyParticipation?.revision !== data.competencyParticipationRevision) throw codedError("COMPETENCY_PARTICIPATION_CONFLICT", "Competency participation changed during approval. Finalize and approve the current revision.");
      if (run.status !== "preview") {
        throw codedError("RUN_STATE_INVALID", `Run ${data.runId} cannot publish approval while in ${run.status}; Finalize must return it to preview first.`);
      }
      const [updated] = await tx.update(pocRun).set({
        approvedPlanId: data.planId,
        approvedRevision: data.revision,
        approvedAt: new Date().toISOString(),
        approvedByMoodleUserId: data.approvedByMoodleUserId ?? null,
        updatedAt: new Date().toISOString(),
      }).where(eq(pocRun.runId, data.runId)).returning();
      if (!updated) throw codedError("NOT_FOUND", `Run not found for approval: ${data.runId}`);
      return updated;
    });
  }

  async failRun(runId: string, error: string): Promise<PocRunRecord> {
    return this.updateStatus(runId, "failed", error);
  }
}
