import { MoodleResponseError } from './errors.js';
import type {
  MoodleAddedQuestionSlot,
  MoodleAssignmentDetails,
  MoodleCategory,
  MoodleCourseFormat,
  MoodleCourseStructure,
  MoodleCreatedAssignment,
  MoodleCreatedCourse,
  MoodleCreatedQuestion,
  MoodleCreatedResource,
  MoodleCompetencyFramework,
  MoodleCreatedCompetency,
  MoodleCourseCompetencyLink,
  MoodleActivityCompetencyLink,
  MoodleCourseCompetencyReadback,
  MoodleCreatedQuiz,
  MoodleCreatedSection,
  MoodleQuizDetails,
  MoodleQuizQuestionAnswer,
  MoodleQuizQuestionSlot,
  MoodleStructureActivity,
  MoodleStructureSection,
  MoodleUpdatedAssignment,
  MoodleUpdatedQuestion,
  MoodleUpdatedQuiz,
  SupportedQuestionType,
} from './types.js';

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function expectNumber(val: unknown, fieldName: string): number {
  if (typeof val === 'number') {
    return val;
  }
  if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
    return Number(val);
  }
  throw new MoodleResponseError(`Expected number for '${fieldName}', received: ${typeof val}`);
}

function expectString(val: unknown, fieldName: string): string {
  if (typeof val === 'string') {
    return val;
  }
  if (typeof val === 'number') {
    return String(val);
  }
  throw new MoodleResponseError(`Expected string for '${fieldName}', received: ${typeof val}`);
}

function expectBoolean(val: unknown, fieldName: string): boolean {
  if (typeof val === 'boolean') return val;
  return expectBooleanFlag(val, fieldName);
}

function expectBooleanFlag(val: unknown, fieldName: string): boolean {
  const flag = expectNumber(val, fieldName);
  if (flag !== 0 && flag !== 1) throw new MoodleResponseError(`Expected 0 or 1 for '${fieldName}'.`);
  return flag === 1;
}

function expectQtype(val: unknown, fieldName: string): SupportedQuestionType {
  const str = expectString(val, fieldName);
  if (str === 'multichoice' || str === 'truefalse' || str === 'shortanswer' || str === 'essay') {
    return str;
  }
  throw new MoodleResponseError(`Invalid question type '${str}' for '${fieldName}'`);
}

export function parseCategories(raw: unknown): MoodleCategory[] {
  if (!Array.isArray(raw)) {
    throw new MoodleResponseError(`Expected array of categories, received: ${typeof raw}`);
  }
  return raw.map((item, idx) => {
    if (!isObject(item)) {
      throw new MoodleResponseError(`Category at index ${idx} is not an object`);
    }
    return {
      id: expectNumber(item.id, `categories[${idx}].id`),
      name: expectString(item.name, `categories[${idx}].name`),
      idnumber: typeof item.idnumber === 'string' ? item.idnumber : '',
      description: typeof item.description === 'string' ? item.description : '',
      parent: typeof item.parent !== 'undefined' ? expectNumber(item.parent, `categories[${idx}].parent`) : 0,
      coursecount: typeof item.coursecount !== 'undefined' ? expectNumber(item.coursecount, `categories[${idx}].coursecount`) : 0,
      visible: typeof item.visible !== 'undefined' ? expectNumber(item.visible, `categories[${idx}].visible`) : 1,
    };
  });
}

export function parseCourseFormats(raw: unknown): MoodleCourseFormat[] {
  if (!Array.isArray(raw)) {
    throw new MoodleResponseError(`Expected array of course formats, received: ${typeof raw}`);
  }
  return raw.map((item, idx) => {
    if (!isObject(item)) throw new MoodleResponseError(`Course format at index ${idx} is not an object`);
    return {
      value: expectString(item.value, `course_formats[${idx}].value`),
      name: expectString(item.name, `course_formats[${idx}].name`),
    };
  });
}

