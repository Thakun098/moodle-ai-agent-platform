import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  McpClientManager,
  type AgentLoopRepositories,
  type ExecutionMappingRepository,
  type IdempotencyRepository,
  type MessageRepository,
  type RunRepository,
  type ToolCallRepository,
} from "@moodle-agent-poc/agent-runtime";
import type { CoursePlanEnvelope } from "@moodle-agent-poc/contracts";
import { MoodleClient } from "@moodle-agent-poc/moodle-client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createMoodleMcpServer } from "../../../apps/moodle-mcp-server/src/server.js";
import { CourseExecutor } from "../src/course-executor.js";

function loadRootEnv(): void {
  const envPath = resolve(__dirname, "../../../.env");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [k, ...v] = trimmed.split("=");
        const key = k?.trim();
        const val = v.join("=").trim();
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadRootEnv();

const isLiveIntegration =
  process.env.MOODLE_INTEGRATION_TEST === "1" ||
  process.env.MOODLE_INTEGRATION_TEST === "true";

describe.skipIf(!isLiveIntegration)(
  "CourseExecutor Live Integration against local Moodle (T1101 to T1110)",
  () => {
    it("executes an end-to-end CoursePlan against live Moodle", async () => {
      const baseUrl = process.env.MOODLE_BASE_URL || "http://127.0.0.1:8000";
      const token = process.env.MOODLE_TOKEN || "";
      expect(token).toBeTruthy();

      const moodleClient = new MoodleClient({
        baseUrl,
        token,
        timeoutMs: 30000,
      });

      const server = createMoodleMcpServer(moodleClient);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);

      const mcpClientManager = new McpClientManager({
        type: "in_memory",
        transport: clientTransport,
      });
      await mcpClientManager.connect();

      const categories = await moodleClient.listCourseCategories();
      expect(categories.length).toBeGreaterThan(0);
      const targetCategoryId = categories[0].id;

      const livePlanEnvelope: CoursePlanEnvelope = {
        schema_version: "0.1",
        plan_id: "live-plan-" + Date.now(),
        revision: 1,
        plan_type: "course",
        operation: "create",
        title: "Live Integration Course " + Date.now(),
        summary: "Course created by Phase 11 live smoke test",
        warnings: [],
        assumptions: [],
        content: {
          course: {
            title: "Live Smoke Course " + Date.now(),
            course_code: "SMOKE" + Math.floor(Math.random() * 1000),
            summary: "Smoke test course summary",
          },
          sections: [
            {
              ref: "sec-1",
              position: 1,
              title: "Module 1: Getting Started",
              summary: "First module of live course",
              source_refs: [],
              activities: [
                {
                  ref: "assign-1",
                  type: "assignment",
                  title: "Assignment 1: Introduction",
                  description: "Submit your introductory assignment",
                  instructions: ["Read chapter 1", "Submit summary"],
                  learning_objectives: ["Understand course structure"],
                  grade: 100,
                  source_refs: [],
                },
                {
                  ref: "quiz-1",
                  type: "quiz",
                  title: "Quiz 1: Baseline Check",
                  description: "Knowledge check for module 1",
                  source_refs: [],
                  questions: [
                    {
                      ref: "q-mcq",
                      type: "multichoice",
                      question: "Which option is correct?",
                      choices: [
                        { ref: "c1", text: "Correct Option A" },
                        { ref: "c2", text: "Incorrect Option B" },
                      ],
                      correct_choice_refs: ["c1"],
                      feedback: "Choice A is correct",
                      default_mark: 1,
                      source_refs: [],
                    },
                    {
                      ref: "q-tf",
                      type: "truefalse",
                      question: "TypeScript is statically typed.",
                      correct_answer: true,
                      feedback: "TypeScript provides static type checking.",
                      default_mark: 1,
                      source_refs: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const repos = {
        toolCallRepo: { recordToolCall: vi.fn().mockResolvedValue({}) },
        mappingRepo: { setMapping: vi.fn().mockResolvedValue({}), getRunMappings: vi.fn().mockResolvedValue([]) },
        idempotencyRepo: {
          acquire: vi.fn().mockResolvedValue({ state: "acquired", key: "k" }),
          recordSuccess: vi.fn().mockResolvedValue(undefined),
          recordFailure: vi.fn().mockResolvedValue(undefined),
          recordUncertain: vi.fn().mockResolvedValue(undefined),
        },
      } as unknown as AgentLoopRepositories;

      const executor = new CourseExecutor({
        runId: "live-run-" + Date.now(),
        planEnvelope: livePlanEnvelope,
        target: { category_id: targetCategoryId },
        mcpClientManager,
        repositories: repos,
        options: { moodleBaseUrl: baseUrl },
      });

      const result = await executor.execute();
      expect(result.status).toBe("awaiting_verification");
      expect(result.courseId).toBeGreaterThan(0);
      expect(result.courseUrl).toContain(`/course/view.php?id=${result.courseId}`);

      await mcpClientManager.close();
      await server.close();
    });
  }
);
