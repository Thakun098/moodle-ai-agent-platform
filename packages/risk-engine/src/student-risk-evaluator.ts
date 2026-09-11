import { RISK_PROFILE_V01, type RiskProfileV01 } from './profile.js';
import type {
  DimensionRiskResult,
  RiskDimension,
  RiskLevel,
  RiskRuleHit,
  StudentNormalizedRiskEvidence,
  StudentRiskResult,
} from './types.js';

const LEVEL_RANK: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function maxLevel(...levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((current, next) =>
    LEVEL_RANK[next] > LEVEL_RANK[current] ? next : current
  , 'LOW');
}

function hit(
  ruleId: string,
  dimension: RiskDimension,
  level: RiskLevel,
  refs: string[],
  message: string
): RiskRuleHit {
  return { rule_id: ruleId, dimension, resulting_level: level, evidence_refs: [...new Set(refs)], message };
}

export class StudentRiskEvaluator {
  constructor(private readonly profile: RiskProfileV01 = RISK_PROFILE_V01) {}

  evaluate(normalized: StudentNormalizedRiskEvidence): StudentRiskResult {
    const progress = this.evaluateProgress(normalized);
    const performance = this.evaluatePerformance(normalized);
    const competency = this.evaluateCompetency(normalized);
    const submission = this.evaluateSubmission(normalized);
    const ruleHits = [
      ...progress.rule_hits,
      ...performance.rule_hits,
      ...competency.rule_hits,
      ...submission.rule_hits,
    ];
    const overall = normalized.evaluation_status === 'COMPLETE'
      ? maxLevel(progress.risk_level, performance.risk_level, competency.risk_level, submission.risk_level)
      : null;

    return {
      student_id: normalized.student_id,
      course_id: normalized.course_id,
      evaluation_status: normalized.evaluation_status,
      overall_risk: overall,
      dimensions: { progress, performance, competency, submission },
      rule_hits: ruleHits,
      evidence: normalized.evidence,
      data_as_of: normalized.data_as_of,
      risk_model_version: this.profile.risk_model_version,
      incomplete_reasons: normalized.incomplete_reasons,
    };
  }

  private evaluateProgress(normalized: StudentNormalizedRiskEvidence): DimensionRiskResult {
    const p = normalized.progress;
    const refs = p.evidence_refs;
    let level: RiskLevel = 'LOW';
    const hits: RiskRuleHit[] = [];

    if (p.progress_gap_pp >= this.profile.progress.high_gap_pp) {
      level = 'HIGH';
      hits.push(hit('PROGRESS_GAP_HIGH', 'PROGRESS', 'HIGH', refs,
        `Progress gap ${p.progress_gap_pp.toFixed(1)}pp is at least ${this.profile.progress.high_gap_pp}pp.`));
    } else if (p.progress_gap_pp >= this.profile.progress.medium_gap_pp) {
      level = 'MEDIUM';
      hits.push(hit('PROGRESS_GAP_MEDIUM', 'PROGRESS', 'MEDIUM', refs,
        `Progress gap ${p.progress_gap_pp.toFixed(1)}pp is at least ${this.profile.progress.medium_gap_pp}pp.`));
    }

    if (
      p.expected_count >= this.profile.progress.minimum_expected_activity_guard &&
      p.completed_expected_count === 0
    ) {
      level = 'HIGH';
      hits.push(hit('PROGRESS_NONE_COMPLETED_GUARD', 'PROGRESS', 'HIGH', refs,
        `${p.expected_count} activities are expected and none of the due/expected activities are complete.`));
    }

    if (
      p.expected_count >= this.profile.progress.minimum_expected_activity_guard &&
      p.timeline_compliance !== null &&
      p.timeline_compliance < this.profile.progress.timeline_compliance_medium_floor
    ) {
      level = maxLevel(level, 'MEDIUM');
      hits.push(hit('PROGRESS_TIMELINE_COMPLIANCE_LOW', 'PROGRESS', 'MEDIUM', refs,
        `Timeline compliance ${(p.timeline_compliance * 100).toFixed(1)}% is below ${this.profile.progress.timeline_compliance_medium_floor * 100}%.`));
    }

    if (hits.length === 0) {
      hits.push(hit('PROGRESS_WITHIN_POLICY', 'PROGRESS', 'LOW', refs,
        'Progress evidence is within the configured LOW thresholds.'));
    }

    return {
      dimension: 'PROGRESS',
      risk_level: level,
      rule_hits: hits,
      metrics: {
        total_applicable: p.total_applicable,
        expected_count: p.expected_count,
        completed_count: p.completed_count,
        completed_expected_count: p.completed_expected_count,
        expected_progress: p.expected_progress,
        actual_progress: p.actual_progress,
        progress_gap_pp: p.progress_gap_pp,
        timeline_compliance: p.timeline_compliance,
      },
      evidence_refs: refs,
    };
  }