export function parseCreatedCourse(raw: unknown): MoodleCreatedCourse {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for created course response');
  }
  return {
    courseId: expectNumber(raw.course_id, 'course_id'),
    fullname: expectString(raw.fullname, 'fullname'),
    shortname: expectString(raw.shortname, 'shortname'),
    categoryId: expectNumber(raw.category_id, 'category_id'),
    visible: expectNumber(raw.visible, 'visible'),
    format: expectString(raw.format, 'format'),
  };
}

export function parseCreatedSection(raw: unknown): MoodleCreatedSection {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for created section response');
  }
  return {
    sectionId: expectNumber(raw.section_id, 'section_id'),
    sectionNum: expectNumber(raw.section_num, 'section_num'),
    name: expectString(raw.name, 'name'),
    summary: typeof raw.summary === 'string' ? raw.summary : '',
  };
}

export function parseCreatedResource(raw: unknown): MoodleCreatedResource {
  if (!isObject(raw)) throw new MoodleResponseError('Expected object for created resource response');
  return {
    activityId: expectNumber(raw.activity_id, 'activity_id'),
    resourceId: expectNumber(raw.resource_id, 'resource_id'),
    sectionId: expectNumber(raw.section_id, 'section_id'),
    name: expectString(raw.name, 'name'),
    filename: expectString(raw.filename, 'filename'),
    moodleMaterialId: expectNumber(raw.moodle_material_id, 'moodle_material_id'),
  };
}

export function parseCreatedAssignment(raw: unknown): MoodleCreatedAssignment {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for created assignment response');
  }
  return {
    activityId: expectNumber(raw.activity_id, 'activity_id'),
    assignmentId: expectNumber(raw.assignment_id, 'assignment_id'),
    name: expectString(raw.name, 'name'),
    sectionId: expectNumber(raw.section_id, 'section_id'),
    grade: expectNumber(raw.grade, 'grade'),
  };
}

export function parseAssignmentDetails(raw: unknown): MoodleAssignmentDetails {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for assignment details response');
  }
  return {
    activityId: expectNumber(raw.activity_id, 'activity_id'),
    assignmentId: expectNumber(raw.assignment_id, 'assignment_id'),
    courseId: expectNumber(raw.course_id, 'course_id'),
    sectionId: expectNumber(raw.section_id, 'section_id'),
    name: expectString(raw.name, 'name'),
    intro: typeof raw.intro === 'string' ? raw.intro : '',
    introFormat: typeof raw.introformat !== 'undefined' ? expectNumber(raw.introformat, 'introformat') : 1,
    grade: expectNumber(raw.grade, 'grade'),
    dueDate: typeof raw.duedate !== 'undefined' ? expectNumber(raw.duedate, 'duedate') : 0,
    onlineTextEnabled: typeof raw.onlinetext_enabled !== 'undefined' ? expectNumber(raw.onlinetext_enabled, 'onlinetext_enabled') : 0,
    fileEnabled: typeof raw.file_enabled !== 'undefined' ? expectNumber(raw.file_enabled, 'file_enabled') : 0,
  };
}

export function parseUpdatedAssignment(raw: unknown): MoodleUpdatedAssignment {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for updated assignment response');
  }
  return {
    activityId: expectNumber(raw.activity_id, 'activity_id'),
    assignmentId: expectNumber(raw.assignment_id, 'assignment_id'),
    name: expectString(raw.name, 'name'),
    intro: typeof raw.intro === 'string' ? raw.intro : '',
    grade: expectNumber(raw.grade, 'grade'),
  };
}

export function parseCreatedQuiz(raw: unknown): MoodleCreatedQuiz {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for created quiz response');
  }
  return {
    activityId: expectNumber(raw.activity_id, 'activity_id'),
    quizId: expectNumber(raw.quiz_id, 'quiz_id'),
    name: expectString(raw.name, 'name'),
    sectionId: expectNumber(raw.section_id, 'section_id'),
    grade: expectNumber(raw.grade, 'grade'),
  };
}

