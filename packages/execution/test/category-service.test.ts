import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpClientManager } from "@moodle-agent-poc/agent-runtime";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { listCourseCategories } from "../src/category-service.js";
import { CourseExecutionError } from "../src/types.js";

describe("Category Service (T1101)", () => {
  it("lists course categories successfully via MCP tool", async () => {
    const server = new McpServer({
      name: "moodle-test-server",
      version: "0.1.0",
    });

    server.registerTool(
      "moodle_list_course_categories",
      {
        description: "List categories",
        inputSchema: z.object({}),
      },
      async () => {
        return {
          content: [{ type: "text", text: "Retrieved 2 categories" }],
          structuredContent: {
            status: "success",
            data: [
              { id: 1, name: "Miscellaneous", coursecount: 5, visible: 1 },
              { id: 2, name: "Computer Science", parent: 1, coursecount: 3, visible: 1 },
            ],
          },
        };
      }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const clientManager = new McpClientManager({
      type: "in_memory",
      transport: clientTransport,
    });
    await clientManager.connect();

    const categories = await listCourseCategories(clientManager);
    expect(categories).toHaveLength(2);
    expect(categories[0]).toEqual({
      id: 1,
      name: "Miscellaneous",
      coursecount: 5,
      visible: 1,
    });
    expect(categories[1]).toEqual({
      id: 2,
      name: "Computer Science",
      parent: 1,
      coursecount: 3,
      visible: 1,
    });

    await clientManager.close();
    await server.close();
  });

  it("throws CourseExecutionError when MCP tool returns error", async () => {
    const server = new McpServer({
      name: "moodle-test-server",
      version: "0.1.0",
    });

    server.registerTool(
      "moodle_list_course_categories",
      {
        description: "List categories",
        inputSchema: z.object({}),
      },
      async () => {
        return {
          content: [{ type: "text", text: "Auth failed" }],
          structuredContent: {
            status: "error",
            code: "AUTH_ERROR",
            message: "Moodle token is invalid or expired",
          },
          isError: true,
        };
      }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const clientManager = new McpClientManager({
      type: "in_memory",
      transport: clientTransport,
    });
    await clientManager.connect();

    await expect(listCourseCategories(clientManager)).rejects.toThrow(CourseExecutionError);

    await clientManager.close();
    await server.close();
  });
});
