import { afterEach, describe, expect, it, vi } from "vitest";
import { GroqModelClient } from "../src/llm/groq-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GroqModelClient", () => {
  it("adapts planner schema to Groq strict structured-output requirements without changing the frozen planner contract", async () => {
    const schema = {
      type: "object",
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        activity: {
          oneOf: [
            {
              type: "object",
              properties: { type: { type: "string", const: "assignment" } },
              required: ["type"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: { type: { type: "string", const: "quiz" } },
              required: ["type"],
              additionalProperties: false,
            },
          ],
        },
      },
      required: ["title", "activity"],
      additionalProperties: false,
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("openai/gpt-oss-120b");
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.strict).toBe(true);
      const strictSchema = body.response_format.json_schema.schema;
      expect(strictSchema.required).toEqual(["title", "summary", "activity"]);
      expect(strictSchema.properties.summary).toEqual({
        anyOf: [{ type: "string" }, { type: "null" }],
      });
      expect(strictSchema.properties.activity.anyOf).toHaveLength(2);
      expect(strictSchema.properties.activity.oneOf).toBeUndefined();
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: '{"title":"Plan","summary":null,"activity":{"type":"quiz"}}' } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new GroqModelClient({ apiKey: "test-key", defaultModel: "openai/gpt-oss-120b" });
    const result = await client.chat({
      messages: [{ role: "user", content: "plan" }],
      format: schema,
      options: { temperature: 0 },
    });

    expect(JSON.parse(result.rawText)).toEqual({ title: "Plan", activity: { type: "quiz" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes Groq function calls to the existing ModelClient tool-call contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_groq_1",
            type: "function",
            function: {
              name: "moodle_get_assignment",
              arguments: '{"activity_id":42}',
            },
          }],
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const client = new GroqModelClient({ apiKey: "test-key" });
    const result = await client.chat({
      messages: [{ role: "user", content: "read assignment" }],
      tools: [{
        type: "function",
        function: {
          name: "moodle_get_assignment",
          description: "read assignment",
          parameters: {
            type: "object",
            properties: { activity_id: { type: "integer" } },
            required: ["activity_id"],
          },
        },
      }],
    });

    expect(result.toolCalls).toEqual([{ id: "call_groq_1", function: { name: "moodle_get_assignment", arguments: { activity_id: 42 } } }]);
  });

  it("sends tool results with the matching provider tool_call_id", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages[2]).toEqual({
        role: "tool",
        content: '{"status":"success"}',
        tool_call_id: "call_groq_1",
      });
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "Done" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new GroqModelClient({ apiKey: "test-key" });
    await client.chat({
      messages: [
        { role: "user", content: "read assignment" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_groq_1",
            function: { name: "moodle_get_assignment", arguments: { activity_id: 42 } },
          }],
        },
        {
          role: "tool",
          content: '{"status":"success"}',
          tool_call_id: "call_groq_1",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
