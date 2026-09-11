import { randomUUID } from "node:crypto";
import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import { describe, expect, it, vi } from "vitest";
import { PlanningError } from "../src/errors/planning-errors.js";
import { QuizPlanner } from "../src/planners/quiz-planner.js";
import type { QuizPlanningInput, QuizUpdateModelOutput } from "../src/types.js";

describe("QuizPlanner (T0510, R3, R4)", () => {
  const sampleInput: QuizPlanningInput = {
    current: {
      ref: "quiz-01",
      title: "Data Structures Quiz",
      description: "Assess understanding of lists and trees.",
      source_refs: [{ source: "syllabus.md" }],
      questions: [],
    },
    instruction: "Add a multiple choice question about Big-O notation.",
  };

  const validModelOutput: QuizUpdateModelOutput = {
    title: "Quiz 1 Update",
    summary: "Added 1 multiple choice question on Big-O notation.",
    warnings: [],
    assumptions: [],
    content: {
      title: "Data Structures Quiz (Updated)",
      description: "Assess understanding of lists, trees, and complexity.",
      source_refs: [{ source: "syllabus.md" }],
      questions_to_add: [
        {
          ref: "question-01",
          type: "multichoice",
          question: "What is the worst-case time complexity of merge sort?",
          choices: [
            { ref: "choice-01", text: "O(n)" },
            { ref: "choice-02", text: "O(n log n)" },
            { ref: "choice-03", text: "O(n^2)" },
          ],
          correct_choice_refs: ["choice-02"],
          feedback: "Merge sort divides the array in half at each step.",
          default_mark: 1,
          source_refs: [{ source: "syllabus.md" }],
        },
      ],
      questions_to_update: [],
    },
  };

  it("plans quiz update generating valid QuizUpdatePlanEnvelope (operation=update)", async () => {
    const mockModelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        rawText: JSON.stringify(validModelOutput),
        message: { role: "assistant", content: JSON.stringify(validModelOutput) },
        toolCalls: [],
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const validPlanId = randomUUID();
    const planner = new QuizPlanner({ modelClient: mockModelClient });
    const envelope = await planner.planQuizUpdate({
      input: sampleInput,
      planId: validPlanId,
      revision: 2,
    });

    expect(envelope.schema_version).toBe("0.1");
    expect(envelope.plan_type).toBe("quiz");
    expect(envelope.operation).toBe("update");
    expect(envelope.plan_id).toBe(validPlanId);
    expect(envelope.revision).toBe(2);
    expect(envelope.content.questions_to_add.length).toBe(1);
    expect(envelope.content.questions_to_add[0]?.type).toBe("multichoice");
  });

  it("persists plan-time question bindings outside the model envelope", async () => {
    const savePlanRevision = vi.fn(async data => data);
    const planner = new QuizPlanner({
      modelClient: { chat: vi.fn(async () => ({ rawText: JSON.stringify(validModelOutput) })) } as any,
      planRepository: { savePlanRevision } as any,
    });
    const target = { course_id: 10, section_id: 20, quiz_id: 30 };
    const input = { ...sampleInput, current: { ...sampleInput.current, questions: [{
      ref: "question-existing", slot_number: 1, question_bank_entry_id: 501, version: 4,
      name: "Existing", type: "truefalse" as const, question: "Existing?", default_mark: 1, answers: [],
    }] } };
    const result = await planner.planQuizUpdate({ input, runId: "run", executionTarget: target });
    expect(savePlanRevision).toHaveBeenCalledWith(expect.objectContaining({ executionContext: {
      target, questionBindings: { "question-existing": { questionBankEntryId: 501, version: 4 } },
    } }));
    expect(result).not.toHaveProperty("executionContext");
  });

  it("rejects ungrounded quiz-level source references (R3)", async () => {
    const outputWithUngroundedQuizSource: QuizUpdateModelOutput = {
      ...validModelOutput,
      content: {
        ...validModelOutput.content,
        source_refs: [{ source: "unauthorized-external-quiz.pdf" }],
      },
    };

    const mockModelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        rawText: JSON.stringify(outputWithUngroundedQuizSource),
        message: { role: "assistant", content: JSON.stringify(outputWithUngroundedQuizSource) },
        toolCalls: [],
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const planner = new QuizPlanner({ modelClient: mockModelClient });
    await expect(
      planner.planQuizUpdate({
        input: sampleInput,
        planId: randomUUID(),
        revision: 2,
      })
    ).rejects.toThrowError(PlanningError);
  });

  it("rejects ungrounded question-level source references (R3, R4)", async () => {
    const outputWithUngroundedQuestionSource: QuizUpdateModelOutput = {
      ...validModelOutput,
      content: {
        ...validModelOutput.content,
        questions_to_add: [
          {
            ...validModelOutput.content.questions_to_add[0]!,
            source_refs: [{ source: "fake-question-source.pdf" }],
          },
        ],
      },
    };

    const mockModelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        rawText: JSON.stringify(outputWithUngroundedQuestionSource),
        message: { role: "assistant", content: JSON.stringify(outputWithUngroundedQuestionSource) },
        toolCalls: [],
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const planner = new QuizPlanner({ modelClient: mockModelClient });
    await expect(
      planner.planQuizUpdate({
        input: sampleInput,
        planId: randomUUID(),
        revision: 2,
      })
    ).rejects.toThrowError(PlanningError);
  });
});
