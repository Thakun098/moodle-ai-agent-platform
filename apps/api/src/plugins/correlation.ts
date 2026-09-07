import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    runId?: string;
  }
}

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function registerCorrelation(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    const rawRunId = request.headers["x-run-id"];
    if (rawRunId !== undefined) {
      if (typeof rawRunId !== "string" || !UUID_REGEX.test(rawRunId.trim())) {
        const error = new Error(
          "Invalid x-run-id header: must be a valid UUID string."
        );
        (error as any).statusCode = 400;
        (error as any).code = "INVALID_RUN_ID";
        throw error;
      }
      request.runId = rawRunId.trim().toLowerCase();
    }
  });

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
    if (request.runId) {
      reply.header("x-run-id", request.runId);
    }
  });
}
