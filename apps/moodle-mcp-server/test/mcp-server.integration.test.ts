import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMoodleMcpServer } from '../src/server.js';

// Auto-load root .env if present
function loadRootEnv(): void {
  const envPath = resolve(__dirname, '../../../.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [k, ...v] = trimmed.split('=');
        const key = k?.trim();
        const val = v.join('=').trim();
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadRootEnv();

const isLiveIntegration =
  process.env.MOODLE_INTEGRATION_TEST === '1' ||
  process.env.MOODLE_INTEGRATION_TEST === 'true';

describe.skipIf(!isLiveIntegration)(
  'Moodle MCP Server Live Moodle 5.1.x Integration (T0901–T0914)',
  () => {
    let client: Client;
    let moodleClient: MoodleClient;

    beforeAll(async () => {
      const baseUrl = process.env.MOODLE_BASE_URL || 'http://127.0.0.1:8000';
      const token = process.env.MOODLE_TOKEN || '';

      if (!token) {
        throw new Error('MOODLE_TOKEN must be set to run live MCP integration test');
      }

      moodleClient = new MoodleClient({
        baseUrl,
        token,
        timeoutMs: 30000,
      });

      const server = createMoodleMcpServer({ moodleClient });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      await server.connect(serverTransport);

      client = new Client(
        { name: 'live-integration-client', version: '0.1.0' },
        { capabilities: {} }
      );
      await client.connect(clientTransport);
    });

    afterAll(async () => {
      if (client) {
        await client.close();
      }
    });

    it('executes full live Moodle course creation, section, assignment, quiz, question and structure flow over MCP', async () => {
      const timestamp = Date.now();

      // 1. moodle_list_course_categories
      const catRes = await client.callTool({
        name: 'moodle_list_course_categories',
        arguments: {},
      });
      expect(catRes.isError).toBeFalsy();
      const categories = (catRes.structuredContent as any).data;
      expect(categories.length).toBeGreaterThan(0);
      const categoryId = categories[0].id;

      // 2. moodle_create_course
      const shortname = `MCP-TEST-${timestamp}`;
      const courseRes = await client.callTool({
        name: 'moodle_create_course',
        arguments: {
          category_id: categoryId,
          fullname: `MCP Test Course ${timestamp}`,
          shortname,
          summary: 'Created via MCP live integration test',
        },
      });
      expect(courseRes.isError).toBeFalsy();
      const course = (courseRes.structuredContent as any).data;
      expect(course.course_id).toBeGreaterThan(0);
      expect(course.visible).toBe(0); // default hidden

      // 3. moodle_create_section
      const secRes = await client.callTool({
        name: 'moodle_create_section',
        arguments: {
          course_id: course.course_id,
          position: 1,
          name: 'Section 1: Live Testing',
          summary: 'Section created via MCP',
        },
      });
      expect(secRes.isError).toBeFalsy();
      const section = (secRes.structuredContent as any).data;
      expect(section.section_id).toBeGreaterThan(0);

      // 4. moodle_create_assignment
      const assignRes = await client.callTool({
        name: 'moodle_create_assignment',
        arguments: {
          course_id: course.course_id,
          section_id: section.section_id,
          name: `Assignment ${timestamp}`,
          intro: 'Live assignment prompt',
          grade: 100,
        },
      });
      expect(assignRes.isError).toBeFalsy();
      const assignment = (assignRes.structuredContent as any).data;
      expect(assignment.activity_id).toBeGreaterThan(0);

      // 5. moodle_get_assignment
      const getAssignRes = await client.callTool({
        name: 'moodle_get_assignment',
        arguments: { activity_id: assignment.activity_id },
      });
      expect(getAssignRes.isError).toBeFalsy();
      expect((getAssignRes.structuredContent as any).data.online_text_enabled).toBe(1);

      // 6. moodle_update_assignment
      const updateAssignRes = await client.callTool({
        name: 'moodle_update_assignment',
        arguments: {
          activity_id: assignment.activity_id,
          name: `Assignment ${timestamp} (Updated)`,
          grade: 95,
        },
      });
      expect(updateAssignRes.isError).toBeFalsy();
      expect((updateAssignRes.structuredContent as any).data.grade).toBe(95);

      // 7. moodle_create_quiz
      const quizRes = await client.callTool({
        name: 'moodle_create_quiz',
        arguments: {
          course_id: course.course_id,
          section_id: section.section_id,
          name: `Quiz ${timestamp}`,
          grade: 10,
        },
      });
      expect(quizRes.isError).toBeFalsy();
      const quiz = (quizRes.structuredContent as any).data;
      expect(quiz.activity_id).toBeGreaterThan(0);

      // 8. moodle_get_quiz
      const getQuizRes = await client.callTool({
        name: 'moodle_get_quiz',
        arguments: { activity_id: quiz.activity_id },
      });
      expect(getQuizRes.isError).toBeFalsy();
      expect((getQuizRes.structuredContent as any).data.preferredbehaviour).toBe('deferredfeedback');

      // 9. moodle_create_quiz_question (multichoice)
      const mcqRes = await client.callTool({
        name: 'moodle_create_quiz_question',
        arguments: {
          activity_id: quiz.activity_id,
          name: `MCQ Question ${timestamp}`,
          question_text: 'Which is an MCP transport?',
          default_mark: 1,
          qtype: 'multichoice',
          options: {
            choices: [
              { text: 'stdio', fraction: 1, feedback: 'Correct!' },
              { text: 'floppy disk', fraction: 0 },
            ],
            shuffle_answers: true,
          },
        },
      });
      expect(mcqRes.isError).toBeFalsy();
      const mcq = (mcqRes.structuredContent as any).data;
      expect(mcq.question_bank_entry_id).toBeGreaterThan(0);
      expect(mcq.version).toBe(1);

      // 10. moodle_add_question_to_quiz
      const addRes = await client.callTool({
        name: 'moodle_add_question_to_quiz',
        arguments: {
          activity_id: quiz.activity_id,
          question_bank_entry_id: mcq.question_bank_entry_id,
          page: 1,
        },
      });
      expect(addRes.isError).toBeFalsy();
      const addedSlot = (addRes.structuredContent as any).data;
      expect(addedSlot.slot_id).toBeGreaterThan(0);

      // 11. moodle_get_quiz_questions
      const questionsRes = await client.callTool({
        name: 'moodle_get_quiz_questions',
        arguments: { activity_id: quiz.activity_id },
      });
      expect(questionsRes.isError).toBeFalsy();
      const slots = (questionsRes.structuredContent as any).data;
      expect(slots.length).toBe(1);
      expect(slots[0].question_bank_entry_id).toBe(mcq.question_bank_entry_id);

      // 12. moodle_update_quiz_question (create version 2)
      const updateQRes = await client.callTool({
        name: 'moodle_update_quiz_question',
        arguments: {
          question_bank_entry_id: mcq.question_bank_entry_id,
          name: `MCQ Question ${timestamp} (v2)`,
        },
      });
      expect(updateQRes.isError).toBeFalsy();
      const updatedQ = (updateQRes.structuredContent as any).data;
      expect(updatedQ.version).toBe(2);

      // 13. moodle_get_course_structure
      const structRes = await client.callTool({
        name: 'moodle_get_course_structure',
        arguments: { course_id: course.course_id },
      });
      expect(structRes.isError).toBeFalsy();
      const structure = (structRes.structuredContent as any).data;
      expect(structure.course.id).toBe(course.course_id);
      expect(structure.sections.length).toBeGreaterThan(0);

      // 14. Test duplicate question conflict rejection -> CONFLICT
      const duplicateRes = await client.callTool({
        name: 'moodle_add_question_to_quiz',
        arguments: {
          activity_id: quiz.activity_id,
          question_bank_entry_id: mcq.question_bank_entry_id,
        },
      });
      expect(duplicateRes.isError).toBe(true);
      expect((duplicateRes.structuredContent as any).code).toBe('CONFLICT');
    });
  }
);
