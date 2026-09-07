import { describe, expect, it } from 'vitest';
import {
  AddedQuestionSlotDataSchema,
  AddedQuestionSlotOutputSchema,
  AddQuestionToQuizInputSchema,
  AssignmentDetailsDataSchema,
  AssignmentDetailsOutputSchema,
  CourseStructureDataSchema,
  CourseStructureOutputSchema,
  CreateAssignmentDataSchema,
  CreateAssignmentInputSchema,
  CreateAssignmentOutputSchema,
  CreateCourseDataSchema,
  CreateCourseInputSchema,
  CreateCourseOutputSchema,
  CreateQuizDataSchema,
  CreateQuizInputSchema,
  CreateQuizOutputSchema,
  CreateQuizQuestionInputSchema,
  CreateSectionDataSchema,
  CreateSectionInputSchema,
  CreateSectionOutputSchema,
  CreatedQuestionDataSchema,
  CreatedQuestionOutputSchema,
  GetAssignmentInputSchema,
  GetCourseStructureInputSchema,
  GetQuizInputSchema,
  QuizDetailsDataSchema,
  QuizDetailsOutputSchema,
  GetQuizQuestionsDataSchema,
  GetQuizQuestionsInputSchema,
  GetQuizQuestionsOutputSchema,
  ListCourseCategoriesDataSchema,
  ListCourseCategoriesInputSchema,
  ListCourseCategoriesOutputSchema,
  UpdateAssignmentDataSchema,
  UpdateAssignmentInputSchema,
  UpdateAssignmentOutputSchema,
  UpdateQuizDataSchema,
  UpdateQuizInputSchema,
  UpdateQuizOutputSchema,
  UpdateQuizQuestionInputSchema,
  UpdatedQuestionDataSchema,
  UpdatedQuestionOutputSchema,
} from '../src/schemas/index.js';

