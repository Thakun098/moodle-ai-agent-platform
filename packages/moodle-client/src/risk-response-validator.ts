import {
  validateCourseRiskEvidence,
  type CourseRiskEvidence,
} from '@moodle-agent-poc/contracts';
import { MoodleResponseError } from './errors.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseCourseRiskEvidenceResponse(raw: unknown): CourseRiskEvidence {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for CourseRiskEvidence response');
  }
  if (raw.schema_version !== '0.1') {
    throw new MoodleResponseError(`Unsupported CourseRiskEvidence schema_version '${String(raw.schema_version)}'`);
  }
  if (typeof raw.payload_json !== 'string') {
    throw new MoodleResponseError("Missing or invalid 'payload_json' in CourseRiskEvidence response");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.payload_json);
  } catch (error) {
    throw new MoodleResponseError(
      `CourseRiskEvidence payload_json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const validation = validateCourseRiskEvidence(payload);
  if (!validation.valid) {
    const details = validation.errors
      .slice(0, 5)
      .map((item) => `${item.instancePath || '/'} ${item.message}`)
      .join('; ');
    throw new MoodleResponseError(`Invalid CourseRiskEvidence v0.1 payload: ${details}`);
  }

  return payload as CourseRiskEvidence;
}
