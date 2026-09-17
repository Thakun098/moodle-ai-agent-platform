import { createHash } from "node:crypto";
import { assertInitialCoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { coreCourseDesignContexts } from "../db/schema/core-course-design-contexts.js";
import type { CoreCourseDesignContext, NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { desc, eq } from "drizzle-orm";
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
    return row?.context ?? null;
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
  async claimApprovedExecution(data: { runId: string; planId: string; revision: number }): Promise<PocRunRecord> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, data.runId)).for("update");
      if (!run) throw codedError("NOT_FOUND", `Run ${data.runId} not found.`);
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
      await tx.insert(coreCourseDesignContexts).values({ runId: context.run_id, revision: context.revision, context });
      await tx.update(pocRun).set({ updatedAt: new Date().toISOString() }).where(eq(pocRun.runId, context.run_id));
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

  async approvePlan(data: { runId: string; planId: string; revision: number; approvedByMoodleUserId?: string | undefined }): Promise<PocRunRecord> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, data.runId)).for("update");
      if (!run) throw codedError("NOT_FOUND", `Run not found for approval: ${data.runId}`);
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
