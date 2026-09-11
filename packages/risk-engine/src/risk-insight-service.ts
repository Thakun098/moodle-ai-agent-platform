import { createHash } from 'node:crypto';
import type { ModelClient } from '@moodle-agent-poc/agent-runtime';
import { RiskTrendEngine, scopeRiskHistoryToSnapshot, type StudentRiskHistoryPoint } from './risk-trend-engine.js';
import type { RiskSnapshotPayloadV01 } from './risk-refresh-types.js';
import {
  buildCourseActions,
  buildCourseInsightContext,
  buildStudentActions,
  buildStudentInsightContext,
  courseInsightEligibility,
  deterministicBlockedCourseInsight,
  deterministicLowStudentInsight,
  generateGovernedInsight,
  type GeneratedRiskInsight,
  type GovernedAction,
} from './risk-insight-governance.js';

export interface RiskInsightCacheRecord {
  insightId: string;
  courseId: number;
  studentId: number | null;
  scope: 'COURSE' | 'STUDENT';
  snapshotId: string;
  riskModelVersion: string;
  status: 'VALID' | 'STALE' | 'REPAIRED' | 'FALLBACK' | 'BLOCKED';
  payload: Record<string, unknown>;
  staleReason: string | null;
  generatedAt: string;
}

export interface RiskInsightCache {
  getForSnapshot(courseId: number, scope: 'COURSE' | 'STUDENT', snapshotId: string, studentId?: number | null): Promise<RiskInsightCacheRecord | null>;
  upsert(input: {
    insightId: string; courseId: number; studentId?: number | null; scope: 'COURSE' | 'STUDENT'; snapshotId: string;
    riskModelVersion: string; status: 'VALID' | 'REPAIRED' | 'FALLBACK' | 'BLOCKED'; payload: Record<string, unknown>;
    staleReason?: string | null; generatedAt: string;
  }): Promise<RiskInsightCacheRecord>;
}

export interface RiskInsightSnapshotSource {
  getSnapshot(snapshotId: string): Promise<{ snapshotId: string; courseId: number; riskModelVersion: string; payload: unknown } | null>;
  listStudentHistory(courseId: number, studentId: number): Promise<StudentRiskHistoryPoint[]>;
}

export interface RiskInsightResult {
  status: GeneratedRiskInsight['status'] | 'STALE';
  payload: GeneratedRiskInsight['payload'];
  model_calls: number;
  blocked_reason: string | null;
  validation_errors: string[];
  insight_id: string;
  course_id: number;
  student_id: number | null;
  scope: 'COURSE' | 'STUDENT';
  snapshot_id: string;
  risk_model_version: string;
  cached: boolean;
  stale_reason: string | null;
}

function isPayload(value: unknown): value is RiskSnapshotPayloadV01 {
  const x = value as any;
  return !!x && x.schema_version === 'risk-snapshot.v0.1' && typeof x.course_id === 'number' && Array.isArray(x.student_results);
}

export const RISK_INSIGHT_GOVERNANCE_POLICY_VERSION = 'risk-insight-governance.v0.3';

function stableInsightId(scope: 'COURSE' | 'STUDENT', courseId: number, snapshotId: string, studentId?: number | null): string {
  return createHash('sha256').update(`${scope}|${courseId}|${snapshotId}|${studentId ?? 'course'}`).digest('hex').slice(0, 48);
}

export class RiskInsightService {
  constructor(
    private readonly model: ModelClient,
    private readonly snapshots: RiskInsightSnapshotSource,
    private readonly cache: RiskInsightCache,
    private readonly now: () => Date = () => new Date()
  ) {}

