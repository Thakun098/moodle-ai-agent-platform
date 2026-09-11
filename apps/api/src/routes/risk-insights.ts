import {
  getDatabase,
  RiskInsightRepository,
  RiskSnapshotRepository,
  type ModelClient,
} from '@moodle-agent-poc/agent-runtime';
import { RiskInsightService, type RiskInsightResult } from '@moodle-agent-poc/risk-engine';
import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../config/config-loader.js';
import { createConfiguredModelClient } from '../config/model-client-factory.js';
import { requireRiskServiceRequest } from '../risk-service-auth.js';

export interface RiskInsightUseCase {
  getCourseInsight(courseId: number, snapshotId: string, forceGenerate?: boolean): Promise<RiskInsightResult>;
  getStudentInsight(courseId: number, snapshotId: string, studentId: number, forceGenerate?: boolean): Promise<RiskInsightResult>;
}

export interface RiskInsightRoutesOptions {
  config: AppConfig;
  modelClient?: ModelClient | undefined;
  riskInsightService?: RiskInsightUseCase | undefined;
}

function getService(options: RiskInsightRoutesOptions): RiskInsightUseCase {
  if (options.riskInsightService) return options.riskInsightService;
  const db = getDatabase();
  return new RiskInsightService(
    options.modelClient ?? createConfiguredModelClient(options.config),
    new RiskSnapshotRepository(db),
    new RiskInsightRepository(db)
  );
}

function mapInsightError(error: unknown, reply: any) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'RISK_SNAPSHOT_NOT_FOUND') return reply.status(404).send({ status: 'FAILED', error: { code: message, message: 'Requested Risk snapshot is not available for this Course.' } });
  if (message === 'STUDENT_NOT_IN_SNAPSHOT') return reply.status(404).send({ status: 'FAILED', error: { code: message, message: 'Student is not present in the requested Risk snapshot.' } });
  throw error;
}

export const riskInsightRoutes: FastifyPluginAsync<RiskInsightRoutesOptions> = async (fastify, options) => {
  fastify.get<{ Params: { courseId: string }; Querystring: { snapshot_id?: string } }>(
    '/api/risk/courses/:courseId/insight',
    async (request, reply) => {
      const courseId = Number(request.params.courseId);
      if (!Number.isInteger(courseId) || courseId <= 0) return reply.status(400).send({ status: 'FAILED', error: { code: 'INVALID_COURSE_ID', message: 'courseId must be a positive integer.' } });
      if (!requireRiskServiceRequest(request, reply, options.config, courseId)) return;
      const snapshotId = request.query.snapshot_id;
      if (!snapshotId) return reply.status(400).send({ status: 'FAILED', error: { code: 'SNAPSHOT_ID_REQUIRED', message: 'snapshot_id is required for AI Insight.' } });
      try {
        return reply.status(200).send({ status: 'OK', insight: await getService(options).getCourseInsight(courseId, snapshotId) });
      } catch (error) { return mapInsightError(error, reply); }
    }
  );

  fastify.post<{ Params: { courseId: string }; Body: { snapshot_id?: string } }>(
    '/api/risk/courses/:courseId/insight/regenerate',
    async (request, reply) => {
      const courseId = Number(request.params.courseId);
      if (!Number.isInteger(courseId) || courseId <= 0) return reply.status(400).send({ status: 'FAILED', error: { code: 'INVALID_COURSE_ID', message: 'courseId must be a positive integer.' } });
      if (!requireRiskServiceRequest(request, reply, options.config, courseId)) return;
      const snapshotId = request.body?.snapshot_id;
      if (!snapshotId) return reply.status(400).send({ status: 'FAILED', error: { code: 'SNAPSHOT_ID_REQUIRED', message: 'snapshot_id is required for AI Insight regeneration.' } });
      try {
        return reply.status(200).send({ status: 'OK', insight: await getService(options).getCourseInsight(courseId, snapshotId, true) });
      } catch (error) { return mapInsightError(error, reply); }
    }
  );

  fastify.get<{ Params: { courseId: string; studentId: string }; Querystring: { snapshot_id?: string } }>(
    '/api/risk/courses/:courseId/students/:studentId/insight',
    async (request, reply) => {
      const courseId = Number(request.params.courseId);
      const studentId = Number(request.params.studentId);
      if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(studentId) || studentId <= 0) return reply.status(400).send({ status: 'FAILED', error: { code: 'INVALID_RISK_DRILLDOWN_ID', message: 'Course and Student ids must be positive integers.' } });
      if (!requireRiskServiceRequest(request, reply, options.config, courseId)) return;
      const snapshotId = request.query.snapshot_id;
      if (!snapshotId) return reply.status(400).send({ status: 'FAILED', error: { code: 'SNAPSHOT_ID_REQUIRED', message: 'snapshot_id is required for AI Insight.' } });
      try {
        return reply.status(200).send({ status: 'OK', insight: await getService(options).getStudentInsight(courseId, snapshotId, studentId) });
      } catch (error) { return mapInsightError(error, reply); }
    }
  );
  fastify.post<{ Params: { courseId: string; studentId: string }; Body: { snapshot_id?: string } }>(
    '/api/risk/courses/:courseId/students/:studentId/insight/regenerate',
    async (request, reply) => {
      const courseId = Number(request.params.courseId);
      const studentId = Number(request.params.studentId);
      if (!Number.isInteger(courseId) || courseId <= 0 || !Number.isInteger(studentId) || studentId <= 0) return reply.status(400).send({ status: 'FAILED', error: { code: 'INVALID_RISK_DRILLDOWN_ID', message: 'Course and Student ids must be positive integers.' } });
      if (!requireRiskServiceRequest(request, reply, options.config, courseId)) return;
      const snapshotId = request.body?.snapshot_id;
      if (!snapshotId) return reply.status(400).send({ status: 'FAILED', error: { code: 'SNAPSHOT_ID_REQUIRED', message: 'snapshot_id is required for AI Insight regeneration.' } });
      try {
        return reply.status(200).send({ status: 'OK', insight: await getService(options).getStudentInsight(courseId, snapshotId, studentId, true) });
      } catch (error) { return mapInsightError(error, reply); }
    }
  );

};
