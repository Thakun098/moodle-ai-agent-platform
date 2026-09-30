import { expect, it, vi } from 'vitest';
import { MoodleClient } from '../src/client.js';
import { parseCompetencyFrameworkPreflight } from '../src/response-validators.js';

it('requires positive identity and authority signature for ENABLED', () => {
  expect(parseCompetencyFrameworkPreflight({ status: 'ENABLED', reason: 'CONFIGURED', framework_id: 3, framework_signature: 'a'.repeat(64), message: 'Ready' }).frameworkId).toBe(3);
  for (const framework_id of [null, 0, -1, 1.5]) {
    expect(() => parseCompetencyFrameworkPreflight({ status: 'ENABLED', reason: 'CONFIGURED', framework_id, framework_signature: 'a'.repeat(64), message: 'Ready' })).toThrow();
  }
});

it('rejects indeterminate responses rather than converting them to bypass', () => {
  for (const raw of [null, {}, { status: 'UNKNOWN' }, { status: 'BYPASSED', reason: 'NO_SCALE', framework_id: 3, framework_signature: null, message: 'Skipped' }]) {
    expect(() => parseCompetencyFrameworkPreflight(raw)).toThrow();
  }
  expect(parseCompetencyFrameworkPreflight({ status: 'BYPASSED', reason: 'DEFAULT_SCALE_UNAVAILABLE', framework_id: null, framework_signature: null, message: 'Skipped' }).status).toBe('BYPASSED');
});

it('sends only the narrow plugin preflight and preserves read-only exact selection', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ENABLED', reason: 'CONFIGURED_FRAMEWORK', framework_id: 7, framework_signature: 'a'.repeat(64), message: 'Ready' })));
  const client = new MoodleClient({ baseUrl: 'https://moodle.test', token: 'test', fetch });
  await client.competencyFrameworkPreflight({ configuredFrameworkId: 7, provisionDefault: false });
  const body = new URLSearchParams(fetch.mock.calls[0]![1].body);
  expect(body.get('wsfunction')).toBe('local_agentpoc_competency_framework_preflight');
  expect(body.get('configured_framework_id')).toBe('7');
  expect(body.get('provision_default')).toBe('0');
  await expect(client.competencyFrameworkPreflight({ configuredFrameworkId: 0 })).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
