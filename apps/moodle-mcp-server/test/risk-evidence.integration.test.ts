import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMoodleMcpServer } from '../src/server.js';

function loadRootEnv(): void {
  const envPath = resolve(__dirname, '../../../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [keyPart, ...valueParts] = trimmed.split('=');
    const key = keyPart?.trim();
    if (key && !process.env[key]) process.env[key] = valueParts.join('=').trim();
  }
}
loadRootEnv();

const enabled = process.env.MOODLE_INTEGRATION_TEST === '1' || process.env.MOODLE_INTEGRATION_TEST === 'true';
const courseId = Number(process.env.RISK_EVIDENCE_COURSE_ID || 20);
const fixtureStudentId = Number(process.env.RISK_EVIDENCE_STUDENT_ID || 4);
const fixtureCompetencyId = Number(process.env.RISK_EVIDENCE_COMPETENCY_ID || 1);

describe.skipIf(!enabled)('Ticket 07 live consolidated Risk evidence', () => {
  let client: Client;

  beforeAll(async () => {
    const moodleClient = new MoodleClient({
      baseUrl: process.env.MOODLE_BASE_URL || 'http://127.0.0.1:8000',
      token: process.env.MOODLE_TOKEN || '',
      timeoutMs: 30_000,
    });
    const server = createMoodleMcpServer({ moodleClient });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'ticket07-live', version: '0.1.0' }, { capabilities: {} });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('reads all factual datasets and real competency mapping through MCP without Risk semantics', async () => {
    const result = await client.callTool({
      name: 'moodle_get_course_risk_evidence',
      arguments: { course_id: courseId },
    });
    expect(result.isError).toBeFalsy();
    const payload = (result.structuredContent as any).data;
    expect(payload.schema_version).toBe('0.1');
    expect(payload.course.course_id).toBe(courseId);
    expect(payload.dataset_status.map((item: any) => item.status)).toEqual([
      'OK', 'OK', 'OK', 'OK', 'OK', 'OK',
    ]);
    expect(payload.activities.length).toBeGreaterThan(0);
    expect(payload.quizzes.length).toBeGreaterThan(0);
    expect(payload.assignments.length).toBeGreaterThan(0);
    expect(payload.competencies.activity_links.length).toBeGreaterThan(0);
    const rating = payload.competencies.ratings.find(
      (item: any) => item.student_id === fixtureStudentId && item.competency_id === fixtureCompetencyId
    );
    expect(rating).toMatchObject({ proficiency: false, grade: 1 });
    expect(rating.evidence.length).toBeGreaterThan(0);
    expect(payload.risk_level).toBeUndefined();
  });
});
