import type { ModelClient } from "./model-client.js";
import {
  ModelClientError,
  type ModelChatParams,
  type ModelChatResult,
  type ModelInfo,
  type ModelMessage,
  type ModelToolCall,
} from "./types.js";

export interface OpenAICompatibleClientOptions {
  apiKey?: string;
  baseUrl: string;
  defaultModel: string;
  defaultTimeoutMs?: number;
  providerName?: string;
  structuredOutputMode?: "json_object" | "json_schema";
}

export class OpenAICompatibleModelClient implements ModelClient {
  public readonly baseUrl: string;
  public readonly defaultModel: string;
  public readonly defaultTimeoutMs: number;
  private readonly apiKey: string | undefined;
  private readonly providerName: string;
  private readonly structuredOutputMode: "json_object" | "json_schema";

  constructor(options: OpenAICompatibleClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.defaultModel = options.defaultModel;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.providerName = options.providerName ?? "OpenAI-compatible provider";
    this.structuredOutputMode = options.structuredOutputMode ?? "json_object";
  }

  async ping(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await this.request("/models", { method: "GET" }, this.defaultTimeoutMs);
    const body = await response.json() as { data?: Array<{ id?: string }> };
    return (body.data ?? []).flatMap((m) => m.id ? [{ name: m.id }] : []);
  }

  async chat(params: ModelChatParams): Promise<ModelChatResult> {
    const model = params.model ?? this.defaultModel;
    const timeoutMs = params.options?.timeoutMs ?? this.defaultTimeoutMs;

    const providerMessages: Array<Record<string, unknown>> = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.role === "tool" && m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      ...(m.tool_calls ? { tool_calls: m.tool_calls.map((tc) => ({
        ...(tc.id ? { id: tc.id } : {}),
        type: "function",
        function: {
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        },
      })) } : {}),
    }));

    if (params.format && this.structuredOutputMode === "json_object" && typeof params.format === "object") {
      providerMessages.unshift({
        role: "system",
        content: `STRUCTURED OUTPUT REQUIREMENT: Return exactly one JSON object that validates against this JSON Schema. Do not wrap it in another key, do not return the schema itself, and do not add commentary. JSON Schema: ${JSON.stringify(params.format)}`,
      });
    }

    const payload: Record<string, unknown> = {
      model,
      messages: providerMessages,
      stream: false,
      ...(params.options?.temperature !== undefined ? { temperature: params.options.temperature } : {}),
      ...(params.tools?.length ? { tools: params.tools, parallel_tool_calls: false } : {}),
    };

    if (params.format) {
      if (this.structuredOutputMode === "json_schema" && typeof params.format === "object") {
        payload.response_format = {
          type: "json_schema",
          json_schema: { name: "moodle_agent_response", strict: false, schema: params.format },
        };
      } else {
        payload.response_format = { type: "json_object" };
      }
    }

    const started = Date.now();
    const response = await this.request("/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }, timeoutMs, model);
    const body = await response.json() as any;
    const rawMessage = body?.choices?.[0]?.message;
    if (!rawMessage) {
      throw new ModelClientError("MODEL_RESPONSE_INVALID", `${this.providerName} returned no completion message.`, body);
    }

    const toolCalls: ModelToolCall[] = [];
    for (const tc of rawMessage.tool_calls ?? []) {
      if (!tc?.function?.name) continue;
      let args: unknown = tc.function.arguments ?? {};
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch (err) {
          throw new ModelClientError("MODEL_RESPONSE_INVALID", `Failed to parse ${this.providerName} tool arguments: ${err instanceof Error ? err.message : String(err)}`, tc.function.arguments);
        }
      }
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new ModelClientError("MODEL_RESPONSE_INVALID", `${this.providerName} tool call arguments must be a JSON object.`, args);
      }
      toolCalls.push({
        ...(tc.id ? { id: String(tc.id) } : {}),
        function: { name: String(tc.function.name), arguments: args as Record<string, unknown> },
      });
    }

    const resultMessage: ModelMessage = {
      role: (rawMessage.role ?? "assistant") as ModelMessage["role"],
      content: rawMessage.content ?? "",
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };

    return {
      message: resultMessage,
      toolCalls,
      rawText: resultMessage.content,
      totalDurationMs: Date.now() - started,
    };
  }

  private async request(path: string, init: RequestInit, timeoutMs: number, model = this.defaultModel): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {};
      if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
      for (const [key, value] of Object.entries(init.headers ?? {})) {
        if (typeof value === "string") headers[key] = value;
      }
      const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
      if (!response.ok) {
        const text = await response.text();
        const code = response.status === 404 ? "MODEL_NOT_FOUND" : "MODEL_RESPONSE_INVALID";
        throw new ModelClientError(code, `${this.providerName} returned HTTP ${response.status} for model ${model}: ${text.slice(0, 1000)}`);
      }
      return response;
    } catch (err: unknown) {
      if (err instanceof ModelClientError) throw err;
      if ((err as any)?.name === "AbortError") {
        throw new ModelClientError("MODEL_TIMEOUT", `${this.providerName} request timed out after ${timeoutMs}ms (model: ${model})`, null, { cause: err });
      }
      throw new ModelClientError("MODEL_PROVIDER_UNAVAILABLE", `${this.providerName} request failed: ${err instanceof Error ? err.message : String(err)}`, null, { cause: err });
    } finally {
      clearTimeout(timer);
    }
  }
}
