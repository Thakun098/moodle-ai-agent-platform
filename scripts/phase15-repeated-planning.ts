import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  GroqModelClient,
  OllamaModelClient,
  OpenAICompatibleModelClient,
  ModelClientError,
} from "../packages/agent-runtime/dist/index.js";
import { CoursePlanner } from "../packages/planning/dist/index.js";
import { ingestSyllabus } from "../packages/syllabus/dist/index.js";

const root = process.cwd();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadDotEnv(path: string): Promise<void> {
  try {
    const text = await readFile(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {}
}

await loadDotEnv(join(root, ".env"));
const fixtureDir = join(root, "packages", "qa", "fixtures");
const resultDir = join(root, "packages", "qa", "results");
const fixtureFiles = ["synthetic-basic.md", "representative-software-engineering.md", "representative-project-management.md"];
const provider = (process.env.MODEL_PROVIDER || "groq").toLowerCase();
const timeoutMs = Number(process.env.AGENT_MODEL_TIMEOUT_MS || 120000);
const repetitions = Number(process.env.QA_REPETITIONS || 3);

let model: string;
let rawClient: { chat(params: any): Promise<any> };
if (provider === "groq") {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is required for MODEL_PROVIDER=groq");
  model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  rawClient = new GroqModelClient({
    apiKey,
    baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    defaultModel: model,
    defaultTimeoutMs: timeoutMs,
    strictStructuredOutputs: true,
  });
} else if (provider === "unsloth") {
  const baseUrl = process.env.UNSLOTH_BASE_URL;
  if (!baseUrl) throw new Error("UNSLOTH_BASE_URL is required for MODEL_PROVIDER=unsloth");
  model = process.env.UNSLOTH_MODEL || "";
  if (!model) throw new Error("UNSLOTH_MODEL is required for MODEL_PROVIDER=unsloth");
  rawClient = new OpenAICompatibleModelClient({
    ...(process.env.UNSLOTH_API_KEY ? { apiKey: process.env.UNSLOTH_API_KEY } : {}),
    baseUrl,
    defaultModel: model,
    defaultTimeoutMs: timeoutMs,
    providerName: "Unsloth",
    structuredOutputMode: "json_object",
  });
} else {
  model = process.env.OLLAMA_MODEL || "gemma4:e2b";
  rawClient = new OllamaModelClient({
    baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    defaultModel: model,
    defaultTimeoutMs: timeoutMs,
  });
}

const client = { chat(params: any) { return rawClient.chat({ ...params, options: { ...params.options, temperature: 0, timeoutMs } }); } };
const planner = new CoursePlanner({ modelClient: client as any });
const observations: Array<Record<string, unknown>> = [];

async function generateWithRateLimitRetry(syllabus: any) {
  let rateLimitRetries = 0;
  for (;;) {
    try {
      const plan = await planner.generateCoursePlan({ syllabus, model, timeoutMs });
      return { plan, rateLimitRetries };
    } catch (error) {
      if (error instanceof ModelClientError && error.code === "MODEL_RATE_LIMITED" && rateLimitRetries < 6) {
        rateLimitRetries += 1;
        const retryAfterMs = Math.max(1000, Number((error.details as any)?.retryAfterMs || 5000) + 750);
        console.log(`[RATE_LIMIT] retry ${rateLimitRetries} after ${retryAfterMs}ms`);
        await sleep(retryAfterMs);
        continue;
      }
      throw error;
    }
  }
}

for (const fixtureFile of fixtureFiles) {
  const content = await readFile(join(fixtureDir, fixtureFile));
  const syllabus = await ingestSyllabus({ filename: fixtureFile, mediaType: "text/markdown", content });
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    const started = Date.now();
    try {
      const { plan, rateLimitRetries } = await generateWithRateLimitRetry(syllabus);
      const totalMs = Date.now() - started;
      observations.push({ fixtureId: basename(fixtureFile, ".md"), repetition, provider, model, temperature: 0, success: true, schemaAndDomainValid: true, totalMs, rateLimitRetries, sections: plan.content.sections.length, warnings: plan.warnings.length, assumptions: plan.assumptions.length });
      console.log(`[PASS] ${fixtureFile} #${repetition} ${totalMs}ms retries=${rateLimitRetries} sections=${plan.content.sections.length}`);
    } catch (error) {
      const totalMs = Date.now() - started;
      const code = error instanceof ModelClientError ? error.code : error instanceof Error ? error.name : "UNKNOWN";
      observations.push({ fixtureId: basename(fixtureFile, ".md"), repetition, provider, model, temperature: 0, success: false, schemaAndDomainValid: false, totalMs, failureClass: code, error: error instanceof Error ? error.message : String(error) });
      console.error(`[FAIL] ${fixtureFile} #${repetition} ${totalMs}ms (${code}): ${error instanceof Error ? error.message : String(error)}`);
    }
    if (provider === "groq") await sleep(65000);
  }
}

const successes = observations.filter((o) => o.success === true).length;
const latencies = observations.filter((o) => o.success === true).map((o) => Number(o.totalMs));
const sorted = [...latencies].sort((a, b) => a - b);
const p95 = sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
const summary = {
  batch: "phase15-repeated-planning",
  provider,
  model,
  temperature: 0,
  fixtureCount: fixtureFiles.length,
  repetitions,
  trials: observations.length,
  successes,
  planningContractValidityRate: observations.length === 0 ? null : successes / observations.length,
  latencyMs: latencies.length === 0 ? null : { min: Math.min(...latencies), max: Math.max(...latencies), mean: latencies.reduce((a, b) => a + b, 0) / latencies.length, p95 },
  observations,
  aiQuality: { status: "not_evaluated", reason: "Technical planning validity is recorded automatically; human AI-quality scoring remains a separate rubric." },
};
await mkdir(resultDir, { recursive: true });
await writeFile(join(resultDir, `phase15-repeated-planning-${provider}.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ provider, model, trials: summary.trials, successes, planningContractValidityRate: summary.planningContractValidityRate, latencyMs: summary.latencyMs }, null, 2));
if (successes !== observations.length) process.exitCode = 1;
