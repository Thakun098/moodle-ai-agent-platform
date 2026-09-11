import { TREND_PROFILE_V01, type TrendProfileV01 } from './trend-profile.js';
import type { RiskLevel } from './types.js';

export type RiskTrendState =
  | 'IMPROVING'
  | 'STABLE'
  | 'WORSENING'
  | 'MIXED'
  | 'INSUFFICIENT_HISTORY';

export interface StudentRiskHistoryPoint {
  snapshotId: string;
  dataAsOf: number;
  createdAt: string;
  riskModelVersion: string;
  evaluationStatus: 'COMPLETE' | 'INCOMPLETE';
  overallRisk: RiskLevel | null;
  progressRisk: RiskLevel | null;
  performanceRisk: RiskLevel | null;
  competencyRisk: RiskLevel | null;
  submissionRisk: RiskLevel | null;
  dimensionMetrics: Record<string, Record<string, number | null>>;
}

export interface CanonicalDailyRiskPoint extends StudentRiskHistoryPoint {
  canonical_day: string;
}

export function scopeRiskHistoryToSnapshot(
  points: StudentRiskHistoryPoint[],
  snapshotId: string,
  riskModelVersion: string,
  fallbackDataAsOf?: number
): StudentRiskHistoryPoint[] {
  const selected = points.find((point) => point.snapshotId === snapshotId);
  return points.filter((point) => {
    if (point.riskModelVersion !== riskModelVersion) return false;
    if (selected) {
      if (point.createdAt < selected.createdAt) return true;
      if (point.createdAt > selected.createdAt) return false;
      if (point.snapshotId === snapshotId) return true;
      if (point.dataAsOf < selected.dataAsOf) return true;
      if (point.dataAsOf > selected.dataAsOf) return false;
      return false;
    }
    return fallbackDataAsOf !== undefined && point.dataAsOf <= fallbackDataAsOf;
  });
}

export interface RiskTrendResult {
  risk_model_version: string | null;
  canonical_points: CanonicalDailyRiskPoint[];
  overall: RiskTrendState;
  dimensions: {
    progress: RiskTrendState;
    performance: RiskTrendState;
    competency: RiskTrendState;
    submission: RiskTrendState;
  };
  recent_window_points: number;
  context_window_points: number;
  reasons: string[];
}

const LEVEL_RANK: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

type DimensionKey = 'progress' | 'performance' | 'competency' | 'submission';

function directionalDelta(delta: number): RiskTrendState {
  if (delta < 0) return 'IMPROVING';
  if (delta > 0) return 'WORSENING';
  return 'STABLE';
}

function dayKey(epochSeconds: number, offsetMinutes: number): string {
  const date = new Date((epochSeconds + offsetMinutes * 60) * 1000);
  return date.toISOString().slice(0, 10);
}

function levelFor(point: StudentRiskHistoryPoint, dimension: DimensionKey): RiskLevel | null {
  if (dimension === 'progress') return point.progressRisk;
  if (dimension === 'performance') return point.performanceRisk;
  if (dimension === 'competency') return point.competencyRisk;
  return point.submissionRisk;
}

function metricDirections(
  first: StudentRiskHistoryPoint,
  last: StudentRiskHistoryPoint,
  dimension: DimensionKey,
  profile: TrendProfileV01
): RiskTrendState {
  const thresholds = profile.significant_metric_movement[dimension] as Record<string, number>;
  const before = first.dimensionMetrics[dimension] ?? {};
  const after = last.dimensionMetrics[dimension] ?? {};
  const directions: RiskTrendState[] = [];

  for (const [metric, threshold] of Object.entries(thresholds)) {
    const a = before[metric];
    const b = after[metric];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const rawDelta = b - a;
    if (Math.abs(rawDelta) < threshold) continue;

    // All configured risk-load metrics are "lower is better" except timeline compliance.
    const riskDelta = metric === 'timeline_compliance' ? -rawDelta : rawDelta;
    directions.push(directionalDelta(riskDelta));
  }

  const directional = directions.filter((item) => item !== 'STABLE');
  if (directional.includes('IMPROVING') && directional.includes('WORSENING')) return 'MIXED';
  if (directional.includes('IMPROVING')) return 'IMPROVING';
  if (directional.includes('WORSENING')) return 'WORSENING';
  return 'STABLE';
}

function dimensionWindowDirection(
  points: StudentRiskHistoryPoint[],
  dimension: DimensionKey,
  profile: TrendProfileV01
): RiskTrendState {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return 'INSUFFICIENT_HISTORY';
  const firstLevel = levelFor(first, dimension);
  const lastLevel = levelFor(last, dimension);
  if (firstLevel === null || lastLevel === null) return 'INSUFFICIENT_HISTORY';

  const severityDirection = directionalDelta(LEVEL_RANK[lastLevel] - LEVEL_RANK[firstLevel]);
  if (severityDirection !== 'STABLE') return severityDirection;
  return metricDirections(first, last, dimension, profile);
}

