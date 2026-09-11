import { describe, expect, it } from 'vitest';
import {
  RiskSnapshotComparator,
  RiskTrendEngine,
  type RiskSnapshotPayloadV01,
  type StudentRiskHistoryPoint,
} from '../src/index.js';

function distribution(low: number, medium: number, high: number) {
  return { denominator: low + medium + high, LOW: low, MEDIUM: medium, HIGH: high };
}

function snapshot(params: {
  overall?: 'LOW' | 'MEDIUM' | 'HIGH';
  submission?: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceHash?: string;
  ruleId?: string;
  version?: string;
  activityIssues?: Array<{ activity_id: number; issue_type: string }>;
  gapIds?: number[];
  coverage?: number;
} = {}): RiskSnapshotPayloadV01 {
  const overall = params.overall ?? 'LOW';
  const submission = params.submission ?? overall;
  const version = params.version ?? 'risk-profile.v0.1';
  const counts = overall === 'LOW' ? distribution(1, 0, 0) : overall === 'MEDIUM' ? distribution(0, 1, 0) : distribution(0, 0, 1);
  const lowDist = distribution(1, 0, 0);
  const submissionDist = submission === 'LOW' ? lowDist : submission === 'MEDIUM' ? distribution(0, 1, 0) : distribution(0, 0, 1);
  const evidenceHash = params.evidenceHash ?? 'a'.repeat(64);
  const ruleId = params.ruleId ?? (submission === 'LOW' ? 'SUBMISSION_WITHIN_POLICY' : `SUBMISSION_OVERDUE_${submission}`);
  const activityIssues = (params.activityIssues ?? []).map((item, index) => ({
    issue_id: `issue-${index}`,
    activity_id: item.activity_id,
    issue_type: item.issue_type,
    affected: { numerator: 3, denominator: 5, rate: 0.6 },
    expected_students: 5,
    evaluable_count: null,
    performance_coverage: null,
    affected_student_refs: ['student:101'],
    evidence_refs: ['ev-1'],
  }));
  const gaps = (params.gapIds ?? []).map((id) => ({
    gap_id: `gap-${id}`,
    competency_id: id,
    confirmed_gap: { numerator: 3, denominator: 5, rate: 0.6 },
    expected_students: 5,
    rated_expected_count: 5,
    rating_coverage: 1,
    affected_student_refs: ['student:101'],
    evidence_refs: ['ev-1'],
  }));

  return {
    schema_version: 'risk-snapshot.v0.1',
    course_id: 77,
    source_evidence: {} as never,
    normalized_students: [{
      student_id: 101,
      course_id: 77,
      data_as_of: 1_789_000_000,
      evaluation_status: 'COMPLETE',
      incomplete_reasons: [],
      progress: {
        total_applicable: 0,
        expected_count: 0,
        completed_count: 0,
        completed_expected_count: 0,
        expected_progress: 0,
        actual_progress: 0,
        progress_gap_pp: 0,
        timeline_compliance: null,
        evidence_refs: [],
      },
      assessments: [],
      competencies: [],
      submissions: submission === 'LOW' ? [] : [{
        evidence_id: 'ev-1',
        activity_id: 301,
        activity_type: 'assignment',
        state: 'OVERDUE',
        due_at: 1_788_000_000,
        submitted_at: null,
        recovery_not_available: false,
        source_ref: {} as never,
      }],
      evidence: [{
        evidence_id: 'ev-1',
        student_id: 101,
        kind: 'SUBMISSION_STATE',
        observed_state: submission === 'LOW' ? 'ON_TIME' : 'OVERDUE',
        observed_value: null,
        observed_at: 1_789_000_000,
        activity_id: 301,
        source_ref: {} as never,
        evidence_hash: evidenceHash,
      }],
    }],
    student_results: [{
      student_id: 101,
      course_id: 77,
      evaluation_status: 'COMPLETE',
      overall_risk: overall,
      dimensions: {
        progress: { dimension: 'PROGRESS', risk_level: 'LOW', rule_hits: [], metrics: {}, evidence_refs: [] },
        performance: { dimension: 'PERFORMANCE', risk_level: 'LOW', rule_hits: [], metrics: {}, evidence_refs: [] },
        competency: { dimension: 'COMPETENCY', risk_level: 'LOW', rule_hits: [], metrics: {}, evidence_refs: [] },
        submission: {
          dimension: 'SUBMISSION',
          risk_level: submission,
          rule_hits: [{ rule_id: ruleId, dimension: 'SUBMISSION', resulting_level: submission, evidence_refs: ['ev-1'], message: 'fixture' }],
          metrics: {},
          evidence_refs: ['ev-1'],
        },
      },
      rule_hits: [{ rule_id: ruleId, dimension: 'SUBMISSION', resulting_level: submission, evidence_refs: ['ev-1'], message: 'fixture' }],
      evidence: [],
      data_as_of: 1_789_000_000,
      risk_model_version: version as 'risk-profile.v0.1',
      incomplete_reasons: [],
    }],
    course_aggregate: {
      course_id: 77,
      data_as_of: 1_789_000_000,
      risk_model_version: version as 'risk-profile.v0.1',
      enrolled_count: 1,
      evaluated_count: 1,
      incomplete_count: 0,
      evaluation_coverage: params.coverage ?? 1,
      student_risk_distribution: counts,
      dimension_distributions: { progress: lowDist, performance: lowDist, competency: lowDist, submission: submissionDist },
      activity_issues: activityIssues as never,
      common_competency_gaps: gaps,
      notable_associations: [],
      action_candidates: [],
    },
  };
}

