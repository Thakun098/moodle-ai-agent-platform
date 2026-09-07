import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpClientManager,
  type ExecutionMappingRepository,
  type IdempotencyRepository,
  type RunRepository,
  type ToolCallRepository,
} from "@moodle-agent-poc/agent-runtime";
import type { CoursePlanEnvelope } from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeCoursePlan } from "../src/course-executor.js";

function planWithOneMcq(): CoursePlanEnvelope {
  return {
    schema_version: "0.1",
    plan_id: "plan-hardening",
    revision: 1,
    plan_type: "course",
    operation: "create",
    title: "Hardening Course",
    summary: "Phase 11 hardening",
    warnings: [],
    assumptions: [],
    content: {
      course: { title: "Hardening Course", course_code: "HARD11" },
      sections: [{
        ref: "section-01",
        position: 1,
        title: "Section 1",
        source_refs: [],
        activities: [{
          ref: "quiz-01",
          type: "quiz",
          title: "Quiz 1",
          description: "Quiz",
          source_refs: [],
          questions: [{
            ref: "question-01",
            type: "multichoice",
            question: "Which answer is correct?",
            choices: [{ ref: "a", text: "A" }, { ref: "b", text: "B" }],
            correct_choice_refs: ["a"],
            feedback: "A is correct",
            default_mark: 2,
            source_refs: [],
          }],
        }],
      }],
    },
  };
}

describe("Phase 11 final hardening", () => {
  it("uses boolean multichoice flags and idempotency context for quiz-slot mutation", async () => {
    const server = new McpServer({ name: "phase11-hardening", version: "1" });
    server.registerTool("moodle_create_course", { inputSchema: z.object({ category_id: z.number(), fullname: z.string(), shortname: z.string() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { course_id: 1 } } }));
    server.registerTool("moodle_create_section", { inputSchema: z.object({ course_id: z.number(), position: z.number(), name: z.string() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { section_id: 2 } } }));
    server.registerTool("moodle_create_quiz", { inputSchema: z.object({ course_id: z.number(), section_id: z.number(), name: z.string(), intro: z.string().optional() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { activity_id: 3, quiz_id: 30 } } }));
    server.registerTool("moodle_create_quiz_question", {
      inputSchema: z.object({
        activity_id: z.number(), name: z.string(), question_text: z.string(), default_mark: z.number(),
        general_feedback: z.string().optional(), qtype: z.literal("multichoice"),
        options: z.object({
          single: z.boolean(),
          shuffle_answers: z.boolean(),
          choices: z.array(z.object({ text: z.string(), fraction: z.union([z.literal(0), z.literal(1)]) })).min(2),
        }),
      }),
    }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { question_bank_entry_id: 4, question_id: 40 } } }));
    server.registerTool("moodle_add_question_to_quiz", { inputSchema: z.object({ activity_id: z.number(), question_bank_entry_id: z.number(), max_mark: z.number() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { slot_id: 5 } } }));

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const manager = new McpClientManager({ type: "in_memory", transport: clientTransport });
    await manager.connect();

    const acquired: Array<Record<string, unknown>> = [];
    const idempotencyRepo = {
      tryAcquire: vi.fn(async (params) => {
        acquired.push(params);
        return { state: "acquired" as const, key: `${params.localRef}:${params.toolName}` };
      }),
      recordSuccess: vi.fn(async () => undefined),
      recordFailure: vi.fn(async () => undefined),
      recordUncertain: vi.fn(async () => undefined),
    } as unknown as IdempotencyRepository;

    const mappings: any[] = [];
    const mappingRepo = {
      setMapping: vi.fn(async (record) => { mappings.push(record); return record; }),
      listRunMappings: vi.fn(async () => mappings),
    } as unknown as ExecutionMappingRepository;
    const toolCallRepo = { recordToolCall: vi.fn(async (record) => record) } as unknown as ToolCallRepository;
    const runRepo = {
      updateStatus: vi.fn(async (_runId, status) => ({ status })),
      failRun: vi.fn(async (_runId, error) => ({ status: "failed", error })),
    } as unknown as RunRepository;

    const result = await executeCoursePlan({
      runId: "run-hardening",
      planEnvelope: planWithOneMcq(),
      target: { category_id: 1 },
      mcpClientManager: manager,
      repositories: { idempotencyRepo, mappingRepo, toolCallRepo, runRepo },
    });

    expect(result.status).toBe("awaiting_verification");
    const slotAcquire = acquired.find((x) => x.toolName === "moodle_add_question_to_quiz");
    expect(slotAcquire).toMatchObject({ localRef: "question-01", toolName: "moodle_add_question_to_quiz" });

    await manager.close();
    await server.close();
  });
});
