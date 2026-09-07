import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpClientManager,
  type ExecutionMappingRepository,
  type IdempotencyRepository,
  type RunRepository,
  type ToolCallRepository,
} from "@moodle-agent-poc/agent-runtime";
import type { QuizCreatePlanEnvelope, QuizUpdatePlanEnvelope } from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeQuizCreate, executeQuizUpdate, readQuizState, resolveQuizActivityId, toExistingQuizState } from "../src/quiz-executor.js";

function repos() {
  const mappings: any[] = [];
  return {
    toolCallRepo: { recordToolCall: vi.fn(async (r) => r) } as unknown as ToolCallRepository,
    mappingRepo: {
      setMapping: vi.fn(async (r) => { mappings.push(r); return r; }),
      listRunMappings: vi.fn(async () => mappings),
    } as unknown as ExecutionMappingRepository,
    idempotencyRepo: {
      tryAcquire: vi.fn(async (p) => ({ state: "acquired" as const, key: `${p.localRef}:${p.toolName}` })),
      recordSuccess: vi.fn(async () => undefined),
      recordFailure: vi.fn(async () => undefined),
      recordUncertain: vi.fn(async () => undefined),
    } as unknown as IdempotencyRepository,
    runRepo: {
      updateStatus: vi.fn(async (_id, status) => ({ status })),
      completeRun: vi.fn(async (_id, finalResult) => ({ status: "completed", finalResult })),
      failRun: vi.fn(async (_id, error) => ({ status: "failed", error })),
    } as unknown as RunRepository,
    mappings,
  };
}

function setupServer() {
  const server = new McpServer({ name: "quiz-phase13", version: "1" });
  let quizName = "Old Quiz";
  let quizIntro = "Old Intro";
  let nextQbe = 700;
  const slots: any[] = [{
    slot_id: 1, slot_number: 1, page: 1, max_mark: 1,
    question_bank_entry_id: 501, question_id: 601, version: 1,
    name: "Q1", qtype: "truefalse", question_text: "Old question", default_mark: 1,
    answers: [
      { id: 1, text: "True", fraction: 1, feedback: "" },
      { id: 2, text: "False", fraction: 0, feedback: "" },
    ],
  }];

  server.registerTool("moodle_get_course_structure", { inputSchema: z.object({ course_id: z.number() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { course: { id: 10, fullname: "C", shortname: "C", category_id: 1, visible: 1 }, sections: [{ section_id: 20, section_num: 1, name: "S", summary: "", activities: [{ activity_id: 30, instance_id: 40, module_name: "quiz", name: quizName, intro: quizIntro, grade: 10 }] }] } } }));
  server.registerTool("moodle_get_quiz", { inputSchema: z.object({ activity_id: z.number() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { activity_id: 30, quiz_id: 40, course_id: 10, name: quizName, intro: quizIntro, grade: 10, preferredbehaviour: "deferredfeedback", attempts: 0, shuffleanswers: 1, questions_count: slots.length, sumgrades: slots.reduce((n, s) => n + s.max_mark, 0) } } }));
  server.registerTool("moodle_get_quiz_questions", { inputSchema: z.object({ activity_id: z.number() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: slots } }));
  server.registerTool("moodle_update_quiz", { inputSchema: z.object({ activity_id: z.number(), name: z.string().optional(), intro: z.string().optional() }) }, async (a) => { quizName = a.name ?? quizName; quizIntro = a.intro ?? quizIntro; return { content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { activity_id: 30, quiz_id: 40, name: quizName, intro: quizIntro } } }; });
  server.registerTool("moodle_update_quiz_question", { inputSchema: z.object({ question_bank_entry_id: z.number(), name: z.string().optional(), question_text: z.string().optional(), default_mark: z.number().optional(), general_feedback: z.string().optional(), qtype: z.literal("truefalse"), options: z.object({ correct_answer: z.boolean() }) }) }, async (a) => { const s = slots.find((x) => x.question_bank_entry_id === a.question_bank_entry_id); s.question_text = a.question_text; s.default_mark = a.default_mark; s.name = a.name; s.version++; s.question_id++; s.answers = [{ id: 1, text: "True", fraction: a.options.correct_answer ? 1 : 0, feedback: "" }, { id: 2, text: "False", fraction: a.options.correct_answer ? 0 : 1, feedback: "" }]; return { content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { question_bank_entry_id: s.question_bank_entry_id, previous_question_id: s.question_id - 1, question_id: s.question_id, version: s.version, name: s.name, qtype: s.qtype, default_mark: s.default_mark } } }; });
  server.registerTool("moodle_create_quiz", { inputSchema: z.object({ course_id: z.number(), section_id: z.number(), name: z.string(), intro: z.string().optional() }) }, async (a) => { quizName = a.name; quizIntro = a.intro ?? ""; slots.splice(0); return { content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { activity_id: 30, quiz_id: 40, name: quizName, section_id: 20, grade: 10 } } }; });
  server.registerTool("moodle_create_quiz_question", { inputSchema: z.object({ activity_id: z.number(), name: z.string(), question_text: z.string(), default_mark: z.number(), general_feedback: z.string().optional(), qtype: z.enum(["truefalse", "essay", "multichoice", "shortanswer"]), options: z.record(z.unknown()).optional() }) }, async (a) => { const qbe = nextQbe++; (server as any)._lastCreated = { qbe, a }; return { content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { question_bank_entry_id: qbe, question_id: qbe + 100, version: 1, name: a.name, qtype: a.qtype, default_mark: a.default_mark, category_id: 1 } } }; });
  server.registerTool("moodle_add_question_to_quiz", { inputSchema: z.object({ activity_id: z.number(), question_bank_entry_id: z.number(), max_mark: z.number() }) }, async (a) => { const c = (server as any)._lastCreated; const opts: any = c.a.options ?? {}; const answers = c.a.qtype === "truefalse" ? [{ id: 1, text: "True", fraction: opts.correct_answer ? 1 : 0, feedback: "" }, { id: 2, text: "False", fraction: opts.correct_answer ? 0 : 1, feedback: "" }] : []; slots.push({ slot_id: slots.length + 1, slot_number: slots.length + 1, page: 1, max_mark: a.max_mark, question_bank_entry_id: a.question_bank_entry_id, question_id: a.question_bank_entry_id + 100, version: 1, name: c.a.name, qtype: c.a.qtype, question_text: c.a.question_text, default_mark: c.a.default_mark, answers }); return { content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { slot_id: slots.length, activity_id: 30, quiz_id: 40, question_bank_entry_id: a.question_bank_entry_id, question_id: a.question_bank_entry_id + 100, slot_number: slots.length, page: 1, max_mark: a.max_mark } } }; });
  return server;
}

