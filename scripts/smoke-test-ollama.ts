import { OllamaModelClient } from "../packages/agent-runtime/dist/index.js";
import type { NormalizedSyllabus } from "../packages/contracts/dist/index.js";
import { CoursePlanner } from "../packages/planning/dist/index.js";

async function main() {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL || "gemma4:e2b";

  console.log(`=== Ollama Live Acceptance Smoke Test (Level C) ===`);
  console.log(`Target Ollama URL: ${baseUrl}`);
  console.log(`Target Model: ${model}\n`);

  const client = new OllamaModelClient({ baseUrl, defaultModel: model, defaultTimeoutMs: 360000 });

  console.log(`[Step 1] Checking Ollama reachability and configured model availability...`);
  const models = await client.listModels();
  console.log(`✓ Ollama reachable. Found ${models.length} model(s).`);
  const modelExists = models.some((m) => m.name === model);
  if (!modelExists) {
    throw new Error(`Configured model "${model}" is not installed in Ollama.`);
  }
  console.log(`✓ Configured model "${model}" is available.`);

  console.log(`\n[Step 2 - T0503] Proving basic model chat request/response...`);
  const startTime = Date.now();
  const chatResult = await client.chat({
    messages: [
      { role: "system", content: "You are a concise academic assistant." },
      { role: "user", content: "State 1 core principle of computer algorithms in one short sentence." },
    ],
    options: { timeoutMs: 360000 },
  });
  const chatDuration = Date.now() - startTime;
  if (!chatResult.rawText || chatResult.rawText.trim().length === 0) {
    throw new Error("T0503 failed: empty model response.");
  }
  console.log(`✓ Response received in ${(chatDuration / 1000).toFixed(1)}s:`);
  console.log(`  "${chatResult.rawText.trim()}"`);
  console.log(`✓ T0503 PASSED: Basic model request/response proven with real Ollama.`);

  console.log(`\n[Step 3 - T0504] Proving native tool-calling response in isolation...`);
  const toolStartTime = Date.now();
  const toolResult = await client.chat({
    messages: [
      { role: "system", content: "You must call the provided tool to look up details before answering." },
      { role: "user", content: "Please look up the topic 'Binary Search Trees' using the lookup_dummy_topic tool." },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "lookup_dummy_topic",
          description: "Looks up pedagogical curriculum details for a given topic.",
          parameters: {
            type: "object",
            properties: {
              topic_name: { type: "string", description: "Name of the topic to look up" },
            },
            required: ["topic_name"],
          },
        },
      },
    ],
    options: { timeoutMs: 360000 },
  });
  const toolDuration = Date.now() - toolStartTime;

  if (toolResult.toolCalls.length === 0) {
    throw new Error("T0504 failed: configured model returned no native tool call.");
  }
  const firstCall = toolResult.toolCalls[0]!;
  if (firstCall.function.name !== "lookup_dummy_topic") {
    throw new Error(`T0504 failed: expected tool "lookup_dummy_topic", got "${firstCall.function.name}"`);
  }
  if (typeof firstCall.function.arguments.topic_name !== "string" || !firstCall.function.arguments.topic_name.trim()) {
    throw new Error("T0504 failed: missing or invalid topic_name argument in tool call.");
  }
  console.log(`✓ Tool response received in ${(toolDuration / 1000).toFixed(1)}s.`);
  console.log(`  Function: ${firstCall.function.name}`);
  console.log(`  Arguments: ${JSON.stringify(firstCall.function.arguments)}`);
  console.log(`✓ T0504 PASSED: Native tool-calling response proven with real Ollama.`);

  console.log(`\n[Step 4 - T0505/T0506] Live CoursePlanner generation smoke test...`);
  const liveSyllabus: NormalizedSyllabus = {
    schema_version: "0.1",
    course_title: "Introduction to Artificial Intelligence",
    course_code: "CS201",
    course_description: "Core algorithms and search strategies in AI.",
    learning_objectives: [
      "Understand uninformed and informed search algorithms.",
      "Implement basic minimax game tree search.",
    ],
    schedule_or_topics: [
      {
        week_or_unit: "Week 1",
        title: "Search Algorithms",
        topics: ["BFS", "DFS", "A* Search"],
        source: { kind: "line", start_line: 1, end_line: 10 },
      },
    ],
    raw_text: "# CS201: Introduction to Artificial Intelligence\n\nWeek 1: Search",
    metadata: {
      filename: "syllabus.md",
      media_type: "text/markdown",
      byte_size: 150,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
  };

  const plannerStartTime = Date.now();
  const planner = new CoursePlanner({ modelClient: client });
  const livePlan = await planner.generateCoursePlan({ syllabus: liveSyllabus, timeoutMs: 360000 });
  const plannerDuration = Date.now() - plannerStartTime;

  console.log(`✓ CoursePlan generated in ${(plannerDuration / 1000).toFixed(1)}s and validated:`);
  console.log(`  Plan ID: ${livePlan.plan_id}`);
  console.log(`  Revision: ${livePlan.revision}`);
  console.log(`  Title: ${livePlan.title}`);
  console.log(`  Sections: ${livePlan.content.sections.length}`);
  console.log(`\n=== All Ollama Level C smoke tests completed successfully! ===`);
}

main().catch((err) => {
  console.error(`\n✗ Smoke test failed with error:`, err);
  process.exit(1);
});
