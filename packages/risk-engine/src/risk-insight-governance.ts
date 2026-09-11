import type { ModelClient } from '@moodle-agent-poc/agent-runtime';
import type { CourseRiskAggregate, CourseActionCode } from './course-risk-types.js';
import type { RiskTrendResult } from './risk-trend-engine.js';
import type { RiskSnapshotPayloadV01 } from './risk-refresh-types.js';
import type { RiskRuleHit, StudentNormalizedRiskEvidence, StudentRiskResult } from './types.js';

export type InsightPriorityBand = 'P1' | 'P2' | 'P3' | 'P4';
export type StudentActionCode =
  | 'REVIEW_ASSESSMENT'
  | 'REVIEW_COMPETENCY_EVIDENCE'
  | 'FOLLOW_UP_OVERDUE_ACTIVITY'
  | 'PROVIDE_REMEDIAL_MATERIAL'
  | 'SCHEDULE_TEACHER_CHECK_IN'
  | 'REASSESS_COMPETENCY'
  | 'MONITOR_NEXT_ASSESSMENT';
export type CourseRecommendationActionCode =
  | 'CONSIDER_REMEDIAL_SESSION'
  | 'CONSIDER_ADDITIONAL_PRACTICE'
  | 'MONITOR_COURSE_TREND';
export type InsightActionCode = StudentActionCode | CourseActionCode | CourseRecommendationActionCode;

export interface GovernedAction {
  action_code: InsightActionCode;
  priority_band: InsightPriorityBand;
  target_ref: string;
  rule_refs: string[];
  evidence_refs: string[];
}

export interface InsightFinding {
  text: string;
  risk_refs: string[];
  trend_refs: string[];
  rule_refs: string[];
  evidence_refs: string[];
}

export interface InsightActionNarrative {
  action_code: InsightActionCode;
  priority_band: InsightPriorityBand;
  target_ref: string;
  rationale: string;
}

export interface StructuredRiskInsight {
  summary: string;
  coverage_qualification: string | null;
  findings: InsightFinding[];
  actions: InsightActionNarrative[];
}

export type InsightGenerationStatus = 'VALID' | 'REPAIRED' | 'FALLBACK' | 'BLOCKED';

export interface GeneratedRiskInsight {
  status: InsightGenerationStatus;
  payload: StructuredRiskInsight;
  model_calls: number;
  blocked_reason: string | null;
  validation_errors: string[];
}

export interface StudentInsightContext {
  schema_version: 'student-insight-context.v0.1';
  course_ref: string;
  subject_ref: string;
  snapshot_id: string;
  risk_model_version: string;
  overall_risk: 'MEDIUM' | 'HIGH';
  dimensions: Record<string, { risk_level: string; metrics: Record<string, number | null> }>;
  material_rules: RiskRuleHit[];
  material_evidence: Array<{ evidence_id: string; kind: string; observed_state: string; observed_value: unknown; observed_at: number; activity_id?: number; competency_id?: number }>;
  counterevidence: Array<{ evidence_id: string; kind: string; observed_state: string; observed_value: unknown }>;
  trend: RiskTrendResult;
  eligible_actions: GovernedAction[];
}

export interface CourseInsightContext {
  schema_version: 'course-insight-context.v0.1';
  course_ref: string;
  snapshot_id: string;
  risk_model_version: string;
  eligibility: 'FULL' | 'LIMITED';
  evaluation_coverage: number;
  evaluated_students: number;
  enrolled_students: number;
  aggregate: Pick<CourseRiskAggregate, 'student_risk_distribution' | 'dimension_distributions' | 'activity_issues' | 'common_competency_gaps' | 'notable_associations'>;
  eligible_actions: GovernedAction[];
}

const BAND_ORDER: Record<InsightPriorityBand, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
const stableUnique = <T>(items: T[]): T[] => [...new Set(items)];

function materialEvidenceRefs(result: StudentRiskResult): string[] {
  return stableUnique(result.rule_hits.filter((hit) => hit.resulting_level !== 'LOW').flatMap((hit) => hit.evidence_refs));
}

