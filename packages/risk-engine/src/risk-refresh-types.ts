import type { CourseRiskEvidence } from '@moodle-agent-poc/contracts';
import type {
  PublishRiskSnapshotInput,
  RecordRiskRefreshFailureInput,
  RiskRefreshOrigin,
} from '@moodle-agent-poc/agent-runtime';
import type { CourseRiskAggregate } from './course-risk-types.js';
import type { StudentNormalizedRiskEvidence, StudentRiskResult } from './types.js';

export interface RiskSnapshotPayloadV01 {
  schema_version: 'risk-snapshot.v0.1';
  course_id: number;
  source_evidence: CourseRiskEvidence;
  normalized_students: StudentNormalizedRiskEvidence[];
  student_results: StudentRiskResult[];
  course_aggregate: CourseRiskAggregate;
}

export interface RiskSnapshotPersistence {
  publishSnapshot(input: PublishRiskSnapshotInput): Promise<{
    currentSnapshotId: string;
    previousSnapshotId: string | null;
  }>;
  recordRefreshFailure(input: RecordRiskRefreshFailureInput): Promise<void>;
  getCurrentSnapshot?(courseId: number): Promise<{
    snapshotId: string;
    payload: unknown;
  } | null>;
}

export interface RiskEvidenceProvider {
  getCourseRiskEvidence(courseId: number): Promise<CourseRiskEvidence>;
}

export type RiskRefreshChangeOriginHint = 'LEARNING_EVENT' | 'SOURCE_CORRECTION' | 'UNKNOWN';

export interface RiskRefreshMaterialChange {
  material: boolean;
  reasons: string[];
  change_origin: 'LEARNING_EVENT' | 'SOURCE_CORRECTION' | 'POLICY_CHANGE' | 'UNKNOWN';
  source_change_count: number;
  student_material_change_count: number;
}

export interface RiskRefreshResult {
  status: 'PUBLISHED';
  course_id: number;
  snapshot_id: string;
  previous_snapshot_id: string | null;
  data_as_of: number;
  computed_at: string;
  risk_model_version: 'risk-profile.v0.1';
  refresh_origin: RiskRefreshOrigin;
  evidence_hash: string;
  evaluation_coverage: number | null;
  material_change: RiskRefreshMaterialChange;
}

export interface CoordinatedRiskRefreshResult extends RiskRefreshResult {
  joined_existing_refresh: boolean;
}

export class RiskRefreshError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly courseId: number,
    public readonly attemptId: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'RiskRefreshError';
  }
}
