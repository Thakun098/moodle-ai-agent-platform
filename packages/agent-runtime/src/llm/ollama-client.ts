import { Ollama } from "ollama";
import type { ModelClient } from "./model-client.js";
import {
  ModelClientError,
  type ModelChatParams,
  type ModelChatResult,
  type ModelInfo,
  type ModelMessage,
  type ModelToolCall,
} from "./types.js";

export interface OllamaClientOptions {
  baseUrl?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
}

export class OllamaModelClient implements ModelClient {
  private readonly client: Ollama;
  public readonly baseUrl: string;
  public readonly defaultModel: string;
  public readonly defaultTimeoutMs: number;

  constructor(options: OllamaClientOptions = {}) {
    this.baseUrl = options.baseUrl || "http://127.0.0.1:11434";
    this.defaultModel = options.defaultModel || "gemma4:e2b";
    this.defaultTimeoutMs = options.defaultTimeoutMs || 360000;
    this.client = new Ollama({ host: this.baseUrl });
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
    try {
      const response = await this.client.list();
      return (response.models || []).map((m) => ({
        name: m.name,
        ...(typeof m.size === "number" ? { size: m.size } : {}),
        ...(m.modified_at ? { modifiedAt: new Date(m.modified_at).toISOString() } : {}),
      }));
    } catch (err: unknown) {
      if (err instanceof ModelClientError) throw err;
      return this.handleTransportError(err, this.defaultModel, "listModels");
    }
  }

  async chat(params: ModelChatParams): Promise<ModelChatResult> {
    const model = params.model || this.defaultModel;
    const timeoutMs = params.options?.timeoutMs || this.defaultTimeoutMs;

    const messages = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    }));

    const tools = params.tools?.map((t) => ({
      type: t.type,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const requestPayload: any = {
      model,
      messages,
      stream: false,
      ...(params.format ? { format: params.format } : {}),
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(params.options?.temperature !== undefined
        ? { options: { temperature: params.options.temperature } }
        : {}),
    };

    const startTime = Date.now();
    const chatPromise = this.client.chat(requestPayload);
    let timeoutHandle: NodeJS.Timeout | null = null;

    // ollama@0.6.3 only exposes abort() for streamed requests. Phase 5 uses
    // stream:false, so this is intentionally a logical/application timeout.
    // True non-stream transport cancellation is deferred to T1011.
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new ModelClientError(
            "MODEL_TIMEOUT",
            `Ollama chat request timed out after ${timeoutMs}ms (model: ${model})`
          )
        );
      }, timeoutMs);
    });

    try {
      const response: any = await Promise.race([chatPromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;

      if (!response || !response.message) {
        throw new ModelClientError(
          "MODEL_RESPONSE_INVALID",
          "Ollama returned empty response message"
        );
      }

      const toolCalls: ModelToolCall[] = [];
      if (response.message.tool_calls && Array.isArray(response.message.tool_calls)) {
        for (const tc of response.message.tool_calls) {
          if (!tc.function) continue;

          let parsedArgs = tc.function.arguments;
          if (typeof parsedArgs === "string") {
            try {
              parsedArgs = JSON.parse(parsedArgs);
            } catch (parseErr: unknown) {
              throw new ModelClientError(
                "MODEL_RESPONSE_INVALID",
                `Failed to parse tool call arguments as JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
                tc.function.arguments,
                { cause: parseErr }
              );
            }
          }

          if (typeof parsedArgs !== "object" || parsedArgs === null || Array.isArray(parsedArgs)) {
            throw new ModelClientError(
              "MODEL_RESPONSE_INVALID",
              "Tool call arguments must be a JSON object",
              parsedArgs
            );
          }

          toolCalls.push({
            function: {
              name: tc.function.name,
              arguments: parsedArgs as Record<string, unknown>,
            },
          });
        }
      }

      const resultMessage: ModelMessage = {
        role: response.message.role as ModelMessage["role"],
        content: response.message.content || "",
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      };

      return {
        message: resultMessage,
        toolCalls,
        rawText: resultMessage.content,
        totalDurationMs: durationMs,
      };
    } catch (err: unknown) {
      if (err instanceof ModelClientError) throw err;
      return this.handleTransportError(err, model, "chat");
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private handleTransportError(err: unknown, model: string, operation: string): never {
    const message = err instanceof Error ? err.message : String(err);
    const errCode = (err as any)?.code || "";
    const causeCode = (err as any)?.cause?.code || "";
    const causeName = (err as any)?.cause?.name || "";
    const causeMessage = (err as any)?.cause?.message || "";
    const combined = `${message} ${errCode} ${causeCode} ${causeName} ${causeMessage}`.toLowerCase();

    if (
      combined.includes("und_err_headers_timeout") ||
      combined.includes("und_err_connect_timeout") ||
      combined.includes("und_err_body_timeout") ||
      combined.includes("headerstimeouterror") ||
      combined.includes("headers timeout") ||
      combined.includes("connect timeout") ||
      combined.includes("timeout")
    ) {
      throw new ModelClientError(
        "MODEL_TIMEOUT",
        `Ollama ${operation} timed out (model: ${model}): ${message}`,
        null,
        { cause: err }
      );
    }

    if (
      combined.includes("not found") ||
      combined.includes("does not exist") ||
      combined.includes("pull")
    ) {
      throw new ModelClientError(
        "MODEL_NOT_FOUND",
        `Model "${model}" not found in Ollama: ${message}`,
        null,
        { cause: err }
      );
    }

    if (
      combined.includes("econnrefused") ||
      combined.includes("err_connection_refused") ||
      combined.includes("enotfound") ||
      combined.includes("eai_again") ||
      combined.includes("econnreset")
    ) {
      throw new ModelClientError(
        "OLLAMA_UNAVAILABLE",
        `Ollama server unreachable at ${this.baseUrl}: ${message}`,
        null,
        { cause: err }
      );
    }

    throw new ModelClientError(
      "MODEL_RESPONSE_INVALID",
      `Ollama ${operation} request failed: ${message}`,
      null,
      { cause: err }
    );
  }
}
