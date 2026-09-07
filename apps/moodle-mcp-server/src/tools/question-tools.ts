import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CreateQuizQuestionParams,
  EssayQuestionOptions,
  MoodleClient,
  MultichoiceQuestionOptions,
  ShortAnswerQuestionOptions,
  TrueFalseQuestionOptions,
  UpdateQuizQuestionParams,
} from '@moodle-agent-poc/moodle-client';
import { formatMcpError, formatMcpSuccess } from '../errors.js';
import {
  AddedQuestionSlotDataSchema,
  AddedQuestionSlotOutputSchema,
  AddQuestionToQuizInputSchema,
  CreatedQuestionDataSchema,
  CreatedQuestionOutputSchema,
  CreateQuizQuestionInputSchema,
  UpdatedQuestionDataSchema,
  UpdatedQuestionOutputSchema,
  UpdateQuizQuestionInputSchema,
} from '../schemas/index.js';
import type {
  MoodleAddedQuestionSlotMcpData,
  MoodleCreatedQuestionMcpData,
  MoodleUpdatedQuestionMcpData,
} from '../types.js';

export function registerQuestionTools(server: McpServer, moodleClient: MoodleClient): void {
  // 1. moodle_create_quiz_question (T0909)
  server.registerTool(
    'moodle_create_quiz_question',
    {
      description: 'Create a new quiz question in the quiz activity context category for multichoice, truefalse, shortanswer, or essay.',
      inputSchema: CreateQuizQuestionInputSchema,
      outputSchema: CreatedQuestionOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = CreateQuizQuestionInputSchema.parse(rawArgs);

        let params: CreateQuizQuestionParams;
        if (args.qtype === 'multichoice') {
          const options: MultichoiceQuestionOptions = {
            choices: args.options.choices.map((c) => ({
              text: c.text,
              fraction: c.fraction,
              ...(c.feedback !== undefined ? { feedback: c.feedback } : {}),
            })),
            ...(args.options.shuffle_answers !== undefined ? { shuffleAnswers: args.options.shuffle_answers } : {}),
            ...(args.options.single !== undefined ? { single: args.options.single } : {}),
          };
          params = {
            activityId: args.activity_id,
            name: args.name,
            questionText: args.question_text,
            ...(args.default_mark !== undefined ? { defaultMark: args.default_mark } : {}),
            ...(args.general_feedback !== undefined ? { generalFeedback: args.general_feedback } : {}),
            qtype: 'multichoice',
            options,
          };
        } else if (args.qtype === 'truefalse') {
          const options: TrueFalseQuestionOptions = {
            correctAnswer: args.options.correct_answer,
            ...(args.options.feedback_true !== undefined ? { feedbackTrue: args.options.feedback_true } : {}),
            ...(args.options.feedback_false !== undefined ? { feedbackFalse: args.options.feedback_false } : {}),
          };
          params = {
            activityId: args.activity_id,
            name: args.name,
            questionText: args.question_text,
            ...(args.default_mark !== undefined ? { defaultMark: args.default_mark } : {}),
            ...(args.general_feedback !== undefined ? { generalFeedback: args.general_feedback } : {}),
            qtype: 'truefalse',
            options,
          };
        } else if (args.qtype === 'shortanswer') {
          const options: ShortAnswerQuestionOptions = {
            acceptedAnswers: args.options.accepted_answers,
            ...(args.options.case_sensitive !== undefined ? { caseSensitive: args.options.case_sensitive } : {}),
            ...(args.options.feedback !== undefined ? { feedback: args.options.feedback } : {}),
          };
          params = {
            activityId: args.activity_id,
            name: args.name,
            questionText: args.question_text,
            ...(args.default_mark !== undefined ? { defaultMark: args.default_mark } : {}),
            ...(args.general_feedback !== undefined ? { generalFeedback: args.general_feedback } : {}),
            qtype: 'shortanswer',
            options,
          };
        } else {
          // essay (options optional on create)
          let options: EssayQuestionOptions | undefined = undefined;
          if (args.options) {
            options = {
              ...(args.options.grading_guidance !== undefined ? { gradingGuidance: args.options.grading_guidance } : {}),
              ...(args.options.response_format !== undefined ? { responseFormat: args.options.response_format } : {}),
              ...(args.options.min_word_limit !== undefined ? { minWordLimit: args.options.min_word_limit } : {}),
              ...(args.options.max_word_limit !== undefined ? { maxWordLimit: args.options.max_word_limit } : {}),
            };
          }
          params = {
            activityId: args.activity_id,
            name: args.name,
            questionText: args.question_text,
            ...(args.default_mark !== undefined ? { defaultMark: args.default_mark } : {}),
            ...(args.general_feedback !== undefined ? { generalFeedback: args.general_feedback } : {}),
            qtype: 'essay',
            ...(options !== undefined ? { options } : {}),
          };
        }

        const res = await moodleClient.createQuizQuestion(params);

        const data: MoodleCreatedQuestionMcpData = {
          question_bank_entry_id: res.questionBankEntryId,
          question_id: res.questionId,
          version: res.version,
          name: res.name,
          qtype: res.qtype,
          default_mark: res.defaultMark,
          category_id: res.categoryId,
        };

        const validated = CreatedQuestionDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Question '${validated.name}' (${validated.qtype}) created with bank entry ID ${validated.question_bank_entry_id} (question ID: ${validated.question_id}, version ${validated.version})`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );

  // 2. moodle_update_quiz_question (T0909)
  server.registerTool(
    'moodle_update_quiz_question',
    {
      description: 'Update a question under an existing Question Bank Entry creating a new version record.',
      inputSchema: UpdateQuizQuestionInputSchema,
      outputSchema: UpdatedQuestionOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = UpdateQuizQuestionInputSchema.parse(rawArgs);

        let params: UpdateQuizQuestionParams;
        if (!('qtype' in args)) {
          // Metadata-only update (no options, no qtype)
          params = {
            questionBankEntryId: args.question_bank_entry_id,
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.question_text !== undefined ? { questionText: args.question_text } : {}),
            ...(args.default_mark !== undefined ? { defaultMark: args.default_mark } : {}),
            ...(args.general_feedback !== undefined ? { generalFeedback: args.general_feedback } : {}),
          };
        } else if (args.qtype === 'multichoice') {
          const options: MultichoiceQuestionOptions = {
            choices: args.options.choices.map((c) => ({
              text: c.text,
              fraction: c.fraction,
              ...(c.feedback !== undefined ? { feedback: c.feedback } : {}),
            })),
            ...(args.options.shuffle_answers !== undefined ? { shuffleAnswers: args.options.shuffle_answers } : {}),
            ...(args.options.single !== undefined ? { single: args.options.single } : {}),
          };
          params = {
            questionBankEntryId: args.question_bank_entry_id,
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.question_text !== undefined ? { questionText: args.question_text } : {}),
            ...(args.default_mark !== undefined ? { defaultMark: args.default_mark } : {}),
            ...(args.general_feedback !== undefined ? { generalFeedback: args.general_feedback } : {}),
            qtype: 'multichoice',
            options,
          };
        } else if (args.qtype === 'truefalse') {
          const options: TrueFalseQuestionOptions = {
            correctAnswer: args.options.correct_answer,
            ...(args.options.feedback_true !== undefined ? { feedbackTrue: args.options.feedback_true } : {}),
            ...(args.options.feedback_false !== undefined ? { feedbackFalse: args.options.feedback_false } : {}),
          };
          params = {
            questionBankEntryId: args.question_bank_entry_id,
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.question_text !== undefined ? { questionText: args.question_text } : {}),
            ...(args.default_mark !== undefined ? { defaultMark: args.default_mark } : {}),
            ...(args.general_feedback !== undefined ? { generalFeedback: args.general_feedback } : {}),
            qtype: 'truefalse',
            options,
          };
        } else if (args.qtype === 'shortanswer') {
          const options: ShortAnswerQuestionOptions = {
            acceptedAnswers: args.options.accepted_answers,
            ...(args.options.case_sensitive !== undefined ? { caseSensitive: args.options.case_sensitive } : {}),
            ...(args.options.feedback !== undefined ? { feedback: args.options.feedback } : {}),
          };
          params = {
            questionBankEntryId: args.question_bank_entry_id,
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.question_text !== undefined ? { questionText: args.question_text } : {}),
            ...(args.default_mark !== undefined ? { defaultMark: args.default_mark } : {}),
            ...(args.general_feedback !== undefined ? { generalFeedback: args.general_feedback } : {}),
            qtype: 'shortanswer',
            options,
          };
        } else {
          // essay (options required on update per Phase 8 remediation P8-F3)
          const options: EssayQuestionOptions = {
            ...(args.options.grading_guidance !== undefined ? { gradingGuidance: args.options.grading_guidance } : {}),
            ...(args.options.response_format !== undefined ? { responseFormat: args.options.response_format } : {}),
            ...(args.options.min_word_limit !== undefined ? { minWordLimit: args.options.min_word_limit } : {}),
            ...(args.options.max_word_limit !== undefined ? { maxWordLimit: args.options.max_word_limit } : {}),
          };
          params = {
            questionBankEntryId: args.question_bank_entry_id,
            ...(args.name !== undefined ? { name: args.name } : {}),
            ...(args.question_text !== undefined ? { questionText: args.question_text } : {}),
            ...(args.default_mark !== undefined ? { defaultMark: args.default_mark } : {}),
            ...(args.general_feedback !== undefined ? { generalFeedback: args.general_feedback } : {}),
            qtype: 'essay',
            options,
          };
        }

        const res = await moodleClient.updateQuizQuestion(params);

        const data: MoodleUpdatedQuestionMcpData = {
          question_bank_entry_id: res.questionBankEntryId,
          previous_question_id: res.previousQuestionId,
          question_id: res.questionId,
          version: res.version,
          name: res.name,
          qtype: res.qtype,
          default_mark: res.defaultMark,
        };

        const validated = UpdatedQuestionDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Question updated under bank entry ${validated.question_bank_entry_id} (new version ${validated.version}, question ID: ${validated.question_id})`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );

  // 3. moodle_add_question_to_quiz (T0909)
  server.registerTool(
    'moodle_add_question_to_quiz',
    {
      description: 'Add an existing question (by question_bank_entry_id) into a quiz slot.',
      inputSchema: AddQuestionToQuizInputSchema,
      outputSchema: AddedQuestionSlotOutputSchema,
    },
    async (rawArgs) => {
      try {
        const args = AddQuestionToQuizInputSchema.parse(rawArgs);
        const res = await moodleClient.addQuestionToQuiz({
          activityId: args.activity_id,
          questionBankEntryId: args.question_bank_entry_id,
          ...(args.page !== undefined ? { page: args.page } : {}),
          ...(args.max_mark !== undefined ? { maxMark: args.max_mark } : {}),
        });

        const data: MoodleAddedQuestionSlotMcpData = {
          slot_id: res.slotId,
          activity_id: res.activityId,
          quiz_id: res.quizId,
          question_bank_entry_id: res.questionBankEntryId,
          question_id: res.questionId,
          slot_number: res.slotNumber,
          page: res.page,
          max_mark: res.maxMark,
        };

        const validated = AddedQuestionSlotDataSchema.parse(data);
        return formatMcpSuccess(
          validated,
          `Question ${validated.question_bank_entry_id} added to quiz activity ${validated.activity_id} at slot ${validated.slot_number} (page: ${validated.page}, max mark: ${validated.max_mark})`
        );
      } catch (err) {
        return formatMcpError(err);
      }
    }
  );
}
