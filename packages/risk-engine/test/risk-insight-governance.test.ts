import { describe, expect, it } from 'vitest';
import type { ModelChatParams, ModelChatResult, ModelClient, ModelInfo } from '@moodle-agent-poc/agent-runtime';
import {
  CourseRiskAggregator,
  RiskEvidenceNormalizer,
  RiskInsightService,
  RiskTrendEngine,
  StudentRiskEvaluator,
  buildCourseInsightContext,
  buildStudentActions,
  buildStudentInsightContext,
  courseInsightEligibility,
  generateGovernedInsight,
} from '../src/index.js';
import type { RiskSnapshotPayloadV01 } from '../src/index.js';
import { addCompetency, addQuiz, baseEvidence, STUDENT } from './course-evidence-fixture.js';

class QueueModel implements ModelClient {
  calls: ModelChatParams[] = [];
  constructor(private readonly responses: Array<string | Error>) {}
  async chat(params: ModelChatParams): Promise<ModelChatResult> {
    this.calls.push(params);
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    const text = next ?? '{}';
    return { message: { role: 'assistant', content: text }, rawText: text, toolCalls: [] };
  }
  async listModels(): Promise<ModelInfo[]> { return []; }
  async ping(): Promise<boolean> { return true; }
}

function mediumPayload(): RiskSnapshotPayloadV01 {
  const evidence = baseEvidence();
  addQuiz(evidence, { activityId: 70, grade: 40, gradeToPass: 50 });
  addCompetency(evidence, { competencyId: 9, proficiency: false, activityId: 70 });
  const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
  const result = new StudentRiskEvaluator().evaluate(normalized);
  const aggregate = new CourseRiskAggregator().aggregate({ normalized_students: [normalized], student_results: [result], course_id: 77, data_as_of: evidence.observed_at });
  return { schema_version: 'risk-snapshot.v0.1', course_id: 77, source_evidence: evidence, normalized_students: [normalized], student_results: [result], course_aggregate: aggregate };
}

function validOutput(context: ReturnType<typeof buildStudentInsightContext>): string {
  if (!context) throw new Error('context missing');
  const action = context.eligible_actions[0]!;
  const rule = context.material_rules[0]!;
  const evidence = context.material_evidence[0]!;
  return JSON.stringify({
    summary: 'Deterministic evidence indicates attention is required.',
    coverage_qualification: null,
    findings: [{ text: 'One grounded finding.', risk_refs: ['overall'], trend_refs: ['overall'], rule_refs: [rule.rule_id], evidence_refs: [evidence.evidence_id] }],
    actions: [{ action_code: action.action_code, priority_band: action.priority_band, target_ref: action.target_ref, rationale: 'Review the grounded evidence.' }],
  });
}

