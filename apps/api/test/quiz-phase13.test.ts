import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpClientManager, type RunRepository } from "@moodle-agent-poc/agent-runtime";
import type { PocRunRecord } from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { buildApp } from "../src/app.js";

const config: any = {
  port: 3000, host: "127.0.0.1", logLevel: "silent", databaseUrl: "x", ollamaModel: "test",
  moodleBaseUrl: "http://localhost:8000", moodleToken: "x",
  agentMaxSteps: 25, agentModelTimeoutMs: 1000, agentToolTimeoutMs: 1000, agentRunTimeoutMs: 5000,
};

async function manager() {
  const server = new McpServer({ name: "quiz-api", version: "1" });
  server.registerTool("moodle_get_quiz", { inputSchema: z.object({ activity_id: z.number() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { activity_id: 30, quiz_id: 40, course_id: 10, name: "Quiz", intro: "Intro", grade: 10, preferredbehaviour: "deferredfeedback", attempts: 0, shuffleanswers: 1, questions_count: 1, sumgrades: 1 } } }));
  server.registerTool("moodle_get_quiz_questions", { inputSchema: z.object({ activity_id: z.number() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: [{ slot_id: 1, slot_number: 1, page: 1, max_mark: 1, question_bank_entry_id: 501, question_id: 601, version: 1, name: "Q", qtype: "truefalse", question_text: "True?", default_mark: 1, answers: [{ id: 1, text: "True", fraction: 1, feedback: "" }, { id: 2, text: "False", fraction: 0, feedback: "" }] }] } }));
  server.registerTool("moodle_get_course_structure", { inputSchema: z.object({ course_id: z.number() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { course: { id: 10, fullname: "C", shortname: "C", category_id: 1, visible: 1 }, sections: [{ section_id: 20, section_num: 1, name: "S", summary: "", activities: [{ activity_id: 30, instance_id: 40, module_name: "quiz", name: "Quiz", intro: "Intro", grade: 10 }] }] } } }));
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const m = new McpClientManager({ type: "in_memory", transport: ct });
  await m.connect();
  return { m, server };
}

describe("Phase 13 quiz API", () => {
  it("GET /api/quizzes/:activityId returns observed and planning state", async () => {
    const { m, server } = await manager();
    const app = buildApp({ config, mcpClientManager: m });
    const res = await app.inject({ method: "GET", url: "/api/quizzes/30" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.quiz.quiz_id).toBe(40);
    expect(body.planning_state.questions[0].ref).toBe("question-01");
    await app.close(); await m.close(); await server.close();
  });

  it("POST quiz-update planning reads Moodle state and returns preview link", async () => {
    const { m, server } = await manager();
    const runRepo = {
      getRun: vi.fn(async (id) => ({ runId: id, status: "preview" }) as PocRunRecord),
      updateStatus: vi.fn(async (id, status) => ({ runId: id, status }) as PocRunRecord),
      failRun: vi.fn(),
    } as unknown as RunRepository;
    const quizPlanner = {
      planQuizUpdate: vi.fn(async () => ({ schema_version: "0.1", plan_id: "plan-q", revision: 1, plan_type: "quiz", operation: "update", title: "Quiz", summary: "Updated", warnings: [], assumptions: [], content: { title: "Quiz", description: "Intro", source_refs: [], questions_to_add: [], questions_to_update: [] } })),
    } as any;
    const app = buildApp({ config, runRepo, quizPlanner, mcpClientManager: m });
    const res = await app.inject({ method: "POST", url: "/api/runs/run-q/plans/quiz-update", payload: { instruction: "Improve it", target: { course_id: 10, section_id: 20, quiz_id: 40 } } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.resolved_activity_id).toBe(30);
    expect(body.preview_url).toContain("/api/plans/plan-q/preview?revision=1");
    expect(quizPlanner.planQuizUpdate).toHaveBeenCalledOnce();
    await app.close(); await m.close(); await server.close();
  });
});
