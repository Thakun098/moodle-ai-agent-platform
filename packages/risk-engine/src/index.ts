export {
  MoodleEvidenceGateway,
  MoodleEvidenceGatewayError,
  type RiskEvidenceToolCaller,
} from './moodle-evidence-gateway.js';
export { RISK_PROFILE_V01, type RiskProfileV01 } from './profile.js';
export { TREND_PROFILE_V01, type TrendProfileV01 } from './trend-profile.js';
export { RiskEvidenceNormalizer } from './risk-evidence-normalizer.js';
export { StudentRiskEvaluator } from './student-risk-evaluator.js';
export { CourseRiskAggregator } from './course-risk-aggregator.js';
export { RiskCompletenessGate, RiskCompletenessGateError } from './risk-completeness-gate.js';
export { RiskRefreshService, type RiskRefreshServiceOptions } from './risk-refresh-service.js';
export { CourseRefreshCoordinator, type CourseRefreshUseCase } from './course-refresh-coordinator.js';
export { ManualRiskRefreshAdapter, NightlyRiskRefreshAdapter } from './risk-refresh-adapters.js';
export { RiskRefreshError } from './risk-refresh-types.js';
export { RiskSnapshotComparator } from './risk-snapshot-comparator.js';
export { RiskTrendEngine, scopeRiskHistoryToSnapshot } from './risk-trend-engine.js';
export {
  buildStudentActions,
  buildCourseActions,
  buildStudentInsightContext,
  buildCourseInsightContext,
  courseInsightEligibility,
  generateGovernedInsight,
  deterministicLowStudentInsight,
  deterministicBlockedCourseInsight,
} from './risk-insight-governance.js';
export { RiskInsightService } from './risk-insight-service.js';
export type {
  CourseMaterialChange,
  RiskSnapshotComparisonOptions,
  RiskSourceChange,
  StudentMaterialChange,
} from './risk-snapshot-comparator.js';
export type {
  CanonicalDailyRiskPoint,
  RiskTrendResult,
  RiskTrendState,
  StudentRiskHistoryPoint,
} from './risk-trend-engine.js';
export type {
  CoordinatedRiskRefreshResult,
  RiskEvidenceProvider,
  RiskRefreshChangeOriginHint,
  RiskRefreshResult,
  RiskSnapshotPayloadV01,
  RiskSnapshotPersistence,
} from './risk-refresh-types.js';
export type {
  ActivityIssue,
  ActivityIssueType,
  CommonCompetencyGap,
  CountRateMetric,
  CourseActionCandidate,
  CourseActionCode,
  CourseRiskAggregate,
  CourseRiskAggregateInput,
  IssueAssociation,
  RiskDistribution,
} from './course-risk-types.js';
export type {
  GovernedAction,
  InsightActionCode,
  InsightGenerationStatus,
  GeneratedRiskInsight,
  StructuredRiskInsight,
  StudentInsightContext,
  CourseInsightContext,
} from './risk-insight-governance.js';
export type {
  RiskInsightCache,
  RiskInsightCacheRecord,
  RiskInsightSnapshotSource,
  RiskInsightResult,
} from './risk-insight-service.js';
export type {
  AcademicStatus,
  DimensionRiskResult,
  NormalizedAssessmentEvidence,
  NormalizedCompetencyEvidence,
  NormalizedCompetencyState,
  NormalizedProgressEvidence,
  NormalizedRiskEvidenceRecord,
  NormalizedSubmissionEvidence,
  NormalizedSubmissionState,
  PerformanceSignal,
  RiskDimension,
  RiskLevel,
  RiskRuleHit,
  StudentEvaluationStatus,
  StudentNormalizedRiskEvidence,
  StudentRiskResult,
} from './types.js';