  private fromCache(row: RiskInsightCacheRecord, allowedActions?: GovernedAction[]): RiskInsightResult {
    const currentPolicy = (row.payload as any).governance_policy_version === RISK_INSIGHT_GOVERNANCE_POLICY_VERSION;
    const bandOrder: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
    const allowed = new Set((allowedActions ?? []).map((action) => `${action.action_code}|${action.priority_band}|${action.target_ref}`));
    if (!currentPolicy) {
      const deterministicActions = [...(allowedActions ?? [])]
        .sort((a, b) => (bandOrder[a.priority_band] ?? 99) - (bandOrder[b.priority_band] ?? 99) || a.action_code.localeCompare(b.action_code))
        .map((action) => ({
          action_code: action.action_code,
          priority_band: action.priority_band,
          target_ref: action.target_ref,
          rationale: 'สิทธิ์ในการเสนอการดำเนินการและระดับความสำคัญถูกกำหนดจากกฎเชิงกำหนดของสแนปช็อตที่เลือก',
        }));
      return {
        insight_id: row.insightId, course_id: row.courseId, student_id: row.studentId, scope: row.scope, snapshot_id: row.snapshotId, risk_model_version: row.riskModelVersion,
        status: row.status === 'STALE' ? 'STALE' : 'FALLBACK',
        payload: { summary: 'ข้อมูลเชิงลึกจาก AI ในแคชถูกสร้างด้วยนโยบายรุ่นเก่า จึงไม่นำข้อความเดิมมาแสดง ระบบใช้ผลความเสี่ยงและข้อเสนอการดำเนินการเชิงกำหนดเป็นข้อมูลหลัก', coverage_qualification: null, findings: [], actions: deterministicActions },
        model_calls: 0, blocked_reason: null, validation_errors: ['CACHED_GOVERNANCE_POLICY_OBSOLETE'], cached: true, stale_reason: row.staleReason,
      };
    }
    const payload = { ...(row.payload as Record<string, unknown>) } as Record<string, unknown> & { actions?: unknown[] };
    let filtered = false;
    if (Array.isArray(payload.actions)) {
      const before = payload.actions.length;
      payload.actions = payload.actions
        .filter((candidate: any) => !allowedActions || allowed.has(`${candidate?.action_code}|${candidate?.priority_band}|${candidate?.target_ref}`))
        .map((action: any, index: number) => ({ action, index }))
        .sort((a: any, b: any) => (bandOrder[a.action?.priority_band] ?? 99) - (bandOrder[b.action?.priority_band] ?? 99) || a.index - b.index)
        .map((item: any) => item.action);
      filtered = payload.actions.length !== before;
    }
    return {
      insight_id: row.insightId, course_id: row.courseId, student_id: row.studentId, scope: row.scope, snapshot_id: row.snapshotId, risk_model_version: row.riskModelVersion, status: row.status,
      payload: payload as any, model_calls: 0, blocked_reason: (payload as any).blocked_reason ?? null, validation_errors: filtered ? ['CACHED_ACTION_POLICY_FILTERED'] : [], cached: true, stale_reason: row.staleReason,
    };
  }

  private async persist(scope: 'COURSE' | 'STUDENT', courseId: number, snapshotId: string, riskModelVersion: string, result: GeneratedRiskInsight, studentId?: number | null): Promise<RiskInsightResult> {
    const insightId = stableInsightId(scope, courseId, snapshotId, studentId);
    const generatedAt = this.now().toISOString();
    const payload = { ...result.payload, governance_policy_version: RISK_INSIGHT_GOVERNANCE_POLICY_VERSION, blocked_reason: result.blocked_reason, validation_errors: result.validation_errors } as unknown as Record<string, unknown>;
    const row = await this.cache.upsert({ insightId, courseId, studentId: studentId ?? null, scope, snapshotId, riskModelVersion, status: result.status, payload, generatedAt });
    return { ...result, insight_id: row.insightId, course_id: courseId, student_id: studentId ?? null, scope, snapshot_id: snapshotId, risk_model_version: riskModelVersion, cached: false, stale_reason: null };
  }

