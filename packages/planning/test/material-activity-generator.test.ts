import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import type { MaterialContext } from "@moodle-agent-poc/materials";
import { describe, expect, it, vi } from "vitest";
import { generateActivity, type ActivityGenerationResult } from "../src/generators/material-activity-generator.js";
import type { CoursePlanningConstraints } from "../src/instructions/planning-constraints.js";
import type { SectionStructureDraft } from "../src/types.js";

const section: SectionStructureDraft = {
  ref: "section-01",
  position: 1,
  title: "Week 1: Search",
  summary: "Search fundamentals",
  source_refs: [{ source: "syllabus.md", section: "Week 1" }],
  activityIntents: [{ type: "assignment", title: "Search lab", source_refs: [], origin: "teacher_instruction", ref: "assignment-01" }],
};

const context: MaterialContext = {
  snapshotId: "snapshot-1",
  sectionRef: "section-01",
  text: "Breadth-first search uses a queue.",
  sourceRefs: [{ source: "lecture.md", section: "section-01" }],
  estimatedTokens: 8,
};

const constraints: CoursePlanningConstraints = { activityRules: [], warnings: [] };

describe("material-grounded activity generation", () => {
  it("generates exactly one Assignment from one intent and rewrites provenance to material", async () => {
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "assignment", title: "Search lab", description: "Implement BFS using a queue.",
        instructions: ["Submit the implementation."], learning_objectives: ["Explain BFS"], grade: 100,
        source_refs: [{ source: "lecture.md", section: "section-01" }],
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };

    const result = await generateActivity({ modelClient, section, intent: section.activityIntents[0]!, materialContext: context, constraints });
    expect(result.status).toBe("generated");
    expect((result as Extract<ActivityGenerationResult, { status: "generated" }>).activity).toMatchObject({
      ref: "assignment-01", type: "assignment", title: "Search lab",
      source_refs: [{ source: "lecture.md", section: "section-01" }],
    });
  });

  it("normalizes semantically equivalent Assignment provider fields without inventing content", async () => {
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "assignment",
        title: "Provider title",
        task_description: "Implement BFS using the supplied queue material.",
        steps: "Submit the BFS implementation and explanation.",
        learning_outcomes: ["Explain how BFS uses a FIFO queue."],
        points: 25,
        source_refs: [{ source: "lecture.md", section: "section-01" }],
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };

    const result = await generateActivity({ modelClient, section, intent: section.activityIntents[0]!, materialContext: context, constraints });
    expect(result).toMatchObject({
      status: "generated",
      activity: {
        type: "assignment",
        title: "Search lab",
        description: "Implement BFS using the supplied queue material.",
        instructions: ["Submit the BFS implementation and explanation."],
        learning_objectives: ["Explain how BFS uses a FIFO queue."],
        grade: 25,
      },
    });
  });

  it.each([
    ["short_answer", "shortanswer", { accepted_answers: ["FIFO"], case_sensitive: false }],
    ["short-answer", "shortanswer", { accepted_answers: ["FIFO"], case_sensitive: false }],
    ["multiple_choice", "multichoice", { choices: ["FIFO", "LIFO"], answer: "FIFO" }],
    ["multiple-choice", "multichoice", { choices: ["FIFO", "LIFO"], answer: "FIFO" }],
    ["mcq", "multichoice", { choices: ["FIFO", "LIFO"], answer: "FIFO" }],
    ["true_false", "truefalse", { correct_answer: true }],
    ["true-false", "truefalse", { correct_answer: true }],
    ["essay", "essay", { grading_guidance: ["Explain queue ordering."] }],
  ] as const)("normalizes question type %s to %s", async (providerType, canonicalType, shape) => {
    const quizSection: SectionStructureDraft = {
      ...section,
      activityIntents: [{ ref: "quiz-01", type: "quiz", title: "BFS check", source_refs: [], origin: "teacher_instruction" }],
    };
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "quiz", title: "BFS check", description: "Check BFS", source_refs: [{ source: "lecture.md", section: "section-01" }],
        questions: [{ type: providerType, question: "Which queue discipline does BFS use?", default_mark: 1, source_refs: [{ source: "lecture.md", section: "section-01" }], ...shape }],
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };

    const result = await generateActivity({ modelClient, section: quizSection, intent: quizSection.activityIntents[0]!, materialContext: context, constraints });
    expect(result.status).toBe("generated");
    expect((result as Extract<ActivityGenerationResult, { status: "generated" }>).activity.type).toBe("quiz");
    expect(((result as Extract<ActivityGenerationResult, { status: "generated" }>).activity as import("@moodle-agent-poc/contracts").QuizPlan).questions[0]?.type).toBe(canonicalType);
  });

  it("normalizes exactly one provider choice flagged is_correct=true as the correct MCQ answer", async () => {
    const quizSection: SectionStructureDraft = {
      ...section,
      activityIntents: [{ ref: "quiz-01", type: "quiz", title: "BFS check", source_refs: [], origin: "teacher_instruction" }],
    };
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "quiz", title: "BFS check", description: "Check BFS", source_refs: [{ source: "lecture.md", section: "section-01" }],
        questions: [{
          type: "multiple_choice",
          question: "Which data structure does BFS use?",
          choices: [
            { id: "a", text: "Queue (FIFO)", is_correct: true },
            { id: "b", text: "Stack (LIFO)", is_correct: false },
          ],
          default_mark: 1,
          source_refs: [{ source: "lecture.md", section: "section-01" }],
        }],
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };

    const result = await generateActivity({ modelClient, section: quizSection, intent: quizSection.activityIntents[0]!, materialContext: context, constraints });
    const quiz = (result as Extract<ActivityGenerationResult, { status: "generated" }>).activity as import("@moodle-agent-poc/contracts").QuizPlan;
    expect(quiz.questions[0]?.type).toBe("multichoice");
    if (quiz.questions[0]?.type === "multichoice") {
      expect(quiz.questions[0].correct_choice_refs).toEqual(["choice-01-01-01-01"]);
    }
  });

  it.each([
    ["correct_answer_index", { correct_answer_index: 1 }],
    ["correct_choice object", { correct_choice: { id: "b" } }],
    ["isCorrect flag", { choices: [{ id: "a", text: "Queue", isCorrect: false }, { id: "b", text: "Stack", isCorrect: true }] }],
  ] as const)("normalizes provider MCQ correct-answer shape %s", async (_label, answerShape) => {
    const quizSection: SectionStructureDraft = {
      ...section,
      activityIntents: [{ ref: "quiz-01", type: "quiz", title: "BFS check", source_refs: [], origin: "teacher_instruction" }],
    };
    const baseChoices = [{ id: "a", text: "Queue" }, { id: "b", text: "Stack" }];
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "quiz", title: "BFS check", description: "Check BFS", source_refs: [{ source: "lecture.md", section: "section-01" }],
        questions: [{ type: "multiple_choice", question: "Which option?", choices: (answerShape as any).choices ?? baseChoices, default_mark: 1, source_refs: [{ source: "lecture.md", section: "section-01" }], ...answerShape }],
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    const result = await generateActivity({ modelClient, section: quizSection, intent: quizSection.activityIntents[0]!, materialContext: context, constraints });
    const quiz = (result as Extract<ActivityGenerationResult, { status: "generated" }>).activity as import("@moodle-agent-poc/contracts").QuizPlan;
    expect(quiz.questions[0]?.type).toBe("multichoice");
    if (quiz.questions[0]?.type === "multichoice") expect(quiz.questions[0].correct_choice_refs).toEqual(["choice-01-01-01-02"]);
  });

  it("normalizes Assignment object-list aliases and uses Teacher Activity Prompt as deterministic fallback for omitted contract prose", async () => {
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "assignment", title: "Provider title",
        task_prompt: "Write a small console program.",
        deliverables: [{ text: "Submit the C# source code." }],
        grade: 100,
        source_refs: [{ source: "lecture.md", section: "section-01" }],
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    const teacherPrompt = "ให้นักเรียนเขียนโค้ด print hello world ด้วยภาษา C sharp ให้ถูกต้อง";
    const result = await generateActivity({ modelClient, section, intent: section.activityIntents[0]!, materialContext: context, constraints, generationInstruction: teacherPrompt });
    expect(result).toMatchObject({
      status: "generated",
      activity: {
        type: "assignment",
        description: "Write a small console program.",
        instructions: ["Submit the C# source code."],
        learning_objectives: [teacherPrompt],
        grade: 100,
      },
    });
  });

  it("tells the provider that Activity Prompt may shape in-scope task content and requests exact Quiz/Assignment contract fields", async () => {
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({ type: "assignment", title: "Search lab", description: "Implement BFS.", instructions: ["Submit"], learning_objectives: ["Explain BFS"], grade: 100, source_refs: [{ source: "lecture.md", section: "section-01" }] }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    await generateActivity({ modelClient, section, intent: section.activityIntents[0]!, materialContext: context, constraints, generationInstruction: "Create a beginner console task." });
    const request = (modelClient.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(request?.messages[0]?.content).toContain("may shape the task, question focus, examples, or presentation");
    expect(request?.messages[0]?.content).toContain("correct_choice_refs");
    expect(request?.messages[0]?.content).toContain("learning_objectives");
    expect(request?.messages[1]?.content).toContain("Additional Activity Prompt");
  });

  it("accepts the C# Week 1 Quiz scenario with four choices and a provider correct_answer_index", async () => {
    const quizSection: SectionStructureDraft = {
      ref: "section-01",
      position: 1,
      title: "สัปดาห์ที่ 1: บทนำสู่ C# และ OOP",
      summary: "ภาพรวม .NET และ C#, โครงสร้างโปรแกรม, ตัวแปร, ชนิดข้อมูล, Operators และ Console I/O",
      source_refs: [{ source: "CS231_Week_01_Mock_Learning_Material.pdf", section: "section-01" }],
      activityIntents: [{ ref: "quiz-01", type: "quiz", title: "Quiz: สัปดาห์ที่ 1", source_refs: [], origin: "teacher_instruction" }],
    };
    const csharpContext: MaterialContext = {
      snapshotId: "snapshot-csharp-1",
      sectionRef: "section-01",
      text: "C# runs on .NET. A basic program uses Main. Console.ReadLine() reads input and Console.WriteLine() displays output. Common types include int, double, string, and bool.",
      sourceRefs: [{ source: "CS231_Week_01_Mock_Learning_Material.pdf", section: "section-01" }],
      estimatedTokens: 40,
    };
    const questions = Array.from({ length: 5 }, (_, index) => ({
      type: "multiple_choice",
      question: `C# Week 1 question ${index + 1}?`,
      choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
      correct_answer_index: index % 4,
      default_mark: 1,
      source_refs: [{ source: "CS231_Week_01_Mock_Learning_Material.pdf", section: "section-01" }],
    }));
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "quiz", title: "Provider Quiz", description: "C# Week 1 check",
        source_refs: [{ source: "CS231_Week_01_Mock_Learning_Material.pdf", section: "section-01" }],
        questions,
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    const quizConstraints: CoursePlanningConstraints = {
      activityRules: [{ scope: "specific_sections", sectionPositions: [1], activityType: "quiz", activityCount: 1, questionType: "multichoice", questionsPerActivity: 5, choicesPerQuestion: 4, correctChoicesPerQuestion: 1 }],
      warnings: [],
    };
    const result = await generateActivity({ modelClient, section: quizSection, intent: quizSection.activityIntents[0]!, materialContext: csharpContext, constraints: quizConstraints, generationInstruction: "ให้สร้าง quiz แบบ multiple choice แต่ละข้อมี 4 choice" });
    const quiz = (result as Extract<ActivityGenerationResult, { status: "generated" }>).activity as import("@moodle-agent-poc/contracts").QuizPlan;
    expect(quiz.questions).toHaveLength(5);
    expect(quiz.questions.every((question) => question.type === "multichoice" && question.choices.length === 4 && question.correct_choice_refs.length === 1)).toBe(true);
  });

  it("accepts the C# Week 1 Hello World Assignment scenario when provider omits learning_objectives", async () => {
    const assignmentSection: SectionStructureDraft = {
      ref: "section-01",
      position: 1,
      title: "สัปดาห์ที่ 1: บทนำสู่ C# และ OOP",
      summary: "โครงสร้างโปรแกรม C# และ Console I/O",
      source_refs: [{ source: "CS231_Week_01_Mock_Learning_Material.pdf", section: "section-01" }],
      activityIntents: [{ ref: "assignment-01", type: "assignment", title: "Assignment: สัปดาห์ที่ 1: บทนำสู่ C# และ OOP", source_refs: [], origin: "teacher_instruction" }],
    };
    const csharpContext: MaterialContext = {
      snapshotId: "snapshot-csharp-1",
      sectionRef: "section-01",
      text: "A basic C# program starts from Main. Console.WriteLine() displays output to the Console.",
      sourceRefs: [{ source: "CS231_Week_01_Mock_Learning_Material.pdf", section: "section-01" }],
      estimatedTokens: 24,
    };
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "assignment",
        title: "Provider Assignment",
        description: "Create a simple C# console program that prints Hello World.",
        deliverables: [{ text: "Submit the C# source code that uses Console.WriteLine()." }],
        grade: 100,
        source_refs: [{ source: "CS231_Week_01_Mock_Learning_Material.pdf", section: "section-01" }],
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    const teacherPrompt = "ให้นักเรียนเขียนโค้ด print hello world ด้วยภาษา C sharp ให้ถูกต้อง";
    const result = await generateActivity({ modelClient, section: assignmentSection, intent: assignmentSection.activityIntents[0]!, materialContext: csharpContext, constraints, generationInstruction: teacherPrompt });
    expect(result).toMatchObject({ status: "generated", activity: { type: "assignment", learning_objectives: [teacherPrompt], grade: 100 } });
  });

  it("enforces deterministic Assignment grade from Activity Intent options over provider output", async () => {
    const intent = { ...section.activityIntents[0]!, options: { grade: 100 } };
    const sectionWithOptions: SectionStructureDraft = { ...section, activityIntents: [intent] };
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "assignment", title: "Search lab", description: "Implement BFS.", instructions: ["Submit"], learning_objectives: ["Explain BFS"], grade: 10, source_refs: [{ source: "lecture.md", section: "section-01" }]
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    const result = await generateActivity({ modelClient, section: sectionWithOptions, intent, materialContext: context, constraints });
    expect(result).toMatchObject({ status: "generated", activity: { type: "assignment", grade: 100 } });
  });

  it("enforces deterministic Quiz default mark from Activity Intent options over provider output", async () => {
    const intent = { ref: "quiz-01", type: "quiz" as const, title: "BFS check", source_refs: [], origin: "teacher_instruction" as const, options: { default_mark: 1 } };
    const quizSection: SectionStructureDraft = { ...section, activityIntents: [intent] };
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({
        type: "quiz", title: "BFS check", description: "Check BFS", source_refs: [{ source: "lecture.md", section: "section-01" }],
        questions: [{ type: "multiple_choice", question: "Which?", choices: [{ id: "a", text: "Queue" }, { id: "b", text: "Stack" }], correct_answer: "a", default_mark: 5, source_refs: [{ source: "lecture.md", section: "section-01" }] }]
      }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    const result = await generateActivity({ modelClient, section: quizSection, intent, materialContext: context, constraints });
    const quiz = (result as Extract<ActivityGenerationResult, { status: "generated" }>).activity as import("@moodle-agent-poc/contracts").QuizPlan;
    expect(quiz.questions[0]?.default_mark).toBe(1);
  });

  it("returns a typed blocked result when the model says the material is insufficient", async () => {
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({ status: "blocked", reason: "INSUFFICIENT_MATERIAL", message: "The material does not define the requested topic." }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    const result = await generateActivity({ modelClient, section, intent: section.activityIntents[0]!, materialContext: context, constraints });
    expect(result).toEqual({ status: "blocked", reason: "INSUFFICIENT_MATERIAL", message: "The material does not define the requested topic." });
  });

  it("does not call the model when the context has no usable text", async () => {
    const modelClient: ModelClient = { ping: vi.fn(), listModels: vi.fn(), chat: vi.fn() };
    const result = await generateActivity({ modelClient, section, intent: section.activityIntents[0]!, materialContext: { ...context, text: "" }, constraints });
    expect(result.status).toBe("blocked");
    expect(modelClient.chat).not.toHaveBeenCalled();
  });

  it("passes a Section generation instruction into the model prompt without changing the ActivityIntent", async () => {
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({ type: "assignment", title: "Search lab", description: "Implement BFS.", instructions: ["Submit"], learning_objectives: ["Explain BFS"], grade: 100, source_refs: [{ source: "lecture.md", section: "section-01" }] }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    await generateActivity({
      modelClient, section, intent: section.activityIntents[0]!, materialContext: context, constraints,
      generationInstruction: "Use a step-by-step beginner-friendly format.",
    });
    const prompt = (modelClient.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.messages[1]?.content;
    expect(prompt).toContain("Additional Activity Prompt");
    expect(prompt).toContain("Use a step-by-step beginner-friendly format.");
    expect(prompt).toContain(JSON.stringify(section.activityIntents[0]));
  });

  it("does not apply Section-level activity cardinality while generating one activity", async () => {
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({ type: "assignment", title: "Search lab", description: "Implement BFS.", instructions: ["Submit"], learning_objectives: ["Explain BFS"], grade: 100, source_refs: [{ source: "lecture.md", section: "section-01" }] }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    const result = await generateActivity({
      modelClient, section, intent: section.activityIntents[0]!, materialContext: context,
      constraints: { activityRules: [{ scope: "each_section", activityType: "quiz", activityCount: 1 }], warnings: [] },
    });
    expect(result.status).toBe("generated");
  });

  it("rejects a correct material filename paired with the wrong section location", async () => {
    const modelClient: ModelClient = {
      ping: vi.fn(), listModels: vi.fn(),
      chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({ type: "assignment", title: "Search lab", description: "Implement BFS.", instructions: ["Submit"], learning_objectives: ["Explain BFS"], grade: 100, source_refs: [{ source: "lecture.md", section: "section-99" }] }), message: { role: "assistant", content: "" }, toolCalls: [] }),
    };
    await expect(generateActivity({ modelClient, section, intent: section.activityIntents[0]!, materialContext: context, constraints })).rejects.toMatchObject({ code: "TEACHER_CONSTRAINT_VIOLATION" });
  });

  it("gives two Quiz intents distinct question and choice identities", async () => {
    const quizSection = { ...section, activityIntents: [
      { ref: "quiz-01", type: "quiz" as const, title: "Quiz A", source_refs: [], origin: "teacher_instruction" as const },
      { ref: "quiz-02", type: "quiz" as const, title: "Quiz B", source_refs: [], origin: "teacher_instruction" as const },
    ] };
    const response = { type: "quiz", title: "Quiz", description: "Check", source_refs: [{ source: "lecture.md", section: "section-01" }], questions: [{ ref: "model-q", type: "multichoice", question: "What?", choices: [{ ref: "a", text: "A" }, { ref: "b", text: "B" }], correct_choice_refs: ["a"], feedback: "", default_mark: 1, source_refs: [{ source: "lecture.md", section: "section-01" }] }] };
    const modelClient: ModelClient = { ping: vi.fn(), listModels: vi.fn(), chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify(response), message: { role: "assistant", content: "" }, toolCalls: [] }) };
    const first = await generateActivity({ modelClient, section: quizSection, intent: quizSection.activityIntents[0]!, materialContext: context, constraints });
    const second = await generateActivity({ modelClient, section: quizSection, intent: quizSection.activityIntents[1]!, materialContext: context, constraints });
    const firstQuestion = (first as Extract<ActivityGenerationResult, { status: "generated" }>).activity as import("@moodle-agent-poc/contracts").QuizPlan;
    const secondQuestion = (second as Extract<ActivityGenerationResult, { status: "generated" }>).activity as import("@moodle-agent-poc/contracts").QuizPlan;
    expect(firstQuestion.questions[0]?.ref).toBe("question-01-01-01");
    expect(secondQuestion.questions[0]?.ref).toBe("question-01-02-01");
    expect(firstQuestion.questions[0]?.type === "multichoice" && firstQuestion.questions[0].choices[0]?.ref).toBe("choice-01-01-01-01");
    expect(secondQuestion.questions[0]?.type === "multichoice" && secondQuestion.questions[0].choices[0]?.ref).toBe("choice-01-02-01-01");
  });
});
