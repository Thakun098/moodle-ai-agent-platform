import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpClientManager,
  type AgentLoopRepositories,
  type ExecutionMappingRepository,
  type IdempotencyRepository,
  type MessageRepository,
  type RunRepository,
  type ToolCallRepository,
} from "@moodle-agent-poc/agent-runtime";
import type {
  CoursePlanEnvelope,
  ExecutionMappingRecord,
  PocRunRecord,
  PocRunStatus,
} from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CourseExecutor, executeCoursePlan } from "../src/course-executor.js";
import { CourseExecutionError } from "../src/types.js";

describe("CourseExecutor (T1102 to T1110, P11-D1 to P11-D8, C1 to C7)", () => {
  // Mock Repository factory for deterministic unit testing
  function createMockRepositories() {
    const mappings: ExecutionMappingRecord[] = [];
    const toolCalls: Array<Record<string, unknown>> = [];
    const runStatuses: PocRunStatus[] = [];

    const messageRepo = {
      appendMessage: vi.fn().mockResolvedValue({}),
      getRunMessages: vi.fn().mockResolvedValue([]),
    } as unknown as MessageRepository;

    const toolCallRepo = {
      recordToolCall: vi.fn().mockImplementation(async (record) => {
        toolCalls.push(record);
        return record;
      }),
      getRunToolCalls: vi.fn().mockResolvedValue(toolCalls),
    } as unknown as ToolCallRepository;

    const mappingRepo = {
      setMapping: vi.fn().mockImplementation(async (record) => {
        mappings.push(record);
        return record;
      }),
      getMapping: vi.fn().mockImplementation(async (runId, localRef) => {
        return mappings.find((m) => m.runId === runId && m.localRef === localRef) ?? null;
      }),
      listRunMappings: vi.fn().mockImplementation(async (runId) => {
        return mappings.filter((m) => m.runId === runId);
      }),
    } as unknown as ExecutionMappingRepository;

    const idempotencyRepo = {
      tryAcquire: vi.fn().mockResolvedValue({ state: "acquired", key: "test-key" }),
      recordSuccess: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      recordUncertain: vi.fn().mockResolvedValue(undefined),
    } as unknown as IdempotencyRepository;

    const runRepo = {
      updateStatus: vi.fn().mockImplementation(async (runId, status) => {
        runStatuses.push(status);
        return { runId, status } as PocRunRecord;
      }),
      failRun: vi.fn().mockImplementation(async (runId, error) => {
        runStatuses.push("failed");
        return { runId, status: "failed", error } as PocRunRecord;
      }),
      completeRun: vi.fn().mockImplementation(async () => {
        throw new Error("completeRun must NOT be called in Phase 11 (P11-D2)");
      }),
    } as unknown as RunRepository;

    return {
      messageRepo,
      toolCallRepo,
      mappingRepo,
      idempotencyRepo,
      runRepo,
      mappings,
      toolCalls,
      runStatuses,
    };
  }

  // Setup fake Moodle MCP Server with canonical tool schemas
  function createFakeMoodleMcpServer() {
    const server = new McpServer({
      name: "fake-moodle-mcp",
      version: "0.1.0",
    });

    let nextCourseId = 101;
    let nextSectionId = 201;
    let nextActivityId = 301;
    let nextQuizId = 401;
    let nextQBankEntryId = 501;
    let nextQuestionId = 601;
    let nextSlotId = 701;

    // 1. moodle_create_course
    server.registerTool(
      "moodle_create_course",
      {
        description: "Create course",
        inputSchema: z.object({
          category_id: z.number(),
          fullname: z.string(),
          shortname: z.string(),
          summary: z.string().optional(),
          format: z.string().optional(),
        }),
      },
      async (args) => {
        const cid = nextCourseId++;
        return {
          content: [{ type: "text", text: `Course ${cid} created` }],
          structuredContent: {
            status: "success",
            data: {
              course_id: cid,
              fullname: args.fullname,
              shortname: args.shortname,
              category_id: args.category_id,
            },
          },
        };
      }
    );

    // 2. moodle_create_section
    server.registerTool(
      "moodle_create_section",
      {
        description: "Create section",
        inputSchema: z.object({
          course_id: z.number(),
          position: z.number(),
          name: z.string(),
          summary: z.string().optional(),
        }),
      },
      async (args) => {
        const sid = nextSectionId++;
        return {
          content: [{ type: "text", text: `Section ${sid} created` }],
          structuredContent: {
            status: "success",
            data: {
              section_id: sid,
              course_id: args.course_id,
              section_num: args.position,
              name: args.name,
            },
          },
        };
      }
    );

    server.registerTool(
      "moodle_create_resource",
      {
        description: "Create file resource",
        inputSchema: z.object({
          course_id: z.number(),
          section_id: z.number(),
          name: z.string(),
          filename: z.string(),
          moodle_material_id: z.number(),
          source_run_id: z.string(),
          source_structure_revision: z.number(),
          source_section_ref: z.string(),
          source_material_revision: z.number(),
        }),
      },
      async (args) => ({
        content: [{ type: "text", text: "Resource created" }],
        structuredContent: {
          status: "success",
          data: { activity_id: 801, resource_id: 901, section_id: args.section_id, name: args.name, filename: args.filename, moodle_material_id: args.moodle_material_id },
        },
      }),
    );

    // 3. moodle_create_assignment
    server.registerTool(
      "moodle_create_assignment",
      {
        description: "Create assignment",
        inputSchema: z.object({
          course_id: z.number(),
          section_id: z.number(),
          name: z.string(),
          intro: z.string().optional(),
          grade: z.number().optional(),
        }),
      },
      async (args) => {
        const aid = nextActivityId++;
        return {
          content: [{ type: "text", text: `Assignment ${aid} created` }],
          structuredContent: {
            status: "success",
            data: {
              activity_id: aid,
              course_id: args.course_id,
              section_id: args.section_id,
              name: args.name,
              grade: args.grade ?? 100,
            },
          },
        };
      }
    );

    // 4. moodle_create_quiz
    server.registerTool(
      "moodle_create_quiz",
      {
        description: "Create quiz",
        inputSchema: z.object({
          course_id: z.number(),
          section_id: z.number(),
          name: z.string(),
          intro: z.string().optional(),
          grade: z.number().optional(),
        }),
      },
      async (args) => {
        const aid = nextActivityId++;
        const qid = nextQuizId++;
        return {
          content: [{ type: "text", text: `Quiz ${aid} created` }],
          structuredContent: {
            status: "success",
            data: {
              activity_id: aid,
              quiz_id: qid,
              name: args.name,
              section_id: args.section_id,
              grade: args.grade ?? 10,
            },
          },
        };
      }
    );

    // 5. moodle_create_quiz_question
    server.registerTool(
      "moodle_create_quiz_question",
      {
        description: "Create question",
        inputSchema: z.object({
          activity_id: z.number(),
          name: z.string(),
          question_text: z.string(),
          default_mark: z.number().optional(),
          general_feedback: z.string().optional(),
          qtype: z.enum(["multichoice", "truefalse", "shortanswer", "essay"]),
          options: z.record(z.unknown()),
        }),
      },
      async (args) => {
        const qbid = nextQBankEntryId++;
        const qid = nextQuestionId++;
        return {
          content: [{ type: "text", text: `Question ${qbid} created` }],
          structuredContent: {
            status: "success",
            data: {
              question_bank_entry_id: qbid,
              question_id: qid,
              version: 1,
              name: args.name,
              qtype: args.qtype,
            },
          },
        };
      }
    );

    // 6. moodle_add_question_to_quiz
    server.registerTool(
      "moodle_add_question_to_quiz",
      {
        description: "Add question to quiz",
        inputSchema: z.object({
          activity_id: z.number(),
          question_bank_entry_id: z.number(),
          page: z.number().optional(),
          max_mark: z.number().optional(),
        }),
      },
      async (args) => {
        const slotId = nextSlotId++;
        return {
          content: [{ type: "text", text: `Slot ${slotId} created` }],
          structuredContent: {
            status: "success",
            data: {
              slot_id: slotId,
              activity_id: args.activity_id,
              quiz_id: 401,
              question_bank_entry_id: args.question_bank_entry_id,
              slot_number: 1,
              page: args.page ?? 1,
              max_mark: args.max_mark ?? 1,
            },
          },
        };
      }
    );

    return server;
  }

  // Sample comprehensive CoursePlan envelope
  const validCoursePlanEnvelope: CoursePlanEnvelope = {
    schema_version: "0.1",
    plan_id: "plan-intro-cs",
    revision: 1,
    plan_type: "course",
    operation: "create",
    title: "Introduction to Computer Science",
    summary: "Complete CS101 foundational syllabus",
    warnings: [],
    assumptions: [],
    content: {
      course: {
        title: "Introduction to Computer Science",
        course_code: "CS101",
        summary: "Introductory course in computer science",
      },
      sections: [
        {
          ref: "sec-2",
          position: 2,
          title: "Week 2: Data Structures",
          summary: "Arrays and Hash Tables",
          source_refs: [],
          activities: [
            {
              ref: "quiz-1",
              type: "quiz",
              title: "Week 2 Knowledge Check",
              description: "Assess understanding of basic data structures",
              source_refs: [],
              questions: [
                {
                  ref: "q-mcq",
                  type: "multichoice",
                  question: "What is the average lookup time of a hash table?",
                  choices: [
                    { ref: "c1", text: "O(1)" },
                    { ref: "c2", text: "O(n)" },
                  ],
                  correct_choice_refs: ["c1"],
                  feedback: "Hash tables provide average O(1) time.",
                  default_mark: 2,
                  source_refs: [],
                },
                {
                  ref: "q-tf",
                  type: "truefalse",
                  question: "Binary search requires a sorted array.",
                  correct_answer: true,
                  feedback: "Binary search only works on sorted collections.",
                  default_mark: 1,
                  source_refs: [],
                },
                {
                  ref: "q-sa",
                  type: "shortanswer",
                  question: "Name the data structure that uses FIFO ordering.",
                  accepted_answers: ["Queue", "queue"],
                  case_sensitive: false,
                  default_mark: 1,
                  source_refs: [],
                },
                {
                  ref: "q-essay",
                  type: "essay",
                  question: "Discuss the trade-offs between arrays and linked lists.",
                  grading_guidance: ["Insertion time", "Random access capability"],
                  default_mark: 5,
                  source_refs: [],
                },
              ],
            },
          ],
        },
        {
          ref: "sec-1",
          position: 1,
          title: "Week 1: Algorithmic Thinking",
          summary: "Introduction to algorithms",
          source_refs: [],
          activities: [
            {
              ref: "assign-1",
              type: "assignment",
              title: "Algorithm Analysis Report",
              description: "Write an essay analyzing big-O complexity.",
              instructions: ["Pick 2 algorithms", "Compare asymptotic growth"],
              learning_objectives: ["Analyze worst-case bounds"],
              grade: 100,
              source_refs: [],
            },
          ],
        },
      ],
    },
  };

  it("executes complete course plan deterministically and records all mappings (T1103–T1108, P11-D1)", async () => {
    const repos = createMockRepositories();
    const server = createFakeMoodleMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const mcpClientManager = new McpClientManager({
      type: "in_memory",
      transport: clientTransport,
    });
    await mcpClientManager.connect();

    const executor = new CourseExecutor({
      runId: "run-001",
      planEnvelope: validCoursePlanEnvelope,
      target: { category_id: 10 },
      mcpClientManager,
      repositories: repos as unknown as AgentLoopRepositories,
      options: { moodleBaseUrl: "http://localhost:8000", courseFormat: "weeks" },
    });

    const result = await executor.execute();

    const courseCall = repos.toolCalls.find((call) => call.toolName === "moodle_create_course");
    expect(courseCall?.arguments).toMatchObject({ format: "weeks" });

    // 1. Result verification
    expect(result.status).toBe("awaiting_verification");
    expect(result.courseId).toBe(101);
    expect(result.courseShortname).toMatch(/^CS101-[A-F0-9]{6}$/);
    expect(result.courseUrl).toBe("http://localhost:8000/course/view.php?id=101");
    expect(result.createdEntities).toEqual({
      courses: 1,
      sections: 2,
      assignments: 1,
      quizzes: 1,
      questions: 4,
      slots: 4,
    });

    // 2. Lifecycle verification (P11-D2)
    expect(repos.runStatuses).toEqual(["executing", "awaiting_verification"]);
    expect(repos.runRepo.completeRun).not.toHaveBeenCalled();

    // 3. Execution Mapping Verification (C6, C7)
    const mappings = repos.mappings;
    expect(mappings).toHaveLength(9);

    const courseMap = mappings.find((m) => m.localRef === "course");
    expect(courseMap?.moodleId).toBe(101);
    expect(courseMap?.targetType).toBe("course");

    const sec1Map = mappings.find((m) => m.localRef === "sec-1");
    expect(sec1Map?.moodleId).toBe(201);
    expect(sec1Map?.targetType).toBe("section");

    const sec2Map = mappings.find((m) => m.localRef === "sec-2");
    expect(sec2Map?.moodleId).toBe(202);
    expect(sec2Map?.targetType).toBe("section");

    const assignMap = mappings.find((m) => m.localRef === "assign-1");
    expect(assignMap?.moodleId).toBe(301);
    expect(assignMap?.targetType).toBe("assignment");

    const quizMap = mappings.find((m) => m.localRef === "quiz-1");
    expect(quizMap?.moodleId).toBe(302); // canonical activity_id (C6)
    expect(quizMap?.targetType).toBe("quiz");

    const mcqMap = mappings.find((m) => m.localRef === "q-mcq");
    expect(mcqMap?.moodleId).toBe(501); // question_bank_entry_id (C7)
    expect(mcqMap?.targetType).toBe("question");

    const tfMap = mappings.find((m) => m.localRef === "q-tf");
    expect(tfMap?.moodleId).toBe(502);

    const saMap = mappings.find((m) => m.localRef === "q-sa");
    expect(saMap?.moodleId).toBe(503);

    const essayMap = mappings.find((m) => m.localRef === "q-essay");
    expect(essayMap?.moodleId).toBe(504);

    await mcpClientManager.close();
    await server.close();
  });

  it("creates one planned File Resource from the sealed material reference after the section exists", async () => {
    const repos = createMockRepositories();
    const server = createFakeMoodleMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const mcpClientManager = new McpClientManager({ type: "in_memory", transport: clientTransport });
    await mcpClientManager.connect();

    const resourcePlan = {
      ...validCoursePlanEnvelope,
      content: {
        course: { title: "Resource Course", course_code: "RES1" },
        sections: [{
          ref: "sec-1", position: 1, title: "Week 1", source_refs: [], activities: [],
          resources: [{ ref: "resource-01-01", type: "resource" as const, title: "Week_01_Material", filename: "Week_01_Material.pdf", moodle_material_id: 77, source_run_id: "run-resource", source_structure_revision: 2, source_section_ref: "sec-1", source_material_revision: 3, source_refs: [] }],
        }],
      },
    };
    const result = await executeCoursePlan({
      runId: "run-resource",
      planEnvelope: resourcePlan,
      target: { category_id: 10 },
      mcpClientManager,
      repositories: repos as unknown as AgentLoopRepositories,
    });

    expect(result.createdEntities.resources).toBe(1);
    expect(repos.mappings.find((mapping) => mapping.localRef === "resource-01-01")).toMatchObject({ moodleId: 801, targetType: "resource" });
    expect(repos.toolCalls.find((call) => call.toolName === "moodle_create_resource")?.arguments).toMatchObject({ name: "Week_01_Material", filename: "Week_01_Material.pdf", moodle_material_id: 77, source_run_id: "run-resource", source_structure_revision: 2, source_section_ref: "sec-1", source_material_revision: 3 });
    await mcpClientManager.close();
    await server.close();
  });

  it("sorts sections by explicit position ascending (T1104, P11-D1)", async () => {
    const repos = createMockRepositories();
    const server = createFakeMoodleMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const mcpClientManager = new McpClientManager({
      type: "in_memory",
      transport: clientTransport,
    });
    await mcpClientManager.connect();

    const result = await executeCoursePlan({
      runId: "run-order-test",
      planEnvelope: validCoursePlanEnvelope, // contains sec-2 (pos 2) before sec-1 (pos 1) in content array
      target: { category_id: 10 },
      mcpClientManager,
      repositories: repos as unknown as AgentLoopRepositories,
    });

    expect(result.status).toBe("awaiting_verification");

    // Section 1 (pos 1) must have been created first (ID 201), Section 2 (pos 2) second (ID 202)
    const sec1 = repos.mappings.find((m) => m.localRef === "sec-1");
    const sec2 = repos.mappings.find((m) => m.localRef === "sec-2");
    expect(sec1?.moodleId).toBe(201);
    expect(sec2?.moodleId).toBe(202);

    await mcpClientManager.close();
    await server.close();
  });

  it("rejects plan with duplicate section positions before making any mutation (P11-D1)", async () => {
    const repos = createMockRepositories();
    const server = createFakeMoodleMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const mcpClientManager = new McpClientManager({
      type: "in_memory",
      transport: clientTransport,
    });
    await mcpClientManager.connect();

    const badPlan: CoursePlanEnvelope = {
      ...validCoursePlanEnvelope,
      content: {
        ...validCoursePlanEnvelope.content,
        sections: [
          {
            ref: "s1",
            position: 1,
            title: "Section 1",
            source_refs: [],
            activities: [],
          },
          {
            ref: "s2",
            position: 1, // duplicate position
            title: "Section 2",
            source_refs: [],
            activities: [],
          },
        ],
      },
    };

    await expect(
      executeCoursePlan({
        runId: "run-dup-pos",
        planEnvelope: badPlan,
        target: { category_id: 10 },
        mcpClientManager,
        repositories: repos as unknown as AgentLoopRepositories,
      })
    ).rejects.toThrow(CourseExecutionError);

    // No tool calls should have been recorded
    expect(repos.toolCalls).toHaveLength(0);

    await mcpClientManager.close();
    await server.close();
  });

  it("rejects execution for non-course plan types (P11-D3)", async () => {
    const repos = createMockRepositories();
    const mcpClientManager = new McpClientManager({
      type: "in_memory",
      transport: InMemoryTransport.createLinkedPair()[0],
    });

    const badTypePlan = {
      ...validCoursePlanEnvelope,
      plan_type: "assignment",
    } as unknown as CoursePlanEnvelope;

    await expect(
      executeCoursePlan({
        runId: "run-bad-type",
        planEnvelope: badTypePlan,
        target: { category_id: 10 },
        mcpClientManager,
        repositories: repos as unknown as AgentLoopRepositories,
      })
    ).rejects.toThrow(CourseExecutionError);
  });

  it("preserves partial mappings and updates run status to failed when a downstream step fails (T1110)", async () => {
    const repos = createMockRepositories();
    const server = new McpServer({
      name: "failing-moodle-mcp",
      version: "0.1.0",
    });

    // Course succeeds
    server.registerTool(
      "moodle_create_course",
      {
        description: "Create course",
        inputSchema: z.object({
          category_id: z.number(),
          fullname: z.string(),
          shortname: z.string(),
          summary: z.string().optional(),
        }),
      },
      async (args) => ({
        content: [{ type: "text", text: "Course created" }],
        structuredContent: {
          status: "success",
          data: { course_id: 999, fullname: args.fullname, shortname: args.shortname, category_id: args.category_id },
        },
      })
    );

    // Section creation fails
    server.registerTool(
      "moodle_create_section",
      {
        description: "Create section",
        inputSchema: z.object({
          course_id: z.number(),
          position: z.number(),
          name: z.string(),
        }),
      },
      async () => ({
        content: [{ type: "text", text: "Section creation error" }],
        structuredContent: {
          status: "error",
          code: "SECTION_CREATION_FAILED",
          message: "Database connection lost during section creation",
        },
        isError: true,
      })
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const mcpClientManager = new McpClientManager({
      type: "in_memory",
      transport: clientTransport,
    });
    await mcpClientManager.connect();

    await expect(
      executeCoursePlan({
        runId: "run-partial-fail",
        planEnvelope: validCoursePlanEnvelope,
        target: { category_id: 5 },
        mcpClientManager,
        repositories: repos as unknown as AgentLoopRepositories,
      })
    ).rejects.toThrow(CourseExecutionError);

    // 1. Run status transitioned to failed
    expect(repos.runStatuses).toContain("failed");

    // 2. Created course mapping remains preserved in repository (T1110)
    expect(repos.mappings).toHaveLength(1);
    expect(repos.mappings[0].localRef).toBe("course");
    expect(repos.mappings[0].moodleId).toBe(999);

    await mcpClientManager.close();
    await server.close();
  });

  it("rejects execution when operation is not 'create' (P11-D3)", async () => {
    const repos = createMockRepositories();
    const mcpClientManager = new McpClientManager({
      type: "in_memory",
      transport: InMemoryTransport.createLinkedPair()[0],
    });

    const updatePlan = {
      ...validCoursePlanEnvelope,
      operation: "update",
    } as unknown as CoursePlanEnvelope;

    await expect(
      executeCoursePlan({
        runId: "run-update-op",
        planEnvelope: updatePlan,
        target: { category_id: 10 },
        mcpClientManager,
        repositories: repos as unknown as AgentLoopRepositories,
      })
    ).rejects.toThrow(CourseExecutionError);
  });

  it("rejects execution when category_id is invalid or <= 0 (P11-D3)", async () => {
    const repos = createMockRepositories();
    const mcpClientManager = new McpClientManager({
      type: "in_memory",
      transport: InMemoryTransport.createLinkedPair()[0],
    });

    await expect(
      executeCoursePlan({
        runId: "run-invalid-cat",
        planEnvelope: validCoursePlanEnvelope,
        target: { category_id: 0 },
        mcpClientManager,
        repositories: repos as unknown as AgentLoopRepositories,
      })
    ).rejects.toThrow(CourseExecutionError);
  });

  it("preserves activity execution order as defined in SectionPlan array (P11-D1)", async () => {
    const repos = createMockRepositories();
    const server = createFakeMoodleMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const mcpClientManager = new McpClientManager({
      type: "in_memory",
      transport: clientTransport,
    });
    await mcpClientManager.connect();

    const interleavedPlan: CoursePlanEnvelope = {
      ...validCoursePlanEnvelope,
      content: {
        course: { title: "Interleaved Course", course_code: "INT1" },
        sections: [
          {
            ref: "sec-mix",
            position: 1,
            title: "Mixed Section",
            source_refs: [],
            activities: [
              {
                ref: "quiz-first",
                type: "quiz",
                title: "Quiz First",
                description: "First activity is a quiz",
                source_refs: [],
                questions: [],
              },
              {
                ref: "assign-middle",
                type: "assignment",
                title: "Assignment Middle",
                description: "Second activity is assignment",
                instructions: ["Task 1"],
                learning_objectives: ["Obj 1"],
                grade: 100,
                source_refs: [],
              },
              {
                ref: "quiz-last",
                type: "quiz",
                title: "Quiz Last",
                description: "Third activity is another quiz",
                source_refs: [],
                questions: [],
              },
            ],
          },
        ],
      },
    };

    const result = await executeCoursePlan({
      runId: "run-interleaved",
      planEnvelope: interleavedPlan,
      target: { category_id: 5 },
      mcpClientManager,
      repositories: repos as unknown as AgentLoopRepositories,
    });

    expect(result.status).toBe("awaiting_verification");

    // Check that toolCalls executed in exact order: moodle_create_course, moodle_create_section, moodle_create_quiz (quiz-first), moodle_create_assignment (assign-middle), moodle_create_quiz (quiz-last)
    const toolNames = repos.toolCalls.map((tc) => tc.toolName);
    expect(toolNames).toEqual([
      "moodle_create_course",
      "moodle_create_section",
      "moodle_create_quiz",
      "moodle_create_assignment",
      "moodle_create_quiz",
    ]);

    await mcpClientManager.close();
    await server.close();
  });
});
