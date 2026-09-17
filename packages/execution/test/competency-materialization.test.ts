import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpClientManager,
  type CompetencyExecutionSnapshot,
  type ExecutionMappingRepository,
  type IdempotencyRepository,
  type RunRepository,
  type ToolCallRepository,
} from "@moodle-agent-poc/agent-runtime";
import type { CoursePlanEnvelope } from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeCoursePlan } from "../src/course-executor.js";

const plan: CoursePlanEnvelope = {
  schema_version: "0.1",
  plan_id: "plan-ticket24",
  revision: 1,
  plan_type: "course",
  operation: "create",
  title: "Ticket 24",
  summary: "Ticket 24",
  warnings: [],
  assumptions: [],
  content: {
    course: { title: "Ticket 24 Course", course_code: "T24" },
    sections: [{
      ref: "section-01", position: 1, title: "Week 1", source_refs: [],
      activities: [{ ref: "assignment-01", type: "assignment", title: "Evidence Assignment", description: "Evidence", instructions: ["Do work"], learning_objectives: ["Outcome"], grade: 100, source_refs: [] }],
    }],
  },
};

const snapshot = (evidence: "CONFIRMED" | "DECLINED" = "CONFIRMED"): CompetencyExecutionSnapshot => ({
  runId: "run-ticket24",
  planId: plan.plan_id,
  revision: plan.revision,
  mappingReviewRevision: 9,
  capturedAt: "2026-09-16T00:00:00.000Z",
  competencies: [{ candidateId: "competency-1", competencyRevision: 4, name: "Design classes", description: "Design classes correctly", outcomeIds: ["outcome-1"], idnumber: "AGENTPOC-T24-C1" }],
  mappings: [{ activityIntentId: "intent-1", activityRef: "assignment-01", competencyId: "competency-1", intentRevision: 2, activityRevision: 3, competencyRevision: 4, evidence }],
});

function repositories() {
  const mappings: any[] = [];
  const toolCalls: any[] = [];
  const mappingRepo = {
    getMapping: vi.fn(async (_runId: string, _planId: string, _revision: number, localRef: string) => mappings.find(m => m.localRef === localRef) ?? null),
    setMapping: vi.fn(async (record: any) => { const existing = mappings.find(m => m.localRef === record.localRef); if (existing) return existing; mappings.push(record); return record; }),
    listRunMappings: vi.fn(async () => mappings),
    findMoodleIdByLocalRef: vi.fn(async (_runId: string, _planId: string, _revision: number, localRef: string) => mappings.find(m => m.localRef === localRef)?.moodleId ?? null),
  } as unknown as ExecutionMappingRepository;
  const idempotencyRepo = {
    tryAcquire: vi.fn(async ({ localRef, toolName }: any) => ({ state: "acquired", key: `${toolName}:${localRef}` })),
    recordSuccess: vi.fn(), recordFailure: vi.fn(), recordUncertain: vi.fn(),
  } as unknown as IdempotencyRepository;
  const toolCallRepo = {
    recordToolCall: vi.fn(async (record: any) => { toolCalls.push(record); return record; }),
  } as unknown as ToolCallRepository;
  const runRepo = { updateStatus: vi.fn(), failRun: vi.fn(), completeRun: vi.fn() } as unknown as RunRepository;
  return { mappingRepo, idempotencyRepo, toolCallRepo, runRepo, mappings, toolCalls };
}

