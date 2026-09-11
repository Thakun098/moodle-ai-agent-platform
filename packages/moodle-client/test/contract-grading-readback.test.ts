import { describe, expect, it } from 'vitest';
import { parseQuizQuestionSlots } from '../src/response-validators.js';
import { serializeUpdateAssignmentParams, serializeUpdateQuizQuestionParams } from '../src/serializers.js';

describe('mutation preconditions and grading wire contracts', () => {
  it('serializes assignment target guards', () => {
    const form = serializeUpdateAssignmentParams({ activityId: 42, expectedCourseId: 10, expectedSectionId: 20, name: 'New' });
    expect(Object.fromEntries(form)).toMatchObject({ activity_id: '42', expected_course_id: '10', expected_section_id: '20' });
  });
  it('serializes scoped slot mark and expected version', () => {
    const form = serializeUpdateQuizQuestionParams({ questionBankEntryId: 501, activityId: 30, maxMark: 5, expectedVersion: 1, defaultMark: 5 });
    expect(Object.fromEntries(form)).toMatchObject({ question_bank_entry_id: '501', activity_id: '30', maxmark: '5', expected_version: '1', defaultmark: '5' });
  });
  const slot = { slot_id: 1, slot_number: 1, page: 1, maxmark: 2, question_bank_entry_id: 501, question_id: 601, version: 2, name: 'Q', qtype: 'shortanswer', questiontext: 'Q?', defaultmark: 2, answers: [{ id: 1, text: 'Answer', fraction: 1, feedback: '' }] };
  it('preserves grading readback, including false flags', () => {
    const read = parseQuizQuestionSlots([{ ...slot, generalfeedback: 'Feedback', case_sensitive: 0, grading_guidance: 'Guidance', correct_answer: 0 }])[0];
    expect(read).toMatchObject({ maxMark: 2, generalFeedback: 'Feedback', caseSensitive: false, gradingGuidance: 'Guidance', correctAnswer: false });
  });
  it('rejects invalid boolean flags rather than normalizing them to false', () => {
    expect(() => parseQuizQuestionSlots([{ ...slot, case_sensitive: 2 }])).toThrow('Expected 0 or 1');
  });
});