export function buildStudentActions(result: StudentRiskResult, normalized: StudentNormalizedRiskEvidence): GovernedAction[] {
  const actions: GovernedAction[] = [];
  const add = (action_code: StudentActionCode, priority_band: InsightPriorityBand, target_ref: string, hits: RiskRuleHit[], evidence_refs: string[]) => {
    actions.push({ action_code, priority_band, target_ref, rule_refs: stableUnique(hits.map((h) => h.rule_id)), evidence_refs: stableUnique(evidence_refs) });
  };
  const performanceHits = result.rule_hits.filter((h) => h.dimension === 'PERFORMANCE' && h.resulting_level !== 'LOW');
  const competencyHits = result.rule_hits.filter((h) => h.dimension === 'COMPETENCY' && h.resulting_level !== 'LOW');
  const submissionHits = result.rule_hits.filter((h) => h.dimension === 'SUBMISSION' && h.resulting_level !== 'LOW');
  const overdue = normalized.submissions.filter((s) => s.state === 'OVERDUE');
  const gaps = normalized.competencies.filter((c) => c.state === 'CONFIRMED_GAP');

  if (overdue.length > 0) add('FOLLOW_UP_OVERDUE_ACTIVITY', 'P1', `student:${result.student_id}`, submissionHits, overdue.map((x) => x.evidence_id));
  if (performanceHits.length > 0 || normalized.assessments.some((a) => a.academic_status === 'PENDING_GRADE')) {
    add('REVIEW_ASSESSMENT', 'P2', `student:${result.student_id}`, performanceHits, stableUnique([...performanceHits.flatMap((h) => h.evidence_refs), ...normalized.assessments.filter((a) => a.academic_status === 'PENDING_GRADE').map((a) => a.evidence_id)]));
  }
  if (competencyHits.length > 0 || normalized.competencies.some((c) => c.state === 'COMPETENCY_CONCERN' || c.review_pending)) {
    add('REVIEW_COMPETENCY_EVIDENCE', 'P2', `student:${result.student_id}`, competencyHits, stableUnique([...competencyHits.flatMap((h) => h.evidence_refs), ...normalized.competencies.filter((c) => c.state === 'COMPETENCY_CONCERN' || c.review_pending).map((c) => c.evidence_id)]));
  }
  if (performanceHits.length > 0 || competencyHits.length > 0) add('PROVIDE_REMEDIAL_MATERIAL', 'P3', `student:${result.student_id}`, [...performanceHits, ...competencyHits], materialEvidenceRefs(result));
  if (result.overall_risk === 'HIGH') add('SCHEDULE_TEACHER_CHECK_IN', 'P3', `student:${result.student_id}`, result.rule_hits.filter((h) => h.resulting_level === 'HIGH'), materialEvidenceRefs(result));
  if (gaps.length > 0) add('REASSESS_COMPETENCY', 'P3', `student:${result.student_id}`, competencyHits, gaps.map((g) => g.evidence_id));
  add('MONITOR_NEXT_ASSESSMENT', 'P4', `student:${result.student_id}`, [], []);

  const dedup = new Map<string, GovernedAction>();
  for (const action of actions) if (!dedup.has(action.action_code)) dedup.set(action.action_code, action);
  return [...dedup.values()].sort((a, b) => BAND_ORDER[a.priority_band] - BAND_ORDER[b.priority_band] || a.action_code.localeCompare(b.action_code));
}

export function buildCourseActions(aggregate: CourseRiskAggregate): GovernedAction[] {
  const actions: GovernedAction[] = aggregate.action_candidates.map((candidate) => ({
    action_code: candidate.action_code,
    priority_band: candidate.priority_band,
    target_ref: candidate.target_ref,
    rule_refs: candidate.issue_refs,
    evidence_refs: candidate.evidence_refs,
  }));
  const add = (code: CourseRecommendationActionCode, band: InsightPriorityBand, target: string, evidence: string[]) => actions.push({ action_code: code, priority_band: band, target_ref: target, rule_refs: [], evidence_refs: stableUnique(evidence) });
  if (aggregate.activity_issues.length > 0 || aggregate.common_competency_gaps.length > 0) {
    add('CONSIDER_REMEDIAL_SESSION', 'P3', `course:${aggregate.course_id}`, [...aggregate.activity_issues.flatMap((x) => x.evidence_refs), ...aggregate.common_competency_gaps.flatMap((x) => x.evidence_refs)]);
    add('CONSIDER_ADDITIONAL_PRACTICE', 'P3', `course:${aggregate.course_id}`, aggregate.activity_issues.flatMap((x) => x.evidence_refs));
  }
  add('MONITOR_COURSE_TREND', 'P4', `course:${aggregate.course_id}`, []);
  const dedup = new Map<string, GovernedAction>();
  for (const action of actions) {
    const key = `${action.action_code}:${action.target_ref}`;
    if (!dedup.has(key)) dedup.set(key, action);
  }
  return [...dedup.values()].sort((a, b) => BAND_ORDER[a.priority_band] - BAND_ORDER[b.priority_band] || a.action_code.localeCompare(b.action_code));
}