async function connected() {
  const server = setupServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const manager = new McpClientManager({ type: "in_memory", transport: ct });
  await manager.connect();
  return { server, manager };
}

describe("Phase 13 quiz execution", () => {
  it("reads quiz + questions and resolves frozen quiz_id target to activity_id", async () => {
    const { server, manager } = await connected();
    expect(await resolveQuizActivityId(manager, { course_id: 10, section_id: 20, quiz_id: 40 })).toBe(30);
    const state = await readQuizState(manager, 30);
    const planning = toExistingQuizState(state.quiz, state.questions);
    expect(planning.questions[0]?.ref).toBe("question-01");
    expect(planning.questions[0]?.question_bank_entry_id).toBe(501);
    await manager.close(); await server.close();
  });

  it("updates metadata, updates existing question, adds question, and verifies read-back", async () => {
    const { server, manager } = await connected();
    const r = repos();
    const plan: QuizUpdatePlanEnvelope = {
      schema_version: "0.1", plan_id: "quiz-update-plan", revision: 1, plan_type: "quiz", operation: "update",
      title: "Updated Quiz", summary: "update", warnings: [], assumptions: [],
      content: {
        title: "Updated Quiz", description: "Updated Intro", source_refs: [],
        questions_to_update: [{ ref: "question-01", type: "truefalse", question: "New existing question", correct_answer: false, feedback: "", default_mark: 2, source_refs: [] }],
        questions_to_add: [{ ref: "question-02", type: "essay", question: "Explain it", grading_guidance: ["Clarity"], default_mark: 3, source_refs: [] }],
      },
    };
    const result = await executeQuizUpdate({ runId: "run-q-update", planEnvelope: plan, target: { course_id: 10, section_id: 20, quiz_id: 40 }, mcpClientManager: manager, repositories: r, options: {} });
    expect(result.status).toBe("completed");
    expect(result.questionsCount).toBe(2);
    expect(r.runRepo.completeRun).toHaveBeenCalledOnce();
    await manager.close(); await server.close();
  });

  it("creates a quiz in an existing section with questions and verifies it", async () => {
    const { server, manager } = await connected();
    const r = repos();
    const plan: QuizCreatePlanEnvelope = {
      schema_version: "0.1", plan_id: "quiz-create-plan", revision: 1, plan_type: "quiz", operation: "create",
      title: "New Quiz", summary: "create", warnings: [], assumptions: [],
      content: { ref: "quiz-new", type: "quiz", title: "New Quiz", description: "New Intro", source_refs: [], questions: [{ ref: "question-01", type: "truefalse", question: "Is this new?", correct_answer: true, feedback: "", default_mark: 1, source_refs: [] }] },
    };
    const result = await executeQuizCreate({ runId: "run-q-create", planEnvelope: plan, target: { course_id: 10, section_id: 20 }, mcpClientManager: manager, repositories: r, options: {} });
    expect(result.status).toBe("completed");
    expect(result.questionsCount).toBe(1);
    expect(r.mappings.some((m) => m.localRef === "quiz-new" && m.moodleId === 30)).toBe(true);
    await manager.close(); await server.close();
  });
});
