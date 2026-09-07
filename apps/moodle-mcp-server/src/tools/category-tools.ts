import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { formatMcpError, formatMcpSuccess } from '../errors.js';
import {
  ListCourseCategoriesDataSchema,
  ListCourseCategoriesInputSchema,
  ListCourseCategoriesOutputSchema,
} from '../schemas/index.js';
import type { MoodleCategoryMcpData } from '../types.js';

export function registerCategoryTools(server: McpServer, moodleClient: MoodleClient): void {
  server.registerTool(
    'moodle_list_course_categories',
    {
      description: 'List course categories accessible to the configured Moodle user token.',
      inputSchema: ListCourseCategoriesInputSchema,
      outputSchema: ListCourseCategoriesOutputSchema,
    },
    async (rawArgs) => {
      try {
        ListCourseCategoriesInputSchema.parse(rawArgs ?? {});
        const categories = await moodleClient.listCourseCategories();
        const data: MoodleCategoryMcpData[] = categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          idnumber: cat.idnumber,
          description: cat.description,
          parent: cat.parent,
          coursecount: cat.coursecount,
          visible: cat.visible,
        }));
        const validated = ListCourseCategoriesDataSchema.parse(data);
        return formatMcpSuccess(validated, `Retrieved ${validated.length} course categories`);
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );
}
