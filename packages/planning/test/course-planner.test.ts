import type { ModelClient, PlanRepository } from "@moodle-agent-poc/agent-runtime";
import { validatePlanningContract, type NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { PlanningError } from "../src/errors/planning-errors.js";
import { CoursePlanner } from "../src/planners/course-planner.js";
import { buildCoursePlanningSchema, buildCoursePlanningUserPrompt } from "../src/prompts/course-planning-prompt.js";
import type { CoursePlanningModelOutput } from "../src/types.js";

describe("CoursePlanner (T0505, T0506, T0507, T0512)", () => {
  const sampleSyllabus: NormalizedSyllabus = {
    schema_version: "0.1",
    course_title: "Introduction to Computer Science",
    course_code: "CS101",
    course_description: "Basic programming and algorithms.",
    learning_objectives: ["Understand algorithms", "Learn data structures"],
    schedule_or_topics: [
      {
        week_or_unit: "Week 1",
        title: "Algorithms Basics",
        topics: ["Big-O notation", "Sorting"],
        source: { kind: "line", start_line: 10, end_line: 20 },
      },
      {
        week_or_unit: "Week 2",
        title: "Linear Structures",
        topics: ["Arrays", "Linked Lists"],
        source: { kind: "line", start_line: 21, end_line: 30 },
      },
    ],
    raw_text: "# CS101: Introduction to Computer Science\n\n## Description\n...",
    metadata: {
      filename: "syllabus.md",
      media_type: "text/markdown",
      byte_size: 250,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
  };

  const validModelOutput: CoursePlanningModelOutput = {
    title: "CS101 Course Structure",
    summary: "Two-week introductory plan covering algorithms and data structures.",
    warnings: [],
    assumptions: ["Assumes 3 lecture hours per week."],
    content: {
      course: {
        title: "Introduction to Computer Science",
        course_code: "CS101",
        summary: "Basic programming and algorithms.",
      },
      sections: [
        {
          ref: "section-01",
          position: 1,
          title: "Week 1: Algorithms Basics",
          summary: "Introduction to algorithmic thinking and Big-O notation.",
          source_refs: [{ source: "syllabus.md", section: "lines 10-20" }],
          activities: [
            {
              ref: "assignment-01",
              type: "assignment",
              title: "Sorting Lab",
              description: "Implement bubble sort and merge sort.",
              instructions: ["Submit python code file."],
              learning_objectives: ["Understand algorithms"],
              grade: 100,
              source_refs: [{ source: "syllabus.md", section: "lines 10-20" }],
            },
          ],
        },
        {
          ref: "section-02",
          position: 2,
          title: "Week 2: Linear Structures",
          summary: "Arrays and Linked Lists.",
          source_refs: [{ source: "syllabus.md", section: "lines 21-30" }],
          activities: [],
        },
      ],
    },
  };

  const thaiSyllabus: NormalizedSyllabus = {
    ...sampleSyllabus,
    course_title: "พื้นฐานการเขียนโปรแกรมภาษา C#",
    course_code: "CS-TH-101",
    course_description: "รายวิชาพื้นฐานการเขียนโปรแกรมด้วย C# และ .NET",
    learning_objectives: ["อธิบายคลาสและอ็อบเจกต์", "ใช้ if / else และเมธอดได้"],
    schedule_or_topics: [
      { week_or_unit: "สัปดาห์ที่ 1", title: "คลาสและอ็อบเจกต์", topics: ["C#", ".NET", "Constructor"], source: { kind: "line", start_line: 1, end_line: 10 } },
      { week_or_unit: "สัปดาห์ที่ 2", title: "การสืบทอด", topics: ["Inheritance", "Polymorphism", "if / else"], source: { kind: "line", start_line: 11, end_line: 20 } },
    ],
    metadata: { ...sampleSyllabus.metadata, filename: "thai-csharp.md" },
  };

  const thaiModelOutput: CoursePlanningModelOutput = {
    title: "แผนรายวิชาพื้นฐานการเขียนโปรแกรมภาษา C#",
    summary: "แผนการเรียนรู้ภาษา C# สองสัปดาห์ ครอบคลุมคลาส อ็อบเจกต์ และการสืบทอด",
    warnings: [],
    assumptions: ["ผู้เรียนมีพื้นฐานการเขียนโปรแกรมเบื้องต้น"],
    content: {
      course: {
        title: "พื้นฐานการเขียนโปรแกรมภาษา C#",
        course_code: "CS-TH-101",
        summary: "ผู้เรียนจะฝึกสร้างโปรแกรมด้วย C# และ .NET",
      },
      sections: [
        {
          ref: "section-01",
          position: 1,
          title: "สัปดาห์ที่ 1: คลาสและอ็อบเจกต์",
          summary: "เรียนรู้คลาส อ็อบเจกต์ Constructor ใน C# และ .NET",
          source_refs: [{ source: "thai-csharp.md", section: "lines 1-10" }],
          activities: [{
            ref: "assignment-01",
            type: "assignment",
            title: "แบบฝึกหัดสร้างคลาส C#",
            description: "สร้างคลาสและอ็อบเจกต์อย่างง่ายด้วย C#",
            instructions: ["สร้าง Constructor และทดสอบโปรแกรม"],
            learning_objectives: ["อธิบายความสัมพันธ์ระหว่างคลาสกับอ็อบเจกต์"],
            grade: 10,
            source_refs: [{ source: "thai-csharp.md", section: "lines 1-10" }],
          }],
        },
        {
          ref: "section-02",
          position: 2,
          title: "สัปดาห์ที่ 2: การสืบทอดและโพลีมอร์ฟิซึม",
          summary: "ประยุกต์ใช้ Inheritance, Polymorphism และ if / else",
          source_refs: [{ source: "thai-csharp.md", section: "lines 11-20" }],
          activities: [{
            ref: "quiz-01",
            type: "quiz",
            title: "แบบทดสอบการสืบทอด",
            description: "ตรวจสอบความเข้าใจเรื่อง Inheritance และ Polymorphism",
            source_refs: [{ source: "thai-csharp.md", section: "lines 11-20" }],
            questions: [{
              ref: "question-01",
              type: "truefalse",
              question: "คลาสลูกสามารถสืบทอดเมธอดจากคลาสแม่ได้หรือไม่",
              correct_answer: true,
              feedback: "ถูกต้อง คลาสลูกใช้ความสามารถจากคลาสแม่ได้",
              default_mark: 1,
              source_refs: [{ source: "thai-csharp.md", section: "lines 11-20" }],
            }],
          }],
        },
      ],
    },
  };

  const structureOutput = (output: CoursePlanningModelOutput) => ({
    title: output.title,
    summary: output.summary,
    warnings: output.warnings ?? [],
    assumptions: output.assumptions ?? [],
    content: {
      course: output.content.course,
      sections: output.content.sections.map(({ activities, ...section }) => ({
        ...section,
        activity_intents: activities.map((activity) => ({
          type: activity.type,
          title: activity.title,
          source_refs: activity.source_refs,
          origin: "syllabus" as const,
        })),
      })),
    },
  });

  const activityOutput = (output: CoursePlanningModelOutput) => ({
    sections: output.content.sections.map((section) => ({
      section_ref: section.ref,
      activities: section.activities,
    })),
  });

  const stagedMockClient = (output: CoursePlanningModelOutput): ModelClient => ({
    chat: vi.fn()
      .mockResolvedValueOnce({ rawText: JSON.stringify(structureOutput(output)), message: { role: "assistant", content: "" }, toolCalls: [] })
      .mockResolvedValueOnce({ rawText: JSON.stringify(activityOutput(output)), message: { role: "assistant", content: "" }, toolCalls: [] }),
    listModels: vi.fn(),
    ping: vi.fn(),
  });

  it("builds a dynamic structured-output schema constrained to actual syllabus provenance", () => {
    const schema = buildCoursePlanningSchema(sampleSyllabus) as any;
    const sourceSchema = schema.$defs.groundedSourceReference;

    expect(sourceSchema.properties.source.const).toBe("syllabus.md");
    expect(sourceSchema.properties.section.enum).toContain("lines 10-20");
    expect(sourceSchema.properties.section.enum).toContain("lines 21-30");
    expect(sourceSchema.properties.section.enum).not.toContain("></section-01");
  });

  it("keeps model-facing strings aligned with frozen nonblank planning constraints", () => {
    const schema = buildCoursePlanningSchema(sampleSyllabus) as any;
    const content = schema.properties.content;
    const sections = content.properties.sections;
    const section = sections.items;
    const assignment = section.properties.activities.items.oneOf[0];
    const question = assignment.properties;

    expect(schema.properties.summary).toMatchObject({ type: "string", minLength: 1, pattern: "\\S" });
    expect(content.properties.course.properties.title).toMatchObject({ type: "string", minLength: 1, pattern: "\\S" });
    expect(section.properties.summary).toMatchObject({ type: "string", minLength: 1, pattern: "\\S" });
    expect(section.required).toContain("summary");
    expect(question.description).toMatchObject({ type: "string", minLength: 1, pattern: "\\S" });
    expect(question.instructions.items).toMatchObject({ type: "string", minLength: 1, pattern: "\\S" });
    expect(sections.minItems).toBe(2);
    const prompt = buildCoursePlanningUserPrompt(sampleSyllabus);
    expect(prompt).toContain("Coverage anchors");
    expect(prompt).toContain("Week 1");
    expect(prompt).toContain("Week 2");
  });

  it("rejects empty Section summaries against the frozen planning contract", async () => {
    const invalidOutput = {
      ...validModelOutput,
      content: {
        ...validModelOutput.content,
        sections: validModelOutput.content.sections.map((section, index) =>
          index === 0 ? { ...section, summary: "" } : section
        ),
      },
    };
    const mockModelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        rawText: JSON.stringify(invalidOutput),
        message: { role: "assistant", content: JSON.stringify(invalidOutput) },
        toolCalls: [],
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const planner = new CoursePlanner({ modelClient: mockModelClient });
    await expect(planner.generateCoursePlan({ syllabus: sampleSyllabus })).rejects.toMatchObject({
      code: "PLAN_SCHEMA_INVALID",
    });
  });

  it("rejects omitted Section summaries from non-strict model providers", async () => {
    const { summary: _summary, ...sectionWithoutSummary } = validModelOutput.content.sections[0];
    const invalidOutput = {
      ...validModelOutput,
      content: {
        ...validModelOutput.content,
        sections: [sectionWithoutSummary, validModelOutput.content.sections[1]],
      },
    };
    const mockModelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        rawText: JSON.stringify(invalidOutput),
        message: { role: "assistant", content: JSON.stringify(invalidOutput) },
        toolCalls: [],
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const planner = new CoursePlanner({ modelClient: mockModelClient });
    await expect(planner.generateCoursePlan({ syllabus: sampleSyllabus })).rejects.toMatchObject({
      code: "PLAN_SCHEMA_INVALID",
    });
  });

  it("passes the grounded dynamic schema to ModelClient", async () => {
    const mockModelClient = stagedMockClient(validModelOutput);
    const chat = mockModelClient.chat as ReturnType<typeof vi.fn>;

    const planner = new CoursePlanner({ modelClient: mockModelClient });
    await planner.generateCoursePlan({ syllabus: sampleSyllabus });

    const format = chat.mock.calls[0]?.[0]?.format as any;
    const sourceSchema = format.$defs.groundedSourceReference;
    expect(sourceSchema.properties.source.const).toBe("syllabus.md");
    expect(sourceSchema.properties.section.enum).toContain("lines 10-20");
  });

  it("preserves Thai syllabus language across generated pedagogical content", async () => {
    const mockModelClient = stagedMockClient(thaiModelOutput);

    const planner = new CoursePlanner({ modelClient: mockModelClient });
    const envelope = await planner.generateCoursePlan({ syllabus: thaiSyllabus });
    const firstSection = envelope.content.sections[0]!;
    const assignment = firstSection.activities.find((activity) => activity.type === "assignment")!;
    const quiz = envelope.content.sections[1]!.activities.find((activity) => activity.type === "quiz")!;
    const hasThai = (value: string) => /[\u0E00-\u0E7F]/u.test(value);

    expect((mockModelClient.chat as ReturnType<typeof vi.fn>).mock.calls[0][0].messages[0].content)
      .toContain("Language Preservation");
    expect((mockModelClient.chat as ReturnType<typeof vi.fn>).mock.calls[0][0].messages[1].content)
      .toContain("C#");
    expect(hasThai(envelope.summary)).toBe(true);
    expect(hasThai(firstSection.summary!)).toBe(true);
    expect(hasThai(assignment.title)).toBe(true);
    expect(hasThai(assignment.description)).toBe(true);
    expect(hasThai(assignment.instructions[0]!)).toBe(true);
    expect(hasThai(quiz.title)).toBe(true);
    expect(hasThai(quiz.description)).toBe(true);
    expect(hasThai(quiz.questions[0]!.question)).toBe(true);
    expect(hasThai(quiz.questions[0]!.feedback!)).toBe(true);
    expect(firstSection.summary).toContain("C#");
    expect(firstSection.summary).toContain(".NET");
    expect(validatePlanningContract(envelope).valid).toBe(true);
  });

  it("generates a valid CoursePlanEnvelope and validates via Ajv and Domain rules", async () => {
    const mockModelClient = stagedMockClient(validModelOutput);

    const planner = new CoursePlanner({ modelClient: mockModelClient });
    const envelope = await planner.generateCoursePlan({ syllabus: sampleSyllabus });

    expect(envelope.schema_version).toBe("0.1");
    expect(envelope.plan_type).toBe("course");
    expect(envelope.operation).toBe("create");
    expect(envelope.revision).toBe(1);
    expect(envelope.plan_id).toBeDefined();
    expect(envelope.title).toBe("CS101 Course Structure");
    expect(envelope.content.sections.length).toBe(2);
    expect(envelope.content.sections[0]?.activities.length).toBe(1);
  });

  it("persists plan revision in PlanRepository when runId is supplied (T0507)", async () => {
    const mockModelClient = stagedMockClient(validModelOutput);

    const mockPlanRepo: PlanRepository = {
      savePlanRevision: vi.fn().mockResolvedValue({
        id: "plan-rec-1",
        planId: "plan-uuid-1",
        runId: "run-uuid-1",
        planType: "course",
        operation: "create",
        revision: 1,
        title: validModelOutput.title,
        summary: validModelOutput.summary,
        validationStatus: "valid",
      }),
      getPlanRevision: vi.fn(),
      getLatestRevision: vi.fn(),
      listPlanRevisions: vi.fn(),
      listRunPlans: vi.fn(),
    } as unknown as PlanRepository;

    const planner = new CoursePlanner({ modelClient: mockModelClient, planRepository: mockPlanRepo });
    await planner.generateCoursePlan({ syllabus: sampleSyllabus, runId: "run-uuid-1" });

    expect(mockPlanRepo.savePlanRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-uuid-1",
        planType: "course",
        operation: "create",
        revision: 1,
        validationStatus: "valid",
      })
    );
  });

  it("throws MODEL_RESPONSE_INVALID if model returns non-JSON string", async () => {
    const mockModelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        rawText: "Here is your plan: not a JSON string",
        message: { role: "assistant", content: "not a JSON string" },
        toolCalls: [],
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const planner = new CoursePlanner({ modelClient: mockModelClient });
    await expect(planner.generateCoursePlan({ syllabus: sampleSyllabus })).rejects.toThrowError(PlanningError);
  });

  it("throws PLAN_SCHEMA_INVALID if model output violates schema contracts", async () => {
    const invalidOutput = {
      ...validModelOutput,
      content: { ...validModelOutput.content, sections: [] },
    };

    const mockModelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        rawText: JSON.stringify(invalidOutput),
        message: { role: "assistant", content: JSON.stringify(invalidOutput) },
        toolCalls: [],
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const planner = new CoursePlanner({ modelClient: mockModelClient });
    await expect(planner.generateCoursePlan({ syllabus: sampleSyllabus })).rejects.toThrowError(PlanningError);
  });

  it("throws TOKEN_BUDGET_EXCEEDED immediately without retry on deterministic request-too-large failure", async () => {
    const groqTooLargeError = new Error(
      'Groq API returned HTTP 413 for model openai/gpt-oss-120b: {"error":{"message":"Request too large for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Requested 12285","type":"tokens","code":"rate_limit_exceeded"}}'
    );
    (groqTooLargeError as any).code = "MODEL_REQUEST_TOO_LARGE";

    const chatMock = vi.fn().mockRejectedValue(groqTooLargeError);
    const mockModelClient: ModelClient = {
      chat: chatMock,
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const planner = new CoursePlanner({ modelClient: mockModelClient });

    await expect(planner.generateCoursePlan({ syllabus: sampleSyllabus })).rejects.toThrowError(
      expect.objectContaining({
        code: "TOKEN_BUDGET_EXCEEDED",
      })
    );

    // CRITICAL: Deterministic failure must NOT retry! Exactly 1 attempt made.
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on transient rate-limit / network failure", async () => {
    const transientError = new Error("Groq transient rate limit");
    (transientError as any).code = "MODEL_RATE_LIMITED";
    (transientError as any).details = { retryAfterMs: 10 };

    const chatMock = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({ rawText: JSON.stringify(structureOutput(validModelOutput)), message: { role: "assistant", content: "" }, toolCalls: [] })
      .mockResolvedValueOnce({ rawText: JSON.stringify(activityOutput(validModelOutput)), message: { role: "assistant", content: "" }, toolCalls: [] });

    const mockModelClient: ModelClient = {
      chat: chatMock,
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const planner = new CoursePlanner({ modelClient: mockModelClient });
    const result = await planner.generateCoursePlan({ syllabus: sampleSyllabus });

    expect(result.title).toBe(validModelOutput.title);
    expect(chatMock).toHaveBeenCalledTimes(3);
  });
});
