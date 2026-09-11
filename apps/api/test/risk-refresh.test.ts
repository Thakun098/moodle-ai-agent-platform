import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  CourseRefreshCoordinator,
  RiskRefreshError,
  type RiskRefreshResult,
} from '@moodle-agent-poc/risk-engine';
import { loadConfig } from '../src/config/config-loader.js';
import { riskRefreshRoutes } from '../src/routes/risk-refresh.js';

const config = loadConfig({
  DATABASE_URL: 'postgresql://dummy:dummy@localhost:5432/dummy',
  RISK_SERVICE_KEY: 'test-risk-key',
});
const authHeaders = {
  'x-agentpoc-service-key': 'test-risk-key',
  'x-agentpoc-actor-ref': 'moodle-user:7',
  'x-agentpoc-actor-type': 'teacher',
  'x-agentpoc-course-ref': 'course:77',
  'x-agentpoc-request-origin': 'MOODLE_BFF',
};

function successResult(snapshotId = '11111111-1111-4111-8111-111111111111'): RiskRefreshResult {
  return {
    status: 'PUBLISHED',
    course_id: 77,
    snapshot_id: snapshotId,
    previous_snapshot_id: null,
    data_as_of: 1_789_030_000,
    computed_at: '2026-09-10T09:00:00.000Z',
    risk_model_version: 'risk-profile.v0.1',
    refresh_origin: 'MANUAL',
    evidence_hash: 'a'.repeat(64),
    evaluation_coverage: 1,
    material_change: {
      material: false,
      reasons: [],
      change_origin: 'UNKNOWN',
      source_change_count: 0,
      student_material_change_count: 0,
    },
  };
}

describe('Ticket 10/12 manual Risk refresh HTTP adapter', () => {
  it('joins concurrent authorized HTTP requests through the same CourseRefreshCoordinator', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const coordinator = new CourseRefreshCoordinator({
      async refreshCourse() {
        calls += 1;
        await gate;
        return successResult();
      },
    });
    const app = Fastify({ logger: false });
    await app.register(riskRefreshRoutes, { config, riskRefreshCoordinator: coordinator });

    const firstPromise = app.inject({ method: 'POST', url: '/api/risk/courses/77/refresh', headers: authHeaders });
    const secondPromise = app.inject({ method: 'POST', url: '/api/risk/courses/77/refresh', headers: authHeaders });
    await Promise.resolve();
    release();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    const firstBody = first.json();
    const secondBody = second.json();

    expect(calls).toBe(1);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(firstBody.snapshot_id).toBe(secondBody.snapshot_id);
    expect([firstBody.joined_existing_refresh, secondBody.joined_existing_refresh].sort()).toEqual([false, true]);
    expect(first.body).not.toContain('test-risk-key');
    await app.close();
  });

  it('returns last-known-good snapshot pointers on a source-level refresh failure', async () => {
    const coordinator = new CourseRefreshCoordinator({
      async refreshCourse(courseId) {
        throw new RiskRefreshError(
          'SOURCE_DATASET_FAILURE',
          'quizzes source unavailable',
          courseId,
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        );
      },
    });
    const app = Fastify({ logger: false });
    await app.register(riskRefreshRoutes, {
      config,
      riskRefreshCoordinator: coordinator,
      riskStateReader: {
        async getCourseState() {
          return {
            courseId: 77,
            currentSnapshotId: '22222222-2222-4222-8222-222222222222',
            previousSnapshotId: '11111111-1111-4111-8111-111111111111',
            lastSuccessfulRefreshAt: '2026-09-10T08:00:00.000Z',
            lastRefreshAttemptAt: '2026-09-10T09:00:00.000Z',
            lastRefreshStatus: 'FAILED',
            lastRefreshOrigin: 'MANUAL',
            lastRefreshAttemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            lastRefreshError: 'SOURCE_DATASET_FAILURE',
            updatedAt: '2026-09-10T09:00:00.000Z',
          };
        },
      },
    });

    const response = await app.inject({ method: 'POST', url: '/api/risk/courses/77/refresh', headers: authHeaders });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'FAILED',
      current_snapshot_id: '22222222-2222-4222-8222-222222222222',
      previous_snapshot_id: '11111111-1111-4111-8111-111111111111',
      error: { code: 'SOURCE_DATASET_FAILURE' },
    });
    await app.close();
  });

  it('rejects invalid or missing service credentials before refresh execution', async () => {
    const coordinator = new CourseRefreshCoordinator({ async refreshCourse() { return successResult(); } });
    const app = Fastify({ logger: false });
    await app.register(riskRefreshRoutes, { config, riskRefreshCoordinator: coordinator });
    const response = await app.inject({
      method: 'POST',
      url: '/api/risk/courses/77/refresh',
      headers: { ...authHeaders, 'x-agentpoc-service-key': 'wrong-key' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'RISK_SERVICE_UNAUTHORIZED' } });
    await app.close();
  });

  it('rejects invalid Course ids before constructing DB/MCP dependencies', async () => {
    const app = Fastify({ logger: false });
    await app.register(riskRefreshRoutes, { config });
    const response = await app.inject({ method: 'POST', url: '/api/risk/courses/not-a-number/refresh' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_COURSE_ID' } });
    await app.close();
  });
  it('forwards trusted SOURCE_CORRECTION origin hints and rejects caller-supplied POLICY_CHANGE', async () => {
    let seenHint: string | undefined;
    let calls = 0;
    const coordinator = new CourseRefreshCoordinator({
      async refreshCourse(_courseId, _origin, changeOriginHint) {
        calls += 1;
        seenHint = changeOriginHint;
        const result = successResult();
        result.material_change.change_origin = changeOriginHint ?? 'UNKNOWN';
        return result;
      },
    });
    const app = Fastify({ logger: false });
    await app.register(riskRefreshRoutes, { config, riskRefreshCoordinator: coordinator });
    const correction = await app.inject({ method: 'POST', url: '/api/risk/courses/77/refresh', headers: { ...authHeaders, 'content-type': 'application/json' }, payload: { change_origin_hint: 'SOURCE_CORRECTION' } });
    expect(correction.statusCode).toBe(200);
    expect(correction.json().material_change.change_origin).toBe('SOURCE_CORRECTION');
    expect(seenHint).toBe('SOURCE_CORRECTION');
    const policy = await app.inject({ method: 'POST', url: '/api/risk/courses/77/refresh', headers: { ...authHeaders, 'content-type': 'application/json' }, payload: { change_origin_hint: 'POLICY_CHANGE' } });
    expect(policy.statusCode).toBe(400);
    expect(policy.json()).toMatchObject({ error: { code: 'INVALID_CHANGE_ORIGIN_HINT' } });
    expect(calls).toBe(1);
    await app.close();
  });

});
