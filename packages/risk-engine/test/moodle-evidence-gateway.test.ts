import { describe, expect, it } from 'vitest';
import {
  MoodleEvidenceGateway,
  MoodleEvidenceGatewayError,
  type RiskEvidenceToolCaller,
} from '../src/index.js';

function evidence() {
  return {
    schema_version: '0.1' as const,
    observed_at: 1_789_000_000,
    course: {
      course_id: 7,
      fullname: 'Risk Fixture',
      shortname: 'RISK-7',
      format: 'topics',
      start_at: null,
      end_at: null,
    },
    dataset_status: [
      'enrolments', 'timeline', 'completion', 'quizzes', 'assignments', 'competencies',
    ].map((dataset) => ({ dataset, status: 'OK', observed_at: 1_789_000_000 })),
    enrolments: [],
    activities: [],
    completion: [],
    quizzes: [],
    assignments: [],
    competencies: { course_competencies: [], activity_links: [], ratings: [] },
  };
}

describe('MoodleEvidenceGateway', () => {
  it('uses exactly the consolidated factual MCP tool and returns validated evidence', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const caller: RiskEvidenceToolCaller = {
      async callTool(name, args) {
        calls.push({ name, args });
        return { status: 'success', data: evidence() };
      },
    };
    const result = await new MoodleEvidenceGateway(caller).getCourseRiskEvidence(7);
    expect(result.course.course_id).toBe(7);
    expect(calls).toEqual([{ name: 'moodle_get_course_risk_evidence', args: { course_id: 7 } }]);
  });

  it('rejects malformed evidence rather than letting Risk rules consume it', async () => {
    const caller: RiskEvidenceToolCaller = {
      async callTool() {
        return { status: 'success', data: { schema_version: '0.1', risk_level: 'HIGH' } };
      },
    };
    await expect(new MoodleEvidenceGateway(caller).getCourseRiskEvidence(7)).rejects.toMatchObject({
      code: 'INVALID_COURSE_RISK_EVIDENCE',
    } satisfies Partial<MoodleEvidenceGatewayError>);
  });

  it('propagates typed MCP source failures without substituting empty evidence', async () => {
    const caller: RiskEvidenceToolCaller = {
      async callTool() {
        return { status: 'error', code: 'NETWORK_ERROR', message: 'Moodle unavailable' };
      },
    };
    await expect(new MoodleEvidenceGateway(caller).getCourseRiskEvidence(7)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });
});
