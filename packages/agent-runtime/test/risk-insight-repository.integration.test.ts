import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDbClient, type AppDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { courseRiskState, riskChangeEvent, riskInsight, riskSnapshot, studentRiskHistory } from '../src/db/schema/index.js';
import { RiskInsightRepository } from '../src/repositories/risk-insight-repository.js';
import { RiskSnapshotRepository } from '../src/repositories/risk-snapshot-repository.js';

describe('Ticket 15 RiskInsightRepository selective invalidation (Real PostgreSQL)', () => {
  const url = process.env.DATABASE_URL || 'postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:5432/moodle_agent_poc';
  const courseId = 991515;
  const studentA = 501;
  const studentB = 502;
  const snap1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const snap2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  let db: AppDatabase;
  let pool: any;
  let insights: RiskInsightRepository;
  let snapshots: RiskSnapshotRepository;

  async function cleanup() {
    await db.delete(riskInsight).where(eq(riskInsight.courseId, courseId));
    await db.delete(riskChangeEvent).where(eq(riskChangeEvent.courseId, courseId));
    await db.delete(studentRiskHistory).where(eq(studentRiskHistory.courseId, courseId));
    await db.delete(courseRiskState).where(eq(courseRiskState.courseId, courseId));
    await db.delete(riskSnapshot).where(eq(riskSnapshot.courseId, courseId));
  }

  beforeAll(async () => {
    await runMigrations(url);
    const client = createDbClient(url);
    db = client.db; pool = client.pool;
    insights = new RiskInsightRepository(db);
    snapshots = new RiskSnapshotRepository(db);
  });
  beforeEach(cleanup);
  afterAll(async () => { if (db) await cleanup(); if (pool) await pool.end(); });

  function pub(snapshotId: string, changeEvents: any[] = []) {
    return snapshots.publishSnapshot({
      snapshotId, courseId, dataAsOf: 1789042000, computedAt: new Date().toISOString(), riskModelVersion: 'risk-profile.v0.1', refreshOrigin: 'MANUAL', evidenceHash: 'a'.repeat(64), payload: { schema_version: 'risk-snapshot.v0.1' }, attemptId: snapshotId, history: [], changeEvents,
    });
  }
  async function seed(id: string, scope: 'COURSE' | 'STUDENT', studentId: number | null) {
    return insights.upsert({ insightId: id, courseId, studentId, scope, snapshotId: snap1, riskModelVersion: 'risk-profile.v0.1', status: 'VALID', payload: { summary: id }, generatedAt: new Date().toISOString() });
  }

  it('persists and reads snapshot-linked structured insight cache', async () => {
    await pub(snap1);
    await seed('course-insight', 'COURSE', null);
    const row = await insights.getForSnapshot(courseId, 'COURSE', snap1, null);
    expect(row).toMatchObject({ insightId: 'course-insight', status: 'VALID', snapshotId: snap1, riskModelVersion: 'risk-profile.v0.1' });
  });

  it('stales only affected Course and Student insights after successful material publication', async () => {
    await pub(snap1);
    await seed('course-insight', 'COURSE', null);
    await seed('student-a', 'STUDENT', studentA);
    await seed('student-b', 'STUDENT', studentB);
    await pub(snap2, [
      { eventId: 'course-change', scope: 'COURSE', material: true, changeOrigin: 'LEARNING_EVENT', reasons: ['COURSE_CHANGE'], sourceChanges: [] },
      { eventId: 'student-a-change', scope: 'STUDENT', studentId: studentA, material: true, changeOrigin: 'LEARNING_EVENT', reasons: ['STUDENT_CHANGE'], sourceChanges: [] },
      { eventId: 'student-b-nochange', scope: 'STUDENT', studentId: studentB, material: false, changeOrigin: 'UNKNOWN', reasons: [], sourceChanges: [] },
    ]);
    const rows = await insights.listCourse(courseId);
    expect(rows.find((x) => x.insightId === 'course-insight')).toMatchObject({ status: 'STALE', staleReason: 'COURSE_MATERIAL_CHANGE' });
    expect(rows.find((x) => x.insightId === 'student-a')).toMatchObject({ status: 'STALE', staleReason: 'STUDENT_MATERIAL_CHANGE' });
    expect(rows.find((x) => x.insightId === 'student-b')).toMatchObject({ status: 'VALID', staleReason: null });
  });

  it('failed refresh preserves VALID insight cache', async () => {
    await pub(snap1);
    await seed('course-insight', 'COURSE', null);
    await snapshots.recordRefreshFailure({ courseId, attemptedAt: new Date().toISOString(), refreshOrigin: 'NIGHTLY', attemptId: 'failed-attempt', error: 'SOURCE_DATASET_FAILURE' });
    const row = await insights.getForSnapshot(courseId, 'COURSE', snap1, null);
    expect(row).toMatchObject({ status: 'VALID', staleReason: null });
  });
});
