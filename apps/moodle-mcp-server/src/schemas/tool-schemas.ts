import { z } from 'zod';

// ==========================================
// Question Options Schemas
// ==========================================

export const MultichoiceChoiceSchema = z
  .object({
    text: z.string().trim().min(1, 'Choice text must not be empty'),
    fraction: z.union([z.literal(0), z.literal(1)]),
    feedback: z.string().optional(),
  })
  .strict();

export const MultichoiceOptionsSchema = z
  .object({
    choices: z
      .array(MultichoiceChoiceSchema)
      .min(2, 'Multiple choice question must have at least 2 choices')
      .refine(
        (choices) => choices.filter((c) => c.fraction === 1).length === 1,
        { message: 'Multiple choice question must have exactly one correct choice with fraction 1' }
      ),
    shuffle_answers: z.boolean().optional(),
    single: z.boolean().optional(),
  })
  .strict();

export const TrueFalseOptionsSchema = z
  .object({
    correct_answer: z.boolean(),
    feedback_true: z.string().optional(),
    feedback_false: z.string().optional(),
  })
  .strict();

export const ShortAnswerOptionsSchema = z
  .object({
    accepted_answers: z
      .array(z.string().trim().min(1, 'Accepted answer cannot be empty'))
      .min(1, 'At least one accepted answer is required'),
    case_sensitive: z.boolean().optional(),
    feedback: z.string().optional(),
  })
  .strict();

export const EssayOptionsSchema = z
  .object({
    grading_guidance: z.string().optional(),
    response_format: z.string().optional(),
    min_word_limit: z.number().int().nonnegative().optional(),
    max_word_limit: z.number().int().nonnegative().optional(),
  })
  .strict();

// ==========================================
// 1. moodle_list_course_categories (T0903)
// ==========================================

export const ListCourseCategoriesInputSchema = z.object({}).strict();
export type ListCourseCategoriesInput = z.infer<typeof ListCourseCategoriesInputSchema>;

export const ListCourseFormatsInputSchema = z.object({}).strict();
export type ListCourseFormatsInput = z.infer<typeof ListCourseFormatsInputSchema>;

// ==========================================
// 2. moodle_create_course (T0904)
// ==========================================

export const CreateCourseInputSchema = z
  .object({
    category_id: z.number().int().positive('category_id must be a positive integer'),
    fullname: z.string().trim().min(1, 'fullname must not be empty'),
    shortname: z.string().trim().min(1, 'shortname must not be empty'),
    summary: z.string().optional(),
    format: z.string().optional(),
  })
  .strict();
export type CreateCourseInput = z.infer<typeof CreateCourseInputSchema>;

// ==========================================
// 3. moodle_create_section (T0905)
// ==========================================

export const CreateSectionInputSchema = z
  .object({
    course_id: z.number().int().positive('course_id must be a positive integer'),
    position: z.number().int().positive('position must be an integer >= 1'),
    name: z.string().trim().min(1, 'name must not be empty'),
    summary: z.string().optional(),
  })
  .strict();
export type CreateSectionInput = z.infer<typeof CreateSectionInputSchema>;