describe('Tool Input & Output Schemas (T0910, T0911)', () => {
  describe('moodle_list_course_categories', () => {
    it('accepts empty object input', () => {
      const parsed = ListCourseCategoriesInputSchema.safeParse({});
      expect(parsed.success).toBe(true);
    });

    it('rejects unexpected properties due to strict schema', () => {
      const parsed = ListCourseCategoriesInputSchema.safeParse({ extra: 123 });
      expect(parsed.success).toBe(false);
    });

    it('validates categories output array data and enveloped output schema', () => {
      const valid = [
        {
          id: 1,
          name: 'Category 1',
          idnumber: 'CAT1',
          description: 'Desc',
          parent: 0,
          coursecount: 5,
          visible: 1,
        },
      ];
      expect(ListCourseCategoriesDataSchema.safeParse(valid).success).toBe(true);
      expect(ListCourseCategoriesOutputSchema.safeParse({ status: 'success', data: valid }).success).toBe(true);
    });
  });

  describe('moodle_create_course', () => {
    it('accepts valid course input', () => {
      const input = {
        category_id: 1,
        fullname: 'Introduction to Computer Science',
        shortname: 'CS101',
        summary: 'A beginner course',
        format: 'topics',
      };
      expect(CreateCourseInputSchema.safeParse(input).success).toBe(true);
    });

    it('rejects negative or zero category_id', () => {
      expect(CreateCourseInputSchema.safeParse({ category_id: 0, fullname: 'A', shortname: 'B' }).success).toBe(false);
      expect(CreateCourseInputSchema.safeParse({ category_id: -1, fullname: 'A', shortname: 'B' }).success).toBe(false);
    });

    it('rejects empty fullname or shortname', () => {
      expect(CreateCourseInputSchema.safeParse({ category_id: 1, fullname: '', shortname: 'CS' }).success).toBe(false);
      expect(CreateCourseInputSchema.safeParse({ category_id: 1, fullname: '   ', shortname: 'CS' }).success).toBe(false);
      expect(CreateCourseInputSchema.safeParse({ category_id: 1, fullname: 'CS', shortname: '' }).success).toBe(false);
    });

    it('validates course create output schema', () => {
      const out = {
        course_id: 101,
        fullname: 'Intro to AI',
        shortname: 'AI101',
        category_id: 1,
        visible: 0,
        format: 'topics',
      };
      expect(CreateCourseDataSchema.safeParse(out).success).toBe(true);
      expect(CreateCourseOutputSchema.safeParse({ status: 'success', data: out }).success).toBe(true);
    });
  });

  describe('moodle_create_section', () => {
    it('accepts valid section input', () => {
      const input = {
        course_id: 10,
        position: 1,
        name: 'Week 1: Fundamentals',
        summary: 'Overview of topics',
      };
      expect(CreateSectionInputSchema.safeParse(input).success).toBe(true);
    });

    it('rejects position < 1', () => {
      expect(CreateSectionInputSchema.safeParse({ course_id: 10, position: 0, name: 'S' }).success).toBe(false);
      expect(CreateSectionInputSchema.safeParse({ course_id: 10, position: -5, name: 'S' }).success).toBe(false);
    });

    it('validates section output schema', () => {
      const out = {
        section_id: 14,
        section_num: 1,
        name: 'Week 1',
        summary: 'Summary text',
      };
      expect(CreateSectionDataSchema.safeParse(out).success).toBe(true);
      expect(CreateSectionOutputSchema.safeParse({ status: 'success', data: out }).success).toBe(true);
    });
  });

  describe('moodle_get_course_structure', () => {
    it('accepts valid course_id input', () => {
      expect(GetCourseStructureInputSchema.safeParse({ course_id: 10 }).success).toBe(true);
    });

    it('rejects invalid course_id', () => {
      expect(GetCourseStructureInputSchema.safeParse({ course_id: 0 }).success).toBe(false);
      expect(GetCourseStructureInputSchema.safeParse({}).success).toBe(false);
    });

    it('validates course structure output tree', () => {
      const structure = {
        course: {
          id: 10,
          fullname: 'AI Course',
          shortname: 'AI101',
          category_id: 1,
          visible: 0,
        },
        sections: [
          {
            section_id: 14,
            section_num: 1,
            name: 'Section 1',
            summary: 'Sum',
            activities: [
              {
                activity_id: 50,
                instance_id: 25,
                module_name: 'assign',
                name: 'Assignment 1',
                intro: 'Do work',
                grade: 100,
              },
            ],
          },
        ],
      };
      expect(CourseStructureDataSchema.safeParse(structure).success).toBe(true);
      expect(CourseStructureOutputSchema.safeParse({ status: 'success', data: structure }).success).toBe(true);
    });
  });

  describe('Assignment tools (moodle_create/get/update_assignment)', () => {
    it('accepts valid create assignment input', () => {
      const input = {
        course_id: 10,
        section_id: 14,
        name: 'Essay on ML',
        intro: 'Write 500 words on supervised learning.',
        grade: 100,
      };
      expect(CreateAssignmentInputSchema.safeParse(input).success).toBe(true);
    });

    it('rejects assignment create with empty name or intro', () => {
      expect(CreateAssignmentInputSchema.safeParse({ course_id: 10, section_id: 14, name: '', intro: 'I' }).success).toBe(false);
      expect(CreateAssignmentInputSchema.safeParse({ course_id: 10, section_id: 14, name: 'N', intro: '   ' }).success).toBe(false);
    });

    it('validates get assignment input and details output', () => {
      expect(GetAssignmentInputSchema.safeParse({ activity_id: 55 }).success).toBe(true);
      const out = {
        activity_id: 55,
        assignment_id: 20,
        course_id: 10,
        section_id: 14,
        name: 'Assignment 1',
        intro: 'Instructions',
        intro_format: 1,
        grade: 100,
        due_date: 0,
        online_text_enabled: 1,
        file_enabled: 0,
      };
      expect(AssignmentDetailsDataSchema.safeParse(out).success).toBe(true);
      expect(AssignmentDetailsOutputSchema.safeParse({ status: 'success', data: out }).success).toBe(true);
    });

    it('accepts valid update assignment input and rejects empty update', () => {
      expect(UpdateAssignmentInputSchema.safeParse({ activity_id: 55, name: 'New Name' }).success).toBe(true);
      expect(UpdateAssignmentInputSchema.safeParse({ activity_id: 55, grade: 80 }).success).toBe(true);
      expect(UpdateAssignmentInputSchema.safeParse({ activity_id: 55 }).success).toBe(false);

      const out = {
        activity_id: 55,
        assignment_id: 20,
        name: 'Updated',
        intro: 'Intro',
        grade: 90,
      };
      expect(UpdateAssignmentDataSchema.safeParse(out).success).toBe(true);
      expect(UpdateAssignmentOutputSchema.safeParse({ status: 'success', data: out }).success).toBe(true);
    });
  });

  describe('Quiz tools (moodle_create/get/update_quiz/get_quiz_questions)', () => {
    it('accepts valid create quiz input', () => {
      const input = {
        course_id: 10,
        section_id: 14,
        name: 'AI Quiz 1',
        intro: 'Covers week 1',
        grade: 20,
      };
      expect(CreateQuizInputSchema.safeParse(input).success).toBe(true);
    });

    it('validates get quiz input and details output', () => {
      expect(GetQuizInputSchema.safeParse({ activity_id: 60 }).success).toBe(true);
      const out = {
        activity_id: 60,
        quiz_id: 30,
        course_id: 10,
        name: 'Quiz',
        intro: 'Intro',
        grade: 10,
        preferredbehaviour: 'deferredfeedback',
        attempts: 0,
        shuffleanswers: 1,
        questions_count: 2,
        sumgrades: 2,
      };
      expect(QuizDetailsDataSchema.safeParse(out).success).toBe(true);
      expect(QuizDetailsOutputSchema.safeParse({ status: 'success', data: out }).success).toBe(true);
    });

    it('validates update quiz input and rejects empty update', () => {
      expect(UpdateQuizInputSchema.safeParse({ activity_id: 60, name: 'New Quiz Name' }).success).toBe(true);
      expect(UpdateQuizInputSchema.safeParse({ activity_id: 60 }).success).toBe(false);

      const out = {
        activity_id: 60,
        quiz_id: 30,
        name: 'Updated',
        intro: 'Intro',
      };
      expect(UpdateQuizDataSchema.safeParse(out).success).toBe(true);
      expect(UpdateQuizOutputSchema.safeParse({ status: 'success', data: out }).success).toBe(true);
    });

    it('validates get quiz questions input and output', () => {
      expect(GetQuizQuestionsInputSchema.safeParse({ activity_id: 60 }).success).toBe(true);
      expect(GetQuizQuestionsInputSchema.safeParse({ activity_id: 0 }).success).toBe(false);

      const slots = [
        {
          slot_id: 1,
          slot_number: 1,
          page: 1,
          max_mark: 1,
          question_bank_entry_id: 100,
          question_id: 200,
          version: 1,
          name: 'Q1',
          qtype: 'multichoice' as const,
          question_text: 'What is 1+1?',
          default_mark: 1,
          answers: [{ id: 1, text: '2', fraction: 1, feedback: 'Good' }],
        },
      ];
      expect(GetQuizQuestionsDataSchema.safeParse(slots).success).toBe(true);
      expect(GetQuizQuestionsOutputSchema.safeParse({ status: 'success', data: slots }).success).toBe(true);
    });
  });

  describe('Question tools (moodle_create/update_quiz_question, moodle_add_question_to_quiz)', () => {
    it('accepts valid multichoice question create input', () => {
      const mcq = {
        activity_id: 60,
        name: 'Q1 MCQ',
        question_text: 'What is 2+2?',
        default_mark: 1,
        qtype: 'multichoice' as const,
        options: {
          choices: [
            { text: '4', fraction: 1 as const, feedback: 'Correct!' },
            { text: '3', fraction: 0 as const },
            { text: '5', fraction: 0 as const },
          ],
          shuffle_answers: true,
          single: true,
        },
      };
      expect(CreateQuizQuestionInputSchema.safeParse(mcq).success).toBe(true);
    });

    it('rejects multichoice question with < 2 choices or no correct choice', () => {
      const mcqNoCorrect = {
        activity_id: 60,
        name: 'Q1 MCQ',
        question_text: 'What is 2+2?',
        qtype: 'multichoice' as const,
        options: {
          choices: [
            { text: '3', fraction: 0 as const },
            { text: '5', fraction: 0 as const },
          ],
        },
      };
      expect(CreateQuizQuestionInputSchema.safeParse(mcqNoCorrect).success).toBe(false);

      const mcqMultipleCorrect = {
        activity_id: 60,
        name: 'Q1 MCQ',
        question_text: 'What is 2+2?',
        qtype: 'multichoice' as const,
        options: {
          choices: [
            { text: '4', fraction: 1 as const },
            { text: '4.0', fraction: 1 as const },
          ],
        },
      };
      expect(CreateQuizQuestionInputSchema.safeParse(mcqMultipleCorrect).success).toBe(false);
    });

    it('accepts valid truefalse question create input', () => {
      const tf = {
        activity_id: 60,
        name: 'Q2 TF',
        question_text: 'The sky is blue.',
        qtype: 'truefalse' as const,
        options: {
          correct_answer: true,
          feedback_true: 'Yes',
        },
      };
      expect(CreateQuizQuestionInputSchema.safeParse(tf).success).toBe(true);
    });

    it('accepts valid shortanswer question create input', () => {
      const sa = {
        activity_id: 60,
        name: 'Q3 Short',
        question_text: 'Capital of France?',
        qtype: 'shortanswer' as const,
        options: {
          accepted_answers: ['Paris', 'paris'],
          case_sensitive: false,
        },
      };
      expect(CreateQuizQuestionInputSchema.safeParse(sa).success).toBe(true);
    });

    it('rejects shortanswer with empty accepted_answers array', () => {
      const sa = {
        activity_id: 60,
        name: 'Q3 Short',
        question_text: 'Capital?',
        qtype: 'shortanswer' as const,
        options: {
          accepted_answers: [],
        },
      };
      expect(CreateQuizQuestionInputSchema.safeParse(sa).success).toBe(false);
    });

    it('accepts essay question create with or without options (Correction 4)', () => {
      const essayWithoutOptions = {
        activity_id: 60,
        name: 'Q4 Essay',
        question_text: 'Explain backpropagation.',
        default_mark: 5,
        qtype: 'essay' as const,
      };
      expect(CreateQuizQuestionInputSchema.safeParse(essayWithoutOptions).success).toBe(true);

      const essayWithOptions = {
        ...essayWithoutOptions,
        options: {
          grading_guidance: 'Look for chain rule derivation',
          min_word_limit: 100,
          max_word_limit: 500,
        },
      };
      expect(CreateQuizQuestionInputSchema.safeParse(essayWithOptions).success).toBe(true);
    });

    it('validates created question output schema', () => {
      const out = {
        question_bank_entry_id: 100,
        question_id: 200,
        version: 1,
        name: 'Q1',
        qtype: 'multichoice' as const,
        default_mark: 1,
        category_id: 1,
      };
      expect(CreatedQuestionDataSchema.safeParse(out).success).toBe(true);
      expect(CreatedQuestionOutputSchema.safeParse({ status: 'success', data: out }).success).toBe(true);
    });

    it('accepts metadata-only question update (Correction 3)', () => {
      const metaUpdate = {
        question_bank_entry_id: 1001,
        name: 'Updated Question Title',
        default_mark: 2,
      };
      expect(UpdateQuizQuestionInputSchema.safeParse(metaUpdate).success).toBe(true);
    });

    it('rejects metadata-only updates containing qtype or options keys', () => {
      expect(
        UpdateQuizQuestionInputSchema.safeParse({
          question_bank_entry_id: 1001,
          name: 'Updated Question Title',
          qtype: undefined,
        }).success
      ).toBe(false);
      expect(
        UpdateQuizQuestionInputSchema.safeParse({
          question_bank_entry_id: 1001,
          name: 'Updated Question Title',
          options: undefined,
        }).success
      ).toBe(false);
    });

    it('rejects question update with qtype but missing options for all 4 types including essay (Correction 3)', () => {
      expect(
        UpdateQuizQuestionInputSchema.safeParse({
          question_bank_entry_id: 1001,
          qtype: 'essay',
        }).success
      ).toBe(false);

      expect(
        UpdateQuizQuestionInputSchema.safeParse({
          question_bank_entry_id: 1001,
          qtype: 'multichoice',
        }).success
      ).toBe(false);

      expect(
        UpdateQuizQuestionInputSchema.safeParse({
          question_bank_entry_id: 1001,
          qtype: 'truefalse',
        }).success
      ).toBe(false);

      expect(
        UpdateQuizQuestionInputSchema.safeParse({
          question_bank_entry_id: 1001,
          qtype: 'shortanswer',
        }).success
      ).toBe(false);
    });

    it('accepts essay question update when options is provided (Correction 3)', () => {
      const essayUpdate = {
        question_bank_entry_id: 1001,
        qtype: 'essay',
        options: {
          grading_guidance: 'Updated rubric',
        },
      };
      expect(UpdateQuizQuestionInputSchema.safeParse(essayUpdate).success).toBe(true);
    });

    it('validates updated question output schema', () => {
      const out = {
        question_bank_entry_id: 100,
        previous_question_id: 200,
        question_id: 201,
        version: 2,
        name: 'Q1 (v2)',
        qtype: 'multichoice' as const,
        default_mark: 1,
      };
      expect(UpdatedQuestionDataSchema.safeParse(out).success).toBe(true);
      expect(UpdatedQuestionOutputSchema.safeParse({ status: 'success', data: out }).success).toBe(true);
    });

    it('validates add question to quiz input and output schema', () => {
      const addInput = {
        activity_id: 60,
        question_bank_entry_id: 1001,
        page: 1,
        max_mark: 2,
      };
      expect(AddQuestionToQuizInputSchema.safeParse(addInput).success).toBe(true);

      expect(
        AddQuestionToQuizInputSchema.safeParse({
          activity_id: 0,
          question_bank_entry_id: 1001,
        }).success
      ).toBe(false);

      const out = {
        slot_id: 1,
        activity_id: 60,
        quiz_id: 30,
        question_bank_entry_id: 1001,
        question_id: 2001,
        slot_number: 1,
        page: 1,
        max_mark: 2,
      };
      expect(AddedQuestionSlotDataSchema.safeParse(out).success).toBe(true);
      expect(AddedQuestionSlotOutputSchema.safeParse({ status: 'success', data: out }).success).toBe(true);
    });
  });
});
