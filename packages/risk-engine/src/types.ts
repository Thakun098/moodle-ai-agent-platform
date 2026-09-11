import type { MoodleRiskSourceReference } from '@moodle-agent-poc/contracts';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type StudentEvaluationStatus = 'COMPLETE' | 'INCOMPLETE';
export type RiskDimension = 'PROGRESS' | 'PERFORMANCE' | 'COMPETENCY' | 'SUBMISSION';

export interface NormalizedRiskEvidenceRecord {
  evidence_id: string;
  student_id: number;
  kind: string;
  observed_state: string;
  observed_value: number | string | boolean | null;
  observed_at: number;
  activity_id?: number;
  competency_id?: number;
  source_ref: MoodleRiskSourceReference;
  evidence_hash: string;
}

export type AcademicStatus =
  | 'PASS'
  | 'FAIL'
  | 'PENDING_GRADE'
  | 'NOT_ATTEMPTED'
  | 'NO_PASS_CRITERION';
export type PerformanceSignal = 'FAIL' | 'LOW_SCORE' | 'NONE';

export interface NormalizedAssessmentEvidence {
  evidence_id: string;
  activity_id: number;
  activity_type: 'quiz' | 'assignment';
  observed_at: number;
  due_at: number | null;
  academic_status: AcademicStatus;
  performance_signal: PerformanceSignal;
  final_grade: number | null;
  grade_max: number | null;
  grade_to_pass: number | null;
  score_ratio: number | null;
  source_ref: MoodleRiskSourceReference;
}

export type NormalizedSubmissionState =
  | 'NOT_DUE'
  | 'ON_TIME'
  | 'SUBMITTED_LATE'
  | 'OVERDUE'
  | 'NOT_ATTEMPTED';

export interface NormalizedSubmissionEvidence {
  evidence_id: string;
  activity_id: number;
  activity_type: 'quiz' | 'assignment';
  state: NormalizedSubmissionState;
  due_at: number | null;
  submitted_at: number | null;
  recovery_not_available: boolean;
  source_ref: MoodleRiskSourceReference;
}

export type NormalizedCompetencyState =
  | 'PROFICIENT'
  | 'CONFIRMED_GAP'
  | 'NOT_RATED'
  | 'COMPETENCY_CONCERN';

export interface NormalizedCompetencyEvidence {
  evidence_id: string;
  competency_id: number;
  state: NormalizedCompetencyState;
  review_pending: boolean;
  related_activity_ids: number[];
  source_ref: MoodleRiskSourceReference;
}

export interface NormalizedProgressEvidence {
  total_applicable: number;
  expected_count: number;
  completed_count: number;
  completed_expected_count: number;
  expected_progress: number;
  actual_progress: number;
  progress_gap_pp: number;
  timeline_compliance: number | null;
  evidence_refs: string[];
}

export interface StudentNormalizedRiskEvidence {
  student_id: number;
  course_id: number;
  data_as_of: number;
  evaluation_status: StudentEvaluationStatus;
  incomplete_reasons: string[];
  progress: NormalizedProgressEvidence;
  assessments: NormalizedAssessmentEvidence[];
  competencies: NormalizedCompetencyEvidence[];
  submissions: NormalizedSubmissionEvidence[];
  evidence: NormalizedRiskEvidenceRecord[];
}

export interface RiskRuleHit {
  rule_id: string;
  dimension: RiskDimension;
  resulting_level: RiskLevel;
  evidence_refs: string[];
  message: string;
}

export interface DimensionRiskResult {
  dimension: RiskDimension;
  risk_level: RiskLevel;
  rule_hits: RiskRuleHit[];
  metrics: Record<string, number | null>;
  evidence_refs: string[];
}

export interface StudentRiskResult {
  student_id: number;
  course_id: number;
  evaluation_status: StudentEvaluationStatus;
  overall_risk: RiskLevel | null;
  dimensions: {
    progress: DimensionRiskResult;
    performance: DimensionRiskResult;
    competency: DimensionRiskResult;
    submission: DimensionRiskResult;
  };
  rule_hits: RiskRuleHit[];
  evidence: NormalizedRiskEvidenceRecord[];
  data_as_of: number;
  risk_model_version: 'risk-profile.v0.1';
  incomplete_reasons: string[];
}