function historyPoint(day: number, params: {
  overall?: 'LOW' | 'MEDIUM' | 'HIGH';
  version?: string;
  createdSuffix?: string;
  progressGap?: number;
  timelineCompliance?: number;
  overdue?: number;
} = {}): StudentRiskHistoryPoint {
  const overall = params.overall ?? 'LOW';
  const base = Date.UTC(2026, 8, day, 8, 0, 0) / 1000;
  return {
    snapshotId: `s-${day}-${params.createdSuffix ?? 'a'}`,
    dataAsOf: base,
    createdAt: `2026-09-${String(day).padStart(2, '0')}T08:00:${params.createdSuffix === 'b' ? '59' : '00'}Z`,
    riskModelVersion: params.version ?? 'risk-profile.v0.1',
    evaluationStatus: 'COMPLETE',
    overallRisk: overall,
    progressRisk: overall,
    performanceRisk: 'LOW',
    competencyRisk: 'LOW',
    submissionRisk: overall,
    dimensionMetrics: {
      progress: { progress_gap_pp: params.progressGap ?? (overall === 'HIGH' ? 30 : overall === 'MEDIUM' ? 15 : 5), timeline_compliance: params.timelineCompliance ?? 0.9 },
      performance: { recent_fail_count: 0, recent_low_score_count: 0, persistent_fail_count: 0, persistent_low_score_count: 0, persistent_low_score_rate: 0 },
      competency: { confirmed_gap_count: 0, confirmed_gap_rate: 0 },
      submission: { late_count: 0, overdue_count: params.overdue ?? (overall === 'HIGH' ? 4 : overall === 'MEDIUM' ? 2 : 0) },
    },
  };
}