export const CreateResourceInputSchema = z
  .object({
    course_id: z.number().int().positive(),
    section_id: z.number().int().positive(),
    name: z.string().trim().min(1),
    filename: z.string().trim().min(1),
    moodle_material_id: z.number().int().positive(),
    source_run_id: z.string().trim().min(1),
    source_structure_revision: z.number().int().positive(),
    source_section_ref: z.string().trim().regex(/^section-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    source_material_revision: z.number().int().positive(),
  })
  .strict();
export type CreateResourceInput = z.infer<typeof CreateResourceInputSchema>;

// ==========================================
// 4. moodle_get_course_structure (T0906)
// ==========================================

export const GetCourseStructureInputSchema = z
  .object({
    course_id: z.number().int().positive('course_id must be a positive integer'),
  })
  .strict();
export type GetCourseStructureInput = z.infer<typeof GetCourseStructureInputSchema>;

// ==========================================
// 5. moodle_create_assignment (T0907)
// ==========================================

export const CreateAssignmentInputSchema = z
  .object({
    course_id: z.number().int().positive('course_id must be a positive integer'),
    section_id: z.number().int().positive('section_id must be a positive integer'),
    name: z.string().trim().min(1, 'name must not be empty'),
    intro: z.string().trim().min(1, 'intro must not be empty'),
    grade: z.number().positive('grade must be a positive number').optional(),
  })
  .strict();
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInputSchema>;

// ==========================================
// 6. moodle_get_assignment (T0907)
// ==========================================

export const GetAssignmentInputSchema = z
  .object({
    activity_id: z.number().int().positive('activity_id must be a positive integer'),
  })
  .strict();
export type GetAssignmentInput = z.infer<typeof GetAssignmentInputSchema>;

// ==========================================
// 7. moodle_update_assignment (T0907)
// ==========================================

export const UpdateAssignmentInputSchema = z
  .object({
    activity_id: z.number().int().positive('activity_id must be a positive integer'),
    expected_course_id: z.number().int().positive().optional(),
    expected_section_id: z.number().int().positive().optional(),
    name: z.string().trim().min(1, 'name must not be empty').optional(),
    intro: z.string().optional(),
    grade: z.number().positive('grade must be a positive number').optional(),
  })
  .strict()
  .refine(
    (data) => data.name !== undefined || data.intro !== undefined || data.grade !== undefined,
    { message: 'At least one field (name, intro, grade) must be provided for update' }
  );
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentInputSchema>;

// ==========================================
// 8. moodle_create_quiz (T0908)
// ==========================================

export const CreateQuizInputSchema = z
  .object({
    course_id: z.number().int().positive('course_id must be a positive integer'),
    section_id: z.number().int().positive('section_id must be a positive integer'),
    name: z.string().trim().min(1, 'name must not be empty'),
    intro: z.string().optional(),
    grade: z.number().positive('grade must be a positive number').optional(),
  })
  .strict();
export type CreateQuizInput = z.infer<typeof CreateQuizInputSchema>;

// ==========================================
// 9. moodle_get_quiz (T0908)
// ==========================================

export const GetQuizInputSchema = z
  .object({
    activity_id: z.number().int().positive('activity_id must be a positive integer'),
  })
  .strict();
export type GetQuizInput = z.infer<typeof GetQuizInputSchema>;

// ==========================================
// 10. moodle_update_quiz (T0908)
// ==========================================

export const UpdateQuizInputSchema = z
  .object({
    activity_id: z.number().int().positive('activity_id must be a positive integer'),
    name: z.string().trim().min(1, 'name must not be empty').optional(),
    intro: z.string().optional(),
  })
  .strict()
  .refine(
    (data) => data.name !== undefined || data.intro !== undefined,
    { message: 'At least one field (name, intro) must be provided for update' }
  );
export type UpdateQuizInput = z.infer<typeof UpdateQuizInputSchema>;

// ==========================================
// 11. moodle_get_quiz_questions (T0908)
// ==========================================

export const GetQuizQuestionsInputSchema = z
  .object({
    activity_id: z.number().int().positive('activity_id must be a positive integer'),
  })
  .strict();
export type GetQuizQuestionsInput = z.infer<typeof GetQuizQuestionsInputSchema>;

// ==========================================
// 12. moodle_create_quiz_question (T0909)
// ==========================================

const CreateQuestionBase = z.object({
  activity_id: z.number().int().positive('activity_id must be a positive integer'),
  name: z.string().trim().min(1, 'name must not be empty'),
  question_text: z.string().trim().min(1, 'question_text must not be empty'),
  default_mark: z.number().positive('default_mark must be a positive number').optional(),
  general_feedback: z.string().optional(),
});

export const CreateQuizQuestionInputSchema = z.discriminatedUnion('qtype', [
  CreateQuestionBase.extend({
    qtype: z.literal('multichoice'),
    options: MultichoiceOptionsSchema,
  }).strict(),
  CreateQuestionBase.extend({
    qtype: z.literal('truefalse'),
    options: TrueFalseOptionsSchema,
  }).strict(),
  CreateQuestionBase.extend({
    qtype: z.literal('shortanswer'),
    options: ShortAnswerOptionsSchema,
  }).strict(),
  CreateQuestionBase.extend({
    qtype: z.literal('essay'),
    options: EssayOptionsSchema.optional(),
  }).strict(),
]);
export type CreateQuizQuestionInput = z.infer<typeof CreateQuizQuestionInputSchema>;

// ==========================================
// 13. moodle_update_quiz_question (T0909)
// ==========================================

const UpdateQuestionBase = z.object({
  question_bank_entry_id: z.number().int().positive('question_bank_entry_id must be a positive integer'),
  activity_id: z.number().int().positive().optional(),
  max_mark: z.number().positive().optional(),
  expected_version: z.number().int().positive().optional(),
  name: z.string().trim().min(1, 'name must not be empty').optional(),
  question_text: z.string().trim().min(1, 'question_text must not be empty').optional(),
  default_mark: z.number().positive('default_mark must be a positive number').optional(),
  general_feedback: z.string().optional(),
});

export const UpdateQuizQuestionInputSchema = z.union([
  // 1. Metadata-only update (no qtype, no options)
  UpdateQuestionBase
    .strict()
    .refine(
      (data) =>
        data.name !== undefined ||
        data.question_text !== undefined ||
        data.default_mark !== undefined ||
        data.general_feedback !== undefined,
      { message: 'At least one question field must be provided for metadata-only update' }
    ),
  // 2. Multichoice update (options required)
  UpdateQuestionBase.extend({
    qtype: z.literal('multichoice'),
    options: MultichoiceOptionsSchema,
  }).strict(),
  // 3. True/False update (options required)
  UpdateQuestionBase.extend({
    qtype: z.literal('truefalse'),
    options: TrueFalseOptionsSchema,
  }).strict(),
  // 4. Short Answer update (options required)
  UpdateQuestionBase.extend({
    qtype: z.literal('shortanswer'),
    options: ShortAnswerOptionsSchema,
  }).strict(),
  // 5. Essay update (options required per Phase 8 remediation P8-F3)
  UpdateQuestionBase.extend({
    qtype: z.literal('essay'),
    options: EssayOptionsSchema,
  }).strict(),
]);
export type UpdateQuizQuestionInput = z.infer<typeof UpdateQuizQuestionInputSchema>;

// ==========================================
// 14. moodle_add_question_to_quiz (T0909)
// ==========================================

export const AddQuestionToQuizInputSchema = z
  .object({
    activity_id: z.number().int().positive('activity_id must be a positive integer'),
    question_bank_entry_id: z.number().int().positive('question_bank_entry_id must be a positive integer'),
    page: z.number().int().positive('page must be an integer >= 1').optional(),
    max_mark: z.number().positive('max_mark must be a positive number').optional(),
  })
  .strict();
export type AddQuestionToQuizInput = z.infer<typeof AddQuestionToQuizInputSchema>;

// Ticket 24 — Moodle-native Competency tools.
export const ListCompetencyFrameworksInputSchema = z.object({}).strict();
export const CreateCompetencyInputSchema = z.object({
  framework_id: z.number().int().positive(),
  idnumber: z.string().trim().min(1),
  shortname: z.string().trim().min(1),
  description: z.string(),
}).strict();
export const AddCompetencyToCourseInputSchema = z.object({ course_id: z.number().int().positive(), competency_id: z.number().int().positive() }).strict();
export const AddCompetencyToActivityInputSchema = z.object({ activity_id: z.number().int().positive(), competency_id: z.number().int().positive(), rule_outcome: z.enum(['none', 'evidence']) }).strict();
export const GetCourseCompetenciesInputSchema = z.object({ course_id: z.number().int().positive() }).strict();