function overallWindowDirection(
  points: StudentRiskHistoryPoint[],
  dimensionDirections: Record<DimensionKey, RiskTrendState>
): RiskTrendState {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || first.overallRisk === null || last.overallRisk === null) return 'INSUFFICIENT_HISTORY';
  const severityDirection = directionalDelta(LEVEL_RANK[last.overallRisk] - LEVEL_RANK[first.overallRisk]);
  if (severityDirection !== 'STABLE') return severityDirection;

  const values = Object.values(dimensionDirections).filter(
    (item) => item !== 'STABLE' && item !== 'INSUFFICIENT_HISTORY'
  );
  if (values.includes('MIXED') || (values.includes('IMPROVING') && values.includes('WORSENING'))) return 'MIXED';
  if (values.includes('IMPROVING')) return 'IMPROVING';
  if (values.includes('WORSENING')) return 'WORSENING';
  return 'STABLE';
}

function reconcile(recent: RiskTrendState, context: RiskTrendState): RiskTrendState {
  if (recent === 'INSUFFICIENT_HISTORY') return context;
  if (context === 'INSUFFICIENT_HISTORY') return recent;
  if (recent === 'MIXED' || context === 'MIXED') return 'MIXED';
  if (recent === context) return recent;
  if (recent === 'STABLE') return context;
  if (context === 'STABLE') return recent;
  return 'MIXED';
}

export class RiskTrendEngine {
  constructor(private readonly profile: TrendProfileV01 = TREND_PROFILE_V01) {}

  canonicalize(points: StudentRiskHistoryPoint[]): CanonicalDailyRiskPoint[] {
    const complete = points.filter(
      (point) => point.evaluationStatus === 'COMPLETE' && point.overallRisk !== null
    );
    if (complete.length === 0) return [];

    // Never cross a Risk Profile boundary. The latest valid point chooses the active version window.
    const ordered = [...complete].sort((a, b) => a.dataAsOf - b.dataAsOf || a.createdAt.localeCompare(b.createdAt));
    const latestVersion = ordered.at(-1)!.riskModelVersion;
    const sameVersion = ordered.filter((point) => point.riskModelVersion === latestVersion);
    const byDay = new Map<string, CanonicalDailyRiskPoint>();
    for (const point of sameVersion) {
      const canonicalDay = dayKey(point.dataAsOf, this.profile.daily_time_offset_minutes);
      const existing = byDay.get(canonicalDay);
      if (
        !existing ||
        point.dataAsOf > existing.dataAsOf ||
        (point.dataAsOf === existing.dataAsOf && point.createdAt > existing.createdAt)
      ) {
        byDay.set(canonicalDay, { ...point, canonical_day: canonicalDay });
      }
    }
    return [...byDay.values()].sort((a, b) => a.canonical_day.localeCompare(b.canonical_day));
  }

  calculate(points: StudentRiskHistoryPoint[]): RiskTrendResult {
    const canonical = this.canonicalize(points);
    const version = canonical.at(-1)?.riskModelVersion ?? null;
    const insufficient: RiskTrendResult = {
      risk_model_version: version,
      canonical_points: canonical,
      overall: 'INSUFFICIENT_HISTORY',
      dimensions: {
        progress: 'INSUFFICIENT_HISTORY',
        performance: 'INSUFFICIENT_HISTORY',
        competency: 'INSUFFICIENT_HISTORY',
        submission: 'INSUFFICIENT_HISTORY',
      },
      recent_window_points: Math.min(3, canonical.length),
      context_window_points: Math.min(7, canonical.length),
      reasons: ['FEWER_THAN_3_CANONICAL_SAME_VERSION_DAILY_POINTS'],
    };
    if (canonical.length < 3) return insufficient;

    const recent = canonical.slice(-3);
    const context = canonical.length >= 7 ? canonical.slice(-7) : null;
    const dimensions = {} as Record<DimensionKey, RiskTrendState>;
    const recentDimensions = {} as Record<DimensionKey, RiskTrendState>;
    const contextDimensions = {} as Record<DimensionKey, RiskTrendState>;

    for (const dimension of ['progress', 'performance', 'competency', 'submission'] as const) {
      recentDimensions[dimension] = dimensionWindowDirection(recent, dimension, this.profile);
      contextDimensions[dimension] = context
        ? dimensionWindowDirection(context, dimension, this.profile)
        : 'INSUFFICIENT_HISTORY';
      dimensions[dimension] = context
        ? reconcile(recentDimensions[dimension], contextDimensions[dimension])
        : recentDimensions[dimension];
    }

    const recentOverall = overallWindowDirection(recent, recentDimensions);
    const contextOverall = context ? overallWindowDirection(context, contextDimensions) : 'INSUFFICIENT_HISTORY';
    const overall = context ? reconcile(recentOverall, contextOverall) : recentOverall;

    return {
      risk_model_version: version,
      canonical_points: canonical,
      overall,
      dimensions,
      recent_window_points: recent.length,
      context_window_points: context?.length ?? 0,
      reasons: context
        ? [`RECENT_3_${recentOverall}`, `CONTEXT_7_${contextOverall}`, `RECONCILED_${overall}`]
        : [`RECENT_3_${recentOverall}`],
    };
  }
}
