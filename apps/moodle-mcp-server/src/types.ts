/**
 * Normalized types for @moodle-agent-poc/moodle-mcp-server
 */

export interface McpSuccessPayload<T = unknown> {
  status: 'success';
  data: T;
}

export interface McpErrorPayload {
  status: 'error';
  code: string;
  message: string;
  details?: unknown;
}

export type McpResultPayload<T = unknown> = McpSuccessPayload<T> | McpErrorPayload;

export interface MoodleCategoryMcpData {
  id: number;
  name: string;
  idnumber: string;
  description: string;
  parent: number;
  coursecount: number;
  visible: number;
}

export interface MoodleCourseFormatMcpData {
  value: string;
  name: string;
}

export interface MoodleCreatedCourseMcpData {
  course_id: number;
  fullname: string;
  shortname: string;
  category_id: number;
  visible: number;
  format: string;
}

export interface MoodleCreatedSectionMcpData {
  section_id: number;
  section_num: number;
  name: string;
  summary: string;
}

export interface MoodleCreatedResourceMcpData {
  activity_id: number;
  resource_id: number;
  section_id: number;
  name: string;
  filename: string;
  moodle_material_id: number;
}

export interface MoodleCreatedAssignmentMcpData {
  activity_id: number;
  assignment_id: number;
  name: string;
  section_id: number;
  grade: number;
}

export interface MoodleAssignmentDetailsMcpData {
  activity_id: number;
  assignment_id: number;
  course_id: number;
  section_id: number;
  name: string;
  intro: string;
  intro_format: number;
  grade: number;
  due_date: number;
  online_text_enabled: number;
  file_enabled: number;
}

export interface MoodleUpdatedAssignmentMcpData {
  activity_id: number;
  assignment_id: number;
  name: string;
  intro: string;
  grade: number;
}

export interface MoodleCreatedQuizMcpData {
  activity_id: number;
  quiz_id: number;
  name: string;
  section_id: number;
  grade: number;
}

export interface MoodleQuizDetailsMcpData {
  activity_id: number;
  quiz_id: number;
  course_id: number;
  name: string;
  intro: string;
  grade: number;
  preferredbehaviour: string;
  attempts: number;
  shuffleanswers: number;
  questions_count: number;
  sumgrades: number;
}

export interface MoodleUpdatedQuizMcpData {
  activity_id: number;
  quiz_id: number;
  name: string;
  intro: string;
}

export interface MoodleQuizQuestionAnswerMcpData {
  id: number;
  text: string;
  fraction: number;
  feedback: string;
}

export interface MoodleQuizQuestionSlotMcpData {
  slot_id: number;
  slot_number: number;
  page: number;
  max_mark: number;
  question_bank_entry_id: number;
  question_id: number;
  version: number;
  name: string;
  qtype: 'multichoice' | 'truefalse' | 'shortanswer' | 'essay';
  question_text: string;
  default_mark: number;
  answers: MoodleQuizQuestionAnswerMcpData[];
  general_feedback?: string;
  correct_answer?: boolean;
  case_sensitive?: boolean;
  grading_guidance?: string;
}

export interface MoodleCreatedQuestionMcpData {
  question_bank_entry_id: number;
  question_id: number;
  version: number;
  name: string;
  qtype: 'multichoice' | 'truefalse' | 'shortanswer' | 'essay';
  default_mark: number;
  category_id: number;
}

export interface MoodleUpdatedQuestionMcpData {
  question_bank_entry_id: number;
  previous_question_id: number;
  question_id: number;
  version: number;
  name: string;
  qtype: 'multichoice' | 'truefalse' | 'shortanswer' | 'essay';
  default_mark: number;
}

export interface MoodleAddedQuestionSlotMcpData {
  slot_id: number;
  activity_id: number;
  quiz_id: number;
  question_bank_entry_id: number;
  question_id: number;
  slot_number: number;
  page: number;
  max_mark: number;
}

export interface MoodleStructureActivityMcpData {
  activity_id: number;
  instance_id: number;
  module_name: string;
  name: string;
  intro: string;
  grade: number;
  files?: string[];
}

export interface MoodleStructureSectionMcpData {
  section_id: number;
  section_num: number;
  name: string;
  summary: string;
  activities: MoodleStructureActivityMcpData[];
}

export interface MoodleCourseStructureMcpData {
  course: {
    id: number;
    fullname: string;
    shortname: string;
    category_id: number;
    visible: number;
    format?: string;
  };
  sections: MoodleStructureSectionMcpData[];
}
