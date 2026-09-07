import {
  MoodleClient,
  MoodleConflictError,
  MoodleResourceNotFoundError,
} from '@moodle-agent-poc/moodle-client';
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
} from '@moodle-agent-poc/moodle-client';

export interface StoredQuestion {
  questionBankEntryId: number;
  questionId: number;
  version: number;
  name: string;
  qtype: 'multichoice' | 'truefalse' | 'shortanswer' | 'essay';
  defaultMark: number;
  categoryId: number;
  questionText: string;
  answers: Array<{ id: number; text: string; fraction: number; feedback: string }>;
}

/**
 * Deterministic In-Memory Stub of MoodleClient for hermetic Phase 9 MCP testing.
 */
export class FakeMoodleClient extends MoodleClient {
  private nextId = 100;
  
  public categories: MoodleCategory[] = [
    {
      id: 1,
      name: 'Miscellaneous',
      idnumber: 'MISC',
      description: 'Default category',
      parent: 0,
      coursecount: 1,
      visible: 1,
    },
    {
      id: 2,
      name: 'Computer Science',
      idnumber: 'CS',
      description: 'CS Courses',
      parent: 0,
      coursecount: 0,
      visible: 1,
    },
  ];

  public courses: Map<number, MoodleCreatedCourse & { summary?: string }> = new Map();
  public sections: Map<number, MoodleCreatedSection & { courseId: number }> = new Map();
  public assignments: Map<number, MoodleAssignmentDetails> = new Map();
  public quizzes: Map<number, MoodleQuizDetails & { sectionId: number }> = new Map();
  public questions: Map<number, StoredQuestion> = new Map();
  public quizSlots: Map<number, MoodleQuizQuestionSlot[]> = new Map(); // activityId -> slots

  constructor() {
    super({ baseUrl: 'http://fake-moodle.local', token: 'fake-token-12345' });
  }

  override async listCourseCategories(): Promise<MoodleCategory[]> {
    return [...this.categories];
  }

  override async createCourse(params: CreateCourseParams): Promise<MoodleCreatedCourse> {
    const courseId = ++this.nextId;
    const course: MoodleCreatedCourse & { summary?: string } = {
      courseId,
      fullname: params.fullname,
      shortname: params.shortname,
      categoryId: params.categoryId,
      visible: 0,
      format: params.format || 'topics',
      summary: params.summary,
    };
    this.courses.set(courseId, course);
    return {
      courseId,
      fullname: course.fullname,
      shortname: course.shortname,
      categoryId: course.categoryId,
      visible: course.visible,
      format: course.format,
    };
  }

  override async createSection(params: CreateSectionParams): Promise<MoodleCreatedSection> {
    const sectionId = ++this.nextId;
    const section: MoodleCreatedSection & { courseId: number } = {
      sectionId,
      sectionNum: params.position,
      name: params.name,
      summary: params.summary || '',
      courseId: params.courseId,
    };
    this.sections.set(sectionId, section);
    return {
      sectionId,
      sectionNum: section.sectionNum,
      name: section.name,
      summary: section.summary,
    };
  }

  override async getCourseStructure(courseId: number): Promise<MoodleCourseStructure> {
    const course = this.courses.get(courseId);
    if (!course) {
      throw new MoodleResourceNotFoundError(`Course ${courseId} not found`);
    }

    const courseSections: MoodleCreatedSection[] = Array.from(this.sections.values())
      .filter((s) => s.courseId === courseId)
      .sort((a, b) => a.sectionNum - b.sectionNum);

    const sectionsWithActivities = courseSections.map((s) => {
      const activities: Array<{
        activityId: number;
        instanceId: number;
        moduleName: string;
        name: string;
        intro: string;
        grade: number;
      }> = [];

      for (const a of this.assignments.values()) {
        if (a.courseId === courseId && a.sectionId === s.sectionId) {
          activities.push({
            activityId: a.activityId,
            instanceId: a.assignmentId,
            moduleName: 'assign',
            name: a.name,
            intro: a.intro,
            grade: a.grade,
          });
        }
      }

      for (const q of this.quizzes.values()) {
        if (q.courseId === courseId && q.sectionId === s.sectionId) {
          activities.push({
            activityId: q.activityId,
            instanceId: q.quizId,
            moduleName: 'quiz',
            name: q.name,
            intro: q.intro,
            grade: q.grade,
          });
        }
      }

      return {
        sectionId: s.sectionId,
        sectionNum: s.sectionNum,
        name: s.name,
        summary: s.summary,
        activities,
      };
    });

    return {
      course: {
        id: course.courseId,
        fullname: course.fullname,
        shortname: course.shortname,
        categoryId: course.categoryId,
        visible: course.visible,
      },
      sections: sectionsWithActivities,
    };
  }