export function parseQuizDetails(raw: unknown): MoodleQuizDetails {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for quiz details response');
  }
  return {
    activityId: expectNumber(raw.activity_id, 'activity_id'),
    quizId: expectNumber(raw.quiz_id, 'quiz_id'),
    courseId: expectNumber(raw.course_id, 'course_id'),
    name: expectString(raw.name, 'name'),
    intro: typeof raw.intro === 'string' ? raw.intro : '',
    grade: expectNumber(raw.grade, 'grade'),
    preferredbehaviour: typeof raw.preferredbehaviour === 'string' ? raw.preferredbehaviour : 'deferredfeedback',
    attempts: typeof raw.attempts !== 'undefined' ? expectNumber(raw.attempts, 'attempts') : 0,
    shuffleanswers: typeof raw.shuffleanswers !== 'undefined' ? expectNumber(raw.shuffleanswers, 'shuffleanswers') : 1,
    questionsCount: typeof raw.questions_count !== 'undefined' ? expectNumber(raw.questions_count, 'questions_count') : 0,
    sumgrades: typeof raw.sumgrades !== 'undefined' ? expectNumber(raw.sumgrades, 'sumgrades') : 0,
  };
}

export function parseUpdatedQuiz(raw: unknown): MoodleUpdatedQuiz {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for updated quiz response');
  }
  return {
    activityId: expectNumber(raw.activity_id, 'activity_id'),
    quizId: expectNumber(raw.quiz_id, 'quiz_id'),
    name: expectString(raw.name, 'name'),
    intro: typeof raw.intro === 'string' ? raw.intro : '',
  };
}

export function parseQuizQuestionSlots(raw: unknown): MoodleQuizQuestionSlot[] {
  if (!Array.isArray(raw)) {
    throw new MoodleResponseError(`Expected array of quiz question slots, received: ${typeof raw}`);
  }
  return raw.map((slot, idx) => {
    if (!isObject(slot)) {
      throw new MoodleResponseError(`Quiz slot at index ${idx} is not an object`);
    }

    const answersRaw = Array.isArray(slot.answers) ? slot.answers : [];
    const answers: MoodleQuizQuestionAnswer[] = answersRaw.map((ans, aIdx) => {
      if (!isObject(ans)) {
        throw new MoodleResponseError(`Answer at slot[${idx}].answers[${aIdx}] is not an object`);
      }
      return {
        id: expectNumber(ans.id, `slot[${idx}].answers[${aIdx}].id`),
        text: typeof ans.text === 'string' ? ans.text : '',
        fraction: typeof ans.fraction !== 'undefined' ? expectNumber(ans.fraction, `slot[${idx}].answers[${aIdx}].fraction`) : 0,
        feedback: typeof ans.feedback === 'string' ? ans.feedback : '',
      };
    });

    return {
      slotId: expectNumber(slot.slot_id, `slots[${idx}].slot_id`),
      slotNumber: expectNumber(slot.slot_number, `slots[${idx}].slot_number`),
      page: expectNumber(slot.page, `slots[${idx}].page`),
      maxMark: expectNumber(slot.maxmark, `slots[${idx}].maxmark`),
      questionBankEntryId: expectNumber(slot.question_bank_entry_id, `slots[${idx}].question_bank_entry_id`),
      questionId: expectNumber(slot.question_id, `slots[${idx}].question_id`),
      version: expectNumber(slot.version, `slots[${idx}].version`),
      name: expectString(slot.name, `slots[${idx}].name`),
      qtype: expectQtype(slot.qtype, `slots[${idx}].qtype`),
      questionText: typeof slot.questiontext === 'string' ? slot.questiontext : '',
      defaultMark: expectNumber(slot.defaultmark, `slots[${idx}].defaultmark`),
      answers,
      ...(slot.generalfeedback !== undefined ? { generalFeedback: expectString(slot.generalfeedback, 'generalfeedback') } : {}),
      ...(slot.correct_answer !== undefined ? { correctAnswer: expectBooleanFlag(slot.correct_answer, 'correct_answer') } : {}),
      ...(slot.case_sensitive !== undefined ? { caseSensitive: expectBooleanFlag(slot.case_sensitive, 'case_sensitive') } : {}),
      ...(slot.grading_guidance !== undefined ? { gradingGuidance: expectString(slot.grading_guidance, 'grading_guidance') } : {}),
    };
  });
}

