import type { ModelChatParams, ModelChatResult, ModelClient } from "@moodle-agent-poc/agent-runtime";

export function isRetryableModelError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "MODEL_RATE_LIMITED" || code === "MODEL_TIMEOUT" || code === "MODEL_PROVIDER_UNAVAILABLE") return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("429") || message.includes("timeout") || message.includes("temporarily unavailable") || message.includes("503");
}

export function isRequestTooLarge(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "MODEL_REQUEST_TOO_LARGE" || code === "TOKEN_BUDGET_EXCEEDED") return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("413") || message.includes("request too large") || message.includes("context_length_exceeded");
}

export interface ModelRequestSchedulerOptions {
  maxRetryDelayMs?: number;
  now?: () => number;
}

const DEFAULT_MAX_RETRY_DELAY_MS = 5 * 60_000;

function timestampToMs(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function providerResetDelayMs(details: Record<string, unknown>, now = Date.now()): number | null {
  for (const key of ["resetAtMs", "resetAt", "tokenResetAtMs", "tokenResetAt", "retryAtMs", "retryAt"]) {
    const value = details[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, timestampToMs(value) - now);
    }
  }
  return null;
}

export function retryAfterMs(
  error: unknown,
  maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
  now = Date.now(),
): number {
  const details = (error as { details?: Record<string, unknown> } | null)?.details;
  if (!details) return 250;
  const retryAfter = typeof details.retryAfterMs === "number"
    ? details.retryAfterMs
    : typeof details.retryAfter === "number"
      ? details.retryAfter * 1000
      : null;
  const resetDelay = providerResetDelayMs(details, now);
  const requestedDelay = Math.max(retryAfter ?? 0, resetDelay ?? 0);
  return requestedDelay > 0 ? Math.min(requestedDelay, maxRetryDelayMs) : 250;
}

export class ModelRequestScheduler {
  private blockedUntil = 0;

  constructor(
    private readonly maxAttempts = 3,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly options: ModelRequestSchedulerOptions = {},
  ) {}

  private async waitForPacing(): Promise<void> {
    const waitMs = this.blockedUntil - (this.options.now?.() ?? Date.now());
    if (waitMs > 0) await this.sleep(waitMs);
  }

  async chat(client: ModelClient, params: ModelChatParams): Promise<ModelChatResult> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        await this.waitForPacing();
        return await client.chat(params);
      } catch (error) {
        lastError = error;
        if (isRequestTooLarge(error) || !isRetryableModelError(error) || attempt === this.maxAttempts) throw error;
        const now = this.options.now?.() ?? Date.now();
        const delayMs = retryAfterMs(error, this.options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS, now);
        this.blockedUntil = Math.max(this.blockedUntil, now + delayMs);
        await this.waitForPacing();
      }
    }
    throw lastError;
  }
}
