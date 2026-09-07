import type { ModelClient } from "./model-client.js";
import {
  ModelClientError,
  type ModelChatParams,
  type ModelChatResult,
  type ModelInfo,
  type ModelMessage,
  type ModelToolCall,
} from "./types.js";

export interface GroqClientOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
  strictStructuredOutputs?: boolean;
}

function strictSchemaView(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(strictSchemaView);
  if (!input || typeof input !== "object") return input;
  const source = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "oneOf" && Array.isArray(value)) {
      out.anyOf = value.map(strictSchemaView);
      continue;
    }
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) continue;
    if (key === "required") continue;
    out[key] = strictSchemaView(value);
  }
  if (source.type === "object" && source.properties && typeof source.properties === "object" && !Array.isArray(source.properties)) {
    const originalRequired = new Set(Array.isArray(source.required) ? source.required.filter((x): x is string => typeof x === "string") : []);
    const properties: Record<string, unknown> = {};
    for (const [name, propSchema] of Object.entries(source.properties as Record<string, unknown>)) {
      const converted = strictSchemaView(propSchema);
      properties[name] = originalRequired.has(name)
        ? converted
        : { anyOf: [converted, { type: "null" }] };
    }
    out.properties = properties;
    out.required = Object.keys(properties);
    out.additionalProperties = false;
  }
  return out;
}

function stripNullFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullFields);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child === null) continue;
    out[key] = stripNullFields(child);
  }
  return out;
}

export class GroqModelClient implements ModelClient {
  public readonly baseUrl: string;
  public readonly defaultModel: string;
  public readonly defaultTimeoutMs: number;
  private readonly apiKey: string;
  private readonly strictStructuredOutputs: boolean;

  constructor(options: GroqClientOptions) {
    if (!options.apiKey?.trim()) throw new ModelClientError("MODEL_PROVIDER_UNAVAILABLE", "GROQ_API_KEY is required for GroqModelClient.");
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl ?? "https://api.groq.com/openai/v1").replace(/\/+$/, "");
    this.defaultModel = options.defaultModel ?? "openai/gpt-oss-120b";
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.strictStructuredOutputs = options.strictStructuredOutputs ?? true;
  }

  async ping(): Promise<boolean> { try { await this.listModels(); return true; } catch { return false; } }

  async listModels(): Promise<ModelInfo[]> {
    const response = await this.request("/models", { method: "GET" }, this.defaultTimeoutMs);
    const body = await response.json() as { data?: Array<{ id?: string }> };
    return (body.data ?? []).flatMap((m) => m.id ? [{ name: m.id }] : []);
  }

  async chat(params: ModelChatParams): Promise<ModelChatResult> {
    const model = params.model ?? this.defaultModel;
    const timeoutMs = params.options?.timeoutMs ?? this.defaultTimeoutMs;
    const maxCompletionTokens = params.options?.maxTokens ?? 4096;
    const payload: Record<string, unknown> = {
      model,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content, ...(m.role === "tool" && m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}), ...(m.tool_calls ? { tool_calls: m.tool_calls.map((tc) => ({ ...(tc.id ? { id: tc.id } : {}), type: "function", function: { name: tc.function.name, arguments: JSON.stringify(tc.function.arguments) } })) } : {}) })),
      stream: false,
      max_completion_tokens: maxCompletionTokens,
      ...(params.options?.temperature !== undefined ? { temperature: params.options.temperature } : {}),
      ...(params.tools?.length ? { tools: params.tools, parallel_tool_calls: false } : {}),
    };
    if (params.format === "json") payload.response_format = { type: "json_object" };
    else if (params.format && typeof params.format === "object") {
      payload.response_format = { type: "json_schema", json_schema: { name: "moodle_agent_response", strict: this.strictStructuredOutputs, schema: this.strictStructuredOutputs ? strictSchemaView(params.format) : params.format } };
    }

    const started = Date.now();
    const response = await this.request("/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }, timeoutMs, model);
    const body = await response.json() as any;
    const rawMessage = body?.choices?.[0]?.message;
    if (!rawMessage) throw new ModelClientError("MODEL_RESPONSE_INVALID", "Groq returned no completion message.", body);

    const toolCalls: ModelToolCall[] = [];
    for (const tc of rawMessage.tool_calls ?? []) {
      if (!tc?.function?.name) continue;
      let args: unknown = tc.function.arguments ?? {};
      if (typeof args === "string") { try { args = JSON.parse(args); } catch (err) { throw new ModelClientError("MODEL_RESPONSE_INVALID", `Failed to parse Groq tool arguments: ${err instanceof Error ? err.message : String(err)}`, tc.function.arguments); } }
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new ModelClientError("MODEL_RESPONSE_INVALID", "Groq tool call arguments must be a JSON object.", args);
      toolCalls.push({ ...(tc.id ? { id: String(tc.id) } : {}), function: { name: String(tc.function.name), arguments: args as Record<string, unknown> } });
    }

    let content = rawMessage.content ?? "";
    if (this.strictStructuredOutputs && params.format && typeof params.format === "object" && content) {
      try { content = JSON.stringify(stripNullFields(JSON.parse(content))); } catch { /* planner remains final parser */ }
    }
    const resultMessage: ModelMessage = { role: (rawMessage.role ?? "assistant") as ModelMessage["role"], content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
    return { message: resultMessage, toolCalls, rawText: resultMessage.content, totalDurationMs: Date.now() - started };
  }

  private async request(path: string, init: RequestInit, timeoutMs: number, model = this.defaultModel): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${this.apiKey}`, ...(init.headers ?? {}) }, signal: controller.signal });
      if (!response.ok) {
        const text = await response.text();
        if (response.status === 413 || /request too large/i.test(text)) {
          throw new ModelClientError("MODEL_REQUEST_TOO_LARGE", `Groq API returned HTTP 413 for model ${model}: ${text.slice(0, 1000)}`, { rawText: text });
        }
        if (response.status === 429) {
          const retryHeader = Number(response.headers.get("retry-after"));
          const match = text.match(/try again in\s+([0-9.]+)s/i);
          const retryAfterMs = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader * 1000 : match ? Math.ceil(Number(match[1]) * 1000) : 5000;
          throw new ModelClientError("MODEL_RATE_LIMITED", `Groq rate limit reached for model ${model}.`, { retryAfterMs });
        }
        const code = response.status === 404 ? "MODEL_NOT_FOUND" : "MODEL_RESPONSE_INVALID";
        throw new ModelClientError(code, `Groq API returned HTTP ${response.status} for model ${model}: ${text.slice(0, 1000)}`);
      }
      return response;
    } catch (err: unknown) {
      if (err instanceof ModelClientError) throw err;
      if ((err as any)?.name === "AbortError") throw new ModelClientError("MODEL_TIMEOUT", `Groq request timed out after ${timeoutMs}ms (model: ${model})`, null, { cause: err });
      throw new ModelClientError("MODEL_PROVIDER_UNAVAILABLE", `Groq API request failed: ${err instanceof Error ? err.message : String(err)}`, null, { cause: err });
    } finally { clearTimeout(timer); }
  }
}