export function parseCreatedQuestion(raw: unknown): MoodleCreatedQuestion {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for created question response');
  }
  return {
    questionBankEntryId: expectNumber(raw.question_bank_entry_id, 'question_bank_entry_id'),
    questionId: expectNumber(raw.question_id, 'question_id'),
    version: expectNumber(raw.version, 'version'),
    name: expectString(raw.name, 'name'),
    qtype: expectQtype(raw.qtype, 'qtype'),
    defaultMark: expectNumber(raw.defaultmark, 'defaultmark'),
    categoryId: expectNumber(raw.category_id, 'category_id'),
  };
}

export function parseUpdatedQuestion(raw: unknown): MoodleUpdatedQuestion {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for updated question response');
  }
  return {
    questionBankEntryId: expectNumber(raw.question_bank_entry_id, 'question_bank_entry_id'),
    previousQuestionId: expectNumber(raw.previous_question_id, 'previous_question_id'),
    questionId: expectNumber(raw.question_id, 'question_id'),
    version: expectNumber(raw.version, 'version'),
    name: expectString(raw.name, 'name'),
    qtype: expectQtype(raw.qtype, 'qtype'),
    defaultMark: expectNumber(raw.defaultmark, 'defaultmark'),
  };
}

export function parseAddedQuestionSlot(raw: unknown): MoodleAddedQuestionSlot {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for added question slot response');
  }
  return {
    slotId: expectNumber(raw.slot_id, 'slot_id'),
    activityId: expectNumber(raw.activity_id, 'activity_id'),
    quizId: expectNumber(raw.quiz_id, 'quiz_id'),
    questionBankEntryId: expectNumber(raw.question_bank_entry_id, 'question_bank_entry_id'),
    questionId: expectNumber(raw.question_id, 'question_id'),
    slotNumber: expectNumber(raw.slot_number, 'slot_number'),
    page: expectNumber(raw.page, 'page'),
    maxMark: expectNumber(raw.maxmark, 'maxmark'),
  };
}

export function parseCourseStructure(raw: unknown): MoodleCourseStructure {
  if (!isObject(raw)) {
    throw new MoodleResponseError('Expected object for course structure response');
  }
  if (!isObject(raw.course)) {
    throw new MoodleResponseError("Missing or invalid 'course' object in course structure");
  }
  if (!Array.isArray(raw.sections)) {
    throw new MoodleResponseError("Missing or invalid 'sections' array in course structure");
  }

  const course = {
    id: expectNumber(raw.course.id, 'course.id'),
    fullname: expectString(raw.course.fullname, 'course.fullname'),
    shortname: expectString(raw.course.shortname, 'course.shortname'),
      categoryId: typeof raw.course.category_id !== 'undefined' ? expectNumber(raw.course.category_id, 'course.category_id') : 0,
      visible: typeof raw.course.visible !== 'undefined' ? expectNumber(raw.course.visible, 'course.visible') : 1,
      ...(typeof raw.course.format !== 'undefined' ? { format: expectString(raw.course.format, 'course.format') } : {}),
    };

  const sections: MoodleStructureSection[] = raw.sections.map((sec, sIdx) => {
    if (!isObject(sec)) {
      throw new MoodleResponseError(`Section at index ${sIdx} is not an object`);
    }
    const rawActivities = Array.isArray(sec.activities) ? sec.activities : [];
    const activities: MoodleStructureActivity[] = rawActivities.map((act, aIdx) => {
      if (!isObject(act)) {
        throw new MoodleResponseError(`Activity at section[${sIdx}].activities[${aIdx}] is not an object`);
      }
      return {
        activityId: expectNumber(act.activity_id, `section[${sIdx}].activities[${aIdx}].activity_id`),
        instanceId: expectNumber(act.instance_id, `section[${sIdx}].activities[${aIdx}].instance_id`),
        moduleName: expectString(act.modulename, `section[${sIdx}].activities[${aIdx}].modulename`),
        name: expectString(act.name, `section[${sIdx}].activities[${aIdx}].name`),
        intro: typeof act.intro === 'string' ? act.intro : '',
        grade: typeof act.grade !== 'undefined' ? expectNumber(act.grade, `section[${sIdx}].activities[${aIdx}].grade`) : 100,
        ...(Array.isArray(act.files) ? { files: act.files.map((file, fileIdx) => expectString(file, `section[${sIdx}].activities[${aIdx}].files[${fileIdx}]`)) } : {}),
      };
    });

    return {
      sectionId: expectNumber(sec.section_id, `sections[${sIdx}].section_id`),
      sectionNum: expectNumber(sec.section_num, `sections[${sIdx}].section_num`),
      name: expectString(sec.name, `sections[${sIdx}].name`),
      summary: typeof sec.summary === 'string' ? sec.summary : '',
      activities,
    };
  });

  return { course, sections };
}

