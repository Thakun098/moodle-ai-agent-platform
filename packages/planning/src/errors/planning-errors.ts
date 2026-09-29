export type PlanningErrorCode =
  | "OLLAMA_UNAVAILABLE"
  | "MODEL_TIMEOUT"
  | "MODEL_RESPONSE_INVALID"
  | "PLAN_SCHEMA_INVALID"
  | "PLAN_DOMAIN_INVALID"
  | "TOKEN_BUDGET_EXCEEDED"
  | "TEACHER_CONSTRAINT_VIOLATION"
  | "TEACHER_INSTRUCTION_UNSUPPORTED"
  | "GENERATION_INSTRUCTION_INVALID"
  | "OUTPUT_LANGUAGE_POLICY_VIOLATION"
  | "STRUCTURE_INVALID"
  | "STRUCTURE_NOT_SEALED"
  | "COURSE_NOT_READY_FOR_FINALIZATION"
  | "STRUCTURE_OUTCOME_COVERAGE_REQUIRED"
  | "OUTCOME_INVALID"
  | "STRUCTURE_ALIGNMENT_UNAUTHORIZED"
  | "ACTIVITY_INTENT_INVALID"
  | "ACTIVITY_INTENT_ALIGNMENT_INVALID"
  | "ACTIVITY_INTENT_OUTCOME_UNAUTHORIZED"
  | "ACTIVITY_INTENT_ALIGNMENT_OVERRIDE_REQUIRED"
  | "ACTIVITY_INTENT_ALIGNMENT_REQUIRED"
  | "ACTIVITY_INTENT_LEARNER_CONTEXT_STALE"
  | "ACTIVITY_INTENT_LEARNER_ACK_REQUIRED";

export class PlanningError extends Error {
  public readonly code: PlanningErrorCode;
  public readonly details: unknown;

  constructor(
    code: PlanningErrorCode,
    message: string,
    details?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "PlanningError";
    this.code = code;
    this.details = details ?? null;
  }
}
