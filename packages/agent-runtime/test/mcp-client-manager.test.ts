import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { McpClientManager } from "../src/mcp/mcp-client-manager.js";

describe("McpClientManager (T1001, T1002, T1008)", () => {
  async function createTestMcpPair() {
    const server = new McpServer({
      name: "test-server",
      version: "0.1.0",
    });

    server.registerTool(
      "test_echo",
      {
        description: "Echo tool",
        inputSchema: z.object({
          message: z.string(),
          count: z.number().optional(),
        }),
      },
      async (args) => {
        return {
          content: [{ type: "text", text: `Echo: ${args.message}` }],
          structuredContent: {
            status: "success",
            data: { echoed: args.message, count: args.count ?? 1 },
          },
        };
      }
    );

    server.registerTool(
      "test_error",
      {
        description: "Error tool",
        inputSchema: z.object({
          code: z.string(),
        }),
      },
      async (args) => {
        return {
          content: [{ type: "text", text: `Error ${args.code}` }],
          structuredContent: {
            status: "error",
            code: args.code,
            message: `Custom error message for ${args.code}`,
          },
          isError: true,
        };
      }
    );

    server.registerTool(
      "test_missing_structured",
      {
        description: "Missing structured tool",
        inputSchema: z.object({}),
      },
      async () => {
        return {
          content: [{ type: "text", text: "Text only without structured content" }],
        };
      }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const clientManager = new McpClientManager({
      transport: clientTransport,
    });
    await clientManager.connect();

    return { server, clientManager };
  }

  it("discovers tools from MCP server and compiles schemas (T1002)", async () => {
    const { clientManager } = await createTestMcpPair();

    const tools = await clientManager.discoverTools();
    expect(tools.length).toBe(3);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("test_echo");
    expect(toolNames).toContain("test_error");
    expect(toolNames).toContain("test_missing_structured");

    const registry = clientManager.getRegistry();
    expect(registry.hasTool("test_echo")).toBe(true);

    await clientManager.close();
  });

  it("calls tool and returns normalized success with structuredContent.data (T1001, T1008)", async () => {
    const { clientManager } = await createTestMcpPair();
    await clientManager.discoverTools();

    const result = await clientManager.callTool("test_echo", {
      message: "Hello MCP",
      count: 2,
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data).toEqual({ echoed: "Hello MCP", count: 2 });
    }

    await clientManager.close();
  });

  it("calls tool and returns normalized error when isError is true (T1008, P10-D7)", async () => {
    const { clientManager } = await createTestMcpPair();
    await clientManager.discoverTools();

    const result = await clientManager.callTool("test_error", {
      code: "CONFLICT",
    });

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("CONFLICT");
      expect(result.message).toBe("Custom error message for CONFLICT");
    }

    await clientManager.close();
  });

  it("rejects tool calls returning missing structuredContent or missing data (Correction 4, R8)", async () => {
    const { clientManager } = await createTestMcpPair();
    await clientManager.discoverTools();

    const result = await clientManager.callTool("test_missing_structured", {});

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("INVALID_MCP_RESPONSE");
      expect(result.message).toContain("invalid success structuredContent");
    }

    await clientManager.close();
  });

  it("rejects success structuredContent that omits data property (R8)", async () => {
    const server = new McpServer({ name: "no-data-server", version: "0.1.0" });
    server.registerTool(
      "test_no_data",
      {
        description: "No data tool",
        inputSchema: z.object({}),
      },
      async () => ({
        content: [{ type: "text", text: "ok" }],
        structuredContent: { status: "success" } as any,
      })
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const clientManager = new McpClientManager({ transport: clientTransport });
    await clientManager.connect();
    await clientManager.discoverTools();

    const result = await clientManager.callTool("test_no_data", {});
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("INVALID_MCP_RESPONSE");
      expect(result.message).toContain("missing status='success' or data");
    }

    await clientManager.close();
  });

  it("rejects malformed error structuredContent missing required string code/message (R8)", async () => {
    const server = new McpServer({ name: "bad-err-server", version: "0.1.0" });
    server.registerTool(
      "test_bad_error",
      {
        description: "Bad error tool",
        inputSchema: z.object({}),
      },
      async () => ({
        content: [{ type: "text", text: "err" }],
        structuredContent: { status: "error" } as any, // missing code and message
        isError: true,
      })
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const clientManager = new McpClientManager({ transport: clientTransport });
    await clientManager.connect();
    await clientManager.discoverTools();

    const result = await clientManager.callTool("test_bad_error", {});
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("INVALID_MCP_RESPONSE");
      expect(result.message).toContain("malformed or missing error structuredContent");
    }

    await clientManager.close();
  });

  it("enforces native tool call timeout returning TOOL_TIMEOUT without unhandled rejection (T1011, P10-RD1)", async () => {
    const server = new McpServer({ name: "slow-server", version: "0.1.0" });
    server.registerTool(
      "slow_tool",
      {
        description: "Slow tool",
        inputSchema: z.object({}),
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return {
          content: [{ type: "text", text: "done" }],
          structuredContent: { status: "success", data: {} },
        };
      }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const clientManager = new McpClientManager({ transport: clientTransport });
    await clientManager.connect();
    await clientManager.discoverTools();

    const result = await clientManager.callTool("slow_tool", {}, { timeoutMs: 50 });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("TOOL_TIMEOUT");
    }

    await clientManager.close();
  });
});
