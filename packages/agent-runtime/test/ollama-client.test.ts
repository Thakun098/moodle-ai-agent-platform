import { describe, expect, it, vi } from "vitest";
import {
  ModelClientError,
  OllamaModelClient,
} from "../src/llm/index.js";

describe("OllamaModelClient (Level A Unit Tests)", () => {
  it("initializes with default options", () => {
    const client = new OllamaModelClient();
    expect(client.baseUrl).toBe("http://127.0.0.1:11434");
    expect(client.defaultModel).toBe("gemma4:e2b");
    expect(client.defaultTimeoutMs).toBe(360000);
  });

  it("handles successful chat response with text message", async () => {
    const client = new OllamaModelClient();
    const mockChat = vi.fn().mockResolvedValue({
      message: {
        role: "assistant",
        content: "Hello from Ollama!",
      },
    });
    (client as any).client = { chat: mockChat };

    const result = await client.chat({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.message.role).toBe("assistant");
    expect(result.message.content).toBe("Hello from Ollama!");
    expect(result.rawText).toBe("Hello from Ollama!");
    expect(result.toolCalls).toEqual([]);
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemma4:e2b",
        stream: false,
      })
    );
  });

  it("handles native tool call response with arguments object", async () => {
    const client = new OllamaModelClient();
    const mockChat = vi.fn().mockResolvedValue({
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            function: {
              name: "lookup_dummy_topic",
              arguments: { topic_name: "Machine Learning" },
            },
          },
        ],
      },
    });
    (client as any).client = { chat: mockChat };

    const result = await client.chat({
      messages: [{ role: "user", content: "Look up ML" }],
      tools: [
        {
          type: "function",
          function: {
            name: "lookup_dummy_topic",
            description: "Dummy tool",
            parameters: {
              type: "object",
              properties: { topic_name: { type: "string" } },
              required: ["topic_name"],
            },
          },
        },
      ],
    });

    expect(result.toolCalls.length).toBe(1);
    expect(result.toolCalls[0]?.function.name).toBe("lookup_dummy_topic");
    expect(result.toolCalls[0]?.function.arguments).toEqual({
      topic_name: "Machine Learning",
    });
  });

  it("throws MODEL_RESPONSE_INVALID on malformed JSON string tool arguments (R10)", async () => {
    const client = new OllamaModelClient();
    const mockChat = vi.fn().mockResolvedValue({
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            function: {
              name: "lookup_dummy_topic",
              arguments: "{ invalid json string",
            },
          },
        ],
      },
    });
    (client as any).client = { chat: mockChat };

    await expect(
      client.chat({
        messages: [{ role: "user", content: "Look up ML" }],
      })
    ).rejects.toMatchObject({
      code: "MODEL_RESPONSE_INVALID",
    });
  });

  it("throws MODEL_TIMEOUT when request exceeds configured timeout", async () => {
    const client = new OllamaModelClient({ defaultTimeoutMs: 50 });
    const mockChat = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 500))
    );
    (client as any).client = { chat: mockChat };

    await expect(
      client.chat({
        messages: [{ role: "user", content: "Hello" }],
      })
    ).rejects.toThrowError(ModelClientError);

    try {
      await client.chat({
        messages: [{ role: "user", content: "Hello" }],
      });
    } catch (err: any) {
      expect(err.code).toBe("MODEL_TIMEOUT");
    }
  });

  it("translates UND_ERR_HEADERS_TIMEOUT to MODEL_TIMEOUT (R1, R12)", async () => {
    const client = new OllamaModelClient();
    const fetchErr = new Error("fetch failed");
    (fetchErr as any).cause = {
      name: "HeadersTimeoutError",
      code: "UND_ERR_HEADERS_TIMEOUT",
      message: "Headers Timeout Error",
    };
    const mockChat = vi.fn().mockRejectedValue(fetchErr);
    (client as any).client = { chat: mockChat };

    try {
      await client.chat({
        messages: [{ role: "user", content: "Hello" }],
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ModelClientError);
      expect(err.code).toBe("MODEL_TIMEOUT");
    }
  });

  it("translates ECONNREFUSED error to OLLAMA_UNAVAILABLE (R1)", async () => {
    const client = new OllamaModelClient();
    const connErr = new Error("connect ECONNREFUSED 127.0.0.1:11434");
    (connErr as any).code = "ECONNREFUSED";
    const mockChat = vi.fn().mockRejectedValue(connErr);
    (client as any).client = { chat: mockChat };

    try {
      await client.chat({
        messages: [{ role: "user", content: "Hello" }],
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err).toBeInstanceOf(ModelClientError);
      expect(err.code).toBe("OLLAMA_UNAVAILABLE");
    }
  });
});
