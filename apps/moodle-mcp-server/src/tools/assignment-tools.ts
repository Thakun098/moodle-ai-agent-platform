import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { formatMcpError, formatMcpSuccess } from '../errors.js';
import {
  AssignmentDetailsDataSchema,
  AssignmentDetailsOutputSchema,
  CreateAssignmentDataSchema,
  CreateAssignmentInputSchema,
  CreateAssignmentOutputSchema,
  GetAssignmentInputSchema,
  UpdateAssignmentDataSchema,
  UpdateAssignmentInputSchema,
  UpdateAssignmentOutputSchema,
} from '../schemas/index.js';
import type {
  MoodleAssignmentDetailsMcpData,
  MoodleCreatedAssignmentMcpData,
  MoodleUpdatedAssignmentMcpData,
} from '../types.js';

export function registerAssignmentTools(server: McpServer, moodleClient: MoodleClient): void {
  // 1. moodle_create_assignment (T0907)
  server.registerTool(
    'moodle_create_assignment',
    {
      description: 'Create a new assignment activity in a Moodle course section with frozen POC defaults.',
      inputSchema: CreateAssignmentInputSchema,
      outputSchema: CreateAssignmentOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = CreateAssignmentInputSchema.parse(rawArgs);
        const res = await moodleClient.createAssignment({
          courseId: args.course_id,
          sectionId: args.section_id,
          name: args.name,
          intro: args.intro,
          ...(args.grade !== undefined ? { grade: args.grade } : {}),
        });

        const data: MoodleCreatedAssignmentMcpData = {
          activity_id: res.activityId,
          assignment_id: res.assignmentId,
          name: res.name,
          section_id: res.sectionId,
          grade: res.grade,
        };

        const validated = CreateAssignmentDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Assignment '${validated.name}' created with activity ID ${validated.activity_id} (grade: ${validated.grade})`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );

  // 2. moodle_get_assignment (T0907)
  server.registerTool(
    'moodle_get_assignment',
    {
      description: 'Retrieve details of an assignment by its canonical activity ID (course module ID).',
      inputSchema: GetAssignmentInputSchema,
      outputSchema: AssignmentDetailsOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = GetAssignmentInputSchema.parse(rawArgs);
        const res = await moodleClient.getAssignment(args.activity_id);

        const data: MoodleAssignmentDetailsMcpData = {
          activity_id: res.activityId,
          assignment_id: res.assignmentId,
          course_id: res.courseId,
          section_id: res.sectionId,
          name: res.name,
          intro: res.intro,
          intro_format: res.introFormat,
          grade: res.grade,
          due_date: res.dueDate,
          online_text_enabled: res.onlineTextEnabled,
          file_enabled: res.fileEnabled,
        };

        const validated = AssignmentDetailsDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Retrieved assignment '${validated.name}' (activity ID: ${validated.activity_id})`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );

  // 3. moodle_update_assignment (T0907)
  server.registerTool(
    'moodle_update_assignment',
    {
      description: 'Update metadata (name, intro, maximum grade) of an existing assignment.',
      inputSchema: UpdateAssignmentInputSchema,
      outputSchema: UpdateAssignmentOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = UpdateAssignmentInputSchema.parse(rawArgs);
        const res = await moodleClient.updateAssignment({
          activityId: args.activity_id,
          ...(args.expected_course_id !== undefined ? { expectedCourseId: args.expected_course_id } : {}),
          ...(args.expected_section_id !== undefined ? { expectedSectionId: args.expected_section_id } : {}),
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.intro !== undefined ? { intro: args.intro } : {}),
          ...(args.grade !== undefined ? { grade: args.grade } : {}),
        });

        const data: MoodleUpdatedAssignmentMcpData = {
          activity_id: res.activityId,
          assignment_id: res.assignmentId,
          name: res.name,
          intro: res.intro,
          grade: res.grade,
        };

        const validated = UpdateAssignmentDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Assignment updated successfully (activity ID: ${validated.activity_id}, name: '${validated.name}', grade: ${validated.grade})`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );
}