function compactEvidence(normalized: StudentNormalizedRiskEvidence, refs: string[]) {
  const set = new Set(refs);
  return normalized.evidence.filter((e) => set.has(e.evidence_id)).map((e) => ({
    evidence_id: e.evidence_id, kind: e.kind, observed_state: e.observed_state, observed_value: e.observed_value, observed_at: e.observed_at,
    ...(e.activity_id !== undefined ? { activity_id: e.activity_id } : {}), ...(e.competency_id !== undefined ? { competency_id: e.competency_id } : {}),
  }));
}

function counterEvidence(normalized: StudentNormalizedRiskEvidence, excluded: Set<string>) {
  const positiveStates = new Set(['PASS', 'PROFICIENT', 'ON_TIME', 'COMPLETED']);
  return normalized.evidence.filter((e) => !excluded.has(e.evidence_id) && positiveStates.has(e.observed_state)).slice(0, 3).map((e) => ({ evidence_id: e.evidence_id, kind: e.kind, observed_state: e.observed_state, observed_value: e.observed_value }));
}

export function buildStudentInsightContext(payload: RiskSnapshotPayloadV01, snapshotId: string, studentId: number, trend: RiskTrendResult): StudentInsightContext | null {
  const result = payload.student_results.find((r) => r.student_id === studentId);
  const normalized = payload.normalized_students.find((s) => s.student_id === studentId);
  if (!result || !normalized || result.evaluation_status !== 'COMPLETE' || (result.overall_risk !== 'MEDIUM' && result.overall_risk !== 'HIGH')) return null;
  const materialRules = result.rule_hits.filter((h) => h.resulting_level !== 'LOW');
  const refs = stableUnique(materialRules.flatMap((h) => h.evidence_refs));
  return {
    schema_version: 'student-insight-context.v0.1', course_ref: `course:${payload.course_id}`, subject_ref: `student:${studentId}`, snapshot_id: snapshotId,
    risk_model_version: result.risk_model_version, overall_risk: result.overall_risk,
    dimensions: Object.fromEntries(Object.entries(result.dimensions).map(([k, v]) => [k, { risk_level: v.risk_level, metrics: v.metrics }])),
    material_rules: materialRules, material_evidence: compactEvidence(normalized, refs), counterevidence: counterEvidence(normalized, new Set(refs)), trend,
    eligible_actions: buildStudentActions(result, normalized),
  };
}

export function courseInsightEligibility(coverage: number | null): 'FULL' | 'LIMITED' | 'BLOCKED' {
  if (coverage !== null && coverage >= 0.8) return 'FULL';
  if (coverage !== null && coverage >= 0.5) return 'LIMITED';
  return 'BLOCKED';
}

export function buildCourseInsightContext(payload: RiskSnapshotPayloadV01, snapshotId: string): CourseInsightContext | null {
  const coverage = payload.course_aggregate.evaluation_coverage;
  const eligibility = courseInsightEligibility(coverage);
  if (eligibility === 'BLOCKED' || coverage === null) return null;
  const a = payload.course_aggregate;
  return {
    schema_version: 'course-insight-context.v0.1', course_ref: `course:${payload.course_id}`, snapshot_id: snapshotId, risk_model_version: a.risk_model_version,
    eligibility, evaluation_coverage: coverage, evaluated_students: a.evaluated_count, enrolled_students: a.enrolled_count,
    aggregate: { student_risk_distribution: a.student_risk_distribution, dimension_distributions: a.dimension_distributions, activity_issues: a.activity_issues, common_competency_gaps: a.common_competency_gaps, notable_associations: a.notable_associations },
    eligible_actions: buildCourseActions(a),
  };
}

function deterministicFallback(message: string, actions: GovernedAction[], coverageQualification: string | null): StructuredRiskInsight {
  return { summary: message, coverage_qualification: coverageQualification, findings: [], actions: actions.map((a) => ({ action_code: a.action_code, priority_band: a.priority_band, target_ref: a.target_ref, rationale: 'ข้อเสนอการดำเนินการนี้มาจากเกณฑ์เชิงกำหนดที่ระบบตรวจสอบแล้ว' })) };
}

