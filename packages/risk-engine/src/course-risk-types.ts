import type { RiskLevel, StudentNormalizedRiskEvidence, StudentRiskResult } from './types.js';

export type ActivityIssueType =
  | 'SUBMISSION_PROBLEM'
  | 'LATE_PATTERN'
  | 'PERFORMANCE_PROBLEM'
  | 'PERFORMANCE_CONCERN';

export interface CountRateMetric {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface ActivityIssue {
  issue_id: string;
  activity_id: number;
  issue_type: ActivityIssueType;
  affected: CountRateMetric;
  expected_students: number;
  evaluable_count: number | null;
  performance_coverage: number | null;
  affected_student_refs: string[];
  evidence_refs: string[];
}

export interface CommonCompetencyGap {
  gap_id: string;
  competency_id: number;
  confirmed_gap: CountRateMetric;
  expected_students: number;
  rated_expected_count: number;
  rating_coverage: number | null;
  affected_student_refs: string[];
  evidence_refs: string[];
}

export interface IssueAssociation {
  association_id: string;
  association_type: 'NOTABLE_ASSOCIATION';
  activity_id: number;
  competency_id: number;
  activity_issue_id: string;
  competency_gap_id: string;
  overlap_count: number;
  activity_side_denominator: number;
  activity_side_overlap_rate: number | null;
  competency_side_denominator: number;
  competency_side_overlap_rate: number | null;
  affected_student_refs: string[];
  evidence_refs: string[];
}

export type CourseActionCode =
  | 'REVIEW_PROBLEMATIC_ACTIVITY'
  | 'REVIEW_AT_RISK_STUDENTS'
  | 'REVIEW_COMMON_COMPETENCY_GAP'
  | 'REVIEW_SUBMISSION_PATTERN';

export interface CourseActionCandidate {
  candidate_id: string;
  action_code: CourseActionCode;
  priority_band: 'P1' | 'P2' | 'P3' | 'P4';
  target_type: 'activity' | 'competency' | 'course';
  target_ref: string;
  issue_refs: string[];
  evidence_refs: string[];
  affected_student_refs: string[];
}

export interface RiskDistribution {
  denominator: number;
  LOW: number;
  MEDIUM: number;
  HIGH: number;
}

export interface CourseRiskAggregate {
  course_id: number;
  data_as_of: number;
  risk_model_version: 'risk-profile.v0.1';
  enrolled_count: number;
  evaluated_count: number;
  incomplete_count: number;
  evaluation_coverage: number | null;
  student_risk_distribution: RiskDistribution;
  dimension_distributions: {
    progress: RiskDistribution;
    performance: RiskDistribution;
    competency: RiskDistribution;
    submission: RiskDistribution;
  };
  activity_issues: ActivityIssue[];
  common_competency_gaps: CommonCompetencyGap[];
  notable_associations: IssueAssociation[];
  action_candidates: CourseActionCandidate[];
}

export interface CourseRiskAggregateInput {
  normalized_students: StudentNormalizedRiskEvidence[];
  student_results: StudentRiskResult[];
  /** Required only when aggregating a valid Course with zero enrolments. */
  course_id?: number;
  /** Required only when aggregating a valid Course with zero enrolments. */
  data_as_of?: number;
}

export function studentRef(studentId: number): string {
  return `student:${studentId}`;
}

export function emptyDistribution(): RiskDistribution {
  return { denominator: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };
}

export function incrementDistribution(distribution: RiskDistribution, level: RiskLevel): void {
  distribution[level] += 1;
  distribution.denominator += 1;
}
