import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { NormalizedToolResult } from "../agent/types.js";
import { McpToolRegistry, type RegisteredMcpTool } from "./mcp-tool-registry.js";

export interface McpClientManagerOptions {
  clientName?: string;
  clientVersion?: string;
  transport?: Transport;
  serverParams?: StdioServerParameters;
  defaultToolTimeoutMs?: number;
}

/**
 * Manages MCP client lifecycle, tool discovery, and tool execution with structured result normalization (T1001, T1002, T1008).
 */
export class McpClientManager {
  private client: Client | null = null;
  private transport: Transport | null = null;
  private readonly registry: McpToolRegistry = new McpToolRegistry();
  private readonly defaultTimeoutMs: number;
  private readonly options: McpClientManagerOptions;

  constructor(options: McpClientManagerOptions = {}) {
    this.options = options;
    this.defaultTimeoutMs = options.defaultToolTimeoutMs ?? 30_000;
  }

  /**
   * Connects to the MCP server using the provided transport or spawns a stdio subprocess.
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    this.client = new Client(
      {
        name: this.options.clientName ?? "agent-runtime-mcp-client",
        version: this.options.clientVersion ?? "0.1.0",
      },
      { capabilities: {} }
    );

    if (this.options.transport) {
      this.transport = this.options.transport;
    } else if (this.options.serverParams) {
      this.transport = new StdioClientTransport(this.options.serverParams);
    } else {
      throw new Error(
        "McpClientManager requires either an explicit transport or serverParams for stdio."
      );
    }

    await this.client.connect(this.transport);
  }

  /**
   * Closes the MCP client connection and transport.
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore close errors
      }
      this.client = null;
      this.transport = null;
    }
  }

  /**
   * Discovers all tools from the MCP server, compiles input schemas once, and returns registered tools (T1002).
   */
  async discoverTools(): Promise<RegisteredMcpTool[]> {
    if (!this.client) {
      throw new Error("McpClientManager must be connected before discovering tools.");
    }

    const res = await this.client.listTools();
    const tools = res.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));

    this.registry.registerTools(tools);
    return this.registry.listTools();
  }

  /**
   * Returns the pre-compiled tool registry.
   */
  getRegistry(): McpToolRegistry {
    return this.registry;
  }

  /**
   * Invokes an MCP tool by name with arguments and extracts the canonical structured result (T1001, T1008, P10-RD1, R6, R8).
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<NormalizedToolResult> {
    if (!this.client) {
      throw new Error("McpClientManager must be connected before calling tools.");
    }

    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();

    try {
      const res = (await this.client.callTool(
        {
          name: toolName,
          arguments: args,
        },
        undefined,
        {
          timeout: timeoutMs,
          maxTotalTimeout: timeoutMs,
          signal: controller.signal,
        }
      )) as CallToolResult;

      // Extract canonical structured result per Phase 9 / 10 contract (P10-D7, Correction 4, R8)
      if (res.isError) {
        const structured = res.structuredContent as Record<string, unknown> | undefined;
        if (
          !structured ||
          typeof structured !== "object" ||
          structured.status !== "error" ||
          typeof structured.code !== "string" ||
          typeof structured.message !== "string"
        ) {
          return {
            status: "error",
            code: "INVALID_MCP_RESPONSE",
            message: `Tool '${toolName}' returned malformed or missing error structuredContent`,
          };
        }

        return {
          status: "error",
          code: structured.code,
          message: structured.message,
          ...(structured.details !== undefined ? { details: structured.details } : {}),
        };
      }

      if (
        !res.structuredContent ||
        typeof res.structuredContent !== "object" ||
        (res.structuredContent as any).status !== "success" ||
        (res.structuredContent as any).data === undefined
      ) {
        return {
          status: "error",
          code: "INVALID_MCP_RESPONSE",
          message: `Tool '${toolName}' returned invalid success structuredContent (missing status='success' or data)`,
        };
      }

      const structured = res.structuredContent as { status: "success"; data: unknown };

      return {
        status: "success",
        data: structured.data,
      };
    } catch (err: unknown) {
      return this.classifyMcpException(err, timeoutMs);
    }
  }

  /**
   * Distinguishes specific MCP SDK and transport failure kinds (R6).
   */
  private classifyMcpException(
    err: unknown,
    timeoutMs: number
  ): NormalizedToolResult {
    if (err instanceof Error) {
      const errName = err.name;
      const errMsg = err.message;
      const lower = errMsg.toLowerCase();

      if (
        errName === "AbortError" ||
        errName === "TimeoutError" ||
        lower.includes("timed out") ||
        lower.includes("timeout")
      ) {
        return {
          status: "error",
          code: "TOOL_TIMEOUT",
          message: `MCP tool call timed out after ${timeoutMs}ms`,
        };
      }

      if (
        errMsg.includes("ECONNREFUSED") ||
        errMsg.includes("ECONNRESET") ||
        errMsg.includes("EPIPE") ||
        errMsg.includes("socket") ||
        errName === "NetworkError"
      ) {
        return {
          status: "error",
          code: "NETWORK_ERROR",
          message: errMsg,
        };
      }

      if (errName === "McpError" || errMsg.includes("JSON-RPC")) {
        return {
          status: "error",
          code: "MCP_PROTOCOL_ERROR",
          message: errMsg,
        };
      }

      return {
        status: "error",
        code: "INVALID_MCP_RESPONSE",
        message: errMsg,
      };
    }

    return {
      status: "error",
      code: "INVALID_MCP_RESPONSE",
      message: String(err),
    };
  }
}