function validateStructuredInsight(value: unknown, allowedActions: GovernedAction[], allowedRuleRefs: Set<string>, allowedEvidenceRefs: Set<string>, allowedRiskRefs: Set<string>, allowedTrendRefs: Set<string>, ruleEvidenceRefs: Map<string, Set<string>>, requireCoverage: boolean): { ok: true; value: StructuredRiskInsight } | { ok: false; recoverable: boolean; errors: string[] } {
  if (!value || typeof value !== 'object') return { ok: false, recoverable: true, errors: ['OUTPUT_NOT_OBJECT'] };
  const x = value as any;
  if (typeof x.summary !== 'string' || !Array.isArray(x.findings) || !Array.isArray(x.actions)) return { ok: false, recoverable: true, errors: ['OUTPUT_SCHEMA_INVALID'] };
  if (requireCoverage && (typeof x.coverage_qualification !== 'string' || x.coverage_qualification.trim() === '')) return { ok: false, recoverable: false, errors: ['LIMITED_COVERAGE_QUALIFICATION_REQUIRED'] };
  const allowedActionMap = new Map(allowedActions.map((a) => [`${a.action_code}|${a.target_ref}`, a]));
  const errors: string[] = [];
  for (const f of x.findings) {
    if (!f || typeof f.text !== 'string' || !Array.isArray(f.rule_refs) || !Array.isArray(f.evidence_refs) || !Array.isArray(f.risk_refs) || !Array.isArray(f.trend_refs)) { errors.push('FINDING_SCHEMA_INVALID'); continue; }
    if (f.rule_refs.length === 0 || f.evidence_refs.length === 0) errors.push('FINDING_GROUNDING_REQUIRED');
    for (const r of f.rule_refs) if (!allowedRuleRefs.has(r)) errors.push(`UNAUTHORIZED_RULE_REF:${r}`);
    for (const r of f.evidence_refs) {
      if (!allowedEvidenceRefs.has(r)) errors.push(`UNAUTHORIZED_EVIDENCE_REF:${r}`);
      const linked = f.rule_refs.some((ruleRef: string) => ruleEvidenceRefs.get(ruleRef)?.has(r));
      if (!linked) errors.push(`EVIDENCE_NOT_LINKED_TO_FINDING_RULE:${r}`);
    }
    for (const r of f.risk_refs) if (!allowedRiskRefs.has(r)) errors.push(`UNAUTHORIZED_RISK_REF:${r}`);
    for (const r of f.trend_refs) if (!allowedTrendRefs.has(r)) errors.push(`UNAUTHORIZED_TREND_REF:${r}`);
  }
  for (const a of x.actions) {
    const allowed = allowedActionMap.get(`${a?.action_code}|${a?.target_ref}`);
    if (!allowed) { errors.push(`UNAUTHORIZED_ACTION:${a?.action_code ?? 'UNKNOWN'}`); continue; }
    if (a.priority_band !== allowed.priority_band) errors.push(`PRIORITY_BAND_MISMATCH:${a.action_code}`);
    if (typeof a.rationale !== 'string') errors.push(`ACTION_RATIONALE_INVALID:${a.action_code}`);
  }
  if (errors.length > 0) return { ok: false, recoverable: false, errors };
  const orderedActions = x.actions
    .map((action: InsightActionNarrative, index: number) => ({ action, index }))
    .sort((a: { action: InsightActionNarrative; index: number }, b: { action: InsightActionNarrative; index: number }) => BAND_ORDER[a.action.priority_band] - BAND_ORDER[b.action.priority_band] || a.index - b.index)
    .map((item: { action: InsightActionNarrative; index: number }) => item.action);
  return { ok: true, value: { summary: x.summary, coverage_qualification: x.coverage_qualification ?? null, findings: x.findings, actions: orderedActions } };
}

const RISK_INSIGHT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'coverage_qualification', 'findings', 'actions'],
  properties: {
    summary: { type: 'string' },
    coverage_qualification: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text','risk_refs','trend_refs','rule_refs','evidence_refs'], properties: { text: { type: 'string' }, risk_refs: { type: 'array', items: { type: 'string' } }, trend_refs: { type: 'array', items: { type: 'string' } }, rule_refs: { type: 'array', items: { type: 'string' } }, evidence_refs: { type: 'array', items: { type: 'string' } } } } },
    actions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['action_code','priority_band','target_ref','rationale'], properties: { action_code: { type: 'string' }, priority_band: { type: 'string', enum: ['P1','P2','P3','P4'] }, target_ref: { type: 'string' }, rationale: { type: 'string' } } } }
  }
} as const;

