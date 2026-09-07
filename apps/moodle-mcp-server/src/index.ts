import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMcpConfig } from './config.js';
import { createMoodleMcpServer } from './server.js';

export * from './config.js';
export * from './errors.js';
export * from './schemas/index.js';
export * from './server.js';
export * from './tools/index.js';
export * from './types.js';

/**
 * Main entry point when invoked via CLI/subprocess (P9-D3).
 */
export async function runServer(): Promise<void> {
  const config = loadMcpConfig();

  const moodleClient = new MoodleClient({
    baseUrl: config.moodleBaseUrl,
    token: config.moodleToken,
    timeoutMs: config.moodleTimeoutMs,
  });

  const server = createMoodleMcpServer({ moodleClient });
  const transport = new StdioServerTransport();

  // All informational / diagnostic logging MUST go to stderr to prevent stdout JSON-RPC corruption
  console.error('[moodle-mcp-server] Initializing stdio transport...');
  await server.connect(transport);
  console.error('[moodle-mcp-server] Server running on stdio transport.');

  const cleanup = async () => {
    console.error('[moodle-mcp-server] Shutting down...');
    try {
      await server.close();
    } catch {
      // Ignore close errors during shutdown
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// Robust cross-platform main script detection
const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1] ? resolve(process.argv[1]) : '';

if (executedFilePath && currentFilePath.toLowerCase() === executedFilePath.toLowerCase()) {
  runServer().catch((err) => {
    console.error('[moodle-mcp-server] Fatal startup error:', err);
    process.exit(1);
  });
}
