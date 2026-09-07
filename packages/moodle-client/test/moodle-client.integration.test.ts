import { describe, expect, it } from 'vitest';
import { MoodleClient, MoodleConflictError } from '../src/index.js';

const isIntegrationEnabled = process.env.MOODLE_INTEGRATION_TEST === '1';

describe.runIf(isIntegrationEnabled)('MoodleClient (Live HTTP Integration Tests)', () => {
  const baseUrl = process.env.MOODLE_BASE_URL || 'http://localhost:8000';
  const token = process.env.MOODLE_TOKEN ?? '';

  // When integration is enabled (MOODLE_INTEGRATION_TEST=1), require MOODLE_TOKEN.
  // When disabled, describe.runIf skips all tests so the empty token is harmless.
  if (isIntegrationEnabled && !token) {
    throw new Error(
      'MOODLE_TOKEN env var is required for integration tests. ' +
      'Generate a fresh token via: php local/agentpoc/cli/create_token.php'
    );
  }

  const client = new MoodleClient({
    baseUrl,
    token: token || 'placeholder-never-used',
  });

  it('executes full course, section, activity, and question lifecycle via Moodle REST Web Service', async () => {
    // 1. List course categories
    const categories = await client.listCourseCategories();
    expect(categories.length).toBeGreaterThanOrEqual(1);
    const categoryId = categories[0].id;

    // 2. Create hidden course with unique shortname
    const uniqueShortname = `MC-IT-${Date.now()}`;
    const course = await client.createCourse({
      categoryId,
      fullname: `Integration Test Course ${uniqueShortname}`,
      shortname: uniqueShortname,
      summary: '<p>Created via MoodleClient Live Integration Test</p>',
      format: 'topics',
    });

    expect(course.courseId).toBeGreaterThan(0);
    expect(course.shortname).toBe(uniqueShortname);
    expect(course.visible).toBe(0);

    // 3. Create Section
    const section = await client.createSection({
      courseId: course.courseId,
      position: 1,
      name: 'Integration Test Section 1',
      summary: '<p>Section summary</p>',
    });

    expect(section.sectionId).toBeGreaterThan(0);
    expect(section.sectionNum).toBe(1);
    expect(section.name).toBe('Integration Test Section 1');

    // 4. Create Assignment with frozen defaults
    const assignment = await client.createAssignment({
      courseId: course.courseId,
      sectionId: section.sectionId,
      name: 'Integration Lab 1',
      intro: '<p>Complete the graph traversal implementation</p>',
      grade: 100,
    });

    expect(assignment.activityId).toBeGreaterThan(0);
    expect(assignment.assignmentId).toBeGreaterThan(0);
    expect(assignment.grade).toBe(100);

    // 5. Read Assignment and verify details
    const assignmentDetails = await client.getAssignment(assignment.activityId);
    expect(assignmentDetails.activityId).toBe(assignment.activityId);
    expect(assignmentDetails.name).toBe('Integration Lab 1');
    expect(assignmentDetails.onlineTextEnabled).toBe(1);
    expect(assignmentDetails.fileEnabled).toBe(0);
    expect(assignmentDetails.dueDate).toBe(0);

    // 6. Create Quiz
    const quiz = await client.createQuiz({
      courseId: course.courseId,
      sectionId: section.sectionId,
      name: 'Integration Assessment 1',
      intro: '<p>Assessment quiz</p>',
      grade: 100,
    });

    expect(quiz.activityId).toBeGreaterThan(0);
    expect(quiz.quizId).toBeGreaterThan(0);

    // 7. Create Multichoice Question
    const mcq = await client.createQuizQuestion({
      activityId: quiz.activityId,
      qtype: 'multichoice',
      name: 'Q1: Data Structure',
      questionText: '<p>Which data structure is used for Breadth-First Search?</p>',
      defaultMark: 1,
      options: {
        choices: [
          { text: 'Queue', fraction: 1, feedback: 'Correct!' },
          { text: 'Stack', fraction: 0, feedback: 'Incorrect' },
        ],
        shuffleAnswers: true,
      },
    });

    expect(mcq.questionBankEntryId).toBeGreaterThan(0);
    expect(mcq.questionId).toBeGreaterThan(0);
    expect(mcq.version).toBe(1);

    // 8. Create True/False Question
    const tf = await client.createQuizQuestion({
      activityId: quiz.activityId,
      qtype: 'truefalse',
      name: 'Q2: Time Complexity',
      questionText: '<p>BFS visits each vertex at most once.</p>',
      defaultMark: 1,
      options: {
        correctAnswer: true,
        feedbackTrue: 'Correct!',
        feedbackFalse: 'Incorrect!',
      },
    });

    expect(tf.questionBankEntryId).toBeGreaterThan(0);

    // 9. Add Questions to Quiz
    const slot1 = await client.addQuestionToQuiz({
      activityId: quiz.activityId,
      questionBankEntryId: mcq.questionBankEntryId,
      page: 1,
      maxMark: 1,
    });
    expect(slot1.slotNumber).toBe(1);

    const slot2 = await client.addQuestionToQuiz({
      activityId: quiz.activityId,
      questionBankEntryId: tf.questionBankEntryId,
      page: 1,
      maxMark: 1,
    });
    expect(slot2.slotNumber).toBe(2);

    // 10. Read Quiz Questions
    const quizQuestions = await client.getQuizQuestions(quiz.activityId);
    expect(quizQuestions).toHaveLength(2);
    expect(quizQuestions[0].questionBankEntryId).toBe(mcq.questionBankEntryId);
    expect(quizQuestions[0].answers).toHaveLength(2);

    // 11. Read Course Structure
    const structure = await client.getCourseStructure(course.courseId);
    expect(structure.course.id).toBe(course.courseId);
    expect(structure.sections.length).toBeGreaterThanOrEqual(1);

    // 12. Test duplicate question rejection -> normalized to MoodleConflictError (P7-R4, R19)
    await expect(
      client.addQuestionToQuiz({
        activityId: quiz.activityId,
        questionBankEntryId: mcq.questionBankEntryId,
      })
    ).rejects.toThrow(MoodleConflictError);
  });
});
