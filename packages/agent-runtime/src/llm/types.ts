export type ModelRole = "system" | "user" | "assistant" | "tool";

export interface ModelToolCall {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ModelMessage {
  role: ModelRole;
  content: string;
  tool_calls?: ModelToolCall[];
  /** ID of the assistant tool call answered by a role="tool" message. */
  tool_call_id?: string;
}

export interface ModelToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ModelChatParams {
  model?: string;
  messages: ModelMessage[];
  format?: "json" | Record<string, unknown>;
  tools?: ModelToolDefinition[];
  options?: {
    temperature?: number;
    timeoutMs?: number;
    maxTokens?: number;
  };
}

export interface ModelChatResult {
  message: ModelMessage;
  toolCalls: ModelToolCall[];
  rawText: string;
  totalDurationMs?: number;
}

export interface ModelInfo {
  name: string;
  size?: number;
  modifiedAt?: string;
}

export type ModelErrorCode =
  | "OLLAMA_UNAVAILABLE"
  | "MODEL_PROVIDER_UNAVAILABLE"
  | "MODEL_RATE_LIMITED"
  | "MODEL_TIMEOUT"
  | "MODEL_RESPONSE_INVALID"
  | "MODEL_NOT_FOUND"
  | "MODEL_REQUEST_TOO_LARGE";

export class ModelClientError extends Error {
  public readonly code: ModelErrorCode;
  public readonly details: unknown;

  constructor(
    code: ModelErrorCode,
    message: string,
    details?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ModelClientError";
    this.code = code;
    this.details = details ?? null;
  }
}
