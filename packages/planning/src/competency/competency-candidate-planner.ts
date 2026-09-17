import { createHash } from "node:crypto";
import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import type { CompetencyCandidate, CoreCourseDesignContext, SourceReference } from "@moodle-agent-poc/contracts";
import { PlanningError } from "../errors/planning-errors.js";

const candidateSchema = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          rationale: { type: "string", minLength: 1 },
          derived_from_outcome_ids: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
          source_refs: { type: "array", items: { type: "object", properties: { source: { type: "string" }, page: { type: "integer", minimum: 1 }, section: { type: "string" }, text: { type: "string" } }, required: ["source"], additionalProperties: false } },
        },
        required: ["name", "description", "rationale", "derived_from_outcome_ids"],
        additionalProperties: false,
      },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
};

export function buildCompetencyDerivationPrompt(context: CoreCourseDesignContext): string {
  const approved = context.approved_learning_outcomes.map((outcome) =>
    `${outcome.outcome_id}: ${outcome.text} (source: ${outcome.source_outcome_ids.join(", ")})`,
  );
  const objectives = context.learning_objectives.map((objective) => `${objective.objective_id}: ${objective.source_text}`);
  const schedule = context.schedule_or_topics.map((item) => `${item.week_or_unit ?? ""}: ${item.title}`).filter((item) => item.trim() !== "");
  return [
    "ROLE: Instructional Designer",
    "OPERATION: DERIVE_COMPETENCIES",
    `Core Course Design Context revision ${context.revision} is authoritative.`,
    "Derive Competency Candidates only from the approved Learning Outcomes below.",
    "Use many-to-many relationships: one candidate may derive from multiple approved Outcomes and an Outcome may support multiple candidates.",
    "Do not approve candidates, create Moodle Competencies, infer learner facts, or use unapproved/source-only Outcomes.",
    "Return JSON {candidates:[{name,description,rationale,derived_from_outcome_ids,source_refs}] }.",
    "Approved Learning Outcomes:\n" + (approved.length ? approved.map((item) => "- " + item).join("\n") : "- None"),
    "Relevant Learning Objectives:\n" + (objectives.length ? objectives.map((item) => "- " + item).join("\n") : "- None"),
  ].join("\n");
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new PlanningError("MODEL_RESPONSE_INVALID", `${field} must be non-empty.`);
  return value.trim();
}

function stableCandidateId(name: string, outcomeIds: readonly string[]): string {
  const digest = createHash("sha256").update(`${name.trim().toLocaleLowerCase()}|${[...outcomeIds].sort().join(",")}`).digest("hex").slice(0, 20);
  return `competency-candidate-${digest}`;
}

function approvedSourceRefs(context: CoreCourseDesignContext, outcomeIds: readonly string[]): SourceReference[] {
  const refs = outcomeIds.flatMap((outcomeId) => {
    const approved = context.approved_learning_outcomes.find((item) => item.outcome_id === outcomeId);
    return approved?.source_refs ?? [];
  });
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = JSON.stringify(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeCompetencyCandidates(
  context: CoreCourseDesignContext,
  raw: unknown,
): CompetencyCandidate[] {
  const candidates = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as { candidates?: unknown }).candidates
    : raw;
  if (!Array.isArray(candidates)) throw new PlanningError("MODEL_RESPONSE_INVALID", "Competency derivation must return a candidates array.");
  const approvedIds = new Set(context.approved_learning_outcomes.map((outcome) => outcome.outcome_id));
  return candidates.map((item, index): CompetencyCandidate => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new PlanningError("MODEL_RESPONSE_INVALID", `Competency candidate ${index + 1} is not an object.`);
    const value = item as Record<string, unknown>;
    const name = nonBlank(value.name, `candidate ${index + 1} name`);
    const description = nonBlank(value.description, `candidate ${index + 1} description`);
    const rationale = nonBlank(value.rationale, `candidate ${index + 1} rationale`);
    const rawOutcomeIds = value.derived_from_outcome_ids;
    if (!Array.isArray(rawOutcomeIds) || rawOutcomeIds.length === 0 || !rawOutcomeIds.every((id) => typeof id === "string" && id.trim() !== "")) {
      throw new PlanningError("MODEL_RESPONSE_INVALID", `Competency candidate ${index + 1} must reference approved Outcomes.`);
    }
    const derivedIds = [...new Set(rawOutcomeIds as string[])];
    const unauthorized = derivedIds.filter((id) => !approvedIds.has(id));
    if (unauthorized.length > 0) {
      throw new PlanningError("STRUCTURE_ALIGNMENT_UNAUTHORIZED", "Competency candidate references an unapproved Outcome.", { candidate_index: index, unauthorized_outcome_ids: unauthorized });
    }
    return {
      candidate_id: stableCandidateId(name, derivedIds),
      name,
      description,
      rationale,
      derived_from_outcome_ids: derivedIds,
      source_refs: approvedSourceRefs(context, derivedIds),
      status: "PROPOSED",
      revision: 1,
    };
  });
}

export async function deriveCompetencyCandidates(
  context: CoreCourseDesignContext,
  modelClient: ModelClient,
  options: { model?: string; timeoutMs?: number } = {},
): Promise<CompetencyCandidate[]> {
  if (context.approved_learning_outcomes.length === 0) {
    throw new PlanningError("STRUCTURE_INVALID", "Competency derivation requires at least one Teacher-approved Learning Outcome.");
  }
  const response = await modelClient.chat({
    ...(options.model ? { model: options.model } : {}),
    messages: [
      { role: "system", content: "You are an Instructional Designer. DERIVE_COMPETENCIES is a proposal-only operation. Never approve or materialize Moodle Competencies." },
      { role: "user", content: buildCompetencyDerivationPrompt(context) },
    ],
    format: candidateSchema,
    ...(options.timeoutMs ? { options: { timeoutMs: options.timeoutMs } } : {}),
  });
  let parsed: unknown;
  try { parsed = JSON.parse(response.rawText); } catch (error) { throw new PlanningError("MODEL_RESPONSE_INVALID", `Competency derivation returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  return normalizeCompetencyCandidates(context, parsed);
}