  override async createAssignment(params: CreateAssignmentParams): Promise<MoodleCreatedAssignment> {
    const activityId = ++this.nextId;
    const assignmentId = ++this.nextId;
    const grade = params.grade ?? 100;

    const assignment: MoodleAssignmentDetails = {
      activityId,
      assignmentId,
      courseId: params.courseId,
      sectionId: params.sectionId,
      name: params.name,
      intro: params.intro,
      introFormat: 1,
      grade,
      dueDate: 0,
      onlineTextEnabled: 1,
      fileEnabled: 0,
    };

    this.assignments.set(activityId, assignment);

    return {
      activityId,
      assignmentId,
      name: assignment.name,
      sectionId: assignment.sectionId,
      grade: assignment.grade,
    };
  }

  override async getAssignment(activityId: number): Promise<MoodleAssignmentDetails> {
    const assignment = this.assignments.get(activityId);
    if (!assignment) {
      throw new MoodleResourceNotFoundError(`Assignment activity ${activityId} not found`);
    }
    return { ...assignment };
  }

  override async updateAssignment(params: UpdateAssignmentParams): Promise<MoodleUpdatedAssignment> {
    const assignment = this.assignments.get(params.activityId);
    if (!assignment) {
      throw new MoodleResourceNotFoundError(`Assignment activity ${params.activityId} not found`);
    }

    if (params.name !== undefined) assignment.name = params.name;
    if (params.intro !== undefined) assignment.intro = params.intro;
    if (params.grade !== undefined) assignment.grade = params.grade;

    return {
      activityId: assignment.activityId,
      assignmentId: assignment.assignmentId,
      name: assignment.name,
      intro: assignment.intro,
      grade: assignment.grade,
    };
  }

  override async createQuiz(params: CreateQuizParams): Promise<MoodleCreatedQuiz> {
    const activityId = ++this.nextId;
    const quizId = ++this.nextId;
    const grade = params.grade ?? 10;

    const quiz: MoodleQuizDetails & { sectionId: number } = {
      activityId,
      quizId,
      courseId: params.courseId,
      sectionId: params.sectionId,
      name: params.name,
      intro: params.intro || '',
      grade,
      preferredbehaviour: 'deferredfeedback',
      attempts: 0,
      shuffleanswers: 1,
      questionsCount: 0,
      sumgrades: 0,
    };

    this.quizzes.set(activityId, quiz);
    this.quizSlots.set(activityId, []);

    return {
      activityId,
      quizId,
      name: quiz.name,
      sectionId: quiz.sectionId,
      grade: quiz.grade,
    };
  }

  override async getQuiz(activityId: number): Promise<MoodleQuizDetails> {
    const quiz = this.quizzes.get(activityId);
    if (!quiz) {
      throw new MoodleResourceNotFoundError(`Quiz activity ${activityId} not found`);
    }
    const slots = this.quizSlots.get(activityId) || [];
    return {
      ...quiz,
      questionsCount: slots.length,
      sumgrades: slots.reduce((acc, s) => acc + s.maxMark, 0),
    };
  }

  override async updateQuiz(params: UpdateQuizParams): Promise<MoodleUpdatedQuiz> {
    const quiz = this.quizzes.get(params.activityId);
    if (!quiz) {
      throw new MoodleResourceNotFoundError(`Quiz activity ${params.activityId} not found`);
    }

    if (params.name !== undefined) quiz.name = params.name;
    if (params.intro !== undefined) quiz.intro = params.intro;

    return {
      activityId: quiz.activityId,
      quizId: quiz.quizId,
      name: quiz.name,
      intro: quiz.intro,
    };
  }

  override async getQuizQuestions(activityId: number): Promise<MoodleQuizQuestionSlot[]> {
    const quiz = this.quizzes.get(activityId);
    if (!quiz) {
      throw new MoodleResourceNotFoundError(`Quiz activity ${activityId} not found`);
    }
    return [...(this.quizSlots.get(activityId) || [])];
  }

