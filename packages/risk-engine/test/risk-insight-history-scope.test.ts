import { describe, expect, it, vi } from 'vitest';
import type { ModelChatParams } from '@moodle-agent-poc/agent-runtime';
import {
  CourseRiskAggregator,
  RiskEvidenceNormalizer,
  RiskInsightService,
  StudentRiskEvaluator,
} from '../src/index.js';
import { addQuiz, baseEvidence, NOW, STUDENT } from './course-evidence-fixture.js';

function mediumPayload() {
  const evidence = baseEvidence();
  addQuiz(evidence, { activityId: 70, grade: 40, gradeToPass: 50 });
  const normalized = new RiskEvidenceNormalizer().normalizeStudent(evidence, STUDENT);
  const result = new StudentRiskEvaluator().evaluate(normalized);
  const aggregate = new CourseRiskAggregator().aggregate({
    course_id: 77,
    data_as_of: evidence.observed_at,
    normalized_students: [normalized],
    student_results: [result],
  });
  return {
    schema_version: 'risk-snapshot.v0.1' as const,
    course_id: 77,
    source_evidence: evidence,
    normalized_students: [normalized],
    student_results: [result],
    course_aggregate: aggregate,
  };
}

describe('RiskInsightService historical snapshot scoping', () => {
  it('never exposes future or cross-policy history to an uncached historical Student Insight', async () => {
    const payload = mediumPayload();
    const calls: ModelChatParams[] = [];
    const model = {
      async chat(params: ModelChatParams) {
        calls.push(params);
        const rawText = JSON.stringify({ summary: 'Review.', coverage_qualification: null, findings: [], actions: [] });
        return { rawText, message: { role: 'assistant' as const, content: rawText }, toolCalls: [] };
      },
    } as any;
    const history = [-1, 0, 1].map((offset, index) => ({
      snapshotId: offset === 0 ? 'selected' : `point-${index}`,
      dataAsOf: NOW + offset * 86400,
      createdAt: new Date((NOW + offset * 86400) * 1000).toISOString(),
      riskModelVersion: offset === 1 ? 'risk-profile.v0.2' : 'risk-profile.v0.1',
      evaluationStatus: 'COMPLETE' as const,
      overallRisk: offset === 1 ? 'LOW' as const : offset === 0 ? 'MEDIUM' as const : 'HIGH' as const,
      progressRisk: 'LOW' as const,
      performanceRisk: offset === 0 ? 'MEDIUM' as const : 'LOW' as const,
      competencyRisk: 'LOW' as const,
      submissionRisk: 'LOW' as const,
      dimensionMetrics: {},
    }));
    const snapshots = {
      async getSnapshot() {
        return { snapshotId: 'selected', courseId: 77, riskModelVersion: 'risk-profile.v0.1', payload };
      },
      async listStudentHistory() { return history; },
    };
    const cache = {
      async getForSnapshot() { return null; },
      async upsert(input: any) { return { ...input, staleReason: null }; },
    };
    const service = new RiskInsightService(model, snapshots, cache as any);
    const result = await service.getStudentInsight(77, 'selected', STUDENT);
    expect(result.status).toBe('VALID');
    expect(calls).toHaveLength(1);
    const userMessage = String(calls[0]!.messages[1]!.content);
    const context = JSON.parse(userMessage.slice(userMessage.indexOf('CONTEXT=') + 'CONTEXT='.length));
    expect(context.trend.risk_model_version).toBe('risk-profile.v0.1');
    expect(context.trend.canonical_points.every((point: any) => point.dataAsOf <= NOW)).toBe(true);
  });
});
