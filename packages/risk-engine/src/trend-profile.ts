import { readFileSync } from 'node:fs';

export interface TrendProfileV01 {
  trend_profile_version: 'trend-profile.v0.1';
  daily_time_offset_minutes: number;
  significant_metric_movement: {
    progress: {
      progress_gap_pp: number;
      timeline_compliance: number;
    };
    performance: {
      recent_fail_count: number;
      recent_low_score_count: number;
      persistent_fail_count: number;
      persistent_low_score_count: number;
      persistent_low_score_rate: number;
    };
    competency: {
      confirmed_gap_count: number;
      confirmed_gap_rate: number;
    };
    submission: {
      late_count: number;
      overdue_count: number;
    };
  };
}

export const TREND_PROFILE_V01 = JSON.parse(
  readFileSync(new URL('../trend-profile.v0.1.json', import.meta.url), 'utf8')
) as TrendProfileV01;
