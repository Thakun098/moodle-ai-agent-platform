import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDbClient, type AppDatabase } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { courseRiskState, riskChangeEvent, riskSnapshot, studentRiskHistory } from '../src/db/schema/index.js';
import { RiskSnapshotRepository } from '../src/repositories/risk-snapshot-repository.js';

describe('Ticket 10/11 RiskSnapshotRepository (Real PostgreSQL)', () => {
  const testDbUrl = process.env.DATABASE_URL || 'postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:5432/moodle_agent_poc';
  const courseId = 990077;
  const studentId = 101;
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ];

  let db: AppDatabase;
  let pool: any;
  let repo: RiskSnapshotRepository;

  async function cleanup() {
    await db.delete(riskChangeEvent).where(eq(riskChangeEvent.courseId, courseId));
    await db.delete(studentRiskHistory).where(eq(studentRiskHistory.courseId, courseId));
    await db.delete(courseRiskState).where(eq(courseRiskState.courseId, courseId));
    await db.delete(riskSnapshot).where(eq(riskSnapshot.courseId, courseId));
  }

  beforeAll(async () => {
    await runMigrations(testDbUrl);
    const client = createDbClient(testDbUrl);
    db = client.db;
    pool = client.pool;
    repo = new RiskSnapshotRepository(db);
  });

  beforeEach(cleanup);
  afterAll(async () => {
    if (db) await cleanup();
    if (pool) await pool.end();
  });

  function input(index: number) {
    return {
      snapshotId: ids[index]!,
      courseId,
      dataAsOf: 1_789_030_000 + index,
      computedAt: new Date(Date.UTC(2026, 8, 10, 10, 0, index)).toISOString(),
      riskModelVersion: 'risk-profile.v0.1',
      refreshOrigin: index === 0 ? 'MANUAL' as const : 'NIGHTLY' as const,
      evidenceHash: String(index + 1).repeat(64).slice(0, 64),
      payload: { schema_version: 'risk-snapshot.v0.1', sequence: index + 1 },
      attemptId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`,
      history: [{
        studentId,
        evaluationStatus: 'COMPLETE' as const,
        overallRisk: index === 2 ? 'HIGH' as const : 'LOW' as const,
        progressRisk: 'LOW' as const,
        performanceRisk: index === 2 ? 'HIGH' as const : 'LOW' as const,
        competencyRisk: 'LOW' as const,
        submissionRisk: 'LOW' as const,
        dimensionMetrics: {
          progress: { progress_gap_pp: 0 },
          performance: { fail_count: index === 2 ? 2 : 0 },
          competency: { confirmed_gap_count: 0 },
          submission: { overdue_count: 0 },
        },
      }],
    };
  }

  it('atomically advances current/previous pointers, retains only two full snapshots, and preserves compact history', async () => {
    await repo.publishSnapshot(input(0));
    await repo.publishSnapshot(input(1));
    await repo.publishSnapshot(input(2));

    const state = await repo.getCourseState(courseId);
    const snapshots = await repo.listCourseSnapshots(courseId);
    const history = await repo.listStudentHistory(courseId, studentId);

    expect(state).toMatchObject({
      currentSnapshotId: ids[2],
      previousSnapshotId: ids[1],
      lastRefreshStatus: 'SUCCESS',
    });
    expect(snapshots.map((row) => row.snapshotId)).toEqual([ids[1], ids[2]]);
    expect(history).toHaveLength(3);
    expect(history.map((row) => row.snapshotId)).toEqual(ids);
  });

  it('persists Course/Student material/source change events in the same publication transaction', async () => {
    await repo.publishSnapshot({
      ...input(0),
      changeEvents: [
        {
          eventId: 'event-course-01',
          scope: 'COURSE',
          material: true,
          changeOrigin: 'LEARNING_EVENT',
          reasons: ['COURSE_INITIAL_SNAPSHOT'],
          sourceChanges: [],
        },
        {
          eventId: 'event-student-01',
          studentId,
          scope: 'STUDENT',
          material: false,
          changeOrigin: 'SOURCE_CORRECTION',
          reasons: [],
          sourceChanges: [{ evidence_id: 'ev-1', change_type: 'CHANGED' }],
        },
      ],
    });

    const events = await db.select().from(riskChangeEvent).where(eq(riskChangeEvent.courseId, courseId));
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.scope).sort()).toEqual(['COURSE', 'STUDENT']);
    expect(events.find((event) => event.scope === 'COURSE')).toMatchObject({
      fromSnapshotId: null,
      toSnapshotId: ids[0],
      material: true,
      changeOrigin: 'LEARNING_EVENT',
    });
    expect(events.find((event) => event.scope === 'STUDENT')).toMatchObject({
      studentId,
      material: false,
      changeOrigin: 'SOURCE_CORRECTION',
    });
  });

  it('records a failed refresh attempt without changing last-known-good full snapshot pointers', async () => {
    await repo.publishSnapshot(input(0));
    await repo.publishSnapshot(input(1));
    await repo.recordRefreshFailure({
      courseId,
      attemptedAt: new Date(Date.UTC(2026, 8, 10, 10, 1, 0)).toISOString(),
      refreshOrigin: 'NIGHTLY',
      attemptId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      error: 'SOURCE_DATASET_FAILURE: fixture',
    });

    const state = await repo.getCourseState(courseId);
    const snapshots = await repo.listCourseSnapshots(courseId);
    expect(state).toMatchObject({
      currentSnapshotId: ids[1],
      previousSnapshotId: ids[0],
      lastRefreshStatus: 'FAILED',
      lastRefreshError: 'SOURCE_DATASET_FAILURE: fixture',
    });
    expect(snapshots.map((row) => row.snapshotId)).toEqual([ids[0], ids[1]]);
  });

  it('rolls back snapshot, history, change-event, and pointer writes when a change event fails', async () => {
    await repo.publishSnapshot({
      ...input(0),
      changeEvents: [{
        eventId: 'event-duplicate',
        scope: 'COURSE',
        material: true,
        changeOrigin: 'UNKNOWN',
        reasons: ['COURSE_INITIAL_SNAPSHOT'],
        sourceChanges: [],
      }],
    });

    await expect(repo.publishSnapshot({
      ...input(1),
      changeEvents: [{
        eventId: 'event-duplicate',
        scope: 'COURSE',
        material: false,
        changeOrigin: 'UNKNOWN',
        reasons: [],
        sourceChanges: [],
      }],
    })).rejects.toThrow();

    const state = await repo.getCourseState(courseId);
    const snapshots = await repo.listCourseSnapshots(courseId);
    const historyRows = await db.select().from(studentRiskHistory).where(
      and(eq(studentRiskHistory.courseId, courseId), eq(studentRiskHistory.snapshotId, ids[1]!))
    );
    const events = await db.select().from(riskChangeEvent).where(eq(riskChangeEvent.courseId, courseId));

    expect(state).toMatchObject({ currentSnapshotId: ids[0], previousSnapshotId: null });
    expect(snapshots.map((row) => row.snapshotId)).toEqual([ids[0]]);
    expect(historyRows).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.toSnapshotId).toBe(ids[0]);
  });
});
