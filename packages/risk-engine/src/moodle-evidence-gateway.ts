import {
  validateCourseRiskEvidence,
  type CourseRiskEvidence,
} from '@moodle-agent-poc/contracts';

export interface RiskEvidenceToolCaller {
  callTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<
    | { status: 'success'; data: unknown }
    | { status: 'error'; code: string; message: string; details?: unknown }
  >;
}

export class MoodleEvidenceGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'MoodleEvidenceGatewayError';
  }
}

/**
 * AI Platform consumer for the factual Moodle CourseRiskEvidence projection.
 * This gateway deliberately has no LLM/model dependency.
 */
export class MoodleEvidenceGateway {
  constructor(private readonly mcp: RiskEvidenceToolCaller) {}

  async getCourseRiskEvidence(courseId: number): Promise<CourseRiskEvidence> {
    if (!Number.isInteger(courseId) || courseId <= 0) {
      throw new MoodleEvidenceGatewayError('INVALID_COURSE_ID', 'courseId must be a positive integer');
    }

    const result = await this.mcp.callTool('moodle_get_course_risk_evidence', {
      course_id: courseId,
    });
    if (result.status === 'error') {
      throw new MoodleEvidenceGatewayError(result.code, result.message, result.details);
    }

    const validation = validateCourseRiskEvidence(result.data);
    if (!validation.valid) {
      throw new MoodleEvidenceGatewayError(
        'INVALID_COURSE_RISK_EVIDENCE',
        `MCP returned an invalid CourseRiskEvidence v0.1 payload: ${validation.errors
          .slice(0, 5)
          .map((error) => `${error.instancePath || '/'} ${error.message}`)
          .join('; ')}`,
        validation.errors
      );
    }

    return result.data as CourseRiskEvidence;
  }
}
