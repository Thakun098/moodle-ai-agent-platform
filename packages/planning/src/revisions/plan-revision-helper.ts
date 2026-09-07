import { randomUUID } from "node:crypto";
import type { PlanRepository, PocPlanRecord } from "@moodle-agent-poc/agent-runtime";
import {
  validatePlanningContract,
  type AnyPlanEnvelope,
  type SourceReference,
} from "@moodle-agent-poc/contracts";
import {
  buildProvenanceAllowlistFromSources,
  validatePlanningDomainInvariants,
} from "../domain/planning-domain-validator.js";
import { PlanningError } from "../errors/planning-errors.js";
import { extractPlanSourceReferences } from "../preview/plan-preview.js";

function sourceReferenceKey(ref: SourceReference): string {
  return JSON.stringify([
    ref.source,
    ref.page ?? null,
    ref.section ?? null,
    ref.text ?? null,
  ]);
}

function assertExactSourceSubset(
  candidateSources: readonly SourceReference[],
  allowedSources: readonly SourceReference[]
): void {
  const allowed = new Set(allowedSources.map(sourceReferenceKey));

  for (const ref of candidateSources) {
    if (!allowed.has(sourceReferenceKey(ref))) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Direct edit cannot introduce or alter source provenance: ${JSON.stringify(ref)}`
      );
    }
  }
}

export class PlanRevisionHelper {
  constructor(private readonly planRepo: PlanRepository) {}

  async createDirectUserEdit(params: {
    planId: string;
    runId?: string;
    editedEnvelope: AnyPlanEnvelope;
    /** UI-facing description of what changed; it is not the Plan summary. */
    changeSummary?: string;
  }): Promise<PocPlanRecord> {
    const { planId, runId, editedEnvelope } = params;

    const latest = await this.planRepo.getLatestRevision(planId);
    if (!latest) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Cannot create revision for non-existent plan: "${planId}"`
      );
    }

    if (runId && runId !== latest.runId) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Cannot move plan revision to a different run: original="${latest.runId}", requested="${runId}"`
      );
    }
    const effectiveRunId = latest.runId;

    if (
      editedEnvelope.plan_type !== latest.planType ||
      editedEnvelope.operation !== latest.operation
    ) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Cannot change plan_type ("${latest.planType}" -> "${editedEnvelope.plan_type}") or operation ("${latest.operation}" -> "${editedEnvelope.operation}") across plan revisions.`
      );
    }

    const nextRevision = latest.revision + 1;

    const nextEnvelope: AnyPlanEnvelope = {
      ...editedEnvelope,
      schema_version: "0.1",
      plan_id: planId,
      revision: nextRevision,
      plan_type: latest.planType as any,
      operation: latest.operation as any,
      // poc_plan.summary is the pedagogical Plan summary. Keep the revision
      // change note separate from this required envelope field.
      summary: editedEnvelope.summary || latest.summary,
    };

    const validation = validatePlanningContract(nextEnvelope);
    if (!validation.valid) {
      const errorMsg = validation.errors
        .map((err) => `${err.instancePath || "/"}: ${err.message}`)
        .join("; ");
      throw new PlanningError(
        "PLAN_SCHEMA_INVALID",
        `Edited plan revision failed schema contract validation: ${errorMsg}`,
        validation.errors
      );
    }

    // Direct edits are stricter than planner grounding: every complete SourceReference
    // tuple in N+1 must already exist exactly in the latest persisted revision.
    const latestSources = extractPlanSourceReferences(latest.rawEnvelope);
    const nextSources = extractPlanSourceReferences(nextEnvelope);
    assertExactSourceSubset(nextSources, latestSources);

    // Retain normal domain validation as a second gate for ref uniqueness and other invariants.
    const allowlist = buildProvenanceAllowlistFromSources(latestSources);
    validatePlanningDomainInvariants(nextEnvelope, allowlist);

    return this.planRepo.savePlanRevision({
      id: randomUUID(),
      planId,
      runId: effectiveRunId,
      planType: nextEnvelope.plan_type,
      operation: nextEnvelope.operation,
      revision: nextRevision,
      title: nextEnvelope.title,
      summary: nextEnvelope.summary,
      content: nextEnvelope.content,
      rawEnvelope: nextEnvelope,
      validationStatus: "valid",
      reviewRequirements: latest.reviewRequirements ?? [],
    });
  }

  async createAgentRePlan(params: {
    planId: string;
    runId?: string;
    newPayload: {
      title?: string;
      summary?: string;
      warnings?: string[];
      assumptions?: string[];
      content: Record<string, unknown>;
    };
    sourceContext?: SourceReference[];
  }): Promise<PocPlanRecord> {
    const { planId, runId, newPayload, sourceContext } = params;

    const latest = await this.planRepo.getLatestRevision(planId);
    if (!latest) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Cannot create re-plan revision for non-existent plan: "${planId}"`
      );
    }

    if (runId && runId !== latest.runId) {
      throw new PlanningError(
        "PLAN_DOMAIN_INVALID",
        `Cannot move plan revision to a different run: original="${latest.runId}", requested="${runId}"`
      );
    }
    const effectiveRunId = latest.runId;

    const nextRevision = latest.revision + 1;

    const nextEnvelope: AnyPlanEnvelope = {
      schema_version: "0.1",
      plan_id: planId,
      revision: nextRevision,
      plan_type: latest.planType as any,
      operation: latest.operation as any,
      title: newPayload.title || latest.title,
      summary: newPayload.summary || latest.summary,
      warnings: newPayload.warnings || [],
      assumptions: newPayload.assumptions || [],
      content: newPayload.content,
    };

    const validation = validatePlanningContract(nextEnvelope);
    if (!validation.valid) {
      const errorMsg = validation.errors
        .map((err) => `${err.instancePath || "/"}: ${err.message}`)
        .join("; ");
      throw new PlanningError(
        "PLAN_SCHEMA_INVALID",
        `Re-plan revision failed schema contract validation: ${errorMsg}`,
        validation.errors
      );
    }

    const baseSources = extractPlanSourceReferences(latest.rawEnvelope);
    const combinedSources = [...baseSources, ...(sourceContext || [])];
    const allowlist = buildProvenanceAllowlistFromSources(combinedSources);
    validatePlanningDomainInvariants(nextEnvelope, allowlist);

    return this.planRepo.savePlanRevision({
      id: randomUUID(),
      planId,
      runId: effectiveRunId,
      planType: nextEnvelope.plan_type,
      operation: nextEnvelope.operation,
      revision: nextRevision,
      title: nextEnvelope.title,
      summary: nextEnvelope.summary,
      content: nextEnvelope.content,
      rawEnvelope: nextEnvelope,
      validationStatus: "valid",
    });
  }
}
