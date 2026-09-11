import { describe, expect, it } from 'vitest';
import type {
  PublishRiskSnapshotInput,
  RecordRiskRefreshFailureInput,
} from '@moodle-agent-poc/agent-runtime';
import {
  CourseRefreshCoordinator,
  ManualRiskRefreshAdapter,
  NightlyRiskRefreshAdapter,
  RiskRefreshService,
  type RiskSnapshotPersistence,
} from '../src/index.js';
import { addQuiz, baseEvidence, NOW, ref } from './course-evidence-fixture.js';

class MemoryPersistence implements RiskSnapshotPersistence {
  current = new Map<number, string>();
  previous = new Map<number, string | null>();
  fullSnapshots = new Map<string, PublishRiskSnapshotInput>();
  history: Array<{ snapshotId: string; studentId: number }> = [];
  failures: RecordRiskRefreshFailureInput[] = [];
  publications: PublishRiskSnapshotInput[] = [];

  async publishSnapshot(input: PublishRiskSnapshotInput) {
    const oldCurrent = this.current.get(input.courseId) ?? null;
    const oldPrevious = this.previous.get(input.courseId) ?? null;

    // Commit as one in-memory step to mirror repository transaction semantics.
    this.publications.push(input);
    this.fullSnapshots.set(input.snapshotId, input);
    for (const point of input.history) this.history.push({ snapshotId: input.snapshotId, studentId: point.studentId });
    this.current.set(input.courseId, input.snapshotId);
    this.previous.set(input.courseId, oldCurrent);
    if (oldPrevious && oldPrevious !== oldCurrent) this.fullSnapshots.delete(oldPrevious);
    return { currentSnapshotId: input.snapshotId, previousSnapshotId: oldCurrent };
  }

  async recordRefreshFailure(input: RecordRiskRefreshFailureInput) {
    this.failures.push(input);
  }
}

function fixedIds() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

function fixedNow() {
  let n = 0;
  return () => new Date(Date.UTC(2026, 8, 10, 9, 0, n++));
}