async function modelJson(model: ModelClient, context: unknown, repairErrors?: string[]): Promise<unknown> {
  const instruction = repairErrors ? `แก้ response ก่อนหน้าให้ตรง strict JSON contract นี้ ข้อผิดพลาด: ${repairErrors.join(', ')} ข้อความสำหรับผู้ใช้ทุกช่องต้องเป็นภาษาไทย` : 'ส่งกลับเฉพาะ JSON object เท่านั้น ห้ามสร้าง risk, trend, rule, evidence, action, target หรือ priority ขึ้นเอง ใช้ได้เฉพาะค่าที่มีใน context และข้อความสำหรับผู้ใช้ต้องเป็นภาษาไทยทั้งหมด';
  const result = await model.chat({
    messages: [{ role: 'system', content: 'คุณเป็นผู้ช่วยสรุปข้อมูลความเสี่ยงสำหรับผู้สอน โดยข้อมูลเชิงกำหนดเป็นข้อมูลหลัก ข้อความที่ผู้ใช้เห็นทุกช่อง ได้แก่ summary, coverage_qualification, findings.text และ actions.rationale ต้องเขียนเป็นภาษาไทยทั้งหมด ห้ามแปลหรือเปลี่ยนค่า code/ref ที่ใช้เป็น contract.' }, { role: 'user', content: `${instruction}\nCONTEXT=${JSON.stringify(context)}` }],
    format: RISK_INSIGHT_RESPONSE_SCHEMA as unknown as Record<string, unknown>, options: { temperature: 0, maxTokens: 1200 },
  });
  return JSON.parse(result.rawText || result.message.content);
}

function ruleEvidenceMap(context: StudentInsightContext | CourseInsightContext): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (context.schema_version === 'student-insight-context.v0.1') {
    for (const rule of context.material_rules) map.set(rule.rule_id, new Set(rule.evidence_refs));
  } else {
    for (const issue of context.aggregate.activity_issues) map.set(issue.issue_id, new Set(issue.evidence_refs));
    for (const gap of context.aggregate.common_competency_gaps) map.set(gap.gap_id, new Set(gap.evidence_refs));
  }
  return map;
}

function canonicalizeInsightNarrative(value: StructuredRiskInsight, context: StudentInsightContext | CourseInsightContext): StructuredRiskInsight {
  const isStudent = context.schema_version === 'student-insight-context.v0.1';
  const summary = isStudent
    ? `ความเสี่ยงเชิงกำหนดของนักเรียนในสแนปช็อตที่เลือกอยู่ในระดับ ${context.overall_risk === 'HIGH' ? 'สูง' : 'ปานกลาง'} โดยกฎและหลักฐานด้านล่างเป็นข้อมูลหลักของการประเมิน`
    : 'ข้อมูลเชิงลึกของรายวิชานี้อ้างอิงเฉพาะหลักฐานสรุปเชิงกำหนดจากสแนปช็อตที่เลือก';
  const coverageQualification = !isStudent && context.eligibility === 'LIMITED'
    ? `ผลนี้ใช้กับนักเรียนที่สามารถประเมินได้เท่านั้น โดยมีความครอบคลุม ${Math.round(context.evaluation_coverage * 100)}%`
    : null;
  return {
    summary,
    coverage_qualification: coverageQualification,
    findings: value.findings.map((finding) => ({
      ...finding,
      text: `ข้อค้นพบนี้มีหลักฐานรองรับตามกฎที่เกี่ยวข้องจำนวน ${finding.rule_refs.length} กฎ และหลักฐาน ${finding.evidence_refs.length} รายการในสแนปช็อตที่เลือก`,
    })),
    actions: value.actions.map((action) => ({
      ...action,
      rationale: 'สิทธิ์ในการเสนอการดำเนินการและระดับความสำคัญถูกกำหนดจากกฎเชิงกำหนดของสแนปช็อตที่เลือก',
    })),
  };
}

