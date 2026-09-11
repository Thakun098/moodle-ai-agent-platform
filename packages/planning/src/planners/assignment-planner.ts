import { randomUUID } from "node:crypto";
import type { ModelClient, PlanRepository } from "@moodle-agent-poc/agent-runtime";
import {
  validatePlanningContract,
  type AnyPlanEnvelope,
  type AssignmentPlanEnvelope,
  type SourceReference,
  type AssignmentUpdateTarget,
} from "@moodle-agent-poc/contracts";
import {
  buildProvenanceAllowlistFromSources,
  validatePlanningDomainInvariants,
} from "../domain/planning-domain-validator.js";
import { PlanningError } from "../errors/planning-errors.js";
import {
  ASSIGNMENT_UPDATE_SCHEMA,
  ASSIGNMENT_UPDATE_SYSTEM_PROMPT,
  buildAssignmentUpdateUserPrompt,
} from "../prompts/assignment-update-prompt.js";
import type {
  AssignmentPlanningInput,
  AssignmentUpdateModelOutput,
} from "../types.js";

export interface AssignmentPlannerOptions {
  modelClient: ModelClient;
  planRepository?: PlanRepository | undefined;
}

export interface UpdateAssignmentPlanParams {
  executionTarget?: AssignmentUpdateTarget;
  input: AssignmentPlanningInput;
  planId?: string;
  runId?: string;
  revision?: number;
  model?: string;
  timeoutMs?: number;
}

export class AssignmentPlanner {
  private readonly modelClient: ModelClient;
  private readonly planRepo: PlanRepository | undefined;

  constructor(options: AssignmentPlannerOptions) {
    this.modelClient = options.modelClient;
    this.planRepo = options.planRepository;
  }

  async planAssignmentUpdate(
    params: UpdateAssignmentPlanParams
  ): Promise<AssignmentPlanEnvelope> {
    const { input, planId, runId, revision } = params;

    const systemPrompt = ASSIGNMENT_UPDATE_SYSTEM_PROMPT;
    const userPrompt = buildAssignmentUpdateUserPrompt(input);

    const response = await this.modelClient.chat({
      ...(params.model ? { model: params.model } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      format: ASSIGNMENT_UPDATE_SCHEMA,
      ...(params.timeoutMs ? { options: { timeoutMs: params.timeoutMs } } : {}),
    });

    let modelOutput: AssignmentUpdateModelOutput;
    try {
      modelOutput = JSON.parse(response.rawText);
    } catch (err: unknown) {
      throw new PlanningError(
        "MODEL_RESPONSE_INVALID",
        `Model output could not be parsed as JSON: ${err instanceof Error ? err.message : String(err)}`,
        null,
        { cause: err }
      );
    }

    const effectivePlanId = planId || randomUUID();
    const effectiveRevision = revision || 1;

    const envelope: AssignmentPlanEnvelope = {
      schema_version: "0.1",
      plan_id: effectivePlanId,
      revision: effectiveRevision,
      plan_type: "assignment",
      operation: "update",
      title: modelOutput.title,
      summary: modelOutput.summary,
      warnings: modelOutput.warnings ?? [],
      assumptions: modelOutput.assumptions ?? [],
      content: modelOutput.content,
    };

    const validation = validatePlanningContract(envelope as unknown as AnyPlanEnvelope);
    if (!validation.valid) {
      const errorMsg = validation.errors
        .map((err) => `${err.instancePath || "/"}: ${err.message}`)
        .join("; ");
      throw new PlanningError(
        "PLAN_SCHEMA_INVALID",
        `Generated AssignmentPlan failed schema contract validation: ${errorMsg}`,
        validation.errors
      );
    }

    // Enforce P5-D4 grounding allowlist (R2)
    const sources: SourceReference[] = [
      ...(input.current.source_refs || []),
      ...(input.source_context || []),
    ];
    const allowlist = buildProvenanceAllowlistFromSources(sources);
    validatePlanningDomainInvariants(envelope, allowlist);

    if (this.planRepo && runId) {
      await this.planRepo.savePlanRevision({
        id: randomUUID(),
        planId: effectivePlanId,
        runId,
        planType: "assignment",
        operation: "update",
        revision: effectiveRevision,
        title: envelope.title,
        summary: envelope.summary,
        content: envelope.content as unknown as Record<string, unknown>,
        rawEnvelope: envelope as unknown as AnyPlanEnvelope,
        validationStatus: "valid",
        ...(params.executionTarget ? { executionContext: { target: params.executionTarget } } : {}),
      });
    }

    return envelope;
  }
}
