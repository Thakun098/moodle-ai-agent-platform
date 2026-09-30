import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Moodle MCP Server Stdio Subprocess Protocol Smoke Test (P9-D3, T0913)', () => {
  it('connects via StdioClientTransport and discovers all tools over stdio JSON-RPC', async () => {
    // Resolve entrypoint path
    const serverPath = resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: process.execPath, // node
      args: [serverPath],
      env: {
        ...process.env,
        MOODLE_BASE_URL: 'http://127.0.0.1:8000',
        MOODLE_TOKEN: 'stdio-smoke-token',
      },
    });

    const client = new Client(
      { name: 'stdio-smoke-client', version: '0.1.0' },
      { capabilities: {} }
    );

    try {
      await client.connect(transport);

      // 1. Tool Discovery Proof (T0913) over Stdio
      const toolList = await client.listTools();
      expect(toolList.tools).toBeDefined();
      expect(toolList.tools.length).toBe(23);

      const toolNames = toolList.tools.map((t) => t.name);
      expect(toolNames).toContain('moodle_competency_framework_preflight');
      expect(toolNames).toContain('moodle_list_competency_frameworks');
      expect(toolNames).toContain('moodle_create_competency');
      expect(toolNames).toContain('moodle_add_competency_to_course');
      expect(toolNames).toContain('moodle_add_competency_to_activity');
      expect(toolNames).toContain('moodle_get_course_competencies');
      expect(toolNames).toContain('moodle_list_course_categories');
      expect(toolNames).toContain('moodle_list_course_formats');
      expect(toolNames).toContain('moodle_create_resource');
      expect(toolNames).toContain('moodle_create_course');
      expect(toolNames).toContain('moodle_create_section');
      expect(toolNames).toContain('moodle_get_course_structure');
      expect(toolNames).toContain('moodle_create_assignment');
      expect(toolNames).toContain('moodle_get_assignment');
      expect(toolNames).toContain('moodle_update_assignment');
      expect(toolNames).toContain('moodle_create_quiz');
      expect(toolNames).toContain('moodle_get_quiz');
      expect(toolNames).toContain('moodle_update_quiz');
      expect(toolNames).toContain('moodle_get_quiz_questions');
      expect(toolNames).toContain('moodle_create_quiz_question');
      expect(toolNames).toContain('moodle_update_quiz_question');
      expect(toolNames).toContain('moodle_add_question_to_quiz');
      expect(toolNames).toContain('moodle_get_course_risk_evidence');

      // 2. Protocol Call & Stdio Frame Isolation
      const invalidCallRes = await client.callTool({
        name: 'moodle_create_course',
        arguments: {
          category_id: -99,
          fullname: '',
          shortname: '',
        },
      });

      expect(invalidCallRes.isError).toBe(true);
      expect(invalidCallRes.content).toBeDefined();
      expect(invalidCallRes.content[0]?.text).toContain('category_id');
    } finally {
      await client.close();
    }
  }, 15_000);
});