describe('Ticket 10 Risk refresh lifecycle', () => {
  it('joins concurrent refreshes for the same Course into one underlying refresh and snapshot', async () => {
    const persistence = new MemoryPersistence();
    let providerCalls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const provider = {
      async getCourseRiskEvidence() {
        providerCalls += 1;
        await gate;
        return baseEvidence();
      },
    };
    const service = new RiskRefreshService(provider, persistence, { idFactory: fixedIds(), now: fixedNow() });
    const coordinator = new CourseRefreshCoordinator(service);

    const firstPromise = coordinator.refreshCourse(77, 'MANUAL');
    const secondPromise = coordinator.refreshCourse(77, 'MANUAL');
    expect(coordinator.hasInFlight(77)).toBe(true);
    release();

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(providerCalls).toBe(1);
    expect(persistence.publications).toHaveLength(1);
    expect(first.snapshot_id).toBe(second.snapshot_id);
    expect(first.joined_existing_refresh).toBe(false);
    expect(second.joined_existing_refresh).toBe(true);
    expect(coordinator.hasInFlight(77)).toBe(false);
  });

  it('lets different Courses refresh concurrently rather than sharing a global flight', async () => {
    const persistence = new MemoryPersistence();
    let active = 0;
    let maxActive = 0;
    let releases = 0;
    const waiters: Array<() => void> = [];
    const provider = {
      async getCourseRiskEvidence(courseId: number) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => waiters.push(resolve));
        active -= 1;
        const evidence = baseEvidence();
        evidence.course.course_id = courseId;
        evidence.enrolments = evidence.enrolments.map((entry) => ({
          ...entry,
          source_ref: { ...entry.source_ref, course_id: courseId },
        }));
        return evidence;
      },
    };
    const service = new RiskRefreshService(provider, persistence, { idFactory: fixedIds(), now: fixedNow() });
    const coordinator = new CourseRefreshCoordinator(service);
    const a = coordinator.refreshCourse(77, 'MANUAL');
    const b = coordinator.refreshCourse(78, 'NIGHTLY');
    while (waiters.length < 2) await Promise.resolve();
    for (const resolve of waiters.splice(0)) { releases += 1; resolve(); }
    await Promise.all([a, b]);
    expect(releases).toBe(2);
    expect(maxActive).toBe(2);
  });

  it('manual and nightly adapters use the same deterministic RiskRefreshService', async () => {
    const persistence = new MemoryPersistence();
    let providerCalls = 0;
    const provider = {
      async getCourseRiskEvidence() {
        providerCalls += 1;
        return baseEvidence();
      },
    };
    const service = new RiskRefreshService(provider, persistence, { idFactory: fixedIds(), now: fixedNow() });
    const coordinator = new CourseRefreshCoordinator(service);
    const manual = new ManualRiskRefreshAdapter(coordinator);
    const nightly = new NightlyRiskRefreshAdapter(coordinator);

    const manualResult = await manual.refreshCourse(77);
    const nightlyResult = await nightly.refreshCourse(77);
    expect(providerCalls).toBe(2);
    expect(manualResult.refresh_origin).toBe('MANUAL');
    expect(nightlyResult.refresh_origin).toBe('NIGHTLY');
    expect(persistence.publications.map((x) => x.refreshOrigin)).toEqual(['MANUAL', 'NIGHTLY']);
  });

  it('rejects a source-level dataset failure and preserves the last-known-good snapshot', async () => {
    const persistence = new MemoryPersistence();
    let failSource = false;
    const provider = {
      async getCourseRiskEvidence() {
        const evidence = baseEvidence();
        if (failSource) {
          evidence.dataset_status = evidence.dataset_status.map((status) =>
            status.dataset === 'quizzes' ? { ...status, status: 'ERROR' as const, message: 'simulated source failure' } : status
          );
        }
        return evidence;
      },
    };
    const service = new RiskRefreshService(provider, persistence, { idFactory: fixedIds(), now: fixedNow() });
    const first = await service.refreshCourse(77, 'MANUAL');
    failSource = true;

    await expect(service.refreshCourse(77, 'NIGHTLY')).rejects.toMatchObject({ code: 'SOURCE_DATASET_FAILURE' });
    expect(persistence.current.get(77)).toBe(first.snapshot_id);
    expect(persistence.publications).toHaveLength(1);
    expect(persistence.failures).toHaveLength(1);
    expect(persistence.failures[0]?.error).toContain('SOURCE_DATASET_FAILURE');
  });

  it('publishes a Course snapshot with a student-specific INCOMPLETE result excluded from Risk distribution', async () => {
    const persistence = new MemoryPersistence();
    const evidence = baseEvidence();
    evidence.enrolments.push({
      student_id: 102,
      active: false,
      enrolled_at: NOW - 10_000,
      source_ref: ref('user_enrolment', 102, undefined, 102),
    });
    const provider = { async getCourseRiskEvidence() { return evidence; } };
    const service = new RiskRefreshService(provider, persistence, { idFactory: fixedIds(), now: fixedNow() });

    const published = await service.refreshCourse(77, 'MANUAL');
    expect(published.status).toBe('PUBLISHED');
    expect(published.evaluation_coverage).toBe(0.5);
    const payload = persistence.publications[0]?.payload as any;
    expect(payload.course_aggregate).toMatchObject({ enrolled_count: 2, evaluated_count: 1, incomplete_count: 1 });
    expect(payload.course_aggregate.student_risk_distribution.denominator).toBe(1);
    expect(payload.student_results.find((x: any) => x.student_id === 102)).toMatchObject({
      evaluation_status: 'INCOMPLETE', overall_risk: null,
    });
  });

  it('treats PENDING_GRADE as academic lifecycle state, not a Completeness Gate failure', async () => {
    const persistence = new MemoryPersistence();
    const evidence = baseEvidence();
    addQuiz(evidence, { activityId: 201, grade: null, gradeToPass: 50, gradeState: 'PENDING' });
    const service = new RiskRefreshService(
      { async getCourseRiskEvidence() { return evidence; } },
      persistence,
      { idFactory: fixedIds(), now: fixedNow() }
    );

    await expect(service.refreshCourse(77, 'MANUAL')).resolves.toMatchObject({ status: 'PUBLISHED' });
    expect(persistence.failures).toHaveLength(0);
  });

  it('keeps current/previous full snapshots while compact history survives a third successful refresh', async () => {
    const persistence = new MemoryPersistence();
    const service = new RiskRefreshService(
      { async getCourseRiskEvidence() { return baseEvidence(); } },
      persistence,
      { idFactory: fixedIds(), now: fixedNow() }
    );

    const first = await service.refreshCourse(77, 'MANUAL');
    const second = await service.refreshCourse(77, 'NIGHTLY');
    const third = await service.refreshCourse(77, 'NIGHTLY');
    expect(persistence.current.get(77)).toBe(third.snapshot_id);
    expect(persistence.previous.get(77)).toBe(second.snapshot_id);
    expect(persistence.fullSnapshots.has(first.snapshot_id)).toBe(false);
    expect(persistence.fullSnapshots.has(second.snapshot_id)).toBe(true);
    expect(persistence.fullSnapshots.has(third.snapshot_id)).toBe(true);
    expect(persistence.history.filter((x) => x.studentId === 101)).toHaveLength(3);
  });
  it('publishes PARTIAL Course evidence with missing active-student Quiz facts as INCOMPLETE and excludes it from denominators', async () => {
    const persistence = new MemoryPersistence();
    const evidence = baseEvidence();
    addQuiz(evidence, { activityId: 201, grade: 0, gradeToPass: 50 });
    evidence.quizzes[0]!.students = [];
    evidence.dataset_status.find((item) => item.dataset === 'quizzes')!.status = 'PARTIAL';
    const service = new RiskRefreshService(
      { async getCourseRiskEvidence() { return evidence; } },
      persistence,
      { idFactory: fixedIds(), now: fixedNow() }
    );

    const published = await service.refreshCourse(77, 'MANUAL');
    expect(published).toMatchObject({ status: 'PUBLISHED', evaluation_coverage: 0 });
    const payload = persistence.publications[0]?.payload as any;
    expect(payload.course_aggregate).toMatchObject({ enrolled_count: 1, evaluated_count: 0, incomplete_count: 1 });
    expect(payload.course_aggregate.student_risk_distribution.denominator).toBe(0);
    expect(payload.student_results[0]).toMatchObject({ evaluation_status: 'INCOMPLETE', overall_risk: null });
  });

});


describe('Risk refresh zero-student empty state', () => {
  it('publishes a valid empty snapshot instead of treating a Course with no active students as an outage', async () => {
    const persistence = new MemoryPersistence();
    const evidence = baseEvidence();
    evidence.enrolments = [];
    const service = new RiskRefreshService(
      { async getCourseRiskEvidence() { return evidence; } },
      persistence,
      { idFactory: fixedIds(), now: fixedNow() }
    );

    const published = await service.refreshCourse(77, 'MANUAL');
    expect(published).toMatchObject({ status: 'PUBLISHED', course_id: 77, evaluation_coverage: null });
    expect(persistence.failures).toHaveLength(0);
    const payload = persistence.publications[0]?.payload as any;
    expect(payload.course_aggregate).toMatchObject({
      enrolled_count: 0,
      evaluated_count: 0,
      incomplete_count: 0,
      evaluation_coverage: null,
      student_risk_distribution: { denominator: 0, LOW: 0, MEDIUM: 0, HIGH: 0 },
    });
    expect(payload.student_results).toEqual([]);
  });
});
