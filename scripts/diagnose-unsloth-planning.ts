import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OpenAICompatibleModelClient } from "../packages/agent-runtime/dist/index.js";
import { buildCoursePlanningSchema, buildCoursePlanningUserPrompt, COURSE_PLANNING_SYSTEM_PROMPT } from "../packages/planning/dist/index.js";
import { ingestSyllabus } from "../packages/syllabus/dist/index.js";

async function loadDotEnv(path: string) {
  const text = await readFile(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("="); if (i <= 0) continue;
    const k = line.slice(0, i).trim(); let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const root = process.cwd();
await loadDotEnv(join(root, ".env"));
const content = await readFile(join(root, "packages/qa/fixtures/synthetic-basic.md"));
const syllabus = await ingestSyllabus({ filename: "synthetic-basic.md", mediaType: "text/markdown", content });
const client = new OpenAICompatibleModelClient({
  ...(process.env.UNSLOTH_API_KEY ? { apiKey: process.env.UNSLOTH_API_KEY } : {}),
  baseUrl: process.env.UNSLOTH_BASE_URL!,
  defaultModel: process.env.UNSLOTH_MODEL!,
  defaultTimeoutMs: 120000,
  providerName: "Unsloth",
  structuredOutputMode: "json_object",
});
const result = await client.chat({
  model: process.env.UNSLOTH_MODEL,
  messages: [
    { role: "system", content: COURSE_PLANNING_SYSTEM_PROMPT },
    { role: "user", content: buildCoursePlanningUserPrompt(syllabus) },
  ],
  format: buildCoursePlanningSchema(syllabus),
  options: { temperature: 0, timeoutMs: 120000 },
});
let parsed: any = null;
try { parsed = JSON.parse(result.rawText); } catch {}
console.log(JSON.stringify({
  durationMs: result.totalDurationMs,
  rawLength: result.rawText.length,
  topLevelKeys: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? Object.keys(parsed) : null,
  preview: result.rawText.slice(0, 1800),
}, null, 2));
