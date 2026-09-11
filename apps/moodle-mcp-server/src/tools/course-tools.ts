import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { formatMcpError, formatMcpSuccess } from '../errors.js';
import {
  CourseStructureDataSchema,
  CourseStructureOutputSchema,
  CreateCourseDataSchema,
  CreateCourseInputSchema,
  CreateCourseOutputSchema,
  GetCourseStructureInputSchema,
} from '../schemas/index.js';
import type { MoodleCourseStructureMcpData, MoodleCreatedCourseMcpData } from '../types.js';

export function registerCourseTools(server: McpServer, moodleClient: MoodleClient): void {
  // 1. moodle_create_course (T0904)
  server.registerTool(
    'moodle_create_course',
    {
      description: 'Create a new hidden Moodle course with deterministic shortname in the specified category.',
      inputSchema: CreateCourseInputSchema,
      outputSchema: CreateCourseOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = CreateCourseInputSchema.parse(rawArgs);
        const res = await moodleClient.createCourse({
          categoryId: args.category_id,
          fullname: args.fullname,
          shortname: args.shortname,
          ...(args.summary !== undefined ? { summary: args.summary } : {}),
          ...(args.format !== undefined ? { format: args.format } : {}),
        });

        const data: MoodleCreatedCourseMcpData = {
          course_id: res.courseId,
          fullname: res.fullname,
          shortname: res.shortname,
          category_id: res.categoryId,
          visible: res.visible,
          format: res.format,
        };

        const validated = CreateCourseDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Course '${validated.fullname}' created successfully with ID ${validated.course_id} (shortname: ${validated.shortname})`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );

  // 2. moodle_get_course_structure (T0906)
  server.registerTool(
    'moodle_get_course_structure',
    {
      description: 'Retrieve the complete hierarchical structure of a course (course metadata, sections, and activities).',
      inputSchema: GetCourseStructureInputSchema,
      outputSchema: CourseStructureOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = GetCourseStructureInputSchema.parse(rawArgs);
        const res = await moodleClient.getCourseStructure(args.course_id);

        const data: MoodleCourseStructureMcpData = {
          course: {
            id: res.course.id,
            fullname: res.course.fullname,
            shortname: res.course.shortname,
            category_id: res.course.categoryId,
            visible: res.course.visible,
            ...(res.course.format !== undefined ? { format: res.course.format } : {}),
          },
          sections: res.sections.map((s) => ({
            section_id: s.sectionId,
            section_num: s.sectionNum,
            name: s.name,
            summary: s.summary,
            activities: s.activities.map((a) => ({
              activity_id: a.activityId,
              instance_id: a.instanceId,
              module_name: a.moduleName,
              name: a.name,
            intro: a.intro,
            grade: a.grade,
            ...(a.files !== undefined ? { files: a.files } : {}),
          })),
          })),
        };

        const validated = CourseStructureDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Retrieved course structure for course ${args.course_id} with ${validated.sections.length} sections`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );
}
