import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MoodleClient } from '@moodle-agent-poc/moodle-client';
import { registerAssignmentTools } from './assignment-tools.js';
import { registerCategoryTools } from './category-tools.js';
import { registerCourseTools } from './course-tools.js';
import { registerQuestionTools } from './question-tools.js';
import { registerQuizTools } from './quiz-tools.js';
import { registerResourceTools } from './resource-tools.js';
import { registerRiskTools } from './risk-tools.js';
import { registerSectionTools } from './section-tools.js';

export * from './assignment-tools.js';
export * from './category-tools.js';
export * from './course-tools.js';
export * from './question-tools.js';
export * from './quiz-tools.js';
export * from './resource-tools.js';
export * from './risk-tools.js';
export * from './section-tools.js';

/**
 * Registers all canonical Moodle MCP tools onto the provided McpServer.
 */
export function registerAllMoodleTools(server: McpServer, moodleClient: MoodleClient): void {
  registerCategoryTools(server, moodleClient);
  registerCourseTools(server, moodleClient);
  registerSectionTools(server, moodleClient);
  registerAssignmentTools(server, moodleClient);
  registerQuizTools(server, moodleClient);
  registerQuestionTools(server, moodleClient);
  registerResourceTools(server, moodleClient);
  registerRiskTools(server, moodleClient);
}