async function serverAndManager() {
  const server = new McpServer({ name: "ticket24", version: "1" });
  server.registerTool("moodle_list_competency_frameworks", { inputSchema: z.object({}) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { frameworks: [{ framework_id: 7, shortname: "POC", idnumber: "POC", visible: true, can_manage: true }] } } }));
  server.registerTool("moodle_create_course", { inputSchema: z.object({ category_id: z.number(), fullname: z.string(), shortname: z.string(), format: z.string().optional() }) }, async (a) => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { course_id: 101, fullname: a.fullname, shortname: a.shortname, category_id: a.category_id } } }));
  server.registerTool("moodle_create_section", { inputSchema: z.object({ course_id: z.number(), position: z.number(), name: z.string() }) }, async (a) => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { section_id: 201, course_id: a.course_id, section_num: a.position, name: a.name } } }));
  server.registerTool("moodle_create_assignment", { inputSchema: z.object({ course_id: z.number(), section_id: z.number(), name: z.string(), intro: z.string(), grade: z.number() }) }, async (a) => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { activity_id: 301, assignment_id: 401, course_id: a.course_id, section_id: a.section_id, name: a.name, grade: a.grade } } }));
  server.registerTool("moodle_create_competency", { inputSchema: z.object({ framework_id: z.number(), idnumber: z.string(), shortname: z.string(), description: z.string() }) }, async (a) => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { competency_id: 901, framework_id: a.framework_id, idnumber: a.idnumber, shortname: a.shortname, created: true } } }));
  server.registerTool("moodle_add_competency_to_course", { inputSchema: z.object({ course_id: z.number(), competency_id: z.number() }) }, async (a) => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { course_id: a.course_id, competency_id: a.competency_id, linked: true } } }));
  server.registerTool("moodle_add_competency_to_activity", { inputSchema: z.object({ activity_id: z.number(), competency_id: z.number(), rule_outcome: z.enum(["none", "evidence"]) }) }, async (a) => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { link_id: 1001, activity_id: a.activity_id, competency_id: a.competency_id, rule_outcome: a.rule_outcome === "evidence" ? 1 : 0 } } }));
  server.registerTool("moodle_get_course_competencies", { inputSchema: z.object({ course_id: z.number() }) }, async () => ({ content: [{ type: "text", text: "ok" }], structuredContent: { status: "success", data: { course_id: 101, course_competencies: [{ competency_id: 901, framework_id: 7, idnumber: "AGENTPOC-T24-C1", shortname: "Design classes" }], activity_links: [{ link_id: 1001, activity_id: 301, competency_id: 901, rule_outcome: 1 }] } } }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const manager = new McpClientManager({ type: "in_memory", transport: clientTransport });
  await manager.connect();
  return { server, manager };
}

describe("Ticket 24 native competency materialization", () => {
  it("blocks before Moodle course mutation when approved competencies exist but no framework is configured", async () => {
    const repos = repositories();
    const { server, manager } = await serverAndManager();
    await expect(executeCoursePlan({ runId: "run-ticket24", planEnvelope: plan, target: { category_id: 10 }, mcpClientManager: manager, repositories: repos, competencySnapshot: snapshot() })).rejects.toMatchObject({ code: "COMPETENCY_FRAMEWORK_REQUIRED" });
    expect(repos.toolCalls.some(call => call.toolName === "moodle_create_course")).toBe(false);
    await manager.close(); await server.close();
  });

  it("materializes the approved competency and confirmed mapping using the configured eligible framework", async () => {
    const repos = repositories();
    const { server, manager } = await serverAndManager();
    const result = await executeCoursePlan({ runId: "run-ticket24", planEnvelope: plan, target: { category_id: 10 }, mcpClientManager: manager, repositories: repos, competencySnapshot: snapshot(), competencyFrameworkId: 7 });
    expect(result.createdEntities.competencies).toBe(1);
    expect(result.createdEntities.competencyLinks).toBe(1);
    expect(repos.mappings.find(m => m.localRef === "competency:competency-1")).toMatchObject({ targetType: "competency", moodleId: 901 });
    expect(repos.toolCalls.find(call => call.toolName === "moodle_add_competency_to_activity")?.arguments).toMatchObject({ activity_id: 301, competency_id: 901, rule_outcome: "evidence" });
    const linkAcquire = (repos.idempotencyRepo.tryAcquire as any).mock.calls.find((call: any[]) => call[0]?.toolName === "moodle_add_competency_to_activity")?.[0];
    expect(linkAcquire.localRef.length).toBeLessThanOrEqual(64);
    expect(result.competencyReadback).toMatchObject({ course_id: 101, activity_links: [{ activity_id: 301, competency_id: 901, rule_outcome: 1 }] });
    await manager.close(); await server.close();
  });

  it("keeps a confirmed mapping non-evidence-producing when evidence eligibility was declined", async () => {
    const repos = repositories();
    const { server, manager } = await serverAndManager();
    await executeCoursePlan({ runId: "run-ticket24", planEnvelope: plan, target: { category_id: 10 }, mcpClientManager: manager, repositories: repos, competencySnapshot: snapshot("DECLINED"), competencyFrameworkId: 7 });
    expect(repos.toolCalls.find(call => call.toolName === "moodle_add_competency_to_activity")?.arguments).toMatchObject({ rule_outcome: "none" });
    await manager.close(); await server.close();
  });
  it("claims approved execution immediately before the first Moodle mutation", async () => {
    const repos = repositories();
    const { server, manager } = await serverAndManager();
    const beforeMutation = vi.fn(async () => { throw Object.assign(new Error("approval changed"), { code: "PLAN_NOT_APPROVED" }); });

    await expect(executeCoursePlan({
      runId: "run-ticket24",
      planEnvelope: plan,
      target: { category_id: 10 },
      mcpClientManager: manager,
      repositories: repos,
      competencySnapshot: snapshot(),
      competencyFrameworkId: 7,
      beforeMutation,
    })).rejects.toMatchObject({ code: "PLAN_NOT_APPROVED" });

    expect(beforeMutation).toHaveBeenCalledTimes(1);
    expect(repos.toolCalls.some(call => call.toolName === "moodle_create_course")).toBe(false);
    await manager.close(); await server.close();
  });

});
