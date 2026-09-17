import type {
  AddQuestionToQuizParams,
  CreateAssignmentParams,
  CreateCourseParams,
  CreateQuizParams,
  CreateQuizQuestionParams,
  CreateResourceParams,
  CreateCompetencyParams,
  AddCompetencyToCourseParams,
  AddCompetencyToActivityParams,
  CreateSectionParams,
  EssayQuestionOptions,
  MultichoiceQuestionOptions,
  QuestionOptions,
  ShortAnswerQuestionOptions,
  SupportedQuestionType,
  TrueFalseQuestionOptions,
  UpdateAssignmentParams,
  UpdateQuizParams,
  UpdateQuizQuestionParams,
} from './types.js';

/**
 * Appends a key-value pair to URLSearchParams only if the value is defined and not null (R10).
 * Preserves false booleans and 0 numbers.
 */
export function appendDefined(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value === 'boolean') {
    params.append(key, value ? '1' : '0');
    return;
  }
  params.append(key, String(value));
}

/**
 * Serializes typed TypeScript question options into Moodle's internal qtype_options_json string (P8-D2, R3).
 */
export function serializeQuestionOptions(
  qtype: SupportedQuestionType,
  options?: QuestionOptions
): string {
  if (!options) {
    return '{}';
  }

  switch (qtype) {
    case 'multichoice': {
      const mcq = options as MultichoiceQuestionOptions;
      const choices = (mcq.choices || []).map((c) => ({
        text: c.text,
        fraction: c.fraction,
        ...(c.feedback !== undefined && c.feedback !== null ? { feedback: c.feedback } : {}),
      }));
      return JSON.stringify({
        choices,
        shuffleanswers: mcq.shuffleAnswers !== undefined ? (mcq.shuffleAnswers ? 1 : 0) : 1,
        single: mcq.single !== undefined ? (mcq.single ? 1 : 1) : 1,
      });
    }

    case 'truefalse': {
      const tf = options as TrueFalseQuestionOptions;
      return JSON.stringify({
        correct_answer: Boolean(tf.correctAnswer),
        ...(tf.feedbackTrue !== undefined && tf.feedbackTrue !== null ? { feedback_true: tf.feedbackTrue } : {}),
        ...(tf.feedbackFalse !== undefined && tf.feedbackFalse !== null ? { feedback_false: tf.feedbackFalse } : {}),
      });
    }

    case 'shortanswer': {
      const sa = options as ShortAnswerQuestionOptions;
      return JSON.stringify({
        accepted_answers: sa.acceptedAnswers || [],
        ...(sa.caseSensitive !== undefined && sa.caseSensitive !== null
          ? { case_sensitive: sa.caseSensitive ? 1 : 0 }
          : {}),
        ...(sa.feedback !== undefined && sa.feedback !== null ? { feedback: sa.feedback } : {}),
      });
    }

    case 'essay': {
      const essay = options as EssayQuestionOptions;
      const payload: Record<string, unknown> = {};
      if (essay.gradingGuidance !== undefined && essay.gradingGuidance !== null) {
        payload.grading_guidance = essay.gradingGuidance;
      }
      if (essay.responseFormat !== undefined && essay.responseFormat !== null) {
        payload.response_format = essay.responseFormat;
      }
      if (essay.minWordLimit !== undefined && essay.minWordLimit !== null) {
        payload.min_word_limit = essay.minWordLimit;
      }
      if (essay.maxWordLimit !== undefined && essay.maxWordLimit !== null) {
        payload.max_word_limit = essay.maxWordLimit;
      }
      return JSON.stringify(payload);
    }

    default:
      return '{}';
  }
}

export function serializeCreateCourseParams(params: CreateCourseParams): URLSearchParams {
  const form = new URLSearchParams();
  appendDefined(form, 'category_id', params.categoryId);
  appendDefined(form, 'fullname', params.fullname);
  appendDefined(form, 'shortname', params.shortname);
  appendDefined(form, 'summary', params.summary);
  appendDefined(form, 'format', params.format);
  return form;
}

export function serializeCreateSectionParams(params: CreateSectionParams): URLSearchParams {
  const form = new URLSearchParams();
  appendDefined(form, 'course_id', params.courseId);
  appendDefined(form, 'position', params.position);
  appendDefined(form, 'name', params.name);
  appendDefined(form, 'summary', params.summary);
  return form;
}

export function serializeCreateResourceParams(params: CreateResourceParams): URLSearchParams {
  const form = new URLSearchParams();
  appendDefined(form, 'course_id', params.courseId);
  appendDefined(form, 'section_id', params.sectionId);
  appendDefined(form, 'name', params.name);
  appendDefined(form, 'filename', params.filename);
  appendDefined(form, 'moodle_material_id', params.moodleMaterialId);
  appendDefined(form, 'source_run_id', params.sourceRunId);
  appendDefined(form, 'source_structure_revision', params.sourceStructureRevision);
  appendDefined(form, 'source_section_ref', params.sourceSectionRef);
  appendDefined(form, 'source_material_revision', params.sourceMaterialRevision);
  return form;
}