  async getStudentInsight(courseId: number, snapshotId: string, studentId: number, forceGenerate = false): Promise<RiskInsightResult> {
    const cached = forceGenerate ? null : await this.cache.getForSnapshot(courseId, 'STUDENT', snapshotId, studentId);
    const snapshot = await this.snapshots.getSnapshot(snapshotId);
    if (!snapshot || snapshot.courseId !== courseId || !isPayload(snapshot.payload)) throw new Error('RISK_SNAPSHOT_NOT_FOUND');
    const result = snapshot.payload.student_results.find((r) => r.student_id === studentId);
    if (!result) throw new Error('STUDENT_NOT_IN_SNAPSHOT');
    const normalized = snapshot.payload.normalized_students.find((s) => s.student_id === studentId);
    if (!normalized) throw new Error('STUDENT_NORMALIZED_EVIDENCE_NOT_FOUND');
    if (cached) {
      const allowedActions = result.evaluation_status === 'COMPLETE' && (result.overall_risk === 'MEDIUM' || result.overall_risk === 'HIGH')
        ? buildStudentActions(result, normalized)
        : [];
      return this.fromCache(cached, allowedActions);
    }
    if (result.evaluation_status !== 'COMPLETE') {
      return this.persist('STUDENT', courseId, snapshotId, snapshot.riskModelVersion, { ...deterministicLowStudentInsight(studentId), blocked_reason: 'STUDENT_EVALUATION_INCOMPLETE', payload: { summary: 'ระบบยังไม่สร้างข้อมูลเชิงลึกจาก AI เนื่องจากข้อมูลสำหรับประเมินความเสี่ยงเชิงกำหนดของนักเรียนยังไม่สมบูรณ์', coverage_qualification: null, findings: [], actions: [] } }, studentId);
    }
    if (result.overall_risk === 'LOW') return this.persist('STUDENT', courseId, snapshotId, snapshot.riskModelVersion, deterministicLowStudentInsight(studentId), studentId);
    const history = await this.snapshots.listStudentHistory(courseId, studentId);
    const scopedHistory = scopeRiskHistoryToSnapshot(history, snapshotId, snapshot.riskModelVersion, snapshot.payload.source_evidence.observed_at);
    const trend = new RiskTrendEngine().calculate(scopedHistory);
    const context = buildStudentInsightContext(snapshot.payload, snapshotId, studentId, trend);
    if (!context) return this.persist('STUDENT', courseId, snapshotId, snapshot.riskModelVersion, deterministicLowStudentInsight(studentId), studentId);
    return this.persist('STUDENT', courseId, snapshotId, snapshot.riskModelVersion, await generateGovernedInsight(this.model, context), studentId);
  }

  async getCourseInsight(courseId: number, snapshotId: string, forceGenerate = false): Promise<RiskInsightResult> {
    const cached = forceGenerate ? null : await this.cache.getForSnapshot(courseId, 'COURSE', snapshotId, null);
    const snapshot = await this.snapshots.getSnapshot(snapshotId);
    if (!snapshot || snapshot.courseId !== courseId || !isPayload(snapshot.payload)) throw new Error('RISK_SNAPSHOT_NOT_FOUND');
    if (cached) return this.fromCache(cached, buildCourseActions(snapshot.payload.course_aggregate));
    const coverage = snapshot.payload.course_aggregate.evaluation_coverage;
    if (courseInsightEligibility(coverage) === 'BLOCKED') return this.persist('COURSE', courseId, snapshotId, snapshot.riskModelVersion, deterministicBlockedCourseInsight(coverage));
    const context = buildCourseInsightContext(snapshot.payload, snapshotId);
    if (!context) return this.persist('COURSE', courseId, snapshotId, snapshot.riskModelVersion, deterministicBlockedCourseInsight(coverage));
    return this.persist('COURSE', courseId, snapshotId, snapshot.riskModelVersion, await generateGovernedInsight(this.model, context));
  }
}
