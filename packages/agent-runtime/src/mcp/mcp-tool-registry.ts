import type { ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { McpToolSchemaError } from "../agent/types.js";
import type { ModelToolDefinition } from "../llm/types.js";

export interface ToolValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface McpToolDefinition {
  name: string;
  description?: string | undefined;
  inputSchema: Record<string, unknown>;
}

export interface RegisteredMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  validate: (args: unknown) => ToolValidationResult;
}

/**
 * Pre-compiles and caches Ajv validators for discovered MCP tool input schemas,
 * and directly maps MCP tool definitions to ModelToolDefinitions (T1002, T1003, T1005).
 */
export class McpToolRegistry {
  private readonly ajv: Ajv2020;
  private readonly tools: Map<string, RegisteredMcpTool> = new Map();

  constructor() {
    this.ajv = new Ajv2020({
      allErrors: true,
      strict: false,
    });
  }

  /**
   * Registers a list of MCP tools, compiling each tool's inputSchema once with Ajv.
   * Throws McpToolSchemaError immediately if any schema fails compilation (P10-RD5).
   */
  registerTools(mcpTools: McpToolDefinition[]): void {
    for (const tool of mcpTools) {
      let validateFn: ValidateFunction;
      try {
        // Strip $schema if present to allow Ajv2020 to compile draft-07/draft-2020 schemas seamlessly
        const schemaToCompile = { ...tool.inputSchema };
        delete schemaToCompile.$schema;
        validateFn = this.ajv.compile(schemaToCompile);
      } catch (err: unknown) {
        throw new McpToolSchemaError(tool.name, err);
      }

      const validate = (args: unknown): ToolValidationResult => {
        const valid = Boolean(validateFn(args));
        if (valid) {
          return { valid: true };
        }
        const errors = (validateFn.errors || []).map((e) => {
          const path = e.instancePath ? `${e.instancePath}: ` : "";
          return `${path}${e.message ?? "validation error"}`;
        });
        return { valid: false, errors };
      };

      this.tools.set(tool.name, {
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema,
        validate,
      });
    }
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getTool(name: string): RegisteredMcpTool | undefined {
    return this.tools.get(name);
  }

  listTools(): RegisteredMcpTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Validates arguments against a pre-compiled tool input schema validator (T1005).
   */
  validateArguments(toolName: string, args: unknown): ToolValidationResult {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        valid: false,
        errors: [`Unknown tool: "${toolName}"`],
      };
    }
    return tool.validate(args);
  }

  /**
   * Converts all registered MCP tools to ModelToolDefinitions for LLM native tool calling (T1003).
   */
  toModelToolDefinitions(): ModelToolDefinition[] {
    return this.listTools().map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }
}