  override async createQuizQuestion(params: CreateQuizQuestionParams): Promise<MoodleCreatedQuestion> {
    const questionBankEntryId = ++this.nextId;
    const questionId = ++this.nextId;
    const version = 1;

    let answers: Array<{ id: number; text: string; fraction: number; feedback: string }> = [];
    if (params.qtype === 'multichoice') {
      answers = params.options.choices.map((c, idx) => ({
        id: ++this.nextId,
        text: c.text,
        fraction: c.fraction,
        feedback: c.feedback || '',
      }));
    } else if (params.qtype === 'truefalse') {
      answers = [
        { id: ++this.nextId, text: 'True', fraction: params.options.correctAnswer ? 1 : 0, feedback: params.options.feedbackTrue || '' },
        { id: ++this.nextId, text: 'False', fraction: params.options.correctAnswer ? 0 : 1, feedback: params.options.feedbackFalse || '' },
      ];
    } else if (params.qtype === 'shortanswer') {
      answers = params.options.acceptedAnswers.map((ans) => ({
        id: ++this.nextId,
        text: ans,
        fraction: 1,
        feedback: params.options.feedback || '',
      }));
    }

    const stored: StoredQuestion = {
      questionBankEntryId,
      questionId,
      version,
      name: params.name,
      qtype: params.qtype,
      defaultMark: params.defaultMark ?? 1,
      categoryId: 1,
      questionText: params.questionText,
      answers,
    };

    this.questions.set(questionBankEntryId, stored);

    return {
      questionBankEntryId,
      questionId,
      version,
      name: stored.name,
      qtype: stored.qtype,
      defaultMark: stored.defaultMark,
      categoryId: stored.categoryId,
    };
  }

  override async updateQuizQuestion(params: UpdateQuizQuestionParams): Promise<MoodleUpdatedQuestion> {
    const existing = this.questions.get(params.questionBankEntryId);
    if (!existing) {
      throw new MoodleResourceNotFoundError(`Question bank entry ${params.questionBankEntryId} not found`);
    }

    const previousQuestionId = existing.questionId;
    const questionId = ++this.nextId;
    const version = existing.version + 1;

    if (params.name !== undefined) existing.name = params.name;
    if (params.questionText !== undefined) existing.questionText = params.questionText;
    if (params.defaultMark !== undefined) existing.defaultMark = params.defaultMark;

    existing.questionId = questionId;
    existing.version = version;

    return {
      questionBankEntryId: existing.questionBankEntryId,
      previousQuestionId,
      questionId,
      version,
      name: existing.name,
      qtype: existing.qtype,
      defaultMark: existing.defaultMark,
    };
  }

  override async addQuestionToQuiz(params: AddQuestionToQuizParams): Promise<MoodleAddedQuestionSlot> {
    const quiz = this.quizzes.get(params.activityId);
    if (!quiz) {
      throw new MoodleResourceNotFoundError(`Quiz activity ${params.activityId} not found`);
    }

    const question = this.questions.get(params.questionBankEntryId);
    if (!question) {
      throw new MoodleResourceNotFoundError(`Question bank entry ${params.questionBankEntryId} not found`);
    }

    const slots = this.quizSlots.get(params.activityId) || [];
    if (slots.some((s) => s.questionBankEntryId === params.questionBankEntryId)) {
      throw new MoodleConflictError(
        `Question ${params.questionBankEntryId} is already in quiz ${params.activityId}`,
        { errorCode: 'errorquestionalreadyinquiz' }
      );
    }

    const slotId = ++this.nextId;
    const slotNumber = slots.length + 1;
    const page = params.page ?? 1;
    const maxMark = params.maxMark ?? question.defaultMark;

    const newSlot: MoodleQuizQuestionSlot = {
      slotId,
      slotNumber,
      page,
      maxMark,
      questionBankEntryId: question.questionBankEntryId,
      questionId: question.questionId,
      version: question.version,
      name: question.name,
      qtype: question.qtype,
      questionText: question.questionText,
      defaultMark: question.defaultMark,
      answers: question.answers,
    };

    slots.push(newSlot);
    this.quizSlots.set(params.activityId, slots);

    return {
      slotId,
      activityId: params.activityId,
      quizId: quiz.quizId,
      questionBankEntryId: question.questionBankEntryId,
      questionId: question.questionId,
      slotNumber,
      page,
      maxMark,
    };
  }
}
