import { describe, expect, it, vi } from 'vitest';
import { verifyCoursePlan } from '../packages/verification/src/course-verifier.js';
import { executeAssignmentPlan } from '../packages/execution/src/assignment-executor.js';
import { executeQuizUpdate, toExistingQuizState } from '../packages/execution/src/quiz-executor.js';

// Production executor/verifier regression seams; Moodle and persistence are fakes.
const question = { ref: 'question-01', type: 'truefalse', question: 'Approved question', correct_answer: true, feedback: '', default_mark: 1, source_refs: [] };
const envelope = { schema_version: '0.1', plan_id: 'audit-plan', revision: 1, title: 'Audit', summary: 'Audit', warnings: [], assumptions: [] };
function repositories() {
  return {
    mappingRepo: { listRunMappings: vi.fn(async () => [
      { localRef: 'course', moodleId: 10 }, { localRef: 'section-01', moodleId: 20 },
      { localRef: 'quiz-01', moodleId: 30 }, { localRef: 'question-01', moodleId: 501 },
    ]), setMapping: vi.fn(async (r) => r) },
    verificationRepo: { recordVerification: vi.fn(async (r) => r) },
    toolCallRepo: { recordToolCall: vi.fn(async (r) => r) },
    idempotencyRepo: { tryAcquire: vi.fn(async () => ({ state: 'acquired', key: 'audit' })), recordSuccess: vi.fn(), recordFailure: vi.fn() },
    runRepo: { updateStatus: vi.fn(), completeRun: vi.fn(), failRun: vi.fn() },
  } as any;
}
function manager(handler: (name: string, args: any) => unknown) {
  return { discoverTools: vi.fn(async () => []), getRegistry: () => ({ validateArguments: () => ({ valid: true }) }),
    callTool: vi.fn(async (name, args) => ({ status: 'success', data: handler(name, args) })) } as any;
}
function slot(id = 501, order = 1) {
  return { slot_id: order, slot_number: order, page: 1, max_mark: 1, question_bank_entry_id: id,
    question_id: id + 100, version: 1, name: 'Q', qtype: 'truefalse', question_text: question.question, default_mark: 1,
    answers: [{ id: 1, text: 'True', fraction: 1, feedback: '' }, { id: 2, text: 'False', fraction: 0, feedback: '' }] };
}
const coursePlan = { ...envelope, plan_type: 'course', operation: 'create', content: {
  course: { title: 'Audit course' }, sections: [{ ref: 'section-01', position: 1, title: 'Week 1', source_refs: [],
    activities: [{ ref: 'quiz-01', type: 'quiz', title: 'Quiz', description: 'Intro', source_refs: [], questions: [question] }] }],
} };
function courseManager(q = slot(), courseOverrides = {}) {
  return manager((name) => name === 'moodle_get_course_structure' ? {
    course: { id: 10, fullname: 'Audit course', category_id: 1, visible: 0, format: 'topics', ...courseOverrides },
    sections: [{ section_id: 20, section_num: 1, name: 'Week 1', activities: [{ activity_id: 30, module_name: 'quiz', name: 'Quiz', intro: 'Intro' }] }],
  } : [q]);
}