describe('Ticket 11 RiskSnapshotComparator', () => {
  it('keeps unchanged canonical interpretation non-material', () => {
    const value = snapshot();
    const comparison = new RiskSnapshotComparator().compare(value, structuredClone(value));
    expect(comparison.material).toBe(false);
    expect(comparison.reasons).toEqual([]);
    expect(comparison.student_changes[0]?.material).toBe(false);
  });

  it('records source correction without pretending it is learning improvement', () => {
    const previous = snapshot({ evidenceHash: 'a'.repeat(64) });
    const current = snapshot({ evidenceHash: 'b'.repeat(64) });
    const comparison = new RiskSnapshotComparator().compare(previous, current, { change_origin_hint: 'SOURCE_CORRECTION' });
    expect(comparison.change_origin).toBe('SOURCE_CORRECTION');
    expect(comparison.material).toBe(false);
    expect(comparison.source_changes).toHaveLength(1);
    expect(comparison.source_changes[0]?.change_type).toBe('CHANGED');
  });

  it('detects HIGH to MEDIUM learning change deterministically', () => {
    const previous = snapshot({ overall: 'HIGH', submission: 'HIGH' });
    const current = snapshot({ overall: 'MEDIUM', submission: 'MEDIUM' });
    const comparison = new RiskSnapshotComparator().compare(previous, current, { change_origin_hint: 'LEARNING_EVENT' });
    expect(comparison.change_origin).toBe('LEARNING_EVENT');
    expect(comparison.material).toBe(true);
    expect(comparison.reasons).toContain('COURSE_EVALUATED_RISK_DISTRIBUTION_CHANGED');
    expect(comparison.student_changes[0]?.reasons).toContain('STUDENT_OVERALL_RISK_CHANGED');
    expect(comparison.student_changes[0]?.reasons).toContain('STUDENT_SUBMISSION_SEVERITY_CHANGED');
  });

  it('forces POLICY_CHANGE when Risk Profile version changes', () => {
    const previous = snapshot({ version: 'risk-profile.v0.1' });
    const current = snapshot({ version: 'risk-profile.v0.2' });
    const comparison = new RiskSnapshotComparator().compare(previous, current, { change_origin_hint: 'LEARNING_EVENT' });
    expect(comparison.change_origin).toBe('POLICY_CHANGE');
    expect(comparison.material).toBe(true);
    expect(comparison.reasons).toContain('RISK_PROFILE_VERSION_CHANGED');
  });

  it('detects Course issue/gap/tier changes without creating a Course risk level', () => {
    const previous = snapshot({ coverage: 0.9 });
    const current = snapshot({
      coverage: 0.6,
      activityIssues: [{ activity_id: 201, issue_type: 'PERFORMANCE_PROBLEM' }],
      gapIds: [401],
    });
    const comparison = new RiskSnapshotComparator().compare(previous, current);
    expect(comparison.reasons).toEqual(expect.arrayContaining([
      'COURSE_ACTIVITY_ISSUE_SET_CHANGED',
      'COURSE_COMMON_COMPETENCY_GAP_SET_CHANGED',
      'COURSE_INSIGHT_ELIGIBILITY_TIER_CHANGED',
    ]));
    expect(current.course_aggregate).not.toHaveProperty('risk_level');
  });
});

