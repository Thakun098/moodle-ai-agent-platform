import { describe, expect, it } from 'vitest';
import { validateCourseRiskEvidence } from '../src/index.js';

function validEvidence() {
  return {
    schema_version: '0.1',
    observed_at: 1_789_000_000,
    course: {
      course_id: 7,
      fullname: 'Risk Fixture',
      shortname: 'RISK-7',
      format: 'topics',
      start_at: 1_788_000_000,
      end_at: null,
    },
    dataset_status: [
      'enrolments',
      'timeline',
      'completion',
      'quizzes',
      'assignments',
      'competencies',
    ].map((dataset) => ({ dataset, status: 'OK', observed_at: 1_789_000_000 })),
    enrolments: [],
    activities: [],
    completion: [],
    quizzes: [],
    assignments: [],
    competencies: {
      course_competencies: [],
      activity_links: [],
      ratings: [],
    },
  };
}

describe('CourseRiskEvidence v0.1', () => {
  it('accepts a factual course projection with explicit dataset status', () => {
    expect(validateCourseRiskEvidence(validEvidence())).toEqual({ valid: true, errors: [] });
  });

  it('rejects Risk semantics at the Moodle factual boundary', () => {
    const payload = { ...validEvidence(), risk_level: 'HIGH' };
    expect(validateCourseRiskEvidence(payload).valid).toBe(false);
  });

  it('rejects an ambiguous missing dataset instead of treating it as empty evidence', () => {
    const payload = validEvidence();
    payload.dataset_status = payload.dataset_status.filter((item) => item.dataset !== 'competencies');
    payload.competencies = undefined as never;
    expect(validateCourseRiskEvidence(payload).valid).toBe(false);
  });
});
