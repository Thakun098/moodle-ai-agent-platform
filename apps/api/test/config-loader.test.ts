import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/config-loader.js";

describe("Configuration Loader", () => {
  const validBaseEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/moodle_poc",
  };

  it("fails fast when DATABASE_URL is missing or blank", () => {
    expect(() => loadConfig({})).toThrow(
      "DATABASE_URL environment variable is required and must not be empty."
    );

    expect(() => loadConfig({ DATABASE_URL: "   " })).toThrow(
      "DATABASE_URL environment variable is required and must not be empty."
    );
  });

  it("applies default configuration values using Ollama", () => {
    const config = loadConfig(validBaseEnv);

    expect(config.port).toBe(3000);
    expect(config.host).toBe("127.0.0.1");
    expect(config.logLevel).toBe("debug");
    expect(config.modelProvider).toBe("ollama");
    expect(config.modelName).toBe("gemma4:e2b");
    expect(config.ollamaModel).toBe("gemma4:e2b");
    expect(config.agentMaxSteps).toBe(25);
    expect(config.agentModelTimeoutMs).toBe(360000);
    expect(config.agentToolTimeoutMs).toBe(30000);
    expect(config.agentRunTimeoutMs).toBe(300000);
    expect(config.maxMaterialFileBytes).toBe(30 * 1024 * 1024);
    expect(config.activityContextTokenBudget).toBe(16000);
    expect(config.ollamaBaseUrl).toBeUndefined();
    expect(config.groqApiKey).toBeUndefined();
    expect(config.moodleBaseUrl).toBeUndefined();
    expect(config.moodleToken).toBeUndefined();
    expect(config.mcpServerCommand).toBeUndefined();
    expect(config.mcpServerArgs).toBeUndefined();
  });

  it("loads and overrides configured Ollama environment variables", () => {
    const customEnv = {
      ...validBaseEnv,
      PORT: "8080",
      HOST: "0.0.0.0",
      LOG_LEVEL: "info",
      MODEL_PROVIDER: "ollama",
      OLLAMA_MODEL: "gemma2:9b",
      OLLAMA_BASE_URL: "http://ollama.local:11434",
      MOODLE_BASE_URL: "http://moodle.local:8000",
      MOODLE_TOKEN: "secret-token-123",
      MCP_SERVER_COMMAND: "node",
      MCP_SERVER_ARGS: '["dist/server.js", "--stdio"]',
      AGENT_MAX_STEPS: "50",
      AGENT_MODEL_TIMEOUT_MS: "120000",
      AGENT_TOOL_TIMEOUT_MS: "45000",
      AGENT_RUN_TIMEOUT_MS: "600000",
      MAX_MATERIAL_FILE_BYTES: "1048576",
      ACTIVITY_CONTEXT_TOKEN_BUDGET: "8000",
    };

    const config = loadConfig(customEnv);

    expect(config.port).toBe(8080);
    expect(config.host).toBe("0.0.0.0");
    expect(config.logLevel).toBe("info");
    expect(config.modelProvider).toBe("ollama");
    expect(config.modelName).toBe("gemma2:9b");
    expect(config.ollamaModel).toBe("gemma2:9b");
    expect(config.ollamaBaseUrl).toBe("http://ollama.local:11434");
    expect(config.moodleBaseUrl).toBe("http://moodle.local:8000");
    expect(config.moodleToken).toBe("secret-token-123");
    expect(config.mcpServerCommand).toBe("node");
    expect(config.mcpServerArgs).toEqual(["dist/server.js", "--stdio"]);
    expect(config.agentMaxSteps).toBe(50);
    expect(config.agentModelTimeoutMs).toBe(120000);
    expect(config.agentToolTimeoutMs).toBe(45000);
    expect(config.agentRunTimeoutMs).toBe(600000);
    expect(config.maxMaterialFileBytes).toBe(1048576);
    expect(config.activityContextTokenBudget).toBe(8000);
  });

  it("loads Groq provider configuration and requires an API key", () => {
    expect(() => loadConfig({ ...validBaseEnv, MODEL_PROVIDER: "groq" })).toThrow(
      "GROQ_API_KEY environment variable is required when MODEL_PROVIDER=groq."
    );

    const config = loadConfig({
      ...validBaseEnv,
      MODEL_PROVIDER: "groq",
      GROQ_API_KEY: "groq-test-key",
      GROQ_MODEL: "openai/gpt-oss-120b",
      GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    });

    expect(config.modelProvider).toBe("groq");
    expect(config.modelName).toBe("openai/gpt-oss-120b");
    expect(config.groqApiKey).toBe("groq-test-key");
    expect(config.groqBaseUrl).toBe("https://api.groq.com/openai/v1");
    expect(config.agentModelTimeoutMs).toBe(120000);
  });

  it("defaults Groq runtime model to GPT-OSS 120B when GROQ_MODEL is omitted", () => {
    const config = loadConfig({
      ...validBaseEnv,
      MODEL_PROVIDER: "groq",
      GROQ_API_KEY: "groq-test-key",
    });

    expect(config.modelProvider).toBe("groq");
    expect(config.modelName).toBe("openai/gpt-oss-120b");
  });

  it("rejects invalid provider and numeric configurations", () => {
    expect(() => loadConfig({ ...validBaseEnv, MODEL_PROVIDER: "unknown" })).toThrow(
      /Invalid configuration for MODEL_PROVIDER/
    );

    expect(() => loadConfig({ ...validBaseEnv, PORT: "invalid" })).toThrow(
      /Invalid configuration for PORT: expected integer/
    );

    expect(() => loadConfig({ ...validBaseEnv, PORT: "-1" })).toThrow(
      /Invalid configuration for PORT: value -1 is out of allowed range/
    );

    expect(() => loadConfig({ ...validBaseEnv, PORT: "70000" })).toThrow(
      /Invalid configuration for PORT: value 70000 is out of allowed range/
    );

    expect(() =>
      loadConfig({ ...validBaseEnv, AGENT_MAX_STEPS: "0" })
    ).toThrow(/Invalid configuration for AGENT_MAX_STEPS/);

    expect(() =>
      loadConfig({ ...validBaseEnv, AGENT_MODEL_TIMEOUT_MS: "-500" })
    ).toThrow(/Invalid configuration for AGENT_MODEL_TIMEOUT_MS/);
  });

  it("rejects invalid MCP_SERVER_ARGS format", () => {
    expect(() =>
      loadConfig({
        ...validBaseEnv,
        MCP_SERVER_ARGS: "invalid json string",
      })
    ).toThrow(/Invalid JSON format for MCP_SERVER_ARGS/);

    expect(() =>
      loadConfig({
        ...validBaseEnv,
        MCP_SERVER_ARGS: '{"key": "value"}',
      })
    ).toThrow(/MCP_SERVER_ARGS must be a JSON array of strings/);

    expect(() =>
      loadConfig({
        ...validBaseEnv,
        MCP_SERVER_ARGS: "[123, 456]",
      })
    ).toThrow(/MCP_SERVER_ARGS must be a JSON array of strings/);
  });
});
