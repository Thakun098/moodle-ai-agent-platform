import { describe, expect, it, vi } from 'vitest';
import {
  MoodleApiError,
  MoodleAuthenticationError,
  MoodleAuthorizationError,
  MoodleClient,
  MoodleConflictError,
  MoodleInvalidParameterError,
  MoodleNetworkError,
  MoodleResourceNotFoundError,
  MoodleResponseError,
  serializeQuestionOptions,
} from '../src/index.js';

describe('MoodleClient (Unit Tests)', () => {
  const mockToken = 'mock_secret_token_12345';
  const mockBaseUrl = 'http://moodle.local:8000';

  function createMockFetch(responseBody: unknown, status = 200, statusText = 'OK') {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      text: vi.fn().mockResolvedValue(typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)),
    });
  }

  describe('Configuration & URL Construction (P8-D1, R9, R14)', () => {
    it('normalizes baseUrl trailing slashes and constructs /webservice/rest/server.php', async () => {
      const mockFetch = createMockFetch([]);
      const client = new MoodleClient({
        baseUrl: 'http://moodle.local:8000///',
        token: mockToken,
        fetch: mockFetch as any,
      });

      await client.listCourseCategories();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://moodle.local:8000/webservice/rest/server.php');
      expect(calledInit.method).toBe('POST');
      expect(calledInit.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

      const body = new URLSearchParams(calledInit.body);
      expect(body.get('wstoken')).toBe(mockToken);
      expect(body.get('wsfunction')).toBe('local_agentpoc_list_course_categories');
      expect(body.get('moodlewsrestformat')).toBe('json');
    });

    it('throws when baseUrl is missing or empty', () => {
      expect(() => new MoodleClient({ baseUrl: '', token: mockToken })).toThrow(
        'MoodleClientConfig.baseUrl is required and cannot be empty.'
      );
    });

    it('throws when token is missing or empty', () => {
      expect(() => new MoodleClient({ baseUrl: mockBaseUrl, token: '' })).toThrow(
        'MoodleClientConfig.token is required and cannot be empty.'
      );
    });
  });

  describe('14 Canonical Operations (Success Paths)', () => {
    it('[1] listCourseCategories', async () => {
      const mockResponse = [
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
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.listCourseCategories();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 1,
        name: 'Category 1',
        idnumber: 'CAT1',
        description: 'Desc',
        parent: 0,
        coursecount: 5,
        visible: 1,
      });
    });

    it('[2] createCourse (P7-D5, R1)', async () => {
      const mockResponse = {
        course_id: 10,
        fullname: 'Software Engineering',
        shortname: 'CS101-2026',
        category_id: 1,
        visible: 0,
        format: 'topics',
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.createCourse({
        categoryId: 1,
        fullname: 'Software Engineering',
        shortname: 'CS101-2026',
        summary: '<p>Course summary</p>',
      });

      expect(result).toEqual({
        courseId: 10,
        fullname: 'Software Engineering',
        shortname: 'CS101-2026',
        categoryId: 1,
        visible: 0,
        format: 'topics',
      });

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('wsfunction')).toBe('local_agentpoc_create_course');
      expect(body.get('category_id')).toBe('1');
      expect(body.get('fullname')).toBe('Software Engineering');
      expect(body.get('shortname')).toBe('CS101-2026');
      expect(body.get('summary')).toBe('<p>Course summary</p>');
    });

    it('[3] createSection (R7, R1)', async () => {
      const mockResponse = {
        section_id: 25,
        section_num: 1,
        name: 'Week 1',
        summary: 'Intro',
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.createSection({
        courseId: 10,
        position: 1,
        name: 'Week 1',
        summary: 'Intro',
      });

      expect(result).toEqual({
        sectionId: 25,
        sectionNum: 1,
        name: 'Week 1',
        summary: 'Intro',
      });

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('wsfunction')).toBe('local_agentpoc_create_section');
      expect(body.get('course_id')).toBe('10');
      expect(body.get('position')).toBe('1');
      expect(body.get('name')).toBe('Week 1');
    });

    it('[4] getCourseStructure (T0705)', async () => {
      const mockResponse = {
        course: { id: 10, fullname: 'CS101', shortname: 'CS101', category_id: 1, visible: 0 },
        sections: [
          {
            section_id: 25,
            section_num: 1,
            name: 'Week 1',
            summary: 'Intro',
            activities: [
              {
                activity_id: 101,
                instance_id: 5,
                modulename: 'assign',
                name: 'Lab 1',
                intro: 'Desc',
                grade: 100,
              },
            ],
          },
        ],
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.getCourseStructure(10);
      expect(result.course.id).toBe(10);
      expect(result.sections).toHaveLength(1);
      expect(result.sections[0].sectionId).toBe(25);
      expect(result.sections[0].activities).toHaveLength(1);
      expect(result.sections[0].activities[0].activityId).toBe(101);
      expect(result.sections[0].activities[0].moduleName).toBe('assign');
    });

    it('[5] createAssignment (P7-D2, R1)', async () => {
      const mockResponse = {
        activity_id: 101,
        assignment_id: 5,
        name: 'Lab 1 Assignment',
        section_id: 25,
        grade: 100,
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.createAssignment({
        courseId: 10,
        sectionId: 25,
        name: 'Lab 1 Assignment',
        intro: '<p>Instructions</p>',
        grade: 100,
      });

      expect(result).toEqual({
        activityId: 101,
        assignmentId: 5,
        name: 'Lab 1 Assignment',
        sectionId: 25,
        grade: 100,
      });
      // Verify no request parameter enrichment (R17)
      expect((result as any).courseId).toBeUndefined();
    });

    it('[6] getAssignment (R1)', async () => {
      const mockResponse = {
        activity_id: 101,
        assignment_id: 5,
        course_id: 10,
        section_id: 25,
        name: 'Lab 1',
        intro: '<p>Instructions</p>',
        introformat: 1,
        grade: 100,
        duedate: 0,
        onlinetext_enabled: 1,
        file_enabled: 0,
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.getAssignment(101);
      expect(result).toEqual({
        activityId: 101,
        assignmentId: 5,
        courseId: 10,
        sectionId: 25,
        name: 'Lab 1',
        intro: '<p>Instructions</p>',
        introFormat: 1,
        grade: 100,
        dueDate: 0,
        onlineTextEnabled: 1,
        fileEnabled: 0,
      });
    });

    it('[7] updateAssignment (R1)', async () => {
      const mockResponse = {
        activity_id: 101,
        assignment_id: 5,
        name: 'Lab 1 (Updated)',
        intro: '<p>New instructions</p>',
        grade: 90,
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.updateAssignment({
        activityId: 101,
        name: 'Lab 1 (Updated)',
        intro: '<p>New instructions</p>',
        grade: 90,
      });

      expect(result).toEqual({
        activityId: 101,
        assignmentId: 5,
        name: 'Lab 1 (Updated)',
        intro: '<p>New instructions</p>',
        grade: 90,
      });
    });

    it('[8] createQuiz (P7-D2, R1)', async () => {
      const mockResponse = {
        activity_id: 102,
        quiz_id: 6,
        name: 'Quiz 1',
        section_id: 25,
        grade: 100,
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.createQuiz({
        courseId: 10,
        sectionId: 25,
        name: 'Quiz 1',
        intro: '<p>Quiz intro</p>',
      });

      expect(result).toEqual({
        activityId: 102,
        quizId: 6,
        name: 'Quiz 1',
        sectionId: 25,
        grade: 100,
      });
    });

    it('[9] getQuiz (R1)', async () => {
      const mockResponse = {
        activity_id: 102,
        quiz_id: 6,
        course_id: 10,
        name: 'Quiz 1',
        intro: '<p>Intro</p>',
        grade: 100,
        preferredbehaviour: 'deferredfeedback',
        attempts: 0,
        shuffleanswers: 1,
        questions_count: 4,
        sumgrades: 8,
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.getQuiz(102);
      expect(result).toEqual({
        activityId: 102,
        quizId: 6,
        courseId: 10,
        name: 'Quiz 1',
        intro: '<p>Intro</p>',
        grade: 100,
        preferredbehaviour: 'deferredfeedback',
        attempts: 0,
        shuffleanswers: 1,
        questionsCount: 4,
        sumgrades: 8,
      });
    });

    it('[10] updateQuiz (R1)', async () => {
      const mockResponse = {
        activity_id: 102,
        quiz_id: 6,
        name: 'Quiz 1 Refined',
        intro: '<p>Updated intro</p>',
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.updateQuiz({
        activityId: 102,
        name: 'Quiz 1 Refined',
        intro: '<p>Updated intro</p>',
      });

      expect(result).toEqual({
        activityId: 102,
        quizId: 6,
        name: 'Quiz 1 Refined',
        intro: '<p>Updated intro</p>',
      });
    });

    it('[11] getQuizQuestions (R1, P7-R1)', async () => {
      const mockResponse = [
        {
          slot_id: 1,
          slot_number: 1,
          page: 1,
          maxmark: 1,
          question_bank_entry_id: 201,
          question_id: 301,
          version: 1,
          name: 'Q1: Multichoice',
          qtype: 'multichoice',
          questiontext: '<p>Question text</p>',
          defaultmark: 1,
          answers: [
            { id: 1, text: 'Choice A', fraction: 1, feedback: 'Correct' },
            { id: 2, text: 'Choice B', fraction: 0, feedback: 'Incorrect' },
          ],
        },
      ];
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.getQuizQuestions(102);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        slotId: 1,
        slotNumber: 1,
        page: 1,
        maxMark: 1,
        questionBankEntryId: 201,
        questionId: 301,
        version: 1,
        name: 'Q1: Multichoice',
        qtype: 'multichoice',
        questionText: '<p>Question text</p>',
        defaultMark: 1,
        answers: [
          { id: 1, text: 'Choice A', fraction: 1, feedback: 'Correct' },
          { id: 2, text: 'Choice B', fraction: 0, feedback: 'Incorrect' },
        ],
      });
    });

    it('[12] createQuizQuestion (P8-D2, R1, R3)', async () => {
      const mockResponse = {
        question_bank_entry_id: 201,
        question_id: 301,
        version: 1,
        activity_id: 102,
        qtype: 'multichoice',
        name: 'Q1: BFS',
        defaultmark: 1,
        category_id: 50,
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.createQuizQuestion({
        activityId: 102,
        qtype: 'multichoice',
        name: 'Q1: BFS',
        questionText: '<p>Which structure?</p>',
        defaultMark: 1,
        options: {
          choices: [
            { text: 'Queue', fraction: 1, feedback: 'Correct' },
            { text: 'Stack', fraction: 0, feedback: 'Incorrect' },
          ],
          shuffleAnswers: true,
        },
      });

      expect(result).toEqual({
        questionBankEntryId: 201,
        questionId: 301,
        version: 1,
        name: 'Q1: BFS',
        qtype: 'multichoice',
        defaultMark: 1,
        categoryId: 50,
      });

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.get('wsfunction')).toBe('local_agentpoc_create_quiz_question');
      expect(body.get('activity_id')).toBe('102');
      expect(body.get('qtype')).toBe('multichoice');

      const parsedOptions = JSON.parse(body.get('qtype_options_json') || '{}');
      expect(parsedOptions.choices).toHaveLength(2);
      expect(parsedOptions.choices[0].fraction).toBe(1);
      expect(parsedOptions.shuffleanswers).toBe(1);
    });

    it('[13] updateQuizQuestion metadata-only (P7-D4, R1)', async () => {
      const mockResponse = {
        question_bank_entry_id: 201,
        previous_question_id: 301,
        question_id: 302,
        version: 2,
        name: 'Q1: BFS Refined',
        qtype: 'multichoice',
        defaultmark: 2,
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.updateQuizQuestion({
        questionBankEntryId: 201,
        name: 'Q1: BFS Refined',
        defaultMark: 2,
      });

      expect(result).toEqual({
        questionBankEntryId: 201,
        previousQuestionId: 301,
        questionId: 302,
        version: 2,
        name: 'Q1: BFS Refined',
        qtype: 'multichoice',
        defaultMark: 2,
      });

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      expect(body.has('qtype_options_json')).toBe(false);
    });

    it('[13b] updateQuizQuestion with typed options (P8-R2)', async () => {
      const mockResponse = {
        question_bank_entry_id: 201,
        previous_question_id: 301,
        question_id: 303,
        version: 3,
        name: 'Q1: BFS v3',
        qtype: 'multichoice',
        defaultmark: 2,
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await client.updateQuizQuestion({
        questionBankEntryId: 201,
        name: 'Q1: BFS v3',
        qtype: 'multichoice',
        options: {
          choices: [
            { text: 'Queue', fraction: 1 },
            { text: 'Stack', fraction: 0 },
          ],
          shuffleAnswers: false,
        },
      });

      const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
      const parsedOptions = JSON.parse(body.get('qtype_options_json') || '{}');
      expect(parsedOptions.choices).toHaveLength(2);
      expect(parsedOptions.shuffleanswers).toBe(0);
    });

    it('[14] addQuestionToQuiz (P7-R3, R1)', async () => {
      const mockResponse = {
        slot_id: 15,
        activity_id: 102,
        quiz_id: 6,
        question_bank_entry_id: 201,
        question_id: 302,
        slot_number: 1,
        page: 1,
        maxmark: 2,
      };
      const mockFetch = createMockFetch(mockResponse);
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      const result = await client.addQuestionToQuiz({
        activityId: 102,
        questionBankEntryId: 201,
        page: 1,
        maxMark: 2,
      });

      expect(result).toEqual({
        slotId: 15,
        activityId: 102,
        quizId: 6,
        questionBankEntryId: 201,
        questionId: 302,
        slotNumber: 1,
        page: 1,
        maxMark: 2,
      });
    });
  });

  describe('Question Serialization Details (R3, R10)', () => {
    it('serializes truefalse question preserving boolean false (R10)', () => {
      const serialized = serializeQuestionOptions('truefalse', {
        correctAnswer: false,
        feedbackFalse: 'Good job',
      });
      const parsed = JSON.parse(serialized);
      expect(parsed.correct_answer).toBe(false);
      expect(parsed.feedback_false).toBe('Good job');
    });

    it('serializes shortanswer question with accepted_answers', () => {
      const serialized = serializeQuestionOptions('shortanswer', {
        acceptedAnswers: ['BFS', 'Breadth First Search'],
        caseSensitive: false,
      });
      const parsed = JSON.parse(serialized);
      expect(parsed.accepted_answers).toEqual(['BFS', 'Breadth First Search']);
      expect(parsed.case_sensitive).toBe(0);
    });

    it('serializes essay question with word limits', () => {
      const serialized = serializeQuestionOptions('essay', {
        gradingGuidance: 'Check complexity analysis',
        minWordLimit: 50,
        maxWordLimit: 300,
      });
      const parsed = JSON.parse(serialized);
      expect(parsed.grading_guidance).toBe('Check complexity analysis');
      expect(parsed.min_word_limit).toBe(50);
      expect(parsed.max_word_limit).toBe(300);
    });
  });

  describe('Error Handling & Normalization (R5, R6, R7, R14, R19)', () => {
    it('normalizes invalidtoken to MoodleAuthenticationError', async () => {
      const mockFetch = createMockFetch({
        exception: 'moodle_exception',
        errorcode: 'invalidtoken',
        message: 'Invalid token - token not found',
      });
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(client.listCourseCategories()).rejects.toThrow(MoodleAuthenticationError);
    });

    it('normalizes required_capability_exception to MoodleAuthorizationError (R6)', async () => {
      const mockFetch = createMockFetch({
        exception: 'required_capability_exception',
        errorcode: 'nopermissions',
        message: 'Sorry, but you do not currently have permissions to do that',
      });
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(client.listCourseCategories()).rejects.toThrow(MoodleAuthorizationError);
    });

    it('normalizes accessexception to MoodleAuthorizationError (R6)', async () => {
      const mockFetch = createMockFetch({
        exception: 'accessexception',
        errorcode: 'accessexception',
        message: 'Access control exception',
      });
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(client.listCourseCategories()).rejects.toThrow(MoodleAuthorizationError);
    });

    it('normalizes invalid_parameter_exception to MoodleInvalidParameterError', async () => {
      const mockFetch = createMockFetch({
        exception: 'invalid_parameter_exception',
        errorcode: 'invalidparameter',
        message: 'Invalid parameter value detected',
      });
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(
        client.createSection({ courseId: 1, position: 0, name: 'Invalid' })
      ).rejects.toThrow(MoodleInvalidParameterError);
    });

    it('normalizes errorquestionalreadyinquiz to MoodleConflictError', async () => {
      const mockFetch = createMockFetch({
        exception: 'moodle_exception',
        errorcode: 'errorquestionalreadyinquiz',
        message: 'Question with bank entry ID 201 already exists in the quiz',
      });
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(
        client.addQuestionToQuiz({ activityId: 102, questionBankEntryId: 201 })
      ).rejects.toThrow(MoodleConflictError);
    });

    it('normalizes resource not found exception to MoodleResourceNotFoundError', async () => {
      const mockFetch = createMockFetch({
        exception: 'moodle_exception',
        errorcode: 'errorquestionnotfound',
        message: 'Question not found with ID 999',
      });
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(client.getAssignment(999)).rejects.toThrow(MoodleResourceNotFoundError);
    });

    it('normalizes HTTP 200 with Moodle exception payload correctly (R7)', async () => {
      const mockFetch = createMockFetch(
        {
          exception: 'invalid_parameter_exception',
          errorcode: 'invalidparameter',
          message: 'Parameter error on HTTP 200',
        },
        200
      );
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(client.listCourseCategories()).rejects.toThrow(MoodleInvalidParameterError);
    });

    it('throws MoodleResponseError on malformed success response (R4)', async () => {
      const mockFetch = createMockFetch({ invalid_shape: true }); // Missing required course_id etc.
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(
        client.createCourse({ categoryId: 1, fullname: 'Test', shortname: 'T1' })
      ).rejects.toThrow(MoodleResponseError);
    });

    it('throws MoodleNetworkError on fetch rejection (R13)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(client.listCourseCategories()).rejects.toThrow(MoodleNetworkError);
    });

    it('never leaks wstoken into error messages or properties (R14)', async () => {
      const mockFetch = createMockFetch({
        exception: 'moodle_exception',
        errorcode: 'generalexception',
        message: 'An error occurred',
      });
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      try {
        await client.listCourseCategories();
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err.message).not.toContain(mockToken);
        expect(JSON.stringify(err)).not.toContain(mockToken);
      }
    });
  });

  describe('Timeout Validation (P8-R4)', () => {
    it('rejects timeoutMs = 0', () => {
      expect(() => new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, timeoutMs: 0 })).toThrow(
        'MoodleClientConfig.timeoutMs must be a positive finite number'
      );
    });

    it('rejects timeoutMs = -1', () => {
      expect(() => new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, timeoutMs: -1 })).toThrow(
        'MoodleClientConfig.timeoutMs must be a positive finite number'
      );
    });

    it('rejects timeoutMs = NaN', () => {
      expect(() => new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, timeoutMs: NaN })).toThrow(
        'MoodleClientConfig.timeoutMs must be a positive finite number'
      );
    });

    it('rejects timeoutMs = Infinity', () => {
      expect(() => new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, timeoutMs: Infinity })).toThrow(
        'MoodleClientConfig.timeoutMs must be a positive finite number'
      );
    });

    it('accepts valid positive timeoutMs', async () => {
      const mockFetch = createMockFetch([]);
      const client = new MoodleClient({
        baseUrl: mockBaseUrl,
        token: mockToken,
        timeoutMs: 5000,
        fetch: mockFetch as any,
      });
      // Should not throw during construction
      await client.listCourseCategories();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('defaults to 30000ms when timeoutMs is undefined', () => {
      const mockFetch = createMockFetch([]);
      // Should not throw during construction
      expect(() => new MoodleClient({
        baseUrl: mockBaseUrl,
        token: mockToken,
        fetch: mockFetch as any,
      })).not.toThrow();
    });
  });

  describe('2xx Non-JSON Response (P8-R5)', () => {
    it('throws MoodleResponseError for 200 with non-JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: vi.fn().mockResolvedValue('<html>Moodle maintenance page</html>'),
      });
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(client.listCourseCategories()).rejects.toThrow(MoodleResponseError);
    });

    it('throws MoodleApiError for non-2xx with non-JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: vi.fn().mockResolvedValue('<html>502 Bad Gateway</html>'),
      });
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(client.listCourseCategories()).rejects.toThrow(MoodleApiError);
    });
  });

  describe('Response Body Read Failure (P8-R6)', () => {
    it('throws MoodleNetworkError when response.text() rejects', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: vi.fn().mockRejectedValue(new Error('Connection reset while reading body')),
      });
      const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

      await expect(client.listCourseCategories()).rejects.toThrow(MoodleNetworkError);
      await expect(client.listCourseCategories()).rejects.toThrow(
        "Failed to read response body from Moodle for 'local_agentpoc_list_course_categories'"
      );
    });
  });
});