export function serializeCreateAssignmentParams(params: CreateAssignmentParams): URLSearchParams {
  const form = new URLSearchParams();
  appendDefined(form, 'course_id', params.courseId);
  appendDefined(form, 'section_id', params.sectionId);
  appendDefined(form, 'name', params.name);
  appendDefined(form, 'intro', params.intro);
  appendDefined(form, 'grade', params.grade);
  return form;
}

export function serializeUpdateAssignmentParams(params: UpdateAssignmentParams): URLSearchParams {
  const form = new URLSearchParams();
  appendDefined(form, 'activity_id', params.activityId);
  appendDefined(form, 'expected_course_id', params.expectedCourseId);
  appendDefined(form, 'expected_section_id', params.expectedSectionId);
  appendDefined(form, 'name', params.name);
  appendDefined(form, 'intro', params.intro);
  appendDefined(form, 'grade', params.grade);
  return form;
}

export function serializeCreateQuizParams(params: CreateQuizParams): URLSearchParams {
  const form = new URLSearchParams();
  appendDefined(form, 'course_id', params.courseId);
  appendDefined(form, 'section_id', params.sectionId);
  appendDefined(form, 'name', params.name);
  appendDefined(form, 'intro', params.intro);
  appendDefined(form, 'grade', params.grade);
  return form;
}

export function serializeUpdateQuizParams(params: UpdateQuizParams): URLSearchParams {
  const form = new URLSearchParams();
  appendDefined(form, 'activity_id', params.activityId);
  appendDefined(form, 'name', params.name);
  appendDefined(form, 'intro', params.intro);
  return form;
}

export function serializeCreateQuizQuestionParams(params: CreateQuizQuestionParams): URLSearchParams {
  const form = new URLSearchParams();
  appendDefined(form, 'activity_id', params.activityId);
  appendDefined(form, 'qtype', params.qtype);
  appendDefined(form, 'name', params.name);
  appendDefined(form, 'questiontext', params.questionText);
  appendDefined(form, 'defaultmark', params.defaultMark);
  appendDefined(form, 'generalfeedback', params.generalFeedback);

  const qtypeOptionsJson = serializeQuestionOptions(params.qtype, params.options);
  appendDefined(form, 'qtype_options_json', qtypeOptionsJson);

  return form;
}

export function serializeUpdateQuizQuestionParams(
  params: UpdateQuizQuestionParams
): URLSearchParams {
  const form = new URLSearchParams();
  appendDefined(form, 'question_bank_entry_id', params.questionBankEntryId);
  appendDefined(form, 'activity_id', params.activityId);
  appendDefined(form, 'maxmark', params.maxMark);
  appendDefined(form, 'expected_version', params.expectedVersion);
  appendDefined(form, 'name', params.name);
  appendDefined(form, 'questiontext', params.questionText);
  appendDefined(form, 'defaultmark', params.defaultMark);
  appendDefined(form, 'generalfeedback', params.generalFeedback);

  if (params.qtype && params.options) {
    const qtypeOptionsJson = serializeQuestionOptions(params.qtype, params.options);
    appendDefined(form, 'qtype_options_json', qtypeOptionsJson);
  }
  // Metadata-only updates omit qtype_options_json entirely

  return form;
}

export function serializeAddQuestionToQuizParams(params: AddQuestionToQuizParams): URLSearchParams {
  const form = new URLSearchParams();
  appendDefined(form, 'activity_id', params.activityId);
  appendDefined(form, 'question_bank_entry_id', params.questionBankEntryId);
  appendDefined(form, 'page', params.page);
  appendDefined(form, 'maxmark', params.maxMark);
  return form;
}

export function serializeCreateCompetencyParams(params: CreateCompetencyParams): URLSearchParams {
  const form = new URLSearchParams(); appendDefined(form, 'framework_id', params.frameworkId); appendDefined(form, 'idnumber', params.idnumber); appendDefined(form, 'shortname', params.shortname); appendDefined(form, 'description', params.description); return form;
}
export function serializeAddCompetencyToCourseParams(params: AddCompetencyToCourseParams): URLSearchParams { const form = new URLSearchParams(); appendDefined(form, 'course_id', params.courseId); appendDefined(form, 'competency_id', params.competencyId); return form; }
export function serializeAddCompetencyToActivityParams(params: AddCompetencyToActivityParams): URLSearchParams { const form = new URLSearchParams(); appendDefined(form, 'activity_id', params.activityId); appendDefined(form, 'competency_id', params.competencyId); appendDefined(form, 'rule_outcome', params.ruleOutcome); return form; }
