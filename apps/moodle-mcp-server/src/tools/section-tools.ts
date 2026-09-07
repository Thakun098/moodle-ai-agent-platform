import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { formatMcpError, formatMcpSuccess } from '../errors.js';
import {
  CreateSectionDataSchema,
  CreateSectionInputSchema,
  CreateSectionOutputSchema,
} from '../schemas/index.js';
import type { MoodleCreatedSectionMcpData } from '../types.js';

export function registerSectionTools(server: McpServer, moodleClient: MoodleClient): void {
  // moodle_create_section (T0905)
  server.registerTool(
    'moodle_create_section',
    {
      description: 'Create a new course section with a relative position and title.',
      inputSchema: CreateSectionInputSchema,
      outputSchema: CreateSectionOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = CreateSectionInputSchema.parse(rawArgs);
        const res = await moodleClient.createSection({
          courseId: args.course_id,
          position: args.position,
          name: args.name,
          ...(args.summary !== undefined ? { summary: args.summary } : {}),
        });

        const data: MoodleCreatedSectionMcpData = {
          section_id: res.sectionId,
          section_num: res.sectionNum,
          name: res.name,
          summary: res.summary,
        };

        const validated = CreateSectionDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Section '${validated.name}' created with ID ${validated.section_id} at position ${args.position} (section num: ${validated.section_num})`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );
}