  private evaluatePerformance(normalized: StudentNormalizedRiskEvidence): DimensionRiskResult {
    const evaluable = normalized.assessments
      .filter((item) => item.final_grade !== null && item.academic_status !== 'PENDING_GRADE')
      .sort((a, b) => b.observed_at - a.observed_at || b.activity_id - a.activity_id);
    const recent = evaluable.slice(0, this.profile.performance.recent_window);
    const recentFail = recent.filter((item) => item.performance_signal === 'FAIL');
    const recentLow = recent.filter((item) => item.performance_signal === 'LOW_SCORE');
    const allFail = evaluable.filter((item) => item.performance_signal === 'FAIL');
    const allLow = evaluable.filter((item) => item.performance_signal === 'LOW_SCORE');
    const refs = evaluable.map((item) => item.evidence_id);
    const hits: RiskRuleHit[] = [];
    let level: RiskLevel = 'LOW';

    if (recentFail.length >= this.profile.performance.recent_fail_high) {
      level = 'HIGH';
      hits.push(hit('PERFORMANCE_RECENT_FAIL_HIGH', 'PERFORMANCE', 'HIGH', recentFail.map((x) => x.evidence_id),
        `${recentFail.length} academic FAIL results occur in the recent ${this.profile.performance.recent_window} evaluable assessments.`));
    } else if (recentFail.length >= this.profile.performance.recent_fail_medium) {
      level = 'MEDIUM';
      hits.push(hit('PERFORMANCE_RECENT_FAIL_MEDIUM', 'PERFORMANCE', 'MEDIUM', recentFail.map((x) => x.evidence_id),
        'At least one recent evaluable assessment is an academic FAIL according to Moodle grade-to-pass.'));
    }

    if (recentLow.length >= this.profile.performance.recent_low_score_high) {
      level = maxLevel(level, 'HIGH');
      hits.push(hit('PERFORMANCE_RECENT_LOW_SCORE_HIGH', 'PERFORMANCE', 'HIGH', recentLow.map((x) => x.evidence_id),
        `${recentLow.length} LOW_SCORE signals occur in the recent evaluable window.`));
    } else if (recentLow.length >= this.profile.performance.recent_low_score_medium) {
      level = maxLevel(level, 'MEDIUM');
      hits.push(hit('PERFORMANCE_RECENT_LOW_SCORE_MEDIUM', 'PERFORMANCE', 'MEDIUM', recentLow.map((x) => x.evidence_id),
        `${recentLow.length} LOW_SCORE signals occur in the recent evaluable window.`));
    }

    if (
      evaluable.length >= this.profile.performance.persistent_min_evaluable &&
      allFail.length >= this.profile.performance.persistent_fail_high
    ) {
      level = 'HIGH';
      hits.push(hit('PERFORMANCE_PERSISTENT_FAIL_HIGH', 'PERFORMANCE', 'HIGH', allFail.map((x) => x.evidence_id),
        `${allFail.length} academic FAIL results persist across ${evaluable.length} evaluable assessments.`));
    }

    const lowRate = evaluable.length > 0 ? allLow.length / evaluable.length : 0;
    if (
      evaluable.length >= this.profile.performance.persistent_min_evaluable &&
      allLow.length >= this.profile.performance.persistent_low_score_min_count &&
      lowRate >= this.profile.performance.persistent_low_score_rate_medium
    ) {
      level = maxLevel(level, 'MEDIUM');
      hits.push(hit('PERFORMANCE_PERSISTENT_LOW_SCORE_MEDIUM', 'PERFORMANCE', 'MEDIUM', allLow.map((x) => x.evidence_id),
        `LOW_SCORE persists at ${(lowRate * 100).toFixed(1)}% across ${evaluable.length} evaluable assessments.`));
    }

    if (hits.length === 0) {
      hits.push(hit('PERFORMANCE_WITHIN_POLICY', 'PERFORMANCE', 'LOW', refs,
        'No Performance rule reaches MEDIUM or HIGH. PENDING_GRADE and NOT_ATTEMPTED are excluded from academic FAIL counts.'));
    }

    return {
      dimension: 'PERFORMANCE',
      risk_level: level,
      rule_hits: hits,
      metrics: {
        evaluable_count: evaluable.length,
        recent_fail_count: recentFail.length,
        recent_low_score_count: recentLow.length,
        persistent_fail_count: allFail.length,
        persistent_low_score_count: allLow.length,
        persistent_low_score_rate: evaluable.length > 0 ? lowRate : null,
      },
      evidence_refs: refs,
    };
  }

