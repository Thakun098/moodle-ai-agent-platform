import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { formatMcpError, formatMcpSuccess } from '../errors.js';
import {
  CourseRiskEvidenceDataSchema,
  CourseRiskEvidenceOutputSchema,
  GetCourseRiskEvidenceInputSchema,
} from '../schemas/index.js';

/** Registers factual Course Risk evidence tools. No Risk severity is calculated here. */
export function registerRiskTools(server: McpServer, moodleClient: MoodleClient): void {
  server.registerTool(
    'moodle_get_course_risk_evidence',
    {
      description:
        'Retrieve one consolidated factual CourseRiskEvidence projection for deterministic Risk processing. This tool does not calculate Risk severity or invoke an LLM.',
      inputSchema: GetCourseRiskEvidenceInputSchema,
      outputSchema: CourseRiskEvidenceOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = GetCourseRiskEvidenceInputSchema.parse(rawArgs);
        const data = await moodleClient.getCourseRiskEvidence(args.course_id);
        const validated = CourseRiskEvidenceDataSchema.parse(data);
        return formatMcpSuccess(
          validated as unknown as Record<string, unknown>,
          `Retrieved factual CourseRiskEvidence v0.1 for course ${args.course_id}`
        );
      } catch (error) {
        return formatMcpError(error);
      }
    }
  );
}
