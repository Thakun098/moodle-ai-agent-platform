import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import { describe, expect, it, vi } from "vitest";
import { ModelRequestScheduler, retryAfterMs } from "../src/scheduling/model-request-scheduler.js";

const result = {
  rawText: "{}",
  message: { role: "assistant" as const, content: "{}" },
  toolCalls: [],
};

describe("ModelRequestScheduler", () => {
  it("honors provider retry metadata beyond the old 30 second cap", () => {
    const error = Object.assign(new Error("rate limited"), {
      code: "MODEL_RATE_LIMITED",
      details: { retryAfterMs: 90_000 },
    });
    expect(retryAfterMs(error)).toBe(90_000);
  });

  it("uses the provider reset timestamp when it is later than Retry-After", () => {
    const now = 1_700_000_000_000;
    const error = Object.assign(new Error("rate limited"), {
      code: "MODEL_RATE_LIMITED",
      details: { retryAfterMs: 1_000, resetAtMs: now + 45_000 },
    });
    expect(retryAfterMs(error, 300_000, now)).toBe(45_000);
  });

  it("paces the next scheduler call after a rate-limit response", async () => {
    let now = 1_700_000_000_000;
    const sleeps: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    });
    const chat = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), {
        code: "MODEL_RATE_LIMITED",
        details: { retryAfterMs: 20_000 },
      }))
      .mockResolvedValue(result);
    const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
    const scheduler = new ModelRequestScheduler(2, sleep, { now: () => now });

    await scheduler.chat(client, { messages: [] });
    await scheduler.chat(client, { messages: [] });

    expect(chat).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([20_000]);
  });
});
