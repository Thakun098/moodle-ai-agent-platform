import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/config-loader.js';
import { riskInsightRoutes, type RiskInsightUseCase } from '../src/routes/risk-insights.js';

const config = loadConfig({ DATABASE_URL: 'postgresql://dummy:dummy@localhost:5432/dummy', RISK_SERVICE_KEY: 'insight-key' });
const headers = { 'x-agentpoc-service-key': 'insight-key', 'x-agentpoc-actor-ref': 'moodle-user:2', 'x-agentpoc-actor-type': 'teacher', 'x-agentpoc-course-ref': 'course:77', 'x-agentpoc-request-origin': 'MOODLE_BFF' };
const snap = '11111111-1111-4111-8111-111111111111';
function insight(scope: 'COURSE'|'STUDENT', studentId: number|null = null) { return { insight_id: `${scope}-1`, course_id: 77, student_id: studentId, scope, snapshot_id: snap, risk_model_version: 'risk-profile.v0.1', status: 'VALID' as const, payload: { summary: 'Grounded summary', coverage_qualification: null, findings: [], actions: [] }, model_calls: 1, blocked_reason: null, validation_errors: [], cached: false, stale_reason: null }; }
function service(): RiskInsightUseCase { return { async getCourseInsight(courseId, snapshotId) { if (snapshotId === 'missing') throw new Error('RISK_SNAPSHOT_NOT_FOUND'); return insight('COURSE'); }, async getStudentInsight(courseId, snapshotId, studentId) { if (studentId === 999) throw new Error('STUDENT_NOT_IN_SNAPSHOT'); return insight('STUDENT', studentId); } }; }
async function app() { const server = Fastify({ logger: false }); await server.register(riskInsightRoutes, { config, riskInsightService: service() }); return server; }

describe('Ticket 15 Risk Insight API', () => {
  it('requires explicit snapshot and trusted service boundary', async () => { const server=await app(); const missing=await server.inject({method:'GET',url:'/api/risk/courses/77/insight',headers}); expect(missing.statusCode).toBe(400); const unauthorized=await server.inject({method:'GET',url:`/api/risk/courses/77/insight?snapshot_id=${snap}`,headers:{...headers,'x-agentpoc-service-key':'bad'}}); expect(unauthorized.statusCode).toBe(401); await server.close(); });
  it('returns snapshot-scoped Course insight without leaking service credential', async () => { const server=await app(); const response=await server.inject({method:'GET',url:`/api/risk/courses/77/insight?snapshot_id=${snap}`,headers}); expect(response.statusCode).toBe(200); expect(response.json().insight).toMatchObject({scope:'COURSE',snapshot_id:snap,status:'VALID'}); expect(response.body).not.toContain('insight-key'); await server.close(); });
  it('returns snapshot-scoped Student insight and preserves not-found semantics', async () => { const server=await app(); const response=await server.inject({method:'GET',url:`/api/risk/courses/77/students/7/insight?snapshot_id=${snap}`,headers}); expect(response.statusCode).toBe(200); expect(response.json().insight).toMatchObject({scope:'STUDENT',student_id:7,snapshot_id:snap}); const missing=await server.inject({method:'GET',url:`/api/risk/courses/77/students/999/insight?snapshot_id=${snap}`,headers}); expect(missing.statusCode).toBe(404); expect(missing.json()).toMatchObject({error:{code:'STUDENT_NOT_IN_SNAPSHOT'}}); await server.close(); });
  it('forces Course and Student insight regeneration through explicit POST routes', async () => {
    const forced: Array<{scope:string; force:boolean|undefined}> = [];
    const forceService: RiskInsightUseCase = {
      async getCourseInsight(courseId, snapshotId, forceGenerate) { forced.push({scope:'COURSE', force:forceGenerate}); return insight('COURSE'); },
      async getStudentInsight(courseId, snapshotId, studentId, forceGenerate) { forced.push({scope:'STUDENT', force:forceGenerate}); return insight('STUDENT', studentId); },
    };
    const server = Fastify({ logger: false });
    await server.register(riskInsightRoutes, { config, riskInsightService: forceService });
    const course = await server.inject({method:'POST',url:'/api/risk/courses/77/insight/regenerate',headers,payload:{snapshot_id:snap}});
    expect(course.statusCode).toBe(200);
    expect(course.json().insight).toMatchObject({scope:'COURSE',cached:false});
    const student = await server.inject({method:'POST',url:'/api/risk/courses/77/students/7/insight/regenerate',headers,payload:{snapshot_id:snap}});
    expect(student.statusCode).toBe(200);
    expect(student.json().insight).toMatchObject({scope:'STUDENT',student_id:7,cached:false});
    expect(forced).toEqual([{scope:'COURSE',force:true},{scope:'STUDENT',force:true}]);
    const missingSnapshot = await server.inject({method:'POST',url:'/api/risk/courses/77/insight/regenerate',headers,payload:{}});
    expect(missingSnapshot.statusCode).toBe(400);
    expect(missingSnapshot.json()).toMatchObject({error:{code:'SNAPSHOT_ID_REQUIRED'}});
    await server.close();
  });
});
