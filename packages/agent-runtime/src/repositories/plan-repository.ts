import {
  validatePlanningContract,
  type AnyPlanEnvelope,
} from "@moodle-agent-poc/contracts";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  pocPlan,
  type NewPocPlanRecord,
  type PocPlanRecord,
  type PocPlanValidationStatus,
  type PlanExecutionContext,
} from "../db/schema/plans.js";

export class PlanRepository {
  constructor(private readonly db: AppDatabase) {}

  async savePlanRevision(data: {
    id: string;
    planId: string;
    runId: string;
    planType: string;
    operation: string;
    revision: number;
    title: string;
    summary: string;
    content: Record<string, unknown>;
    rawEnvelope: AnyPlanEnvelope;
    validationStatus: PocPlanValidationStatus;
    validationErrors?: unknown;
    reviewRequirements?: Array<{ code: string; activity_ref?: string }>;
    executionContext?: PlanExecutionContext;
  }): Promise<PocPlanRecord> {
    if (data.validationStatus === "valid") {
      const validation = validatePlanningContract(data.rawEnvelope);
      if (!validation.valid) {
        const errorDetails = validation.errors
          .map((err) => `${err.instancePath || "/"}: ${err.message}`)
          .join("; ");
        throw new Error(
          `Cannot save plan revision as valid: Planning contract schema validation failed (${errorDetails})`
        );
      }
    }

    const insertData: NewPocPlanRecord = {
      id: data.id,
      planId: data.planId,
      runId: data.runId,
      planType: data.planType,
      operation: data.operation,
      revision: data.revision,
      title: data.title,
      summary: data.summary,
      content: data.content,
      rawEnvelope: data.rawEnvelope,
      validationStatus: data.validationStatus,
      validationErrors: data.validationErrors ?? null,
      reviewRequirements: data.reviewRequirements ?? [],
      executionContext: data.executionContext ?? null,
    };
    const [created] = await this.db.insert(pocPlan).values(insertData).returning();
    if (!created) {
      throw new Error(
        `Failed to save plan revision for plan ${data.planId} rev ${data.revision}`
      );
    }
    return created;
  }

  async getPlanRevision(
    planId: string,
    revision: number
  ): Promise<PocPlanRecord | null> {
    const [record] = await this.db
      .select()
      .from(pocPlan)
      .where(and(eq(pocPlan.planId, planId), eq(pocPlan.revision, revision)))
      .limit(1);
    return record ?? null;
  }

  /** First execution pins create-targets atomically; subsequent calls cannot retarget retries. */
  async bindExecutionContext(planId: string, revision: number, context: PlanExecutionContext): Promise<PlanExecutionContext> {
    const [bound] = await this.db.update(pocPlan).set({ executionContext: context })
      .where(and(eq(pocPlan.planId, planId), eq(pocPlan.revision, revision), isNull(pocPlan.executionContext)))
      .returning();
    const current = bound ?? await this.getPlanRevision(planId, revision);
    if (!current?.executionContext) throw new Error("Plan execution context could not be bound.");
    return current.executionContext;
  }

  async getLatestRevision(planId: string): Promise<PocPlanRecord | null> {
    const [record] = await this.db
      .select()
      .from(pocPlan)
      .where(eq(pocPlan.planId, planId))
      .orderBy(desc(pocPlan.revision))
      .limit(1);
    return record ?? null;
  }

  async listPlanRevisions(planId: string): Promise<PocPlanRecord[]> {
    return this.db
      .select()
      .from(pocPlan)
      .where(eq(pocPlan.planId, planId))
      .orderBy(desc(pocPlan.revision));
  }

  async listRunPlans(runId: string): Promise<PocPlanRecord[]> {
    return this.db
      .select()
      .from(pocPlan)
      .where(eq(pocPlan.runId, runId))
      .orderBy(desc(pocPlan.createdAt));
  }
}
