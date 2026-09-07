import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/config-loader.js";

describe("model provider configuration", () => {
  const databaseUrl = "postgresql://user:pass@localhost:5432/moodle_poc";

  it("loads Unsloth OpenAI-compatible provider configuration", () => {
    const config = loadConfig({
      DATABASE_URL: databaseUrl,
      MODEL_PROVIDER: "unsloth",
      UNSLOTH_BASE_URL: "http://192.168.1.50:8000/v1",
      UNSLOTH_MODEL: "example/gemma-4-E4B-it-GGUF:Q5_K_M",
      UNSLOTH_API_KEY: "local-secret",
    });
    expect(config.modelProvider).toBe("unsloth");
    expect(config.modelName).toBe("example/gemma-4-E4B-it-GGUF:Q5_K_M");
    expect(config.unslothBaseUrl).toBe("http://192.168.1.50:8000/v1");
    expect(config.unslothApiKey).toBe("local-secret");
    expect(config.agentModelTimeoutMs).toBe(120000);
  });

  it("requires base URL and model for Unsloth", () => {
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, MODEL_PROVIDER: "unsloth" }))
      .toThrow(/UNSLOTH_BASE_URL and UNSLOTH_MODEL are required/);
  });
});
