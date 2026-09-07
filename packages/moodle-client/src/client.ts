import { MoodleHttpClient } from './http.js';
import {
  parseAddedQuestionSlot,
  parseAssignmentDetails,
  parseCategories,
  parseCourseStructure,
  parseCreatedAssignment,
  parseCreatedCourse,
  parseCreatedQuestion,
  parseCreatedQuiz,
  parseCreatedSection,
  parseQuizDetails,
  parseQuizQuestionSlots,
  parseUpdatedAssignment,
  parseUpdatedQuestion,
  parseUpdatedQuiz,
} from './response-validators.js';
import {
  appendDefined,
  serializeAddQuestionToQuizParams,
  serializeCreateAssignmentParams,
  serializeCreateCourseParams,
  serializeCreateQuizParams,
  serializeCreateQuizQuestionParams,
  serializeCreateSectionParams,
  serializeUpdateAssignmentParams,
  serializeUpdateQuizParams,
  serializeUpdateQuizQuestionParams,
} from './serializers.js';
import type {
  AddQuestionToQuizParams,
  CreateAssignmentParams,
  CreateCourseParams,
  CreateQuizParams,
  CreateQuizQuestionParams,
  CreateSectionParams,
  MoodleAddedQuestionSlot,
  MoodleAssignmentDetails,
  MoodleCategory,
  MoodleClientConfig,
  MoodleCourseStructure,
  MoodleCreatedAssignment,
  MoodleCreatedCourse,
  MoodleCreatedQuestion,
  MoodleCreatedQuiz,
  MoodleCreatedSection,
  MoodleQuizDetails,
  MoodleQuizQuestionSlot,
  MoodleUpdatedAssignment,
  MoodleUpdatedQuestion,
  MoodleUpdatedQuiz,
  UpdateAssignmentParams,
  UpdateQuizParams,
  UpdateQuizQuestionParams,
} from './types.js';

export class MoodleClient {
  private readonly http: MoodleHttpClient;

  constructor(config: MoodleClientConfig) {
    this.http = new MoodleHttpClient(config);
  }

  /**
   * List course categories accessible to the configured token (T0702, R16).
   */
  async listCourseCategories(): Promise<MoodleCategory[]> {
    const raw = await this.http.post('local_agentpoc_list_course_categories');
    return parseCategories(raw);
  }

  /**
   * Create a hidden course with required shortname (T0703, R8, P7-D5).
   */
  async createCourse(params: CreateCourseParams): Promise<MoodleCreatedCourse> {
    const form = serializeCreateCourseParams(params);
    const raw = await this.http.post('local_agentpoc_create_course', form);
    return parseCreatedCourse(raw);
  }

  /**
   * Create a section within a course returning distinct section_id and section_num (T0704, R7).
   */
  async createSection(params: CreateSectionParams): Promise<MoodleCreatedSection> {
    const form = serializeCreateSectionParams(params);
    const raw = await this.http.post('local_agentpoc_create_section', form);
    return parseCreatedSection(raw);
  }

  /**
   * Retrieve the complete hierarchical course tree (T0705).
   */
  async getCourseStructure(courseId: number): Promise<MoodleCourseStructure> {
    const form = new URLSearchParams();
    appendDefined(form, 'course_id', courseId);
    const raw = await this.http.post('local_agentpoc_get_course_structure', form);
    return parseCourseStructure(raw);
  }

  /**
   * Create an assignment with frozen defaults via can_add_moduleinfo (T0706, R14, P7-R2).
   */
  async createAssignment(params: CreateAssignmentParams): Promise<MoodleCreatedAssignment> {
    const form = serializeCreateAssignmentParams(params);
    const raw = await this.http.post('local_agentpoc_create_assignment', form);
    return parseCreatedAssignment(raw);
  }

  /**
   * Retrieve assignment details by canonical activity_id (CMID) (T0708, P7-D2).
   */
  async getAssignment(activityId: number): Promise<MoodleAssignmentDetails> {
    const form = new URLSearchParams();
    appendDefined(form, 'activity_id', activityId);
    const raw = await this.http.post('local_agentpoc_get_assignment', form);
    return parseAssignmentDetails(raw);
  }

  /**
   * Update assignment metadata or maximum grade (T0709).
   */
  async updateAssignment(params: UpdateAssignmentParams): Promise<MoodleUpdatedAssignment> {
    const form = serializeUpdateAssignmentParams(params);
    const raw = await this.http.post('local_agentpoc_update_assignment', form);
    return parseUpdatedAssignment(raw);
  }

  /**
   * Create a quiz with frozen defaults via can_add_moduleinfo (T0710, R15, P7-R2).
   */
  async createQuiz(params: CreateQuizParams): Promise<MoodleCreatedQuiz> {
    const form = serializeCreateQuizParams(params);
    const raw = await this.http.post('local_agentpoc_create_quiz', form);
    return parseCreatedQuiz(raw);
  }

  /**
   * Retrieve quiz metadata by canonical activity_id (CMID) (T0711, P7-D2).
   */
  async getQuiz(activityId: number): Promise<MoodleQuizDetails> {
    const form = new URLSearchParams();
    appendDefined(form, 'activity_id', activityId);
    const raw = await this.http.post('local_agentpoc_get_quiz', form);
    return parseQuizDetails(raw);
  }

  /**
   * Update quiz metadata (T0712).
   */
  async updateQuiz(params: UpdateQuizParams): Promise<MoodleUpdatedQuiz> {
    const form = serializeUpdateQuizParams(params);
    const raw = await this.http.post('local_agentpoc_update_quiz', form);
    return parseUpdatedQuiz(raw);
  }

  /**
   * Retrieve questions in a quiz with bank entry, version, and choices (T0713, P7-R1).
   */
  async getQuizQuestions(activityId: number): Promise<MoodleQuizQuestionSlot[]> {
    const form = new URLSearchParams();
    appendDefined(form, 'activity_id', activityId);
    const raw = await this.http.post('local_agentpoc_get_quiz_questions', form);
    return parseQuizQuestionSlots(raw);
  }

  /**
   * Create a question in the Quiz activity context category (T0714-T0717, P7-D3, P8-D2).
   */
  async createQuizQuestion(params: CreateQuizQuestionParams): Promise<MoodleCreatedQuestion> {
    const form = serializeCreateQuizQuestionParams(params);
    const raw = await this.http.post('local_agentpoc_create_quiz_question', form);
    return parseCreatedQuestion(raw);
  }

  /**
   * Update a question under an existing Question Bank Entry creating version N+1 (T0719, P7-D4).
   */
  async updateQuizQuestion(
    params: UpdateQuizQuestionParams
  ): Promise<MoodleUpdatedQuestion> {
    const form = serializeUpdateQuizQuestionParams(params);
    const raw = await this.http.post('local_agentpoc_update_quiz_question', form);
    return parseUpdatedQuestion(raw);
  }

  /**
   * Add a question to a quiz using question_bank_entry_id (T0718, P7-R3, P7-R4).
   */
  async addQuestionToQuiz(params: AddQuestionToQuizParams): Promise<MoodleAddedQuestionSlot> {
    const form = serializeAddQuestionToQuizParams(params);
    const raw = await this.http.post('local_agentpoc_add_question_to_quiz', form);
    return parseAddedQuestionSlot(raw);
  }
}