  private evaluateCompetency(normalized: StudentNormalizedRiskEvidence): DimensionRiskResult {
    const confirmed = normalized.competencies.filter((item) => item.state === 'CONFIRMED_GAP');
    const rated = normalized.competencies.filter(
      (item) => item.state === 'CONFIRMED_GAP' || item.state === 'PROFICIENT'
    );
    const concerns = normalized.competencies.filter((item) => item.state === 'COMPETENCY_CONCERN');
    const reviewPending = normalized.competencies.filter((item) => item.review_pending);
    const gapRate = rated.length > 0 ? confirmed.length / rated.length : 0;
    const refs = normalized.competencies.map((item) => item.evidence_id);
    const hits: RiskRuleHit[] = [];
    let level: RiskLevel = 'LOW';

    if (
      confirmed.length >= this.profile.competency.high_confirmed_gap_count &&
      rated.length >= this.profile.competency.high_min_rated_expected &&
      gapRate >= this.profile.competency.high_confirmed_gap_rate
    ) {
      level = 'HIGH';
      hits.push(hit('COMPETENCY_CONFIRMED_GAP_HIGH', 'COMPETENCY', 'HIGH', confirmed.map((x) => x.evidence_id),
        `${confirmed.length} confirmed gaps represent ${(gapRate * 100).toFixed(1)}% of ${rated.length} rated expected competencies.`));
    } else if (confirmed.length >= this.profile.competency.medium_confirmed_gap_count) {
      level = 'MEDIUM';
      hits.push(hit('COMPETENCY_CONFIRMED_GAP_MEDIUM', 'COMPETENCY', 'MEDIUM', confirmed.map((x) => x.evidence_id),
        'At least one Moodle competency rating is explicitly not proficient.'));
    }

    if (hits.length === 0) {
      hits.push(hit('COMPETENCY_NO_CONFIRMED_GAP', 'COMPETENCY', 'LOW', refs,
        'No confirmed Moodle competency gap is present. NOT_RATED, concerns, and review-pending workflow do not raise Student Risk.'));
    }

    return {
      dimension: 'COMPETENCY',
      risk_level: level,
      rule_hits: hits,
      metrics: {
        expected_count: normalized.competencies.length,
        rated_expected_count: rated.length,
        confirmed_gap_count: confirmed.length,
        confirmed_gap_rate: rated.length > 0 ? gapRate : null,
        concern_count: concerns.length,
        review_pending_count: reviewPending.length,
      },
      evidence_refs: refs,
    };
  }

  private evaluateSubmission(normalized: StudentNormalizedRiskEvidence): DimensionRiskResult {
    const late = normalized.submissions.filter((item) => item.state === 'SUBMITTED_LATE');
    const overdue = normalized.submissions.filter((item) => item.state === 'OVERDUE');
    const refs = normalized.submissions.map((item) => item.evidence_id);
    const hits: RiskRuleHit[] = [];

    let lateLevel: RiskLevel = 'LOW';
    if (late.length >= this.profile.submission.late_high_min) lateLevel = 'HIGH';
    else if (late.length >= this.profile.submission.late_medium_min) lateLevel = 'MEDIUM';

    let overdueLevel: RiskLevel = 'LOW';
    if (overdue.length >= this.profile.submission.overdue_high_min) overdueLevel = 'HIGH';
    else if (overdue.length >= this.profile.submission.overdue_medium_min) overdueLevel = 'MEDIUM';

    let level = maxLevel(lateLevel, overdueLevel);
    if (lateLevel !== 'LOW') {
      hits.push(hit(`SUBMISSION_LATE_${lateLevel}`, 'SUBMISSION', lateLevel, late.map((x) => x.evidence_id),
        `${late.length} activities were submitted late.`));
    }
    if (overdueLevel !== 'LOW') {
      hits.push(hit(`SUBMISSION_OVERDUE_${overdueLevel}`, 'SUBMISSION', overdueLevel, overdue.map((x) => x.evidence_id),
        `${overdue.length} activities are actively overdue/not attempted after due time.`));
    }
    if (
      this.profile.submission.combine_medium_late_and_overdue_to_high &&
      lateLevel === 'MEDIUM' && overdueLevel === 'MEDIUM'
    ) {
      level = 'HIGH';
      hits.push(hit('SUBMISSION_MEDIUM_COMBINATION_HIGH', 'SUBMISSION', 'HIGH', [
        ...late.map((x) => x.evidence_id),
        ...overdue.map((x) => x.evidence_id),
      ], 'MEDIUM Late and MEDIUM Overdue signals combine explicitly to HIGH.'));
    }
    if (hits.length === 0) {
      hits.push(hit('SUBMISSION_WITHIN_POLICY', 'SUBMISSION', 'LOW', refs,
        'Late and active overdue counts remain within LOW thresholds.'));
    }

    return {
      dimension: 'SUBMISSION',
      risk_level: level,
      rule_hits: hits,
      metrics: {
        late_count: late.length,
        overdue_count: overdue.length,
        recovery_not_available_count: normalized.submissions.filter((x) => x.recovery_not_available).length,
      },
      evidence_refs: refs,
    };
  }
}