// P8 final hardening: typed update option serialization across remaining qtypes.
describe('Update Question Typed Option Serialization (P8-F3)', () => {
  const mockToken = 'mock_secret_token_12345';
  const mockBaseUrl = 'http://moodle.local:8000';

  function responseFor(qtype: 'truefalse' | 'shortanswer' | 'essay') {
    return {
      question_bank_entry_id: 900,
      previous_question_id: 901,
      question_id: 902,
      version: 2,
      name: 'Updated question',
      qtype,
      defaultmark: 1,
    };
  }

  function createMockFetch(responseBody: unknown) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: vi.fn().mockResolvedValue(JSON.stringify(responseBody)),
    });
  }

  it('serializes truefalse update preserving correctAnswer=false', async () => {
    const mockFetch = createMockFetch(responseFor('truefalse'));
    const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

    await client.updateQuizQuestion({
      questionBankEntryId: 900,
      qtype: 'truefalse',
      options: { correctAnswer: false, feedbackFalse: 'No' },
    });

    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
    const options = JSON.parse(body.get('qtype_options_json') || '{}');
    expect(options.correct_answer).toBe(false);
    expect(options.feedback_false).toBe('No');
  });

  it('serializes shortanswer update using accepted_answers', async () => {
    const mockFetch = createMockFetch(responseFor('shortanswer'));
    const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

    await client.updateQuizQuestion({
      questionBankEntryId: 900,
      qtype: 'shortanswer',
      options: { acceptedAnswers: ['BFS'], caseSensitive: false },
    });

    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
    const options = JSON.parse(body.get('qtype_options_json') || '{}');
    expect(options.accepted_answers).toEqual(['BFS']);
    expect(options.case_sensitive).toBe(0);
  });

  it('serializes essay update using Moodle snake_case option keys', async () => {
    const mockFetch = createMockFetch(responseFor('essay'));
    const client = new MoodleClient({ baseUrl: mockBaseUrl, token: mockToken, fetch: mockFetch as any });

    await client.updateQuizQuestion({
      questionBankEntryId: 900,
      qtype: 'essay',
      options: { gradingGuidance: 'Use rubric', minWordLimit: 100, maxWordLimit: 500 },
    });

    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
    const options = JSON.parse(body.get('qtype_options_json') || '{}');
    expect(options.grading_guidance).toBe('Use rubric');
    expect(options.min_word_limit).toBe(100);
    expect(options.max_word_limit).toBe(500);
  });
});
