import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { registerAllMoodleTools } from './tools/index.js';

export interface CreateMoodleMcpServerOptions {
  moodleClient: MoodleClient;
  name?: string;
  version?: string;
}

/**
 * Creates and configures an McpServer instance with all 14 Moodle tools registered.
 */
export function createMoodleMcpServer(options: CreateMoodleMcpServerOptions): McpServer {
  const server = new McpServer(
    {
      name: options.name || 'moodle-mcp-server',
      version: options.version || '0.1.0',
    }
  );

  registerAllMoodleTools(server, options.moodleClient);

  return server;
}
