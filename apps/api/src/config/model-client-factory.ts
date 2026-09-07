import {
  GroqModelClient,
  OllamaModelClient,
  OpenAICompatibleModelClient,
  type ModelClient,
} from "@moodle-agent-poc/agent-runtime";
import type { AppConfig } from "./config-loader.js";

export function createConfiguredModelClient(config: AppConfig): ModelClient {
  if (config.modelProvider === "groq") {
    if (!config.groqApiKey) {
      throw new Error("GROQ_API_KEY is required when MODEL_PROVIDER=groq.");
    }
    return new GroqModelClient({
      apiKey: config.groqApiKey,
      ...(config.groqBaseUrl ? { baseUrl: config.groqBaseUrl } : {}),
      defaultModel: config.modelName,
      defaultTimeoutMs: config.agentModelTimeoutMs,
      strictStructuredOutputs: true,
    });
  }

  if (config.modelProvider === "unsloth") {
    if (!config.unslothBaseUrl) {
      throw new Error("UNSLOTH_BASE_URL is required when MODEL_PROVIDER=unsloth.");
    }
    return new OpenAICompatibleModelClient({
      ...(config.unslothApiKey ? { apiKey: config.unslothApiKey } : {}),
      baseUrl: config.unslothBaseUrl,
      defaultModel: config.modelName,
      defaultTimeoutMs: config.agentModelTimeoutMs,
      providerName: "Unsloth",
      structuredOutputMode: "json_object",
    });
  }

  return new OllamaModelClient({
    ...(config.ollamaBaseUrl ? { baseUrl: config.ollamaBaseUrl } : {}),
    defaultModel: config.modelName,
    defaultTimeoutMs: config.agentModelTimeoutMs,
  });
}
