import { McpClientManager } from "@moodle-agent-poc/agent-runtime";
import { listCourseCategories } from "@moodle-agent-poc/execution";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";

export interface CategoriesRoutesOptions {
  config: AppConfig;
  mcpClientManager?: McpClientManager | undefined;
}

function createConfiguredMcpManager(config: AppConfig): McpClientManager {
  const env: Record<string, string> = { PATH: process.env.PATH || "" };
  if (config.moodleBaseUrl) env.MOODLE_BASE_URL = config.moodleBaseUrl;
  if (config.moodleToken) env.MOODLE_TOKEN = config.moodleToken;

  return new McpClientManager({
    serverParams: {
      command: config.mcpServerCommand ?? "node",
      args: [...(config.mcpServerArgs ?? ["apps/moodle-mcp-server/dist/index.js"])],
      env,
    },
  });
}

export const categoriesRoutes: FastifyPluginAsync<CategoriesRoutesOptions> = async (
  fastify,
  options
) => {
  const { config, mcpClientManager: injectedMcp } = options;

  fastify.get("/api/categories", async (_request, reply) => {
    const manager = injectedMcp ?? createConfiguredMcpManager(config);
    const ownsManager = injectedMcp === undefined;

    try {
      if (ownsManager) await manager.connect();
      const categories = await listCourseCategories(manager);
      reply.status(200).send({ categories });
    } finally {
      if (ownsManager) await manager.close();
    }
  });
};
