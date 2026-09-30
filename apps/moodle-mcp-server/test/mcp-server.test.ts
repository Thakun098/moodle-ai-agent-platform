import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  MoodleAuthenticationError,
  MoodleAuthorizationError,
  MoodleConflictError,
  MoodleInvalidParameterError,
  MoodleNetworkError,
  MoodleResourceNotFoundError,
  MoodleResponseError,
} from '@moodle-agent-poc/moodle-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMcpError, redactSensitiveTokens } from '../src/errors.js';
import { CreateCourseInputSchema } from '../src/schemas/index.js';
import { createMoodleMcpServer } from '../src/server.js';
import { FakeMoodleClient } from './helpers/fake-moodle-client.js';

describe('Moodle MCP Server In-Memory Integration (T0901–T0914)', () => {
  let fakeClient: FakeMoodleClient;
  let client: Client;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    fakeClient = new FakeMoodleClient();
    const server = createMoodleMcpServer({ moodleClient: fakeClient });

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    client = new Client(
      { name: 'test-mcp-client', version: '0.1.0' },
      { capabilities: {} }
    );
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('T0913 — In-Memory Tool Discovery Proof', () => {
    it('discovers all canonical Moodle tools with input and output schemas', async () => {
      const response = await client.listTools();
      expect(response.tools).toBeDefined();
      expect(response.tools.length).toBe(23);

      const expectedToolNames = [
        'moodle_list_course_categories',
        'moodle_list_course_formats',
        'moodle_create_resource',
        'moodle_create_course',
        'moodle_create_section',
        'moodle_get_course_structure',
        'moodle_get_course_risk_evidence',
        'moodle_create_assignment',
        'moodle_get_assignment',
        'moodle_update_assignment',
        'moodle_create_quiz',
        'moodle_get_quiz',
        'moodle_update_quiz',
        'moodle_get_quiz_questions',
        'moodle_create_quiz_question',
        'moodle_update_quiz_question',
        'moodle_add_question_to_quiz',
        'moodle_list_competency_frameworks',
        'moodle_competency_framework_preflight',
        'moodle_create_competency',
        'moodle_add_competency_to_course',
        'moodle_add_competency_to_activity',
        'moodle_get_course_competencies',
      ];

      const toolNames = response.tools.map((t) => t.name);
      for (const expected of expectedToolNames) {
        expect(toolNames).toContain(expected);
      }

      // Assert all tools have descriptions and valid JSON schemas
      for (const tool of response.tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('T0914 — In-Memory Tool Execution Proofs', () => {
    it('preflight preserves exact chosen framework and disables provisioning for Execute', async () => {
      const preflight = vi.spyOn(fakeClient, 'competencyFrameworkPreflight').mockResolvedValue({
        status: 'ENABLED', reason: 'CONFIGURED_FRAMEWORK', frameworkId: 7, frameworkSignature: 'a'.repeat(64), message: 'Ready',
      });
      const result = await client.callTool({ name: 'moodle_competency_framework_preflight', arguments: { configured_framework_id: 7, provision_default: false } });
      expect(result.isError).toBeFalsy();
      expect(preflight).toHaveBeenCalledWith({ configuredFrameworkId: 7, provisionDefault: false });
      expect(result.structuredContent).toMatchObject({ status: 'success', data: { status: 'ENABLED', framework_id: 7, framework_signature: 'a'.repeat(64) } });
    });

    it('preflight authentication and transport errors remain actionable errors', async () => {
      const preflight = vi.spyOn(fakeClient, 'competencyFrameworkPreflight');
      for (const error of [new MoodleAuthenticationError('Invalid token'), new MoodleNetworkError('Offline')]) {
        preflight.mockRejectedValueOnce(error);
        const result = await client.callTool({ name: 'moodle_competency_framework_preflight', arguments: {} });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).not.toMatchObject({ data: { status: 'BYPASSED' } });
      }
    });
    it('executes moodle_list_course_categories (T0903)', async () => {
      const result = await client.callTool({
        name: 'moodle_list_course_categories',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toBeDefined();
      const content = result.structuredContent as { status: string; data: Array<{ id: number; name: string }> };
      expect(content.status).toBe('success');
      expect(content.data.length).toBe(2);
      expect(content.data[0]?.name).toBe('Miscellaneous');
    });

    it('executes moodle_list_course_formats', async () => {
      const result = await client.callTool({
        name: 'moodle_list_course_formats',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as { status: string; data: Array<{ value: string; name: string }> };
      expect(content.status).toBe('success');
      expect(content.data.map((format) => format.value)).toEqual(['topics', 'weeks']);
    });

    it('executes moodle_create_course (T0904)', async () => {
      const result = await client.callTool({
        name: 'moodle_create_course',
        arguments: {
          category_id: 1,
          fullname: 'Machine Learning',
          shortname: 'ML101',
          summary: 'Intro ML',
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as { status: string; data: { course_id: number; shortname: string } };
      expect(content.status).toBe('success');
      expect(content.data.course_id).toBeGreaterThan(0);
      expect(content.data.shortname).toBe('ML101');
    });

    it('executes moodle_create_section (T0905)', async () => {
      const courseRes = await client.callTool({
        name: 'moodle_create_course',
        arguments: { category_id: 1, fullname: 'Course', shortname: 'C1' },
      });
      const courseId = (courseRes.structuredContent as any).data.course_id;

      const result = await client.callTool({
        name: 'moodle_create_section',
        arguments: {
          course_id: courseId,
          position: 1,
          name: 'Section 1',
        },
      });

      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as { status: string; data: { section_id: number; section_num: number } };
      expect(content.status).toBe('success');
      expect(content.data.section_num).toBe(1);
    });

    it('executes moodle_create_resource from an existing material snapshot file', async () => {
      const result = await client.callTool({
        name: 'moodle_create_resource',
        arguments: { course_id: 101, section_id: 201, name: 'week-1', filename: 'week-1.txt', moodle_material_id: 10, source_run_id: 'run-01', source_structure_revision: 1, source_section_ref: 'section-01', source_material_revision: 1 },
      });
      expect(result.isError).toBeFalsy();
      const content = result.structuredContent as { status: string; data: { name: string; filename: string; moodle_material_id: number } };
      expect(content.status).toBe('success');
      expect(content.data).toMatchObject({ name: 'week-1', filename: 'week-1.txt', moodle_material_id: 10 });
    });

    it('executes Assignment tools: create, get, update (T0907)', async () => {
      const courseRes = await client.callTool({
        name: 'moodle_create_course',
        arguments: { category_id: 1, fullname: 'Course', shortname: 'C2' },
      });
      const courseId = (courseRes.structuredContent as any).data.course_id;

      const secRes = await client.callTool({
        name: 'moodle_create_section',
        arguments: { course_id: courseId, position: 1, name: 'Sec 1' },
      });
      const sectionId = (secRes.structuredContent as any).data.section_id;

      // Create Assignment
      const createRes = await client.callTool({
        name: 'moodle_create_assignment',
        arguments: {
          course_id: courseId,
          section_id: sectionId,
          name: 'Homework 1',
          intro: 'Complete exercises',
          grade: 100,
        },
      });
      expect(createRes.isError).toBeFalsy();
      const activityId = (createRes.structuredContent as any).data.activity_id;
      expect(activityId).toBeGreaterThan(0);

      // Get Assignment
      const getRes = await client.callTool({
        name: 'moodle_get_assignment',
        arguments: { activity_id: activityId },
      });
      expect(getRes.isError).toBeFalsy();
      expect((getRes.structuredContent as any).data.name).toBe('Homework 1');

      // Update Assignment
      const updateRes = await client.callTool({
        name: 'moodle_update_assignment',
        arguments: {
          activity_id: activityId,
          name: 'Homework 1 (Updated)',
          grade: 90,
        },
      });
      expect(updateRes.isError).toBeFalsy();
      expect((updateRes.structuredContent as any).data.name).toBe('Homework 1 (Updated)');
      expect((updateRes.structuredContent as any).data.grade).toBe(90);
    });

    it('executes Quiz tools: create, get, update, get_questions (T0908)', async () => {
      const courseRes = await client.callTool({
        name: 'moodle_create_course',
        arguments: { category_id: 1, fullname: 'Course', shortname: 'C3' },
      });
      const courseId = (courseRes.structuredContent as any).data.course_id;

      const secRes = await client.callTool({
        name: 'moodle_create_section',
        arguments: { course_id: courseId, position: 1, name: 'Sec 1' },
      });
      const sectionId = (secRes.structuredContent as any).data.section_id;

      // Create Quiz
      const createRes = await client.callTool({
        name: 'moodle_create_quiz',
        arguments: {
          course_id: courseId,
          section_id: sectionId,
          name: 'Quiz 1',
          grade: 20,
        },
      });
      expect(createRes.isError).toBeFalsy();
      const activityId = (createRes.structuredContent as any).data.activity_id;

      // Get Quiz
      const getRes = await client.callTool({
        name: 'moodle_get_quiz',
        arguments: { activity_id: activityId },
      });
      expect(getRes.isError).toBeFalsy();
      expect((getRes.structuredContent as any).data.name).toBe('Quiz 1');

      // Update Quiz
      const updateRes = await client.callTool({
        name: 'moodle_update_quiz',
        arguments: {
          activity_id: activityId,
          name: 'Quiz 1 Revised',
        },
      });
      expect(updateRes.isError).toBeFalsy();
      expect((updateRes.structuredContent as any).data.name).toBe('Quiz 1 Revised');

      // Get Quiz Questions (empty initially)
      const qRes = await client.callTool({
        name: 'moodle_get_quiz_questions',
        arguments: { activity_id: activityId },
      });
      expect(qRes.isError).toBeFalsy();
      expect((qRes.structuredContent as any).data).toEqual([]);
    });

    it('executes Question tools for all 4 types and slots questions into Quiz (T0909)', async () => {
      const courseRes = await client.callTool({
        name: 'moodle_create_course',
        arguments: { category_id: 1, fullname: 'Course', shortname: 'C4' },
      });
      const courseId = (courseRes.structuredContent as any).data.course_id;

      const secRes = await client.callTool({
        name: 'moodle_create_section',
        arguments: { course_id: courseId, position: 1, name: 'Sec 1' },
      });
      const sectionId = (secRes.structuredContent as any).data.section_id;

      const quizRes = await client.callTool({
        name: 'moodle_create_quiz',
        arguments: { course_id: courseId, section_id: sectionId, name: 'Quiz' },
      });
      const quizActivityId = (quizRes.structuredContent as any).data.activity_id;

      // 1. Multichoice
      const mcqRes = await client.callTool({
        name: 'moodle_create_quiz_question',
        arguments: {
          activity_id: quizActivityId,
          name: 'MCQ 1',
          question_text: 'What is 1+1?',
          default_mark: 1,
          qtype: 'multichoice',
          options: {
            choices: [
              { text: '2', fraction: 1, feedback: 'Correct' },
              { text: '3', fraction: 0 },
            ],
          },
        },
      });
      expect(mcqRes.isError).toBeFalsy();
      const mcqBankEntryId = (mcqRes.structuredContent as any).data.question_bank_entry_id;

      // 2. True/False
      const tfRes = await client.callTool({
        name: 'moodle_create_quiz_question',
        arguments: {
          activity_id: quizActivityId,
          name: 'TF 1',
          question_text: 'Earth is round.',
          default_mark: 1,
          qtype: 'truefalse',
          options: {
            correct_answer: true,
          },
        },
      });
      expect(tfRes.isError).toBeFalsy();
      const tfBankEntryId = (tfRes.structuredContent as any).data.question_bank_entry_id;

      // 3. Short Answer
      const saRes = await client.callTool({
        name: 'moodle_create_quiz_question',
        arguments: {
          activity_id: quizActivityId,
          name: 'SA 1',
          question_text: 'Capital of UK?',
          default_mark: 1,
          qtype: 'shortanswer',
          options: {
            accepted_answers: ['London', 'london'],
          },
        },
      });
      expect(saRes.isError).toBeFalsy();
      const saBankEntryId = (saRes.structuredContent as any).data.question_bank_entry_id;

      // 4. Essay (without options, per Correction 4)
      const essayRes = await client.callTool({
        name: 'moodle_create_quiz_question',
        arguments: {
          activity_id: quizActivityId,
          name: 'Essay 1',
          question_text: 'Discuss neural networks.',
          default_mark: 5,
          qtype: 'essay',
        },
      });
      expect(essayRes.isError).toBeFalsy();
      const essayBankEntryId = (essayRes.structuredContent as any).data.question_bank_entry_id;

      // Add all 4 questions to Quiz (T0909)
      const add1 = await client.callTool({
        name: 'moodle_add_question_to_quiz',
        arguments: { activity_id: quizActivityId, question_bank_entry_id: mcqBankEntryId, page: 1 },
      });
      expect(add1.isError).toBeFalsy();

      const add2 = await client.callTool({
        name: 'moodle_add_question_to_quiz',
        arguments: { activity_id: quizActivityId, question_bank_entry_id: tfBankEntryId, page: 1 },
      });
      expect(add2.isError).toBeFalsy();

      const add3 = await client.callTool({
        name: 'moodle_add_question_to_quiz',
        arguments: { activity_id: quizActivityId, question_bank_entry_id: saBankEntryId, page: 2 },
      });
      expect(add3.isError).toBeFalsy();

      const add4 = await client.callTool({
        name: 'moodle_add_question_to_quiz',
        arguments: { activity_id: quizActivityId, question_bank_entry_id: essayBankEntryId, page: 2 },
      });
      expect(add4.isError).toBeFalsy();

      // Verify questions in quiz
      const slotsRes = await client.callTool({
        name: 'moodle_get_quiz_questions',
        arguments: { activity_id: quizActivityId },
      });
      expect(slotsRes.isError).toBeFalsy();
      const slots = (slotsRes.structuredContent as any).data;
      expect(slots.length).toBe(4);

      // Update question (metadata-only)
      const updateMetaRes = await client.callTool({
        name: 'moodle_update_quiz_question',
        arguments: {
          question_bank_entry_id: mcqBankEntryId,
          name: 'MCQ 1 (Updated)',
        },
      });
      expect(updateMetaRes.isError).toBeFalsy();
      expect((updateMetaRes.structuredContent as any).data.version).toBe(2);

      // Update question (essay with options)
      const updateEssayRes = await client.callTool({
        name: 'moodle_update_quiz_question',
        arguments: {
          question_bank_entry_id: essayBankEntryId,
          qtype: 'essay',
          options: {
            grading_guidance: 'Updated guidance',
          },
        },
      });
      expect(updateEssayRes.isError).toBeFalsy();
      expect((updateEssayRes.structuredContent as any).data.version).toBe(2);
    });

    it('executes consolidated factual CourseRiskEvidence without Risk severity', async () => {
      const courseRes = await client.callTool({
        name: 'moodle_create_course',
        arguments: { category_id: 1, fullname: 'Risk Evidence Course', shortname: 'RISK-EVIDENCE' },
      });
      const courseId = (courseRes.structuredContent as any).data.course_id;
      const result = await client.callTool({
        name: 'moodle_get_course_risk_evidence',
        arguments: { course_id: courseId },
      });
      expect(result.isError).toBeFalsy();
      const payload = (result.structuredContent as any).data;
      expect(payload.schema_version).toBe('0.1');
      expect(payload.course.course_id).toBe(courseId);
      expect(payload.dataset_status).toHaveLength(6);
      expect(payload.risk_level).toBeUndefined();
    });
    it('executes moodle_get_course_structure and returns full course tree (T0906)', async () => {
      const courseRes = await client.callTool({
        name: 'moodle_create_course',
        arguments: { category_id: 1, fullname: 'Structure Course', shortname: 'SC1' },
      });
      const courseId = (courseRes.structuredContent as any).data.course_id;

      const secRes = await client.callTool({
        name: 'moodle_create_section',
        arguments: { course_id: courseId, position: 1, name: 'Section 1' },
      });
      const sectionId = (secRes.structuredContent as any).data.section_id;

      await client.callTool({
        name: 'moodle_create_assignment',
        arguments: { course_id: courseId, section_id: sectionId, name: 'A1', intro: 'Do' },
      });

      await client.callTool({
        name: 'moodle_create_quiz',
        arguments: { course_id: courseId, section_id: sectionId, name: 'Q1' },
      });

      const structRes = await client.callTool({
        name: 'moodle_get_course_structure',
        arguments: { course_id: courseId },
      });

      expect(structRes.isError).toBeFalsy();
      const struct = (structRes.structuredContent as any).data;
      expect(struct.course.id).toBe(courseId);
      expect(struct.sections.length).toBe(1);
      expect(struct.sections[0].activities.length).toBe(2);
      expect(struct.sections[0].activities.map((a: any) => a.module_name)).toEqual(['assign', 'quiz']);
    });
  });

  describe('T0912 — Typed MCP Error Translation & Security', () => {
    it('translates schema validation errors into INVALID_ARGUMENTS with isError: true', async () => {
      const res = await client.callTool({
        name: 'moodle_create_course',
        arguments: {
          category_id: -1, // invalid
          fullname: '',
          shortname: 'S',
        },
      });

      expect(res.isError).toBe(true);
      expect(res.content).toBeDefined();
      expect(res.content[0]?.text).toContain('category_id');

      // Test formatMcpError with ZodError directly
      const zodErr = CreateCourseInputSchema.safeParse({ category_id: -1, fullname: '', shortname: 'S' });
      if (!zodErr.success) {
        const formatted = formatMcpError(zodErr.error);
        expect(formatted.isError).toBe(true);
        const err = formatted.structuredContent as { status: string; code: string; message: string };
        expect(err.status).toBe('error');
        expect(err.code).toBe('INVALID_ARGUMENTS');
        expect(err.message).toContain('category_id');
      }
    });

    it('translates MoodleResourceNotFoundError into RESOURCE_NOT_FOUND with isError: true', async () => {
      const res = await client.callTool({
        name: 'moodle_get_assignment',
        arguments: { activity_id: 999999 },
      });

      expect(res.isError).toBe(true);
      const err = res.structuredContent as { status: string; code: string; message: string };
      expect(err.status).toBe('error');
      expect(err.code).toBe('RESOURCE_NOT_FOUND');
      expect(err.message).toContain('999999');
    });

    it('translates duplicate question in quiz into CONFLICT with isError: true', async () => {
      // Setup course, section, quiz, question
      const c = (await client.callTool({ name: 'moodle_create_course', arguments: { category_id: 1, fullname: 'C', shortname: 'C' } }) as any).structuredContent.data;
      const s = (await client.callTool({ name: 'moodle_create_section', arguments: { course_id: c.course_id, position: 1, name: 'S' } }) as any).structuredContent.data;
      const q = (await client.callTool({ name: 'moodle_create_quiz', arguments: { course_id: c.course_id, section_id: s.section_id, name: 'Q' } }) as any).structuredContent.data;
      const qn = (await client.callTool({ name: 'moodle_create_quiz_question', arguments: { activity_id: q.activity_id, name: 'QN', question_text: 'T', qtype: 'truefalse', options: { correct_answer: true } } }) as any).structuredContent.data;

      // Add once -> success
      const add1 = await client.callTool({
        name: 'moodle_add_question_to_quiz',
        arguments: { activity_id: q.activity_id, question_bank_entry_id: qn.question_bank_entry_id },
      });
      expect(add1.isError).toBeFalsy();

      // Add duplicate -> CONFLICT
      const add2 = await client.callTool({
        name: 'moodle_add_question_to_quiz',
        arguments: { activity_id: q.activity_id, question_bank_entry_id: qn.question_bank_entry_id },
      });
      expect(add2.isError).toBe(true);
      const err = add2.structuredContent as { status: string; code: string };
      expect(err.code).toBe('CONFLICT');
    });

    it('sanitizes unexpected internal errors and does not echo sensitive internal stack/message', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const unexpected = new Error('Moodle token super_secret_123 leaked in this message');

      const res = formatMcpError(unexpected);
      expect(res.isError).toBe(true);
      const payload = res.structuredContent as { status: string; code: string; message: string };
      expect(payload.code).toBe('INTERNAL_ERROR');
      expect(payload.message).toBe('An internal error occurred while processing the tool request');
      expect(payload.message).not.toContain('super_secret_123');
      expect(consoleSpy).toHaveBeenCalledWith(
        '[moodle-mcp-server] Unexpected internal error (details withheld)'
      );

      consoleSpy.mockRestore();
    });

    it('redacts tokens matching known token strings or URL query patterns (R14, P9-D5)', () => {
      const secretToken = 'abcdef1234567890moodletoken';
      const msg = `Failed request to http://moodle.local/webservice/rest/server.php?wstoken=${secretToken}&action=test with token ${secretToken}`;
      const redacted = redactSensitiveTokens(msg, secretToken);

      expect(redacted).not.toContain(secretToken);
      expect(redacted).toContain('[REDACTED_TOKEN]');
    });

    it('translates all MoodleClientError subtypes correctly', () => {
      expect((formatMcpError(new MoodleAuthenticationError('bad token')).structuredContent as any).code).toBe('AUTH_ERROR');
      expect((formatMcpError(new MoodleAuthorizationError('no capability')).structuredContent as any).code).toBe('PERMISSION_DENIED');
      expect((formatMcpError(new MoodleInvalidParameterError('bad param')).structuredContent as any).code).toBe('INVALID_PARAMETER');
      expect((formatMcpError(new MoodleNetworkError('connect ECONNREFUSED')).structuredContent as any).code).toBe('NETWORK_ERROR');
      expect((formatMcpError(new MoodleResponseError('malformed json')).structuredContent as any).code).toBe('INVALID_RESPONSE');
    });
  });

  describe('T0914 — Multi-step Chained Workflow Proof Without LLM', () => {
    it('executes complete 14-step course materialization pipeline end-to-end', async () => {
      // Step 1: List categories
      const catRes = (await client.callTool({ name: 'moodle_list_course_categories', arguments: {} }) as any).structuredContent.data;
      const categoryId = catRes[0].id;
      expect(categoryId).toBe(1);

      // Step 2: Create Course
      const courseRes = (await client.callTool({
        name: 'moodle_create_course',
        arguments: { category_id: categoryId, fullname: 'Autonomous Systems', shortname: 'AUTO101' },
      }) as any).structuredContent.data;
      const courseId = courseRes.course_id;

      // Step 3: Create Section
      const secRes = (await client.callTool({
        name: 'moodle_create_section',
        arguments: { course_id: courseId, position: 1, name: 'Week 1: Foundations' },
      }) as any).structuredContent.data;
      const sectionId = secRes.section_id;

      // Step 4: Create Assignment
      const assignRes = (await client.callTool({
        name: 'moodle_create_assignment',
        arguments: { course_id: courseId, section_id: sectionId, name: 'Self-Driving Essay', intro: 'Write 300 words' },
      }) as any).structuredContent.data;
      const assignmentActivityId = assignRes.activity_id;

      // Step 5: Create Quiz
      const quizRes = (await client.callTool({
        name: 'moodle_create_quiz',
        arguments: { course_id: courseId, section_id: sectionId, name: 'Foundations Quiz' },
      }) as any).structuredContent.data;
      const quizActivityId = quizRes.activity_id;

      // Step 6: Create Multichoice Question
      const mcq = (await client.callTool({
        name: 'moodle_create_quiz_question',
        arguments: {
          activity_id: quizActivityId,
          name: 'Q1 MCQ',
          question_text: 'What is LiDAR?',
          qtype: 'multichoice',
          options: { choices: [{ text: 'Light Detection and Ranging', fraction: 1 }, { text: 'Sound Navigation', fraction: 0 }] },
        },
      }) as any).structuredContent.data;

      // Step 7: Create TrueFalse Question
      const tf = (await client.callTool({
        name: 'moodle_create_quiz_question',
        arguments: {
          activity_id: quizActivityId,
          name: 'Q2 TF',
          question_text: 'Cameras operate on sound.',
          qtype: 'truefalse',
          options: { correct_answer: false },
        },
      }) as any).structuredContent.data;

      // Step 8: Create ShortAnswer Question
      const sa = (await client.callTool({
        name: 'moodle_create_quiz_question',
        arguments: {
          activity_id: quizActivityId,
          name: 'Q3 SA',
          question_text: 'What does GPS stand for?',
          qtype: 'shortanswer',
          options: { accepted_answers: ['Global Positioning System'] },
        },
      }) as any).structuredContent.data;

      // Step 9: Create Essay Question
      const essay = (await client.callTool({
        name: 'moodle_create_quiz_question',
        arguments: {
          activity_id: quizActivityId,
          name: 'Q4 Essay',
          question_text: 'Compare Radar vs LiDAR.',
          qtype: 'essay',
          options: { grading_guidance: 'Compare wave lengths' },
        },
      }) as any).structuredContent.data;

      // Step 10: Slot all questions into Quiz
      await client.callTool({ name: 'moodle_add_question_to_quiz', arguments: { activity_id: quizActivityId, question_bank_entry_id: mcq.question_bank_entry_id } });
      await client.callTool({ name: 'moodle_add_question_to_quiz', arguments: { activity_id: quizActivityId, question_bank_entry_id: tf.question_bank_entry_id } });
      await client.callTool({ name: 'moodle_add_question_to_quiz', arguments: { activity_id: quizActivityId, question_bank_entry_id: sa.question_bank_entry_id } });
      await client.callTool({ name: 'moodle_add_question_to_quiz', arguments: { activity_id: quizActivityId, question_bank_entry_id: essay.question_bank_entry_id } });

      // Step 11: Update Question
      const updatedQ = (await client.callTool({
        name: 'moodle_update_quiz_question',
        arguments: { question_bank_entry_id: mcq.question_bank_entry_id, name: 'Q1 LiDAR (Revised)' },
      }) as any).structuredContent.data;
      expect(updatedQ.version).toBe(2);

      // Step 12: Verify Quiz Questions
      const quizQuestions = (await client.callTool({
        name: 'moodle_get_quiz_questions',
        arguments: { activity_id: quizActivityId },
      }) as any).structuredContent.data;
      expect(quizQuestions.length).toBe(4);

      // Step 13: Update Assignment
      const updatedAssign = (await client.callTool({
        name: 'moodle_update_assignment',
        arguments: { activity_id: assignmentActivityId, grade: 80 },
      }) as any).structuredContent.data;
      expect(updatedAssign.grade).toBe(80);

      // Step 14: Get Course Structure & Verify
      const structure = (await client.callTool({
        name: 'moodle_get_course_structure',
        arguments: { course_id: courseId },
      }) as any).structuredContent.data;

      expect(structure.course.id).toBe(courseId);
      expect(structure.sections.length).toBe(1);
      expect(structure.sections[0].activities.length).toBe(2);
    });
  });
});
