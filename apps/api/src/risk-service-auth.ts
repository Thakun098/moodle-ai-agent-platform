import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from './config/config-loader.js';

export interface RiskActorContext {
  actor_ref: string;
  actor_type: string;
  course_ref: string;
  request_origin: string;
}

function secureEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function requireRiskServiceRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  expectedCourseId?: number
): RiskActorContext | null {
  if (!config.riskServiceKey) {
    reply.status(503).send({
      status: 'FAILED',
      error: { code: 'RISK_SERVICE_NOT_CONFIGURED', message: 'Risk service credential is not configured.' },
    });
    return null;
  }

  const suppliedKey = header(request, 'x-agentpoc-service-key') ?? '';
  if (!secureEqual(suppliedKey, config.riskServiceKey)) {
    reply.status(401).send({
      status: 'FAILED',
      error: { code: 'RISK_SERVICE_UNAUTHORIZED', message: 'Invalid Risk service credential.' },
    });
    return null;
  }

  const context: RiskActorContext = {
    actor_ref: header(request, 'x-agentpoc-actor-ref') ?? '',
    actor_type: header(request, 'x-agentpoc-actor-type') ?? '',
    course_ref: header(request, 'x-agentpoc-course-ref') ?? '',
    request_origin: header(request, 'x-agentpoc-request-origin') ?? '',
  };
  if (!context.actor_ref || !context.actor_type || !context.course_ref || !context.request_origin) {
    reply.status(400).send({
      status: 'FAILED',
      error: { code: 'RISK_ACTOR_CONTEXT_REQUIRED', message: 'Trusted Moodle actor audit context is required.' },
    });
    return null;
  }
  if (expectedCourseId !== undefined && context.course_ref !== `course:${expectedCourseId}`) {
    reply.status(400).send({
      status: 'FAILED',
      error: { code: 'RISK_ACTOR_COURSE_MISMATCH', message: 'Actor audit course_ref does not match the requested Course.' },
    });
    return null;
  }

  request.log.info({ risk_actor: context }, 'Authorized Moodle Risk BFF request');
  return context;
}
