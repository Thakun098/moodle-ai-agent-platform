export type ModelProvider = "ollama" | "groq" | "unsloth";

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
  readonly databaseUrl: string;
  readonly modelProvider: ModelProvider;
  readonly modelName: string;
  readonly ollamaModel: string;
  readonly ollamaBaseUrl?: string;
  readonly groqApiKey?: string;
  readonly groqBaseUrl?: string;
  readonly unslothApiKey?: string;
  readonly unslothBaseUrl?: string;
  readonly moodleBaseUrl?: string;
  readonly moodleToken?: string;
  readonly mcpServerCommand?: string;
  readonly mcpServerArgs?: readonly string[];
  readonly agentMaxSteps: number;
  readonly agentModelTimeoutMs: number;
  readonly agentToolTimeoutMs: number;
  readonly agentRunTimeoutMs: number;
  readonly maxMaterialFileBytes: number;
  readonly activityContextTokenBudget: number;
  readonly activityGenerationMaxAttempts: number;
  readonly defaultQuizQuestionCount: number;
  readonly defaultQuizChoiceCount: number;
  readonly defaultAssignmentGrade: number;
  readonly syllabusActivityDetailThreshold: number;
}

function parsePositiveInteger(
  value: string | undefined,
  name: string,
  defaultValue: number,
  options?: { min?: number; max?: number }
): number {
  if (value === undefined || value.trim() === "") return defaultValue;

  const trimmed = value.trim();
  const num = Number(trimmed);
  if (!Number.isInteger(num)) {
    throw new Error(`Invalid configuration for ${name}: expected integer, got "${value}"`);
  }

  const min = options?.min ?? 1;
  const max = options?.max ?? Number.MAX_SAFE_INTEGER;
  if (num < min || num > max) {
    throw new Error(`Invalid configuration for ${name}: value ${num} is out of allowed range [${min}, ${max}]`);
  }
  return num;
}

function parseOptionalNonEmptyString(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return value.trim();
}

function parseMcpServerArgs(value: string | undefined): readonly string[] | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error(`MCP_SERVER_ARGS must be a JSON array of strings, got "${value}"`);
    }
    return Object.freeze([...parsed]);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("MCP_SERVER_ARGS must be")) throw err;
    throw new Error(`Invalid JSON format for MCP_SERVER_ARGS: "${value}"`);
  }
}