describe('Ticket 11 RiskTrendEngine', () => {
  it('returns INSUFFICIENT_HISTORY with fewer than 3 same-version canonical days', () => {
    const result = new RiskTrendEngine().calculate([historyPoint(1), historyPoint(2)]);
    expect(result.overall).toBe('INSUFFICIENT_HISTORY');
    expect(result.canonical_points).toHaveLength(2);
  });

  it('keeps only the latest valid point for each day', () => {
    const first = historyPoint(1, { overall: 'HIGH', createdSuffix: 'a' });
    const later = { ...historyPoint(1, { overall: 'MEDIUM', createdSuffix: 'b' }), dataAsOf: first.dataAsOf + 60 };
    const result = new RiskTrendEngine().calculate([first, later, historyPoint(2, { overall: 'MEDIUM' }), historyPoint(3, { overall: 'LOW' })]);
    expect(result.canonical_points).toHaveLength(3);
    expect(result.canonical_points[0]?.snapshotId).toBe(later.snapshotId);
  });

  it('uses severity movement first for a 3-day improving trend', () => {
    const result = new RiskTrendEngine().calculate([
      historyPoint(1, { overall: 'HIGH' }),
      historyPoint(2, { overall: 'MEDIUM' }),
      historyPoint(3, { overall: 'MEDIUM' }),
    ]);
    expect(result.overall).toBe('IMPROVING');
  });

  it('reconciles opposite recent-3 and context-7 directions to MIXED', () => {
    const result = new RiskTrendEngine().calculate([
      historyPoint(1, { overall: 'HIGH' }),
      historyPoint(2, { overall: 'HIGH' }),
      historyPoint(3, { overall: 'HIGH' }),
      historyPoint(4, { overall: 'LOW' }),
      historyPoint(5, { overall: 'LOW' }),
      historyPoint(6, { overall: 'LOW' }),
      historyPoint(7, { overall: 'MEDIUM' }),
    ]);
    expect(result.overall).toBe('MIXED');
    expect(result.reasons).toEqual(expect.arrayContaining(['RECENT_3_WORSENING', 'CONTEXT_7_IMPROVING', 'RECONCILED_MIXED']));
  });

  it('never crosses a Risk Profile version boundary', () => {
    const points = [1, 2, 3, 4, 5].map((day) => historyPoint(day, { version: 'risk-profile.v0.1', overall: 'HIGH' }));
    points.push(historyPoint(6, { version: 'risk-profile.v0.2', overall: 'MEDIUM' }));
    points.push(historyPoint(7, { version: 'risk-profile.v0.2', overall: 'LOW' }));
    const result = new RiskTrendEngine().calculate(points);
    expect(result.risk_model_version).toBe('risk-profile.v0.2');
    expect(result.canonical_points).toHaveLength(2);
    expect(result.overall).toBe('INSUFFICIENT_HISTORY');
  });

  it('can surface different dimension directions and overall MIXED while severity is unchanged', () => {
    const points = [
      historyPoint(1, { overall: 'HIGH', progressGap: 30, overdue: 1 }),
      historyPoint(2, { overall: 'HIGH', progressGap: 22, overdue: 2 }),
      historyPoint(3, { overall: 'HIGH', progressGap: 15, overdue: 4 }),
    ];
    // Keep dimension severity stable so significant metrics, not severity, drive direction.
    for (const point of points) {
      point.progressRisk = 'HIGH';
      point.submissionRisk = 'HIGH';
    }
    const result = new RiskTrendEngine().calculate(points);
    expect(result.dimensions.progress).toBe('IMPROVING');
    expect(result.dimensions.submission).toBe('WORSENING');
    expect(result.overall).toBe('MIXED');
  });

  it('ignores metric movement below the versioned significance threshold', () => {
    const result = new RiskTrendEngine().calculate([
      historyPoint(1, { overall: 'LOW', progressGap: 5 }),
      historyPoint(2, { overall: 'LOW', progressGap: 7 }),
      historyPoint(3, { overall: 'LOW', progressGap: 9 }),
    ]);
    expect(result.dimensions.progress).toBe('STABLE');
    expect(result.overall).toBe('STABLE');
  });
});


describe('Ticket 11 JSONB canonical comparison regression', () => {
  it('does not treat object key-order changes from JSONB as a material Course change', () => {
    const previous = snapshot({ overall: 'MEDIUM', submission: 'MEDIUM' });
    const current = structuredClone(previous);
    const reorder = (value: { denominator: number; LOW: number; MEDIUM: number; HIGH: number }) => ({
      LOW: value.LOW,
      HIGH: value.HIGH,
      MEDIUM: value.MEDIUM,
      denominator: value.denominator,
    });
    current.course_aggregate.student_risk_distribution = reorder(current.course_aggregate.student_risk_distribution);
    current.course_aggregate.dimension_distributions = {
      progress: reorder(current.course_aggregate.dimension_distributions.progress),
      performance: reorder(current.course_aggregate.dimension_distributions.performance),
      competency: reorder(current.course_aggregate.dimension_distributions.competency),
      submission: reorder(current.course_aggregate.dimension_distributions.submission),
    };

    const comparison = new RiskSnapshotComparator().compare(previous, current);
    expect(comparison.material).toBe(false);
    expect(comparison.reasons).toEqual([]);
  });
});
