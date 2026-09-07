import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { formatMcpError, formatMcpSuccess } from '../errors.js';
import {
  CreateQuizDataSchema,
  CreateQuizInputSchema,
  CreateQuizOutputSchema,
  GetQuizInputSchema,
  GetQuizQuestionsDataSchema,
  GetQuizQuestionsInputSchema,
  GetQuizQuestionsOutputSchema,
  QuizDetailsDataSchema,
  QuizDetailsOutputSchema,
  UpdateQuizDataSchema,
  UpdateQuizInputSchema,
  UpdateQuizOutputSchema,
} from '../schemas/index.js';
import type {
  MoodleCreatedQuizMcpData,
  MoodleQuizDetailsMcpData,
  MoodleQuizQuestionSlotMcpData,
  MoodleUpdatedQuizMcpData,
} from '../types.js';

export function registerQuizTools(server: McpServer, moodleClient: MoodleClient): void {
  // 1. moodle_create_quiz (T0908)
  server.registerTool(
    'moodle_create_quiz',
    {
      description: 'Create a new quiz activity in a Moodle course section with frozen POC defaults.',
      inputSchema: CreateQuizInputSchema,
      outputSchema: CreateQuizOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = CreateQuizInputSchema.parse(rawArgs);
        const res = await moodleClient.createQuiz({
          courseId: args.course_id,
          sectionId: args.section_id,
          name: args.name,
          ...(args.intro !== undefined ? { intro: args.intro } : {}),
          ...(args.grade !== undefined ? { grade: args.grade } : {}),
        });

        const data: MoodleCreatedQuizMcpData = {
          activity_id: res.activityId,
          quiz_id: res.quizId,
          name: res.name,
          section_id: res.sectionId,
          grade: res.grade,
        };

        const validated = CreateQuizDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Quiz '${validated.name}' created with activity ID ${validated.activity_id} (quiz ID: ${validated.quiz_id})`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );

  // 2. moodle_get_quiz (T0908)
  server.registerTool(
    'moodle_get_quiz',
    {
      description: 'Retrieve details of a quiz by its canonical activity ID (course module ID).',
      inputSchema: GetQuizInputSchema,
      outputSchema: QuizDetailsOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = GetQuizInputSchema.parse(rawArgs);
        const res = await moodleClient.getQuiz(args.activity_id);

        const data: MoodleQuizDetailsMcpData = {
          activity_id: res.activityId,
          quiz_id: res.quizId,
          course_id: res.courseId,
          name: res.name,
          intro: res.intro,
          grade: res.grade,
          preferredbehaviour: res.preferredbehaviour,
          attempts: res.attempts,
          shuffleanswers: res.shuffleanswers,
          questions_count: res.questionsCount,
          sumgrades: res.sumgrades,
        };

        const validated = QuizDetailsDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Retrieved quiz '${validated.name}' (activity ID: ${validated.activity_id}, questions count: ${validated.questions_count})`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );

  // 3. moodle_update_quiz (T0908)
  server.registerTool(
    'moodle_update_quiz',
    {
      description: 'Update metadata (name, intro) of an existing quiz activity.',
      inputSchema: UpdateQuizInputSchema,
      outputSchema: UpdateQuizOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = UpdateQuizInputSchema.parse(rawArgs);
        const res = await moodleClient.updateQuiz({
          activityId: args.activity_id,
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.intro !== undefined ? { intro: args.intro } : {}),
        });

        const data: MoodleUpdatedQuizMcpData = {
          activity_id: res.activityId,
          quiz_id: res.quizId,
          name: res.name,
          intro: res.intro,
        };

        const validated = UpdateQuizDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Quiz updated successfully (activity ID: ${validated.activity_id}, name: '${validated.name}')`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );

  // 4. moodle_get_quiz_questions (T0908)
  server.registerTool(
    'moodle_get_quiz_questions',
    {
      description: 'Retrieve question slots, bank entry IDs, versions, and answers slotted into a quiz.',
      inputSchema: GetQuizQuestionsInputSchema,
      outputSchema: GetQuizQuestionsOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = GetQuizQuestionsInputSchema.parse(rawArgs);
        const res = await moodleClient.getQuizQuestions(args.activity_id);

        const data: MoodleQuizQuestionSlotMcpData[] = res.map((q) => ({
          slot_id: q.slotId,
          slot_number: q.slotNumber,
          page: q.page,
          max_mark: q.maxMark,
          question_bank_entry_id: q.questionBankEntryId,
          question_id: q.questionId,
          version: q.version,
          name: q.name,
          qtype: q.qtype,
          question_text: q.questionText,
          default_mark: q.defaultMark,
          answers: q.answers.map((a) => ({
            id: a.id,
            text: a.text,
            fraction: a.fraction,
            feedback: a.feedback,
          })),
        }));

        const validated = GetQuizQuestionsDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Retrieved ${validated.length} question slot(s) for quiz activity ${args.activity_id}`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );
}