export function parseCompetencyFrameworks(raw: unknown): MoodleCompetencyFramework[] {
  if (!Array.isArray(raw)) throw new MoodleResponseError('Expected array of competency frameworks');
  return raw.map((item, idx) => { if (!isObject(item)) throw new MoodleResponseError('Invalid competency framework'); return { frameworkId: expectNumber(item.framework_id, `frameworks[${idx}].framework_id`), shortname: expectString(item.shortname, 'shortname'), idnumber: expectString(item.idnumber, 'idnumber'), visible: expectBoolean(item.visible, 'visible'), canManage: expectBoolean(item.can_manage, 'can_manage') }; });
}
export function parseCreatedCompetency(raw: unknown): MoodleCreatedCompetency { if (!isObject(raw)) throw new MoodleResponseError('Expected created competency object'); return { competencyId: expectNumber(raw.competency_id,'competency_id'), frameworkId: expectNumber(raw.framework_id,'framework_id'), idnumber: expectString(raw.idnumber,'idnumber'), shortname: expectString(raw.shortname,'shortname'), created: expectBoolean(raw.created,'created') }; }
export function parseCourseCompetencyLink(raw: unknown): MoodleCourseCompetencyLink { if (!isObject(raw)) throw new MoodleResponseError('Expected course competency link object'); return { courseId: expectNumber(raw.course_id,'course_id'), competencyId: expectNumber(raw.competency_id,'competency_id'), linked: expectBoolean(raw.linked,'linked') }; }
export function parseActivityCompetencyLink(raw: unknown): MoodleActivityCompetencyLink { if (!isObject(raw)) throw new MoodleResponseError('Expected activity competency link object'); return { linkId: expectNumber(raw.link_id,'link_id'), activityId: expectNumber(raw.activity_id,'activity_id'), competencyId: expectNumber(raw.competency_id,'competency_id'), ruleOutcome: expectNumber(raw.rule_outcome,'rule_outcome') }; }
export function parseCourseCompetencyReadback(raw: unknown): MoodleCourseCompetencyReadback {
  if (!isObject(raw) || !Array.isArray(raw.course_competencies) || !Array.isArray(raw.activity_links)) throw new MoodleResponseError('Expected course competency readback object');
  return { courseId: expectNumber(raw.course_id,'course_id'), courseCompetencies: raw.course_competencies.map((item,idx) => { if(!isObject(item)) throw new MoodleResponseError('Invalid course competency row'); return { courseLinkId: expectNumber(item.course_link_id,`course_competencies[${idx}].course_link_id`), competencyId: expectNumber(item.competency_id,'competency_id'), frameworkId: expectNumber(item.framework_id,'framework_id'), idnumber: expectString(item.idnumber,'idnumber'), shortname: expectString(item.shortname,'shortname') }; }), activityLinks: raw.activity_links.map((item,idx) => { if(!isObject(item)) throw new MoodleResponseError('Invalid activity competency row'); return { linkId: expectNumber(item.link_id,`activity_links[${idx}].link_id`), activityId: expectNumber(item.activity_id,'activity_id'), competencyId: expectNumber(item.competency_id,'competency_id'), ruleOutcome: expectNumber(item.rule_outcome,'rule_outcome') }; }) };
}
