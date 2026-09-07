import { describe, expect, it } from "vitest";
import { McpToolRegistry } from "../src/mcp/mcp-tool-registry.js";

describe("McpToolRegistry (T1002, T1003, T1005)", () => {
  it("registers tools and pre-compiles Ajv validators (T1002, T1005)", () => {
    const registry = new McpToolRegistry();

    registry.registerTools([
      {
        name: "moodle_create_course",
        description: "Create a new course",
        inputSchema: {
          type: "object",
          properties: {
            category_id: { type: "integer" },
            fullname: { type: "string" },
            shortname: { type: "string" },
          },
          required: ["category_id", "fullname", "shortname"],
          additionalProperties: false,
        },
      },
    ]);

    expect(registry.hasTool("moodle_create_course")).toBe(true);
    expect(registry.hasTool("unknown_tool")).toBe(false);

    // Valid arguments
    const validRes = registry.validateArguments("moodle_create_course", {
      category_id: 1,
      fullname: "Intro to AI",
      shortname: "CS101",
    });
    expect(validRes.valid).toBe(true);
    expect(validRes.errors).toBeUndefined();

    // Invalid arguments (missing required field)
    const invalidRes = registry.validateArguments("moodle_create_course", {
      category_id: 1,
      fullname: "Intro to AI",
    });
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.errors).toBeDefined();
    expect(invalidRes.errors?.length).toBeGreaterThan(0);

    // Unknown tool validation
    const unknownRes = registry.validateArguments("unknown_tool", {});
    expect(unknownRes.valid).toBe(false);
    expect(unknownRes.errors?.[0]).toContain('Unknown tool: "unknown_tool"');
  });

  it("converts MCP tools directly to ModelToolDefinitions for LLM (T1003, Correction 3)", () => {
    const registry = new McpToolRegistry();

    const inputSchema = {
      type: "object",
      properties: {
        course_id: { type: "integer" },
        name: { type: "string" },
      },
      required: ["course_id", "name"],
    };

    registry.registerTools([
      {
        name: "moodle_create_section",
        description: "Creates a section",
        inputSchema,
      },
    ]);

    const modelTools = registry.toModelToolDefinitions();
    expect(modelTools).toHaveLength(1);
    expect(modelTools[0]).toEqual({
      type: "function",
      function: {
        name: "moodle_create_section",
        description: "Creates a section",
        parameters: inputSchema,
      },
    });
  });

  it("throws McpToolSchemaError immediately on malformed discovered schema (P10-RD5)", () => {
    const registry = new McpToolRegistry();

    expect(() =>
      registry.registerTools([
        {
          name: "malformed_tool",
          description: "Tool with broken schema",
          inputSchema: {
            type: "invalid_type_name_here" as any,
          },
        },
      ])
    ).toThrowError(/MCP input schema for tool 'malformed_tool' could not be compiled/);
  });
});
