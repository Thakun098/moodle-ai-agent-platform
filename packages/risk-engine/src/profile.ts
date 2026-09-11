import { readFileSync } from 'node:fs';

export interface RiskProfileV01 {
  risk_model_version: 'risk-profile.v0.1';
  progress: {
    medium_gap_pp: number;
    high_gap_pp: number;
    minimum_expected_activity_guard: number;
    timeline_compliance_medium_floor: number;
  };
  performance: {
    recent_window: number;
    recent_fail_medium: number;
    recent_fail_high: number;
    recent_low_score_medium: number;
    recent_low_score_high: number;
    persistent_min_evaluable: number;
    persistent_fail_high: number;
    persistent_low_score_min_count: number;
    persistent_low_score_rate_medium: number;
    low_score_ratio_threshold: number;
  };
  competency: {
    medium_confirmed_gap_count: number;
    high_confirmed_gap_count: number;
    high_confirmed_gap_rate: number;
    high_min_rated_expected: number;
  };
  submission: {
    late_medium_min: number;
    late_high_min: number;
    overdue_medium_min: number;
    overdue_high_min: number;
    combine_medium_late_and_overdue_to_high: boolean;
  };
}

export const RISK_PROFILE_V01 = JSON.parse(
  readFileSync(new URL('../risk-profile.v0.1.json', import.meta.url), 'utf8')
) as RiskProfileV01;
