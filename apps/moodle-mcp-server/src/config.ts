/**
 * Safe configuration loader for @moodle-agent-poc/moodle-mcp-server
 */

export interface MoodleMcpServerConfig {
  readonly moodleBaseUrl: string;
  readonly moodleToken: string;
  readonly moodleTimeoutMs: number;
}

export function loadMcpConfig(
  env: Record<string, string | undefined> = process.env
): MoodleMcpServerConfig {
  const moodleBaseUrl = env.MOODLE_BASE_URL?.trim() || 'http://localhost:8000';
  const moodleToken = env.MOODLE_TOKEN?.trim() || '';
  
  let moodleTimeoutMs = 30000;
  if (env.MOODLE_TIMEOUT_MS && env.MOODLE_TIMEOUT_MS.trim() !== '') {
    const parsed = Number(env.MOODLE_TIMEOUT_MS.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      moodleTimeoutMs = parsed;
    }
  }

  return Object.freeze({
    moodleBaseUrl,
    moodleToken,
    moodleTimeoutMs,
  });
}