function parseModelProvider(value: string | undefined): ModelProvider {
  const normalized = value?.trim().toLowerCase() || "ollama";
  if (normalized !== "ollama" && normalized !== "groq" && normalized !== "unsloth") {
    throw new Error(
      `Invalid configuration for MODEL_PROVIDER: expected "ollama", "groq", or "unsloth", got "${value}"`
    );
  }
  return normalized;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env
): AppConfig {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL environment variable is required and must not be empty.");
  }

  const port = parsePositiveInteger(env.PORT, "PORT", 3000, { min: 1, max: 65535 });
  const host = env.HOST?.trim() || "127.0.0.1";
  const logLevel = env.LOG_LEVEL?.trim() || "debug";
  const modelProvider = parseModelProvider(env.MODEL_PROVIDER);

  const ollamaModel = env.OLLAMA_MODEL?.trim() || "gemma4:e2b";
  const groqModel = env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
  const unslothModel = env.UNSLOTH_MODEL?.trim() || "";
  const modelName =
    modelProvider === "groq"
      ? groqModel
      : modelProvider === "unsloth"
        ? unslothModel
        : ollamaModel;

  const ollamaBaseUrl = parseOptionalNonEmptyString(env.OLLAMA_BASE_URL);
  const groqApiKey = parseOptionalNonEmptyString(env.GROQ_API_KEY);
  const groqBaseUrl = parseOptionalNonEmptyString(env.GROQ_BASE_URL);
  const unslothApiKey = parseOptionalNonEmptyString(env.UNSLOTH_API_KEY);
  const unslothBaseUrl = parseOptionalNonEmptyString(env.UNSLOTH_BASE_URL);

  if (modelProvider === "groq" && !groqApiKey) {
    throw new Error("GROQ_API_KEY environment variable is required when MODEL_PROVIDER=groq.");
  }
  if (modelProvider === "unsloth" && (!unslothBaseUrl || !unslothModel)) {
    throw new Error("UNSLOTH_BASE_URL and UNSLOTH_MODEL are required when MODEL_PROVIDER=unsloth.");
  }

  const moodleBaseUrl = parseOptionalNonEmptyString(env.MOODLE_BASE_URL);
  const moodleToken = parseOptionalNonEmptyString(env.MOODLE_TOKEN);
  const mcpServerCommand = parseOptionalNonEmptyString(env.MCP_SERVER_COMMAND);
  const mcpServerArgs = parseMcpServerArgs(env.MCP_SERVER_ARGS);

  const agentMaxSteps = parsePositiveInteger(env.AGENT_MAX_STEPS, "AGENT_MAX_STEPS", 25, { min: 1 });
  const agentModelTimeoutMs = parsePositiveInteger(
    env.AGENT_MODEL_TIMEOUT_MS,
    "AGENT_MODEL_TIMEOUT_MS",
    modelProvider === "ollama" ? 360000 : 120000,
    { min: 1 }
  );
  const agentToolTimeoutMs = parsePositiveInteger(
    env.AGENT_TOOL_TIMEOUT_MS,
    "AGENT_TOOL_TIMEOUT_MS",
    30000,
    { min: 1 }
  );
  const agentRunTimeoutMs = parsePositiveInteger(
    env.AGENT_RUN_TIMEOUT_MS,
    "AGENT_RUN_TIMEOUT_MS",
    300000,
    { min: 1 }
  );
  const maxMaterialFileBytes = parsePositiveInteger(
    env.MAX_MATERIAL_FILE_BYTES,
    "MAX_MATERIAL_FILE_BYTES",
    30 * 1024 * 1024,
    { min: 1 },
  );
  const activityContextTokenBudget = parsePositiveInteger(
    env.ACTIVITY_CONTEXT_TOKEN_BUDGET,
    "ACTIVITY_CONTEXT_TOKEN_BUDGET",
    16_000,
    { min: 1 },
  );
  const activityGenerationMaxAttempts = parsePositiveInteger(env.ACTIVITY_GENERATION_MAX_ATTEMPTS, "ACTIVITY_GENERATION_MAX_ATTEMPTS", 2, { min: 1 });
  const defaultQuizQuestionCount = parsePositiveInteger(env.DEFAULT_QUIZ_QUESTION_COUNT, "DEFAULT_QUIZ_QUESTION_COUNT", 5, { min: 1 });
  const defaultQuizChoiceCount = parsePositiveInteger(env.DEFAULT_QUIZ_CHOICE_COUNT, "DEFAULT_QUIZ_CHOICE_COUNT", 4, { min: 2 });
  const defaultAssignmentGrade = parsePositiveInteger(env.DEFAULT_ASSIGNMENT_GRADE, "DEFAULT_ASSIGNMENT_GRADE", 100, { min: 1 });
  const syllabusActivityDetailThreshold = parsePositiveInteger(env.SYLLABUS_ACTIVITY_DETAIL_THRESHOLD, "SYLLABUS_ACTIVITY_DETAIL_THRESHOLD", 500, { min: 1 });

  return Object.freeze({
    port,
    host,
    logLevel,
    databaseUrl: databaseUrl.trim(),
    modelProvider,
    modelName,
    ollamaModel,
    ...(ollamaBaseUrl ? { ollamaBaseUrl } : {}),
    ...(groqApiKey ? { groqApiKey } : {}),
    ...(groqBaseUrl ? { groqBaseUrl } : {}),
    ...(unslothApiKey ? { unslothApiKey } : {}),
    ...(unslothBaseUrl ? { unslothBaseUrl } : {}),
    ...(moodleBaseUrl ? { moodleBaseUrl } : {}),
    ...(moodleToken ? { moodleToken } : {}),
    ...(mcpServerCommand ? { mcpServerCommand } : {}),
    ...(mcpServerArgs ? { mcpServerArgs } : {}),
    agentMaxSteps,
    agentModelTimeoutMs,
    agentToolTimeoutMs,
    agentRunTimeoutMs,
    maxMaterialFileBytes,
    activityContextTokenBudget,
    activityGenerationMaxAttempts,
    defaultQuizQuestionCount,
    defaultQuizChoiceCount,
    defaultAssignmentGrade,
    syllabusActivityDetailThreshold,
  });
}
