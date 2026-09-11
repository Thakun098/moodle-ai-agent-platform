import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { formatMcpError, formatMcpSuccess } from '../errors.js';
import { CreateResourceDataSchema, CreateResourceInputSchema, CreateResourceOutputSchema } from '../schemas/index.js';
import type { MoodleCreatedResourceMcpData } from '../types.js';

export function registerResourceTools(server: McpServer, moodleClient: MoodleClient): void {
  server.registerTool(
    'moodle_create_resource',
    {
      description: 'Create a Moodle File Resource from an already sealed local_agentpoc material snapshot file.',
      inputSchema: CreateResourceInputSchema,
      outputSchema: CreateResourceOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = CreateResourceInputSchema.parse(rawArgs);
        const resource = await moodleClient.createResource({
          courseId: args.course_id,
          sectionId: args.section_id,
          name: args.name,
          filename: args.filename,
          moodleMaterialId: args.moodle_material_id,
          sourceRunId: args.source_run_id,
          sourceStructureRevision: args.source_structure_revision,
          sourceSectionRef: args.source_section_ref,
          sourceMaterialRevision: args.source_material_revision,
        });
        const data: MoodleCreatedResourceMcpData = {
          activity_id: resource.activityId,
          resource_id: resource.resourceId,
          section_id: resource.sectionId,
          name: resource.name,
          filename: resource.filename,
          moodle_material_id: resource.moodleMaterialId,
        };
        const validated = CreateResourceDataSchema.parse(data);
        return formatMcpSuccess(validated, `File Resource '${validated.name}' created successfully with ID ${validated.activity_id}`);
      } catch (err) {
        return formatMcpError(err);
      }
    },
  );
}
