import type { RiskChangeOrigin } from '@moodle-agent-poc/agent-runtime';
import type { CourseRiskAggregate } from './course-risk-types.js';
import type { RiskSnapshotPayloadV01 } from './risk-refresh-types.js';
import type { StudentNormalizedRiskEvidence, StudentRiskResult } from './types.js';

export interface RiskSourceChange {
  scope: 'STUDENT';
  student_id: number;
  evidence_id: string;
  from_hash: string | null;
  to_hash: string | null;
  change_type: 'ADDED' | 'REMOVED' | 'CHANGED';
}

export interface StudentMaterialChange {
  student_id: number;
  material: boolean;
  reasons: string[];
  source_changes: RiskSourceChange[];
}

export interface CourseMaterialChange {
  material: boolean;
  reasons: string[];
  change_origin: RiskChangeOrigin;
  source_changes: RiskSourceChange[];
  student_changes: StudentMaterialChange[];
}

export interface RiskSnapshotComparisonOptions {
  change_origin_hint?: Exclude<RiskChangeOrigin, 'POLICY_CHANGE'>;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function setChanged(a: Iterable<string>, b: Iterable<string>): boolean {
  const aa = sorted(a);
  const bb = sorted(b);
  return aa.length !== bb.length || aa.some((value, index) => value !== bb[index]);
}

function distributionSignature(aggregate: CourseRiskAggregate): string {
  const dist = (value: CourseRiskAggregate['student_risk_distribution']) => [
    value.denominator, value.LOW, value.MEDIUM, value.HIGH,
  ];
  return JSON.stringify([
    aggregate.evaluated_count,
    aggregate.incomplete_count,
    aggregate.evaluation_coverage,
    dist(aggregate.student_risk_distribution),
    dist(aggregate.dimension_distributions.progress),
    dist(aggregate.dimension_distributions.performance),
    dist(aggregate.dimension_distributions.competency),
    dist(aggregate.dimension_distributions.submission),
  ]);
}

function issueSignature(aggregate: CourseRiskAggregate): string[] {
  return aggregate.activity_issues.map((issue) => `${issue.activity_id}:${issue.issue_type}`).sort();
}

function gapSignature(aggregate: CourseRiskAggregate): string[] {
  return aggregate.common_competency_gaps.map((gap) => String(gap.competency_id)).sort();
}

function insightTier(coverage: number | null): 'FULL' | 'LIMITED' | 'BLOCKED' {
  if (coverage !== null && coverage >= 0.8) return 'FULL';
  if (coverage !== null && coverage >= 0.5) return 'LIMITED';
  return 'BLOCKED';
}

function dominantDimensions(aggregate: CourseRiskAggregate): string[] {
  const scores = Object.entries(aggregate.dimension_distributions).map(([dimension, distribution]) => ({
    dimension,
    score: distribution.HIGH * 2 + distribution.MEDIUM,
  }));
  const max = Math.max(...scores.map((item) => item.score), 0);
  return scores.filter((item) => item.score === max).map((item) => item.dimension).sort();
}

function materialRuleIds(result: StudentRiskResult): string[] {
  return result.rule_hits
    .map((hit) => hit.rule_id)
    .filter((ruleId) => !ruleId.endsWith('_WITHIN_POLICY') && ruleId !== 'COMPETENCY_NO_CONFIRMED_GAP')
    .sort();
}

function confirmedGaps(normalized: StudentNormalizedRiskEvidence): string[] {
  return normalized.competencies
    .filter((item) => item.state === 'CONFIRMED_GAP')
    .map((item) => String(item.competency_id))
    .sort();
}

function activeOverdues(normalized: StudentNormalizedRiskEvidence): string[] {
  return normalized.submissions
    .filter((item) => item.state === 'OVERDUE')
    .map((item) => String(item.activity_id))
    .sort();
}

function evidenceChanges(
  previous: StudentNormalizedRiskEvidence | undefined,
  current: StudentNormalizedRiskEvidence
): RiskSourceChange[] {
  const before = new Map((previous?.evidence ?? []).map((item) => [item.evidence_id, item.evidence_hash]));
  const after = new Map(current.evidence.map((item) => [item.evidence_id, item.evidence_hash]));
  const ids = sorted([...before.keys(), ...after.keys()]);
  const changes: RiskSourceChange[] = [];
  for (const id of ids) {
    const fromHash = before.get(id) ?? null;
    const toHash = after.get(id) ?? null;
    if (fromHash === toHash) continue;
    changes.push({
      scope: 'STUDENT',
      student_id: current.student_id,
      evidence_id: id,
      from_hash: fromHash,
      to_hash: toHash,
      change_type: fromHash === null ? 'ADDED' : toHash === null ? 'REMOVED' : 'CHANGED',
    });
  }
  return changes;
}

function compareStudent(
  previousResult: StudentRiskResult | undefined,
  previousNormalized: StudentNormalizedRiskEvidence | undefined,
  currentResult: StudentRiskResult,
  currentNormalized: StudentNormalizedRiskEvidence,
  policyChanged: boolean
): StudentMaterialChange {
  const reasons: string[] = [];
  if (!previousResult || !previousNormalized) {
    reasons.push('STUDENT_INITIAL_STATE');
  } else {
    if (previousResult.overall_risk !== currentResult.overall_risk) reasons.push('STUDENT_OVERALL_RISK_CHANGED');
    for (const key of ['progress', 'performance', 'competency', 'submission'] as const) {
      if (previousResult.dimensions[key].risk_level !== currentResult.dimensions[key].risk_level) {
        reasons.push(`STUDENT_${key.toUpperCase()}_SEVERITY_CHANGED`);
      }
    }
    if (setChanged(confirmedGaps(previousNormalized), confirmedGaps(currentNormalized))) {
      reasons.push('STUDENT_CONFIRMED_COMPETENCY_GAP_CHANGED');
    }
    if (setChanged(activeOverdues(previousNormalized), activeOverdues(currentNormalized))) {
      reasons.push('STUDENT_ACTIVE_OVERDUE_CHANGED');
    }
    if (setChanged(materialRuleIds(previousResult), materialRuleIds(currentResult))) {
      reasons.push('STUDENT_MATERIAL_RULE_SET_CHANGED');
    }
    if (previousResult.evaluation_status !== currentResult.evaluation_status) {
      reasons.push('STUDENT_EVALUATION_STATUS_CHANGED');
    }
  }
  if (policyChanged) reasons.push('RISK_PROFILE_VERSION_CHANGED');
  return {
    student_id: currentResult.student_id,
    material: reasons.length > 0,
    reasons: sorted(reasons),
    source_changes: evidenceChanges(previousNormalized, currentNormalized),
  };
}

export class RiskSnapshotComparator {
  compare(
    previous: RiskSnapshotPayloadV01 | null,
    current: RiskSnapshotPayloadV01,
    options: RiskSnapshotComparisonOptions = {}
  ): CourseMaterialChange {
    const policyChanged = previous !== null &&
      previous.course_aggregate.risk_model_version !== current.course_aggregate.risk_model_version;
    const previousResults = new Map(previous?.student_results.map((item) => [item.student_id, item]) ?? []);
    const previousNormalized = new Map(previous?.normalized_students.map((item) => [item.student_id, item]) ?? []);

    const studentChanges = current.student_results.map((result) => {
      const normalized = current.normalized_students.find((item) => item.student_id === result.student_id);
      if (!normalized) throw new Error(`Missing normalized evidence for Student ${result.student_id}.`);
      return compareStudent(
        previousResults.get(result.student_id),
        previousNormalized.get(result.student_id),
        result,
        normalized,
        policyChanged
      );
    });

    const reasons: string[] = [];
    if (previous === null) {
      reasons.push('COURSE_INITIAL_SNAPSHOT');
    } else {
      if (distributionSignature(previous.course_aggregate) !== distributionSignature(current.course_aggregate)) {
        reasons.push('COURSE_EVALUATED_RISK_DISTRIBUTION_CHANGED');
      }
      if (setChanged(issueSignature(previous.course_aggregate), issueSignature(current.course_aggregate))) {
        reasons.push('COURSE_ACTIVITY_ISSUE_SET_CHANGED');
      }
      if (setChanged(gapSignature(previous.course_aggregate), gapSignature(current.course_aggregate))) {
        reasons.push('COURSE_COMMON_COMPETENCY_GAP_SET_CHANGED');
      }
      if (setChanged(dominantDimensions(previous.course_aggregate), dominantDimensions(current.course_aggregate))) {
        reasons.push('COURSE_DOMINANT_DIMENSION_CHANGED');
      }
      if (insightTier(previous.course_aggregate.evaluation_coverage) !== insightTier(current.course_aggregate.evaluation_coverage)) {
        reasons.push('COURSE_INSIGHT_ELIGIBILITY_TIER_CHANGED');
      }
    }
    if (policyChanged) reasons.push('RISK_PROFILE_VERSION_CHANGED');

    const sourceChanges = studentChanges.flatMap((item) => item.source_changes);
    const origin: RiskChangeOrigin = policyChanged
      ? 'POLICY_CHANGE'
      : options.change_origin_hint ?? 'UNKNOWN';

    return {
      material: reasons.length > 0 || studentChanges.some((item) => item.material),
      reasons: sorted(reasons),
      change_origin: origin,
      source_changes: sourceChanges,
      student_changes: studentChanges,
    };
  }
}