describe('execution and verification contract regressions', () => {
  it('allows retry of this revision\'s already-completed question version without rewriting it', async () => {
    const q = slot(); q.version = 2;
    const m = manager((name) => {
      if (name === 'moodle_get_course_structure') return { course: { id: 10 }, sections: [{ section_id: 20, activities: [{ activity_id: 30, instance_id: 40, module_name: 'quiz' }] }] };
      if (name === 'moodle_get_quiz') return { activity_id: 30, quiz_id: 40, course_id: 10, name: 'Quiz', intro: 'Intro', sumgrades: 1 };
      if (name === 'moodle_get_quiz_questions') return [q];
      if (name === 'moodle_update_quiz') return {};
      throw new Error('Completed question mutation must not be repeated');
    });
    const r = repositories();
    const completed = { question_bank_entry_id: 501, version: 2 };
    r.idempotencyRepo.getIdempotencyRecord = vi.fn(async () => ({ status: 'completed', resultPayload: completed }));
    r.idempotencyRepo.tryAcquire = vi.fn(async ({ toolName }) => toolName === 'moodle_update_quiz_question' ? { state: 'cached', key: 'audit', result: completed } : { state: 'acquired', key: 'metadata' });
    const plan = { ...envelope, plan_type: 'quiz', operation: 'update', content: { title: 'Quiz', description: 'Intro', source_refs: [], questions_to_add: [], questions_to_update: [question] } };
    const result = await executeQuizUpdate({ runId: 'audit-run', planEnvelope: plan as any, questionBindings: { 'question-01': { questionBankEntryId: 501, version: 1 } }, target: { course_id: 10, section_id: 20, quiz_id: 40 }, mcpClientManager: m, repositories: r });
    expect(result.verified).toBe(true);
    expect(m.callTool.mock.calls.some(([name]: [string]) => name === 'moodle_update_quiz_question')).toBe(false);
  });
  it.each(['missing', 'deleted', 'version'])('rejects %s question identity before any mutation', async kind => {
    const q = slot();
    if (kind === 'version') q.version = 2;
    const m = manager((name) => {
      if (name === 'moodle_get_course_structure') return { course: { id: 10 }, sections: [{ section_id: 20, activities: [{ activity_id: 30, instance_id: 40, module_name: 'quiz' }] }] };
      if (name === 'moodle_get_quiz') return { activity_id: 30, quiz_id: 40, course_id: 10, name: 'Quiz', intro: 'Intro' };
      if (name === 'moodle_get_quiz_questions') return kind === 'deleted' ? [] : [q];
      throw new Error('Unexpected mutation');
    });
    const r = repositories(); r.idempotencyRepo.getIdempotencyRecord = vi.fn(async () => null);
    const plan = { ...envelope, plan_type: 'quiz', operation: 'update', content: { title: 'Quiz', description: 'Intro', source_refs: [], questions_to_add: [], questions_to_update: [question] } };
    await expect(executeQuizUpdate({ runId: 'audit-run', planEnvelope: plan as any, target: { course_id: 10, section_id: 20, quiz_id: 40 },
      ...(kind === 'missing' ? {} : { questionBindings: { 'question-01': { questionBankEntryId: 501, version: 1 } } }), mcpClientManager: m, repositories: r })).rejects.toThrow();
    expect(m.callTool.mock.calls.every(([name]: [string]) => name.startsWith('moodle_get_'))).toBe(true);
  });
  it('control: matching Moodle readback passes', async () => {
    const result = await verifyCoursePlan({ runId: 'audit-run', categoryId: 1, planEnvelope: coursePlan as any, mcpClientManager: courseManager(), repositories: repositories() });
    expect(result.passed).toBe(true);
  });
  it('must reject a reversed answer key', async () => {
    const q = slot(); q.answers[0].fraction = 0; q.answers[1].fraction = 1;
    const result = await verifyCoursePlan({ runId: 'audit-run', categoryId: 1, planEnvelope: coursePlan as any, mcpClientManager: courseManager(q), repositories: repositories() });
    expect(result.passed).toBe(false);
  });
  it('must reject a visible course under the hidden-course contract', async () => {
    const result = await verifyCoursePlan({ runId: 'audit-run', categoryId: 1, planEnvelope: coursePlan as any, mcpClientManager: courseManager(slot(), { visible: 1 }), repositories: repositories() });
    expect(result.passed).toBe(false);
  });
  it('must reject an assignment in another course BEFORE mutating it', async () => {
    const state = { activity_id: 42, assignment_id: 420, course_id: 999, section_id: 888, name: 'Original', intro: 'Original', grade: 100 };
    const m = manager((name, args) => {
      if (name === 'moodle_update_assignment') Object.assign(state, { name: args.name, intro: args.intro, grade: args.grade });
      return state;
    });
    const plan = { ...envelope, plan_type: 'assignment', operation: 'update', content: {
      ref: 'assignment-42', type: 'assignment', title: 'Overwrite', description: 'Changed', instructions: ['Do'], learning_objectives: ['Learn'], grade: 50, source_refs: [],
    } };
    await expect(executeAssignmentPlan({ runId: 'audit-run', planEnvelope: plan as any, target: { course_id: 10, section_id: 20, activity_id: 42 }, mcpClientManager: m, repositories: repositories() })).rejects.toThrow();
    expect(state.name, 'An error after mutation cannot protect the other course').toBe('Original');
  });
  it('must preserve plan-time question identity after slot reorder', async () => {
    const slots = [slot(501, 1), slot(502, 2)];
    slots[0].question_text = 'Original A'; slots[1].question_text = 'Original B';
    const quiz = { activity_id: 30, quiz_id: 40, course_id: 10, name: 'Quiz', intro: 'Intro', grade: 10, questions_count: 2, get sumgrades() { return slots.reduce((sum, q) => sum + q.max_mark, 0); } };
    const planning = toExistingQuizState(quiz, slots);
    expect(planning.questions[0].question_bank_entry_id).toBe(501);
    slots[0].slot_number = 2; slots[1].slot_number = 1;
    const m = manager((name, args) => {
      if (name === 'moodle_get_course_structure') return { course: { id: 10 }, sections: [{ section_id: 20, activities: [{ activity_id: 30, instance_id: 40, module_name: 'quiz' }] }] };
      if (name === 'moodle_get_quiz') return quiz;
      if (name === 'moodle_get_quiz_questions') return slots;
      if (name === 'moodle_update_quiz') return Object.assign(quiz, { name: args.name, intro: args.intro });
      const q = slots.find(s => s.question_bank_entry_id === args.question_bank_entry_id)!;
      Object.assign(q, { question_text: args.question_text, default_mark: args.default_mark, max_mark: args.max_mark });
      return q;
    });
    const plan = { ...envelope, plan_type: 'quiz', operation: 'update', content: { title: 'Quiz', description: 'Intro', source_refs: [], questions_to_add: [], questions_to_update: [{ ...question, question: 'Approved replacement for A' }] } };
    const result = await executeQuizUpdate({ runId: 'audit-run', planEnvelope: plan as any, questionBindings: { 'question-01': { questionBankEntryId: 501, version: 1 } }, target: { course_id: 10, section_id: 20, quiz_id: 40 }, mcpClientManager: m, repositories: repositories() });
    expect(result.verified).toBe(true);
    expect(slots.find(s => s.question_bank_entry_id === 501)!.question_text).toBe('Approved replacement for A');
    expect(slots.find(s => s.question_bank_entry_id === 502)!.question_text).toBe('Original B');
  });
  it('must apply updated question marks to the quiz slot', async () => {
    const q = slot();
    const quiz = { activity_id: 30, quiz_id: 40, course_id: 10, name: 'Quiz', intro: 'Intro', grade: 10, questions_count: 1, get sumgrades() { return q.max_mark; } };
    const m = manager((name, args) => {
      if (name === 'moodle_get_course_structure') return { course: { id: 10 }, sections: [{ section_id: 20, activities: [{ activity_id: 30, instance_id: 40, module_name: 'quiz' }] }] };
      if (name === 'moodle_get_quiz') return quiz;
      if (name === 'moodle_get_quiz_questions') return [q];
      if (name === 'moodle_update_quiz') return Object.assign(quiz, { name: args.name, intro: args.intro });
      Object.assign(q, { question_text: args.question_text, default_mark: args.default_mark, max_mark: args.max_mark });
      return q;
    });
    const plan = { ...envelope, plan_type: 'quiz', operation: 'update', content: { title: 'Quiz', description: 'Intro', source_refs: [], questions_to_add: [], questions_to_update: [{ ...question, default_mark: 5 }] } };
    const result = await executeQuizUpdate({ runId: 'audit-run', planEnvelope: plan as any, questionBindings: { 'question-01': { questionBankEntryId: 501, version: 1 } }, target: { course_id: 10, section_id: 20, quiz_id: 40 }, mcpClientManager: m, repositories: repositories() });
    expect(result.verified).toBe(true);
    expect(q.max_mark, 'The actual quiz weighting must follow the approved mark').toBe(5);
  });
});
