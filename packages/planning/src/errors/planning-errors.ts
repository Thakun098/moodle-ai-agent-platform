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
  | "STRUCTURE_INVALID"
  | "STRUCTURE_NOT_SEALED"
  | "COURSE_NOT_READY_FOR_FINALIZATION";

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