export async function generateGovernedInsight(model: ModelClient, context: StudentInsightContext | CourseInsightContext): Promise<GeneratedRiskInsight> {
  const actions = context.eligible_actions;
  const isStudent = context.schema_version === 'student-insight-context.v0.1';
  const rules = new Set(isStudent ? context.material_rules.map((r) => r.rule_id) : context.aggregate.activity_issues.flatMap((x) => [x.issue_id]).concat(context.aggregate.common_competency_gaps.map((x) => x.gap_id)));
  const evidence = new Set(isStudent ? [...context.material_evidence, ...context.counterevidence].map((e) => e.evidence_id) : actions.flatMap((a) => a.evidence_refs));
  const riskRefs = new Set(isStudent ? ['overall', 'progress', 'performance', 'competency', 'submission'] : ['course_aggregate', 'progress', 'performance', 'competency', 'submission']);
  const trendRefs = new Set(isStudent ? ['overall', 'progress', 'performance', 'competency', 'submission'] : []);
  const linkedEvidence = ruleEvidenceMap(context);
  const requireCoverage = !isStudent && context.eligibility === 'LIMITED';
  let calls = 0;
  let repairUsed = false;
  const fallback = (errors: string[], message = 'ผลจาก AI ไม่ผ่านการตรวจสอบการอ้างอิงหรือข้อกำหนด ระบบจึงใช้ผลความเสี่ยงและข้อเสนอการดำเนินการเชิงกำหนดเป็นข้อมูลหลัก'): GeneratedRiskInsight => ({
    status: 'FALLBACK',
    payload: deterministicFallback(message, actions, requireCoverage ? `ผลนี้ใช้กับนักเรียนที่สามารถประเมินได้เท่านั้น โดยมีความครอบคลุม ${Math.round(context.evaluation_coverage * 100)}%` : null),
    model_calls: calls,
    blocked_reason: null,
    validation_errors: errors,
  });
  try {
    calls += 1;
    let raw: unknown;
    try {
      raw = await modelJson(model, context);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      repairUsed = true;
      calls += 1;
      try {
        raw = await modelJson(model, context, ['INVALID_JSON']);
      } catch {
        return fallback(['INVALID_JSON_AFTER_REPAIR'], 'ไม่สามารถสร้างข้อมูลเชิงลึกจาก AI ได้ ระบบยังคงใช้ผลความเสี่ยงและข้อเสนอการดำเนินการเชิงกำหนดเป็นข้อมูลหลัก');
      }
    }

    let validation = validateStructuredInsight(raw, actions, rules, evidence, riskRefs, trendRefs, linkedEvidence, requireCoverage);
    if (!validation.ok && validation.recoverable) {
      if (repairUsed) return fallback(validation.errors);
      repairUsed = true;
      calls += 1;
      let repaired: unknown;
      try {
        repaired = await modelJson(model, context, validation.errors);
      } catch {
        return fallback(['INVALID_OUTPUT_AFTER_REPAIR']);
      }
      validation = validateStructuredInsight(repaired, actions, rules, evidence, riskRefs, trendRefs, linkedEvidence, requireCoverage);
    }
    if (!validation.ok) return fallback(validation.errors);
    return {
      status: repairUsed ? 'REPAIRED' : 'VALID',
      payload: canonicalizeInsightNarrative(validation.value, context),
      model_calls: calls,
      blocked_reason: null,
      validation_errors: [],
    };
  } catch {
    return fallback(['MODEL_UNAVAILABLE'], 'โมเดล AI ไม่พร้อมใช้งานในขณะสร้างข้อมูลเชิงลึก ระบบยังคงแสดงผลความเสี่ยงและข้อเสนอการดำเนินการเชิงกำหนดได้ตามปกติ');
  }
}

export function deterministicLowStudentInsight(studentId: number): GeneratedRiskInsight {
  return { status: 'BLOCKED', payload: { summary: 'ไม่มีกฎความเสี่ยงเชิงกำหนดที่มีนัยสำคัญสูงกว่าระดับต่ำในสแนปช็อตที่เลือก', coverage_qualification: null, findings: [], actions: [{ action_code: 'MONITOR_NEXT_ASSESSMENT', priority_band: 'P4', target_ref: `student:${studentId}`, rationale: 'ติดตามผลตามรอบปกติตามเกณฑ์เชิงกำหนด' }] }, model_calls: 0, blocked_reason: 'LOW_STUDENT_NO_LLM', validation_errors: [] };
}

export function deterministicBlockedCourseInsight(coverage: number | null): GeneratedRiskInsight {
  const pct = coverage === null ? 'unknown' : `${Math.round(coverage * 100)}%`;
  return { status: 'BLOCKED', payload: { summary: `ระบบยังไม่สร้างข้อมูลเชิงลึกจาก AI เนื่องจากความครอบคลุมการประเมินต่ำกว่า 50% (${pct}) โดยตัวชี้วัดความเสี่ยงเชิงกำหนดของรายวิชายังคงใช้งานได้`, coverage_qualification: `ความครอบคลุม ${pct}`, findings: [], actions: [] }, model_calls: 0, blocked_reason: 'COURSE_COVERAGE_BELOW_50', validation_errors: [] };
}