describe('Ticket 15 evidence-grounded AI Insight governance', () => {
  it('applies exact Course FULL/LIMITED/BLOCKED coverage boundaries', () => {
    expect(courseInsightEligibility(0.8)).toBe('FULL');
    expect(courseInsightEligibility(0.7999)).toBe('LIMITED');
    expect(courseInsightEligibility(0.5)).toBe('LIMITED');
    expect(courseInsightEligibility(0.4999)).toBe('BLOCKED');
    expect(courseInsightEligibility(null)).toBe('BLOCKED');
  });

  it('builds pseudonymous minimized Student context and deterministic action bands', () => {
    const payload = mediumPayload();
    const context = buildStudentInsightContext(payload, 'snap-1', STUDENT, new RiskTrendEngine().calculate([]));
    expect(context).not.toBeNull();
    const text = JSON.stringify(context);
    expect(text).toContain(`student:${STUDENT}`);
    expect(text).not.toContain('firstname');
    expect(text).not.toContain('lastname');
    expect(text).not.toContain('email');
    const actions = buildStudentActions(payload.student_results[0]!, payload.normalized_students[0]!);
    expect(actions.some((a) => a.action_code === 'REVIEW_ASSESSMENT' && a.priority_band === 'P2')).toBe(true);
    expect(actions.some((a) => a.action_code === 'REASSESS_COMPETENCY' && a.priority_band === 'P3')).toBe(true);
    expect(actions.some((a) => a.action_code === 'MONITOR_NEXT_ASSESSMENT' && a.priority_band === 'P4')).toBe(true);
  });

  it('accepts valid grounded output with one model call', async () => {
    const payload = mediumPayload();
    const context = buildStudentInsightContext(payload, 'snap-1', STUDENT, new RiskTrendEngine().calculate([]))!;
    const model = new QueueModel([validOutput(context)]);
    const result = await generateGovernedInsight(model, context);
    expect(result.status).toBe('VALID');
    expect(result.model_calls).toBe(1);
    expect(model.calls).toHaveLength(1);
  });

  it('preserves grounded model narrative instead of replacing it with a scripted template', async () => {
    const payload = mediumPayload();
    const context = buildStudentInsightContext(payload, 'snap-natural', STUDENT, new RiskTrendEngine().calculate([]))!;
    const action = context.eligible_actions[0]!;
    const rule = context.material_rules[0]!;
    const evidence = context.material_evidence[0]!;
    const modelSummary = 'ผลการประเมินล่าสุดชี้ว่านักเรียนมีความเสี่ยงที่ควรได้รับการติดตาม โดยหลักฐานด้านผลการเรียนและสมรรถนะสอดคล้องกันในสแนปช็อตนี้';
    const modelFinding = 'ผลการประเมินที่ไม่ผ่านเชื่อมโยงกับหลักฐานที่รองรับกฎความเสี่ยงโดยตรง';
    const model = new QueueModel([JSON.stringify({ summary: modelSummary, coverage_qualification: null, findings: [{ text: modelFinding, rule_refs: [rule.rule_id], evidence_refs: [evidence.evidence_id] }], actions: [{ action_code: 'INVENTED', priority_band: 'P1', target_ref: 'bad', rationale: 'ignore me' }] })]);
    const result = await generateGovernedInsight(model, context);
    expect(result.status).toBe('VALID');
    expect(result.payload.summary).toBe(modelSummary);
    expect(result.payload.findings[0]?.text).toBe(modelFinding);
    expect(result.payload.actions.map((item) => item.action_code)).toEqual(context.eligible_actions.map((item) => item.action_code));
    expect(result.payload.actions[0]?.priority_band).toBe(action.priority_band);
    expect(model.calls[0]?.format).toBe('json');
  });

  it('performs at most one repair for recoverable malformed JSON/schema', async () => {
    const payload = mediumPayload();
    const context = buildStudentInsightContext(payload, 'snap-1', STUDENT, new RiskTrendEngine().calculate([]))!;
    const model = new QueueModel(['not-json', validOutput(context)]);
    const result = await generateGovernedInsight(model, context);
    expect(result.status).toBe('REPAIRED');
    expect(result.model_calls).toBe(2);
    expect(model.calls).toHaveLength(2);
  });

  it('ignores invented model actions and keeps deterministic eligible actions authoritative', async () => {
    const payload = mediumPayload();
    const context = buildStudentInsightContext(payload, 'snap-1', STUDENT, new RiskTrendEngine().calculate([]))!;
    const invented = JSON.stringify({ summary: 'bad', coverage_qualification: null, findings: [], actions: [{ action_code: 'SEND_STUDENT_MESSAGE', priority_band: 'P1', target_ref: `student:${STUDENT}`, rationale: 'bad' }] });
    const model = new QueueModel([invented, validOutput(context)]);
    const result = await generateGovernedInsight(model, context);
    expect(result.status).toBe('VALID');
    expect(result.payload.actions.some((action) => action.action_code === 'SEND_STUDENT_MESSAGE')).toBe(false);
    expect(result.payload.actions.map((action) => action.action_code)).toEqual(context.eligible_actions.map((action) => action.action_code));
    expect(model.calls).toHaveLength(1);
  });

  it('ignores model priority-band mutation and preserves deterministic priority bands', async () => {
    const payload = mediumPayload();
    const context = buildStudentInsightContext(payload, 'snap-1', STUDENT, new RiskTrendEngine().calculate([]))!;
    const action = context.eligible_actions[0]!;
    const badBand = action.priority_band === 'P1' ? 'P2' : 'P1';
    const output = JSON.stringify({ summary: 'bad', coverage_qualification: null, findings: [], actions: [{ action_code: action.action_code, priority_band: badBand, target_ref: action.target_ref, rationale: 'bad' }] });
    const model = new QueueModel([output]);
    const result = await generateGovernedInsight(model, context);
    expect(result.status).toBe('VALID');
    const rendered = result.payload.actions.find((candidate) => candidate.action_code === action.action_code && candidate.target_ref === action.target_ref);
    expect(rendered?.priority_band).toBe(action.priority_band);
    expect(model.calls).toHaveLength(1);
  });

  it('requires evaluated-students coverage qualification for LIMITED Course insight', async () => {
    const payload = mediumPayload();
    payload.course_aggregate.evaluation_coverage = 0.5;
    const context = buildCourseInsightContext(payload, 'snap-course')!;
    expect(context.eligibility).toBe('LIMITED');
    const model = new QueueModel([JSON.stringify({ summary: 'Course summary', coverage_qualification: null, findings: [], actions: [] })]);
    const result = await generateGovernedInsight(model, context);
    expect(result.status).toBe('FALLBACK');
    expect(result.validation_errors).toContain('LIMITED_COVERAGE_QUALIFICATION_REQUIRED');
    expect(model.calls).toHaveLength(1);
  });

  it('LOW Student and BLOCKED Course use zero model calls through service', async () => {
    const evidence = baseEvidence();
    const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
    const result = new StudentRiskEvaluator().evaluate(normalized);
    const aggregate = new CourseRiskAggregator().aggregate({ normalized_students: [normalized], student_results: [result], course_id: 77, data_as_of: evidence.observed_at });
    aggregate.evaluation_coverage = 0.49;
    const payload: RiskSnapshotPayloadV01 = { schema_version: 'risk-snapshot.v0.1', course_id: 77, source_evidence: evidence, normalized_students: [normalized], student_results: [result], course_aggregate: aggregate };
    const model = new QueueModel([]);
    const rows: any[] = [];
    const cache = {
      async getForSnapshot() { return null; },
      async upsert(input: any) { const row = { ...input, staleReason: null }; rows.push(row); return row; },
    };
    const snapshots = { async getSnapshot() { return { snapshotId: 'low-snap', courseId: 77, riskModelVersion: 'risk-profile.v0.1', payload }; }, async listStudentHistory() { return []; } };
    const service = new RiskInsightService(model, snapshots, cache as any);
    const student = await service.getStudentInsight(77, 'low-snap', STUDENT);
    const course = await service.getCourseInsight(77, 'low-snap');
    expect(student.status).toBe('BLOCKED');
    expect(student.blocked_reason).toBe('LOW_STUDENT_NO_LLM');
    expect(course.status).toBe('BLOCKED');
    expect(course.blocked_reason).toBe('COURSE_COVERAGE_BELOW_50');
    expect(model.calls).toHaveLength(0);
  });
  it('does not offer overdue follow-up for NOT_ATTEMPTED activities without a due deadline', () => {
    const evidence = baseEvidence();
    addQuiz(evidence, { activityId: 71, grade: null, gradeToPass: 50, gradeState: 'NOT_ATTEMPTED', attempted: false });
    evidence.activities[0]!.due_at = null;
    evidence.quizzes[0]!.time_close = null;
    addCompetency(evidence, { competencyId: 9, proficiency: false, activityId: 71 });
    const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
    const result = new StudentRiskEvaluator().evaluate(normalized);
    expect(normalized.submissions[0]?.state).toBe('NOT_ATTEMPTED');
    const actions = buildStudentActions(result, normalized);
    expect(actions.some((action) => action.action_code === 'FOLLOW_UP_OVERDUE_ACTIVITY')).toBe(false);
    expect(actions.some((action) => action.action_code === 'REVIEW_COMPETENCY_EVIDENCE')).toBe(true);
  });

  it('filters stale cached action narratives against current deterministic eligibility before render', async () => {
    const evidence = baseEvidence();
    addQuiz(evidence, { activityId: 71, grade: null, gradeToPass: 50, gradeState: 'NOT_ATTEMPTED', attempted: false });
    evidence.activities[0]!.due_at = null;
    evidence.quizzes[0]!.time_close = null;
    addCompetency(evidence, { competencyId: 9, proficiency: false, activityId: 71 });
    const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
    const result = new StudentRiskEvaluator().evaluate(normalized);
    const aggregate = new CourseRiskAggregator().aggregate({ normalized_students: [normalized], student_results: [result], course_id: 77, data_as_of: evidence.observed_at });
    const payload: RiskSnapshotPayloadV01 = { schema_version: 'risk-snapshot.v0.1', course_id: 77, source_evidence: evidence, normalized_students: [normalized], student_results: [result], course_aggregate: aggregate };
    const cached = { insightId: 'cached-1', courseId: 77, studentId: STUDENT, scope: 'STUDENT' as const, snapshotId: 'snap-cache', riskModelVersion: 'risk-profile.v0.1', status: 'FALLBACK' as const, payload: { governance_policy_version: 'risk-insight-governance.v0.5', summary: 'cached', coverage_qualification: null, findings: [], actions: [{ action_code: 'FOLLOW_UP_OVERDUE_ACTIVITY', priority_band: 'P1', target_ref: `student:${STUDENT}`, rationale: 'legacy' }, { action_code: 'REVIEW_COMPETENCY_EVIDENCE', priority_band: 'P2', target_ref: `student:${STUDENT}`, rationale: 'valid' }] }, staleReason: null, generatedAt: new Date().toISOString() };
    const cache = { async getForSnapshot() { return cached; }, async upsert(input: any) { return { ...input, staleReason: null }; } };
    const snapshots = { async getSnapshot() { return { snapshotId: 'snap-cache', courseId: 77, riskModelVersion: 'risk-profile.v0.1', payload }; }, async listStudentHistory() { return []; } };
    const service = new RiskInsightService(new QueueModel([]), snapshots, cache as any);
    const insight = await service.getStudentInsight(77, 'snap-cache', STUDENT);
    expect(insight.cached).toBe(true);
    expect(insight.validation_errors).toContain('CACHED_ACTION_POLICY_FILTERED');
    expect(insight.payload.actions.some((action) => action.action_code === 'FOLLOW_UP_OVERDUE_ACTIVITY')).toBe(false);
    expect(insight.payload.actions.some((action) => action.action_code === 'REVIEW_COMPETENCY_EVIDENCE')).toBe(true);
  });

  it('force regeneration bypasses cached MEDIUM Student insight and calls the model again', async () => {
    const payload = mediumPayload();
    const context = buildStudentInsightContext(payload, 'force-snap', STUDENT, new RiskTrendEngine().calculate([]))!;
    const model = new QueueModel([validOutput(context)]);
    let upserted: any = null;
    const cached = {
      insightId: 'cached-force', courseId: 77, studentId: STUDENT, scope: 'STUDENT' as const, snapshotId: 'force-snap', riskModelVersion: 'risk-profile.v0.1', status: 'VALID' as const,
      payload: { governance_policy_version: 'risk-insight-governance.v0.5', summary: 'cached summary', coverage_qualification: null, findings: [], actions: [] },
      staleReason: null, generatedAt: new Date().toISOString(),
    };
    const cache = {
      async getForSnapshot() { return cached; },
      async upsert(input: any) { upserted = input; return { ...input, staleReason: null }; },
    };
    const snapshots = { async getSnapshot() { return { snapshotId: 'force-snap', courseId: 77, riskModelVersion: 'risk-profile.v0.1', payload }; }, async listStudentHistory() { return []; } };
    const service = new RiskInsightService(model, snapshots, cache as any);
    const normal = await service.getStudentInsight(77, 'force-snap', STUDENT);
    expect(normal.cached).toBe(true);
    expect(model.calls).toHaveLength(0);
    const forced = await service.getStudentInsight(77, 'force-snap', STUDENT, true);
    expect(forced.cached).toBe(false);
    expect(forced.model_calls).toBe(1);
    expect(model.calls).toHaveLength(1);
    expect(upserted?.snapshotId).toBe('force-snap');
  });

  it('force regeneration never bypasses LOW Student zero-LLM policy', async () => {
    const evidence = baseEvidence();
    const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
    const result = new StudentRiskEvaluator().evaluate(normalized);
    const aggregate = new CourseRiskAggregator().aggregate({ normalized_students: [normalized], student_results: [result], course_id: 77, data_as_of: evidence.observed_at });
    const payload: RiskSnapshotPayloadV01 = { schema_version: 'risk-snapshot.v0.1', course_id: 77, source_evidence: evidence, normalized_students: [normalized], student_results: [result], course_aggregate: aggregate };
    const model = new QueueModel([]);
    const cache = {
      async getForSnapshot() { return { insightId:'cached-low',courseId:77,studentId:STUDENT,scope:'STUDENT',snapshotId:'low-force',riskModelVersion:'risk-profile.v0.1',status:'VALID',payload:{governance_policy_version:'risk-insight-governance.v0.3',summary:'should not be reused',findings:[],actions:[]},staleReason:null,generatedAt:new Date().toISOString() }; },
      async upsert(input: any) { return { ...input, staleReason: null }; },
    };
    const snapshots = { async getSnapshot() { return { snapshotId: 'low-force', courseId: 77, riskModelVersion: 'risk-profile.v0.1', payload }; }, async listStudentHistory() { return []; } };
    const service = new RiskInsightService(model, snapshots, cache as any);
    const forced = await service.getStudentInsight(77, 'low-force', STUDENT, true);
    expect(forced.cached).toBe(false);
    expect(forced.status).toBe('BLOCKED');
    expect(forced.blocked_reason).toBe('LOW_STUDENT_NO_LLM');
    expect(forced.model_calls).toBe(0);
    expect(model.calls).toHaveLength(0);
  });

});
