import { z } from 'zod';

// ==========================================
// Zod Data Output Schemas for all 14 MCP tools
// ==========================================

export const MoodleCategoryDataSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    idnumber: z.string(),
    description: z.string(),
    parent: z.number(),
    coursecount: z.number(),
    visible: z.number(),
  })
  .strict();

export const ListCourseCategoriesDataSchema = z.array(MoodleCategoryDataSchema);

export const CreateCourseDataSchema = z
  .object({
    course_id: z.number(),
    fullname: z.string(),
    shortname: z.string(),
    category_id: z.number(),
    visible: z.number(),
    format: z.string(),
  })
  .strict();

export const CreateSectionDataSchema = z
  .object({
    section_id: z.number(),
    section_num: z.number(),
    name: z.string(),
    summary: z.string(),
  })
  .strict();

export const CreateAssignmentDataSchema = z
  .object({
    activity_id: z.number(),
    assignment_id: z.number(),
    name: z.string(),
    section_id: z.number(),
    grade: z.number(),
  })
  .strict();

export const AssignmentDetailsDataSchema = z
  .object({
    activity_id: z.number(),
    assignment_id: z.number(),
    course_id: z.number(),
    section_id: z.number(),
    name: z.string(),
    intro: z.string(),
    intro_format: z.number(),
    grade: z.number(),
    due_date: z.number(),
    online_text_enabled: z.number(),
    file_enabled: z.number(),
  })
  .strict();

export const UpdateAssignmentDataSchema = z
  .object({
    activity_id: z.number(),
    assignment_id: z.number(),
    name: z.string(),
    intro: z.string(),
    grade: z.number(),
  })
  .strict();

export const CreateQuizDataSchema = z
  .object({
    activity_id: z.number(),
    quiz_id: z.number(),
    name: z.string(),
    section_id: z.number(),
    grade: z.number(),
  })
  .strict();

export const QuizDetailsDataSchema = z
  .object({
    activity_id: z.number(),
    quiz_id: z.number(),
    course_id: z.number(),
    name: z.string(),
    intro: z.string(),
    grade: z.number(),
    preferredbehaviour: z.string(),
    attempts: z.number(),
    shuffleanswers: z.number(),
    questions_count: z.number(),
    sumgrades: z.number(),
  })
  .strict();

export const UpdateQuizDataSchema = z
  .object({
    activity_id: z.number(),
    quiz_id: z.number(),
    name: z.string(),
    intro: z.string(),
  })
  .strict();

export const QuizQuestionAnswerDataSchema = z
  .object({
    id: z.number(),
    text: z.string(),
    fraction: z.number(),
    feedback: z.string(),
  })
  .strict();

export const QuizQuestionSlotDataSchema = z
  .object({
    slot_id: z.number(),
    slot_number: z.number(),
    page: z.number(),
    max_mark: z.number(),
    question_bank_entry_id: z.number(),
    question_id: z.number(),
    version: z.number(),
    name: z.string(),
    qtype: z.enum(['multichoice', 'truefalse', 'shortanswer', 'essay']),
    question_text: z.string(),
    default_mark: z.number(),
    answers: z.array(QuizQuestionAnswerDataSchema),
  })
  .strict();

export const GetQuizQuestionsDataSchema = z.array(QuizQuestionSlotDataSchema);

export const CreatedQuestionDataSchema = z
  .object({
    question_bank_entry_id: z.number(),
    question_id: z.number(),
    version: z.number(),
    name: z.string(),
    qtype: z.enum(['multichoice', 'truefalse', 'shortanswer', 'essay']),
    default_mark: z.number(),
    category_id: z.number(),
  })
  .strict();

export const UpdatedQuestionDataSchema = z
  .object({
    question_bank_entry_id: z.number(),
    previous_question_id: z.number(),
    question_id: z.number(),
    version: z.number(),
    name: z.string(),
    qtype: z.enum(['multichoice', 'truefalse', 'shortanswer', 'essay']),
    default_mark: z.number(),
  })
  .strict();

export const AddedQuestionSlotDataSchema = z
  .object({
    slot_id: z.number(),
    activity_id: z.number(),
    quiz_id: z.number(),
    question_bank_entry_id: z.number(),
    question_id: z.number(),
    slot_number: z.number(),
    page: z.number(),
    max_mark: z.number(),
  })
  .strict();

export const StructureActivityDataSchema = z
  .object({
    activity_id: z.number(),
    instance_id: z.number(),
    module_name: z.string(),
    name: z.string(),
    intro: z.string(),
    grade: z.number(),
  })
  .strict();

export const StructureSectionDataSchema = z
  .object({
    section_id: z.number(),
    section_num: z.number(),
    name: z.string(),
    summary: z.string(),
    activities: z.array(StructureActivityDataSchema),
  })
  .strict();

export const CourseStructureDataSchema = z
  .object({
    course: z
      .object({
        id: z.number(),
        fullname: z.string(),
        shortname: z.string(),
        category_id: z.number(),
        visible: z.number(),
      })
      .strict(),
    sections: z.array(StructureSectionDataSchema),
  })
  .strict();

// Generic success structured envelope schema builder
export function createSuccessEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z
    .object({
      status: z.literal('success'),
      data: dataSchema,
    })
    .strict();
}

// ==========================================
// Enveloped Output Schemas registered with McpServer
// ==========================================

export const ListCourseCategoriesOutputSchema = createSuccessEnvelopeSchema(ListCourseCategoriesDataSchema);
export const CreateCourseOutputSchema = createSuccessEnvelopeSchema(CreateCourseDataSchema);
export const CreateSectionOutputSchema = createSuccessEnvelopeSchema(CreateSectionDataSchema);
export const CreateAssignmentOutputSchema = createSuccessEnvelopeSchema(CreateAssignmentDataSchema);
export const AssignmentDetailsOutputSchema = createSuccessEnvelopeSchema(AssignmentDetailsDataSchema);
export const UpdateAssignmentOutputSchema = createSuccessEnvelopeSchema(UpdateAssignmentDataSchema);
export const CreateQuizOutputSchema = createSuccessEnvelopeSchema(CreateQuizDataSchema);
export const QuizDetailsOutputSchema = createSuccessEnvelopeSchema(QuizDetailsDataSchema);
export const UpdateQuizOutputSchema = createSuccessEnvelopeSchema(UpdateQuizDataSchema);
export const GetQuizQuestionsOutputSchema = createSuccessEnvelopeSchema(GetQuizQuestionsDataSchema);
export const CreatedQuestionOutputSchema = createSuccessEnvelopeSchema(CreatedQuestionDataSchema);
export const UpdatedQuestionOutputSchema = createSuccessEnvelopeSchema(UpdatedQuestionDataSchema);
export const AddedQuestionSlotOutputSchema = createSuccessEnvelopeSchema(AddedQuestionSlotDataSchema);
export const CourseStructureOutputSchema = createSuccessEnvelopeSchema(CourseStructureDataSchema);

export const McpErrorEnvelopeSchema = z
  .object({
    status: z.literal('error'),
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .strict();
