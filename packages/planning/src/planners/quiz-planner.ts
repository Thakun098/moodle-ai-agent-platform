import { randomUUID } from "node:crypto";
import type { ModelClient, PlanRepository } from "@moodle-agent-poc/agent-runtime";
import {
  validatePlanningContract,
  type AnyPlanEnvelope,
  type QuizUpdatePlanEnvelope,
  type SourceReference,
} from "@moodle-agent-poc/contracts";
import {
  buildProvenanceAllowlistFromSources,
  validatePlanningDomainInvariants,
} from "../domain/planning-domain-validator.js";
import { PlanningError } from "../errors/planning-errors.js";
import {
  buildQuizUpdateUserPrompt,
  QUIZ_UPDATE_SCHEMA,
  QUIZ_UPDATE_SYSTEM_PROMPT,
} from "../prompts/quiz-update-prompt.js";
import type { QuizPlanningInput, QuizUpdateModelOutput } from "../types.js";

export interface QuizPlannerOptions {
  modelClient: ModelClient;
  planRepository?: PlanRepository | undefined;
}

export interface UpdateQuizPlanParams {
  input: QuizPlanningInput;
  planId?: string;
  runId?: string;
  revision?: number;
  model?: string;
  timeoutMs?: number;
}

export class QuizPlanner {
  private readonly modelClient: ModelClient;
  private readonly planRepo: PlanRepository | undefined;

  constructor(options: QuizPlannerOptions) {
    this.modelClient = options.modelClient;
    this.planRepo = options.planRepository;
  }

  async planQuizUpdate(
    params: UpdateQuizPlanParams
  ): Promise<QuizUpdatePlanEnvelope> {
    const { input, planId, runId, revision } = params;

    const systemPrompt = QUIZ_UPDATE_SYSTEM_PROMPT;
    const userPrompt = buildQuizUpdateUserPrompt(input);

    const response = await this.modelClient.chat({
      ...(params.model ? { model: params.model } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      format: QUIZ_UPDATE_SCHEMA,
      ...(params.timeoutMs ? { options: { timeoutMs: params.timeoutMs } } : {}),
    });

    let modelOutput: QuizUpdateModelOutput;
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

    const envelope: QuizUpdatePlanEnvelope = {
      schema_version: "0.1",
      plan_id: effectivePlanId,
      revision: effectiveRevision,
      plan_type: "quiz",
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
        `Generated QuizUpdatePlan failed schema contract validation: ${errorMsg}`,
        validation.errors
      );
    }

    // Enforce P5-D4 grounding allowlist (R3)
    const sources: SourceReference[] = [
      ...(input.current.source_refs || []),
      ...(input.source_context || []),
    ];
    if (input.current.questions) {
      for (const q of input.current.questions) {
        if (q.source_refs) {
          sources.push(...q.source_refs);
        }
      }
    }
    const allowlist = buildProvenanceAllowlistFromSources(sources);
    validatePlanningDomainInvariants(envelope, allowlist);

    if (this.planRepo && runId) {
      await this.planRepo.savePlanRevision({
        id: randomUUID(),
        planId: effectivePlanId,
        runId,
        planType: "quiz",
        operation: "update",
        revision: effectiveRevision,
        title: envelope.title,
        summary: envelope.summary,
        content: envelope.content as unknown as Record<string, unknown>,
        rawEnvelope: envelope as unknown as AnyPlanEnvelope,
        validationStatus: "valid",
      });
    }

    return envelope;
  }
}
