import { AgentLoopError, ModelClientError } from "@moodle-agent-poc/agent-runtime";
import { CourseExecutionError, QuizExecutionError } from "@moodle-agent-poc/execution";
import { PlanningError } from "@moodle-agent-poc/planning";
import { MaterialIngestionError } from "@moodle-agent-poc/materials";
import type { FastifyError, FastifyInstance } from "fastify";

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: unknown;
    request_id: string;
  };
}

function resolveErrorCode(statusCode: number, customCode?: string): string {
  if (customCode === "FST_REQ_FILE_TOO_LARGE") return "FILE_TOO_LARGE";
  if (customCode && customCode !== "FST_ERR_NOT_FOUND") return customCode;
  switch (statusCode) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409: return "CONFLICT";
    case 413: return "FILE_TOO_LARGE";
    case 415: return "UNSUPPORTED_FILE_TYPE";
    case 422: return "UNPROCESSABLE_ENTITY";
    case 502: return "MODEL_RESPONSE_INVALID";
    case 503: return "OLLAMA_UNAVAILABLE";
    case 504: return "MODEL_TIMEOUT";
    default: return "INTERNAL_SERVER_ERROR";
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: "NOT_FOUND", message: `Route ${request.method}:${request.url} not found`, details: null, request_id: request.id },
    });
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof PlanningError || (error as any).name === "PlanningError") {
      const pErr = error as PlanningError;
      let statusCode = 422;
      if (pErr.code === "MODEL_RESPONSE_INVALID") statusCode = 502;
      else if (pErr.code === "OLLAMA_UNAVAILABLE") statusCode = 503;
      else if (pErr.code === "MODEL_TIMEOUT") statusCode = 504;
      request.log.warn({ err: error, code: pErr.code }, "Planning error occurred");
      reply.status(statusCode).send({ error: { code: pErr.code, message: pErr.message, details: pErr.details ?? null, request_id: request.id } });
      return;
    }

    if (error instanceof MaterialIngestionError || (error as any).name === "MaterialIngestionError") {
      const materialError = error as MaterialIngestionError;
      const statusCode = materialError.code === "MATERIAL_FILE_TOO_LARGE" ? 413 : 422;
      request.log.warn({ err: error, code: materialError.code }, "Material ingestion error occurred");
      reply.status(statusCode).send({ error: { code: materialError.code, message: materialError.message, details: materialError.details ?? null, request_id: request.id } });
      return;
    }

    if (error instanceof ModelClientError || (error as any).name === "ModelClientError") {
      const mErr = error as ModelClientError;
      let statusCode = 502;
      if (mErr.code === "MODEL_TIMEOUT") statusCode = 504;
      else if ((mErr.code === "OLLAMA_UNAVAILABLE" || mErr.code === "MODEL_PROVIDER_UNAVAILABLE") || mErr.code === "MODEL_NOT_FOUND") statusCode = 503;
      request.log.warn({ err: error, code: mErr.code }, "Model client error occurred");
      reply.status(statusCode).send({ error: { code: mErr.code, message: mErr.message, details: null, request_id: request.id } });
      return;
    }

    if (error instanceof AgentLoopError || (error as any).name?.endsWith?.("Error") && typeof (error as any).code === "string" && [
      "MUTATION_OUTCOME_UNCERTAIN",
      "IDEMPOTENCY_UNCERTAIN",
      "IDEMPOTENCY_IN_FLIGHT",
      "RUN_TIMEOUT",
      "TOOL_TIMEOUT",
      "MAPPING_ID_MISSING",
      "UNRECOVERABLE_TOOL_ERROR",
    ].includes((error as any).code)) {
      const aErr = error as AgentLoopError;
      let statusCode = 502;
      if (aErr.code === "IDEMPOTENCY_IN_FLIGHT") statusCode = 409;
      else if (aErr.code === "IDEMPOTENCY_UNCERTAIN" || aErr.code === "MUTATION_OUTCOME_UNCERTAIN") statusCode = 409;
      else if (aErr.code === "RUN_TIMEOUT" || aErr.code === "TOOL_TIMEOUT") statusCode = 504;
      request.log.warn({ err: error, code: aErr.code }, "Agent runtime error occurred");
      reply.status(statusCode).send({ error: { code: aErr.code, message: aErr.message, details: aErr.details ?? null, request_id: request.id } });
      return;
    }

    if (error instanceof CourseExecutionError || (error as any).name === "CourseExecutionError") {
      const cErr = error as CourseExecutionError;
      let statusCode = 400;
      if ([
        "COURSE_CREATION_FAILED",
        "SECTION_CREATION_FAILED",
        "ASSIGNMENT_CREATION_FAILED",
        "QUIZ_CREATION_FAILED",
        "QUESTION_CREATION_FAILED",
        "ADD_QUESTION_TO_QUIZ_FAILED",
        "ASSIGNMENT_VERIFICATION_FAILED",
      ].includes(cErr.code)) statusCode = 502;
      request.log.warn({ err: error, code: cErr.code }, "Execution error occurred");
      reply.status(statusCode).send({ error: { code: cErr.code, message: cErr.message, details: cErr.details ?? null, request_id: request.id } });
      return;
    }

    if (error instanceof QuizExecutionError || (error as any).name === "QuizExecutionError") {
      const qErr = error as QuizExecutionError;
      let statusCode = 502;
      if (qErr.code === "QUIZ_TARGET_MISMATCH" || qErr.code === "QUESTION_REF_NOT_FOUND" || qErr.code === "INCOMPATIBLE_PLAN_OPERATION") statusCode = 409;
      request.log.warn({ err: error, code: qErr.code }, "Quiz execution error occurred");
      reply.status(statusCode).send({ error: { code: qErr.code, message: qErr.message, details: qErr.details ?? null, request_id: request.id } });
      return;
    }

    const rawStatusCode = (error as any).statusCode;
    const statusCode = typeof rawStatusCode === "number" && rawStatusCode >= 400 && rawStatusCode < 600 ? rawStatusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      reply.status(statusCode).send({ error: { code: resolveErrorCode(statusCode, (error as any).code), message: error.message || "Client error", details: (error as any).details ?? null, request_id: request.id } });
      return;
    }

    request.log.error(error);
    reply.status(500).send({ error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error", details: null, request_id: request.id } });
  });
}
