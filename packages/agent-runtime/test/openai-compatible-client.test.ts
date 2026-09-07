import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleModelClient } from "../src/llm/openai-compatible-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAICompatibleModelClient", () => {
  it("sends tool results with the matching provider tool_call_id", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages[2]).toEqual({
        role: "tool",
        content: '{"status":"success"}',
        tool_call_id: "call_openai_1",
      });
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "Done" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAICompatibleModelClient({
      apiKey: "test-key",
      baseUrl: "http://model.local/v1",
      defaultModel: "test-model",
    });
    await client.chat({
      messages: [
        { role: "user", content: "read assignment" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_openai_1",
            function: { name: "moodle_get_assignment", arguments: { activity_id: 42 } },
          }],
        },
        {
          role: "tool",
          content: '{"status":"success"}',
          tool_call_id: "call_openai_1",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
