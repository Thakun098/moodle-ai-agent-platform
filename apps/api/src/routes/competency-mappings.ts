import { timingSafeEqual } from "node:crypto";
import { CompetencyMappingReviewRepository, getDatabase } from "@moodle-agent-poc/agent-runtime";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { reviewCompetencyMappings, type CompetencyMappingDecisionRequest } from "../services/competency-mapping-review-service.js";

export const competencyMappingRoutes: FastifyPluginAsync<{ config: AppConfig; reviewRepo?: CompetencyMappingReviewRepository }> = async (app, options) => {
  app.addHook("preHandler", async (request, reply) => {
    const expected = options.config.instructionalDesignServiceKey;
    const supplied = request.headers["x-agentpoc-instructional-design-key"];
    if (!expected || typeof supplied !== "string" || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
      return reply.code(401).send({ error: { code: "INSTRUCTIONAL_DESIGN_UNAUTHORIZED", message: "Instructional Design service authorization is required." } });
    }
  });

  const bodySchema = {
    type: "object",
    additionalProperties: false,
    required: ["activity_id", "competency_id", "kind", "decision", "confirmed", "expected_revision", "teacher_id"],
    properties: {
      activity_id: { type: "string", minLength: 1 },
      competency_id: { type: "string", minLength: 1 },
      kind: { enum: ["mapping", "evidence"] },
      decision: { enum: ["CONFIRMED", "DECLINED"] },
      confirmed: { const: true },
      expected_revision: { type: "integer", minimum: 0 },
      teacher_id: { type: "integer", minimum: 1 },
    },
  };

  const getRepo = () => options.reviewRepo ?? new CompetencyMappingReviewRepository(getDatabase());

  app.get<{ Params: { runId: string } }>("/api/runs/:runId/competency-mappings", async (request, reply) => {
    try {
      return await reviewCompetencyMappings(getRepo(), request.params.runId);
    } catch (error) {
      return reply.code((error as { code?: string }).code === "NOT_FOUND" ? 404 : 422).send({
        error: { code: (error as { code?: string }).code ?? "MAPPING_INVALID", message: (error as Error).message },
      });
    }
  });

  app.post<{ Params: { runId: string }; Body: CompetencyMappingDecisionRequest }>("/api/runs/:runId/competency-mappings/decision", { schema: { body: bodySchema } }, async (request, reply) => {
    try {
      return await reviewCompetencyMappings(getRepo(), request.params.runId, request.body);
    } catch (error) {
      const code = (error as { code?: string }).code ?? "MAPPING_INVALID";
      return reply.code(code === "NOT_FOUND" ? 404 : code === "MAPPING_STALE" ? 409 : 422).send({ error: { code, message: (error as Error).message } });
    }
  });
};
