import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { interpretTeacherInstruction } from "../src/instructions/teacher-instruction-interpreter.js";
import { ActivityPlanner, splitActivityChunks } from "../src/planners/activity-planner.js";
import { CoursePlanner } from "../src/planners/course-planner.js";
import { validateActivityConstraints } from "../src/validators/teacher-constraint-validator.js";
import { buildSectionGrounding, buildSectionProvenanceAllowlists } from "../src/grounding/section-grounding.js";
import { validatePlanningDomainInvariants } from "../src/domain/planning-domain-validator.js";
import { getPlanningProgress } from "../src/planning-progress.js";
import { buildCourseStructureUserPrompt, COURSE_STRUCTURE_SYSTEM_PROMPT } from "../src/prompts/course-planning-prompt.js";
import { buildCourseStructureSchema } from "../src/planners/course-structure-planner.js";

const syllabus: NormalizedSyllabus = {
  schema_version: "0.1",
  course_title: "C# Basics",
  course_code: "CS231",
  course_description: "Object-oriented programming.",
  learning_objectives: ["Understand classes"],
  schedule_or_topics: [1, 2, 3].map((week) => ({ week_or_unit: `Week ${week}`, title: `Topic ${week}`, topics: [`C# topic ${week}`], source: { kind: "line" as const, start_line: week, end_line: week } })),
  raw_text: "Week 1 Topic 1 Week 2 Topic 2 Week 3 Topic 3",
  metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 100, sha256: "a".repeat(64) },
};

describe("chunked course planning", () => {
  it("compiles weekly MCQ instruction into deterministic constraints", () => {
    const result = interpretTeacherInstruction("ในแต่ละสัปดาห์ให้สร้าง Quiz แบบ Multiple Choice จำนวน 5 ข้อ แต่ละข้อมี 4 ตัวเลือก และมีคำตอบที่ถูกต้องเพียง 1 ตัวเลือก");
    expect(result.activityRules).toEqual([expect.objectContaining({ scope: "each_section", activityType: "quiz", activityCount: 1, questionType: "multichoice", questionsPerActivity: 5, choicesPerQuestion: 4, correctChoicesPerQuestion: 1 })]);
  });

  it("compiles specific, interval, and ambiguous scopes without defaulting globally", () => {
    expect(interpretTeacherInstruction("สัปดาห์ที่ 5 มี Quiz").activityRules).toEqual([
      expect.objectContaining({ scope: "specific_sections", sectionPositions: [5], anchors: ["สัปดาห์ที่ 5"] }),
    ]);
    expect(interpretTeacherInstruction("ทุก 2 สัปดาห์สร้าง Quiz").activityRules).toEqual([
      expect.objectContaining({ scope: "every_n_sections", interval: 2 }),
    ]);
    const ambiguous = interpretTeacherInstruction("สร้าง Quiz");
    expect(ambiguous.activityRules).toEqual([]);
    expect(ambiguous.warnings.join(" ")).toContain("did not specify a supported scope");
  });

  it("preserves activity counts greater than one", () => {
    expect(interpretTeacherInstruction("ทุกสัปดาห์สร้าง Quiz 2 ชุด").activityRules).toEqual([
      expect.objectContaining({ scope: "each_section", activityType: "quiz", activityCount: 2 }),
    ]);
  });

  it("compiles mixed Thai/English Quiz-every-week and Assignment-Week-2/4 instructions", () => {
    const result = interpretTeacherInstruction("ขอให้ในทุก week มี quiz และใน week ที่ 2 และ 4 เป็น assignment 1 เรื่อง");
    expect(result.warnings).toEqual([]);
    expect(result.activityRules).toEqual([
      expect.objectContaining({ scope: "each_section", activityType: "quiz", activityCount: 1 }),
      expect.objectContaining({ scope: "specific_sections", sectionPositions: [2, 4], activityType: "assignment", activityCount: 1 }),
    ]);
  });

  it("keeps Stage 1 prompt independent from full activity-body requirements", () => {
    const system = COURSE_STRUCTURE_SYSTEM_PROMPT.toLowerCase();
    const user = buildCourseStructureUserPrompt(syllabus).toLowerCase();
    expect(system).not.toContain('"activities"');
    expect(system).not.toContain("quiz questions");
    expect(system).not.toContain("assignment descriptions");
    expect(user).not.toContain('"activities"');
    expect(user).not.toContain("quiz questions");
    expect(user).not.toContain("assignment descriptions");
    expect((buildCourseStructureSchema(syllabus) as any).properties.content.properties.sections.items.properties.activity_intents.items.properties.origin).toMatchObject({ const: "syllabus" });
  });

  it("sends original section-specific syllabus grounding to the activity model", async () => {
    const assessmentSyllabus = { ...syllabus, assessment_text: "The course has a final project." };
    const chat = vi.fn().mockResolvedValue({
      rawText: JSON.stringify({ sections: [{ section_ref: "section-01", activities: [] }] }),
      message: { role: "assistant", content: "" },
      toolCalls: [],
    });
    const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
    await new ActivityPlanner(client).generateChunk(assessmentSyllabus, [{
      ref: "section-01",
      position: 1,
      title: "Week 1",
      summary: "Generated summary",
      source_refs: [],
      activityIntents: [],
    }], { activityRules: [], warnings: [] });

    const prompt = chat.mock.calls[0]?.[0]?.messages[1]?.content as string;
    expect(prompt).toContain("C# topic 1");
    expect(prompt).not.toContain("C# topic 2");
    expect(prompt).toContain("Original syllabus grounding");
    expect(prompt).toContain("Course-global assessment context");
    expect(prompt).not.toContain("Relevant assessment context");
  });

  it("rejects activity provenance from another section", () => {
    const scopedSyllabus: NormalizedSyllabus = {
      ...syllabus,
      schedule_or_topics: [
        { week_or_unit: "Week 5", title: "Encapsulation", topics: ["Properties"], source: { kind: "line", start_line: 50, end_line: 55 } },
        { week_or_unit: "Week 12", title: "Deployment", topics: ["Containers"], source: { kind: "line", start_line: 120, end_line: 125 } },
      ],
    };
    const section = {
      ref: "section-05",
      position: 5,
      title: "Week 5: Encapsulation",
      source_refs: [],
      activities: [{
        ref: "quiz-05-01",
        type: "quiz" as const,
        title: "Quiz",
        description: "Quiz",
        source_refs: [{ source: "syllabus.md", section: "lines 120-125" }],
        questions: [{
          ref: "question-05-01-01",
          type: "truefalse" as const,
          question: "Q",
          correct_answer: true,
          feedback: "F",
          default_mark: 1,
          source_refs: [{ source: "syllabus.md", section: "lines 120-125" }],
        }],
      }],
    };
    const allowlists = buildSectionProvenanceAllowlists(scopedSyllabus, [section]);
    const envelope = {
      schema_version: "0.1" as const,
      plan_id: "plan-1",
      revision: 1,
      plan_type: "course" as const,
      operation: "create" as const,
      title: "Plan",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: { course: { title: "Course" }, sections: [section] },
    };
    expect(() => validatePlanningDomainInvariants(envelope, new Set(["syllabus.md"]), allowlists)).toThrow(/not among the grounded source locations|not authorized for section/);
  });

  it("resolves a specific Week 5 rule by anchor even when the predicted section ref is custom", async () => {
    const weekFiveSyllabus: NormalizedSyllabus = {
      ...syllabus,
      schedule_or_topics: [{ week_or_unit: "Week 5", title: "Encapsulation", topics: ["Properties"], source: { kind: "line", start_line: 50, end_line: 55 } }],
    };
    for (const sectionRef of ["section-5", "section-custom-week-5"]) {
      const structure = { title: "Plan", summary: "Summary", warnings: [], assumptions: [], content: { course: { title: "Course" }, sections: [{ ref: sectionRef, position: 1, title: "Week 5: Encapsulation", summary: "Properties", source_refs: [], activity_intents: [] }] } };
      const activity = { sections: [{ section_ref: sectionRef, activities: [{ ref: "quiz-05-01", type: "quiz" as const, title: "Quiz", description: "Quiz", source_refs: [{ source: "syllabus.md", section: "lines 50-55" }], questions: [{ ref: "question-05-01-01", type: "truefalse" as const, question: "Q", correct_answer: true, feedback: "F", default_mark: 1, source_refs: [{ source: "syllabus.md", section: "lines 50-55" }] }] }] }] };
      const chat = vi.fn()
        .mockResolvedValueOnce({ rawText: JSON.stringify(structure), message: { role: "assistant", content: "" }, toolCalls: [] })
        .mockResolvedValueOnce({ rawText: JSON.stringify(activity), message: { role: "assistant", content: "" }, toolCalls: [] });
      const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
      const result = await new CoursePlanner({ modelClient: client }).generateCoursePlan({ syllabus: weekFiveSyllabus, teacherInstruction: "สัปดาห์ที่ 5 มี Quiz" });
      expect(result.content.sections[0]!.activities).toHaveLength(1);
    }
  });

  it("does not inject unrelated course objectives into a section grounding slice", () => {
    const scoped = { ...syllabus, learning_objectives: ["Unrelated objective for deployment"], schedule_or_topics: [{ week_or_unit: "Week 1", title: "Encapsulation", topics: ["Properties"], source: { kind: "line" as const, start_line: 1, end_line: 5 } }] };
    const grounding = buildSectionGrounding(scoped, { ref: "section-01", position: 1, title: "Week 1: Encapsulation", source_refs: [] });
    expect(grounding.learningObjectives).toEqual([]);
  });

  it("rejects duplicate, missing, and unknown Stage 2 section refs before merge", async () => {
    const sections = [
      { ref: "section-01", position: 1, title: "Week 1", summary: "One", source_refs: [], activityIntents: [] },
      { ref: "section-02", position: 2, title: "Week 2", summary: "Two", source_refs: [], activityIntents: [] },
    ];
    for (const returned of [
      [{ section_ref: "section-01", activities: [] }, { section_ref: "section-01", activities: [] }],
      [{ section_ref: "section-01", activities: [] }],
      [{ section_ref: "section-01", activities: [] }, { section_ref: "section-03", activities: [] }],
    ]) {
      const chat = vi.fn().mockResolvedValue({ rawText: JSON.stringify({ sections: returned }), message: { role: "assistant", content: "" }, toolCalls: [] });
      const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
      await expect(new ActivityPlanner(client, undefined, 0).generateChunk(syllabus, sections, { activityRules: [], warnings: [] })).rejects.toMatchObject({ code: "TEACHER_CONSTRAINT_VIOLATION" });
    }
  });

  it("creates two deterministic teacher-generated quizzes per section", async () => {
    const oneWeekSyllabus = { ...syllabus, schedule_or_topics: [syllabus.schedule_or_topics[0]!] };
    const structure = {
      title: "Plan", summary: "Summary", warnings: [], assumptions: [], content: {
        course: { title: "C# Basics" },
        sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Basics", source_refs: [], activity_intents: [
          { type: "quiz", title: "Quiz: Week 1", source_refs: [], origin: "teacher_instruction" },
          { type: "quiz", title: "Quiz: Week 1", source_refs: [], origin: "teacher_instruction" },
        ] }],
      },
    };
    const quiz = (name: string) => ({
      ref: name,
      type: "quiz" as const,
      title: name,
      description: "Quiz",
      source_refs: [{ source: "syllabus.md", section: "lines 1" }],
      questions: [{ ref: "question-old", type: "truefalse" as const, question: "Q", correct_answer: true, feedback: "F", default_mark: 1, source_refs: [{ source: "syllabus.md", section: "lines 1" }] }],
    });
    const chat = vi.fn()
      .mockResolvedValueOnce({ rawText: JSON.stringify(structure), message: { role: "assistant", content: "" }, toolCalls: [] })
      .mockResolvedValueOnce({ rawText: JSON.stringify({ sections: [{ section_ref: "section-01", activities: [quiz("a"), quiz("b")] }] }), message: { role: "assistant", content: "" }, toolCalls: [] });
    const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
    const envelope = await new CoursePlanner({ modelClient: client }).generateCoursePlan({ syllabus: oneWeekSyllabus, teacherInstruction: "ทุกสัปดาห์สร้าง Quiz 2 ชุด" });
    const activities = envelope.content.sections[0]!.activities;
    expect(activities).toHaveLength(2);
    expect(new Set(activities.map((activity) => activity.ref)).size).toBe(2);
    expect(new Set(activities.map((activity) => activity.title)).size).toBe(2);
  });

  it.each([
    { name: "syllabus quiz plus one teacher quiz", instruction: "Every week create Quiz", syllabusIntent: { type: "quiz", title: "Syllabus quiz", source_refs: [{ source: "syllabus.md", section: "lines 1-1" }], origin: "syllabus" }, activityCount: 2, teacherCount: 1 },
    { name: "syllabus assignment plus one teacher quiz", instruction: "Every week create Quiz", syllabusIntent: { type: "assignment", title: "Syllabus assignment", source_refs: [{ source: "syllabus.md", section: "lines 1-1" }], origin: "syllabus" }, activityCount: 2, teacherCount: 1 },
    { name: "syllabus quiz plus two teacher quizzes", instruction: "Every week create Quiz 2 sets", syllabusIntent: { type: "quiz", title: "Syllabus quiz", source_refs: [{ source: "syllabus.md", section: "lines 1-1" }], origin: "syllabus" }, activityCount: 3, teacherCount: 2 },
  ])("keeps $name separate from teacher cardinality", async ({ instruction, syllabusIntent, activityCount, teacherCount }) => {
    const oneWeekSyllabus = { ...syllabus, schedule_or_topics: [syllabus.schedule_or_topics[0]!] };
    const structure = { title: "Plan", summary: "Summary", warnings: [], assumptions: [], content: { course: { title: "Course" }, sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Basics", source_refs: [], activity_intents: [syllabusIntent] }] } };
    const assignment = { ref: "assignment-model", type: "assignment" as const, title: "Assignment", description: "Assignment", instructions: ["Complete it"], learning_objectives: ["Learn it"], grade: 10, source_refs: [{ source: "syllabus.md", section: "lines 1-1" }] };
    const quiz = (index: number) => ({ ref: `quiz-model-${index}`, type: "quiz" as const, title: "Quiz", description: "Quiz", source_refs: [{ source: "syllabus.md", section: "lines 1-1" }], questions: [{ ref: `question-model-${index}`, type: "truefalse" as const, question: "Q", correct_answer: true, feedback: "F", default_mark: 1, source_refs: [{ source: "syllabus.md", section: "lines 1-1" }] }] });
    const activities = [
      ...(syllabusIntent.type === "assignment" ? [assignment] : [quiz(0)]),
      ...Array.from({ length: teacherCount }, (_, index) => quiz(index + 1)),
    ];
    const chat = vi.fn()
      .mockResolvedValueOnce({ rawText: JSON.stringify(structure), message: { role: "assistant", content: "" }, toolCalls: [] })
      .mockResolvedValueOnce({ rawText: JSON.stringify({ sections: [{ section_ref: "section-01", activities }] }), message: { role: "assistant", content: "" }, toolCalls: [] });
    const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
    const envelope = await new CoursePlanner({ modelClient: client }).generateCoursePlan({ syllabus: oneWeekSyllabus, teacherInstruction: instruction });
    expect(envelope.content.sections[0]!.activities).toHaveLength(activityCount);
    expect(envelope.content.sections[0]!.activities.filter((activity) => activity.type === "quiz")).toHaveLength(teacherCount + (syllabusIntent.type === "quiz" ? 1 : 0));
  });

  it("drops model-produced teacher intents and Stage 2 activities outside the deterministic Week 5 scope", async () => {
    const scopedSyllabus: NormalizedSyllabus = {
      ...syllabus,
      schedule_or_topics: [1, 4, 5].map((week) => ({ week_or_unit: `Week ${week}`, title: `Topic ${week}`, topics: [`Topic ${week}`], source: { kind: "line" as const, start_line: week, end_line: week } })),
    };
    const structure = {
      title: "Plan", summary: "Summary", warnings: [], assumptions: [], content: {
        course: { title: "Course" },
        sections: [1, 4, 5].map((position) => ({ ref: `section-${String(position).padStart(2, "0")}`, position, title: `Week ${position}`, summary: `Week ${position}`, source_refs: [], activity_intents: [{ type: "quiz", title: `Model quiz ${position}`, source_refs: [], origin: "teacher_instruction" }] })),
      },
    };
    const quiz = (position: number) => ({ ref: `model-quiz-${position}`, type: "quiz" as const, title: "Model supplied", description: "Model supplied", source_refs: [{ source: "syllabus.md", section: `lines ${position}-${position}` }], questions: [{ ref: `model-question-${position}`, type: "truefalse" as const, question: "Q", correct_answer: true, feedback: "F", default_mark: 1, source_refs: [{ source: "syllabus.md", section: `lines ${position}-${position}` }] }] });
    const chat = vi.fn()
      .mockResolvedValueOnce({ rawText: JSON.stringify(structure), message: { role: "assistant", content: "" }, toolCalls: [] })
      .mockResolvedValueOnce({ rawText: JSON.stringify({ sections: [1, 4].map((position) => ({ section_ref: `section-${String(position).padStart(2, "0")}`, activities: [quiz(position)] })) }), message: { role: "assistant", content: "" }, toolCalls: [] })
      .mockResolvedValueOnce({ rawText: JSON.stringify({ sections: [{ section_ref: "section-05", activities: [quiz(5)] }] }), message: { role: "assistant", content: "" }, toolCalls: [] });
    const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
    const envelope = await new CoursePlanner({ modelClient: client }).generateCoursePlan({ syllabus: scopedSyllabus, teacherInstruction: "Week 5 should have a Quiz" });
    expect(envelope.content.sections.map((section) => [section.position, section.activities.length])).toEqual([[1, 0], [4, 0], [5, 1]]);
  });

  it("uses numeric section position only when semantic Week resolution fails", async () => {
    const insertedIntroSyllabus: NormalizedSyllabus = {
      ...syllabus,
      schedule_or_topics: [4, 5].map((week) => ({ week_or_unit: `Week ${week}`, title: `Topic ${week}`, topics: [`Topic ${week}`], source: { kind: "line" as const, start_line: week, end_line: week } })),
    };
    const structure = { title: "Plan", summary: "Summary", warnings: [], assumptions: [], content: { course: { title: "Course" }, sections: [
      { ref: "section-intro", position: 5, title: "Week 4", summary: "Week 4", source_refs: [], activity_intents: [] },
      { ref: "section-week-5", position: 6, title: "Week 5", summary: "Week 5", source_refs: [], activity_intents: [] },
    ] } };
    const activity = (ref: string, position: number) => ({ section_ref: ref, activities: [{ ref: `quiz-${position}`, type: "quiz" as const, title: "Quiz", description: "Quiz", source_refs: [{ source: "syllabus.md", section: `lines ${position}-${position}` }], questions: [{ ref: `question-${position}`, type: "truefalse" as const, question: "Q", correct_answer: true, feedback: "F", default_mark: 1, source_refs: [{ source: "syllabus.md", section: `lines ${position}-${position}` }] }] }] });
    const chat = vi.fn()
      .mockResolvedValueOnce({ rawText: JSON.stringify(structure), message: { role: "assistant", content: "" }, toolCalls: [] })
      .mockResolvedValueOnce({ rawText: JSON.stringify({ sections: [activity("section-intro", 4), activity("section-week-5", 5)] }), message: { role: "assistant", content: "" }, toolCalls: [] });
    const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
    const envelope = await new CoursePlanner({ modelClient: client }).generateCoursePlan({ syllabus: insertedIntroSyllabus, teacherInstruction: "Week 5 should have a Quiz" });
    expect(envelope.content.sections.map((section) => [section.position, section.activities.length])).toEqual([[5, 0], [6, 1]]);
  });

  it("repairs the complete requested chunk rather than claiming section-only repair", async () => {
    const sections = [1, 2].map((position) => ({ ref: `section-0${position}`, position, title: `Week ${position}`, summary: "Summary", source_refs: [], activityIntents: [] }));
    const chat = vi.fn()
      .mockResolvedValueOnce({ rawText: JSON.stringify({ sections: [{ section_ref: "section-01", activities: [] }] }), message: { role: "assistant", content: "" }, toolCalls: [] })
      .mockResolvedValueOnce({ rawText: JSON.stringify({ sections: sections.map((section) => ({ section_ref: section.ref, activities: [] })) }), message: { role: "assistant", content: "" }, toolCalls: [] });
    const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
    await new ActivityPlanner(client, undefined, 1).generateChunk(syllabus, sections, { activityRules: [], warnings: [] });
    const repair = chat.mock.calls[1]?.[0]?.messages[1]?.content as string;
    expect(repair).toContain("complete requested chunk");
    expect(repair).toContain("section-01");
    expect(repair).toContain("section-02");
    expect(repair).not.toContain("only for the affected sections");
  });

  it("reports actual chunk counts at ready_for_preview", async () => {
    const longSyllabus: NormalizedSyllabus = {
      ...syllabus,
      schedule_or_topics: Array.from({ length: 15 }, (_, index) => ({ week_or_unit: `Week ${index + 1}`, title: `Topic ${index + 1}`, topics: [`Topic detail ${index + 1}`], source: { kind: "line" as const, start_line: index + 1, end_line: index + 1 } })),
    };
    const structure = {
      title: "Long plan", summary: "Fifteen weeks", warnings: [], assumptions: [], content: {
        course: { title: "Long course" },
        sections: longSyllabus.schedule_or_topics.map((item, index) => ({ ref: `section-${String(index + 1).padStart(2, "0")}`, position: index + 1, title: item.week_or_unit!, summary: item.title, source_refs: [], activity_intents: [] })),
      },
    };
    const emptyChunk = (items: readonly { ref: string }[]) => ({ sections: items.map((item) => ({ section_ref: item.ref, activities: [] })) });
    const chat = vi.fn().mockResolvedValueOnce({ rawText: JSON.stringify(structure), message: { role: "assistant", content: "" }, toolCalls: [] });
    for (let i = 0; i < 8; i++) {
      const refs = structure.content.sections.slice(i * 2, i * 2 + 2).map((section) => ({ section_ref: section.ref, activities: [] }));
      chat.mockResolvedValueOnce({ rawText: JSON.stringify({ sections: refs }), message: { role: "assistant", content: "" }, toolCalls: [] });
    }
    const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
    await new CoursePlanner({ modelClient: client }).generateCoursePlan({ syllabus: longSyllabus, runId: "run-15" });
    expect(getPlanningProgress("run-15")).toEqual(expect.objectContaining({ stage: "ready_for_preview", completedChunks: 8, totalChunks: 8, completedSections: 15, totalSections: 15 }));
  });

  it("never bypasses Stage 2 when Stage 1 returns legacy activity bodies", async () => {
    const legacyStructure = {
      title: "Legacy-shaped response", summary: "Summary", warnings: [], assumptions: [], content: {
        course: { title: "C# Basics" },
        sections: [1, 2, 3].map((week) => ({ ref: `section-0${week}`, position: week, title: `Week ${week}`, summary: `Topics ${week}`, source_refs: [], activity_intents: [], activities: [{ ref: `quiz-${week}`, type: "quiz", title: "Should be ignored", description: "ignored", source_refs: [], questions: [] }] })),
      },
    };
    const chat = vi.fn().mockResolvedValueOnce({ rawText: JSON.stringify(legacyStructure), message: { role: "assistant", content: "" }, toolCalls: [] });
    chat.mockResolvedValueOnce({ rawText: JSON.stringify({ sections: [{ section_ref: "section-01", activities: [] }, { section_ref: "section-02", activities: [] }] }), message: { role: "assistant", content: "" }, toolCalls: [] });
    chat.mockResolvedValueOnce({ rawText: JSON.stringify({ sections: [{ section_ref: "section-03", activities: [] }] }), message: { role: "assistant", content: "" }, toolCalls: [] });
    const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
    const envelope = await new CoursePlanner({ modelClient: client }).generateCoursePlan({ syllabus });
    expect(chat).toHaveBeenCalledTimes(3);
    expect(envelope.content.sections.every((section) => section.activities.length === 0)).toBe(true);
  });

  it("splits 15 sections into eight bounded chunks by default", () => {
    expect(splitActivityChunks(Array.from({ length: 15 }, (_, i) => i))).toHaveLength(8);
    expect(splitActivityChunks([1])).toEqual([[1]]);
    expect(splitActivityChunks([1, 2, 3, 4])).toEqual([[1, 2], [3, 4]]);
  });

  it("validates quiz question, choice, type, and correct-answer counts", () => {
    const violations = validateActivityConstraints({ ref: "section-01", position: 1, title: "Week 1", summary: "Basics", source_refs: [], activities: [{ ref: "quiz-01", type: "quiz", title: "Quiz", description: "Quiz", source_refs: [], questions: [{ ref: "question-01", type: "multichoice", question: "Q", choices: [{ ref: "choice-01", text: "A" }, { ref: "choice-02", text: "B" }], correct_choice_refs: ["choice-01"], feedback: "Feedback", default_mark: 1, source_refs: [] }] }] }, { activityRules: [{ scope: "each_section", activityType: "quiz", activityCount: 1, questionType: "multichoice", questionsPerActivity: 5, choicesPerQuestion: 4, correctChoicesPerQuestion: 1 }], warnings: [] });
    expect(violations.map((v) => v.constraint)).toEqual(["questions_per_activity", "choices_per_question"]);
  });

  it("makes structure and activity calls separately and assembles a valid plan", async () => {
    const structure = { title: "C# Plan", summary: "Three week plan", warnings: [], assumptions: [], content: { course: { title: "C# Basics", course_code: "CS231", summary: "Object-oriented programming." }, sections: [1, 2, 3].map((week) => ({ ref: `section-0${week}`, position: week, title: `Week ${week}`, summary: `Topics for week ${week}`, source_refs: [{ source: "syllabus.md", section: `lines ${week}-${week}` }], activity_intents: [{ type: "quiz", title: `Quiz ${week}`, source_refs: [{ source: "syllabus.md", section: `lines ${week}-${week}` }], origin: "syllabus" }], })) } };
    const activity = { sections: [1, 2].map((week) => ({ section_ref: `section-0${week}`, activities: [{ ref: `quiz-0${week}`, type: "quiz", title: `Quiz ${week}`, description: "A quiz", source_refs: [{ source: "syllabus.md", section: `lines ${week}` }], questions: [{ ref: `question-0${week}`, type: "truefalse", question: "Is this true?", correct_answer: true, feedback: "Correct", default_mark: 1, source_refs: [{ source: "syllabus.md", section: `lines ${week}` }] }] }] })) };
    const activity2 = { sections: [{ section_ref: "section-03", activities: [{ ref: "quiz-03", type: "quiz", title: "Quiz 3", description: "A quiz", source_refs: [{ source: "syllabus.md", section: "lines 3" }], questions: [{ ref: "question-03", type: "truefalse", question: "Is this true?", correct_answer: true, feedback: "Correct", default_mark: 1, source_refs: [{ source: "syllabus.md", section: "lines 3" }] }] }] }] };
    const chat = vi.fn().mockResolvedValueOnce({ rawText: JSON.stringify(structure), message: { role: "assistant", content: "" }, toolCalls: [] }).mockResolvedValueOnce({ rawText: JSON.stringify(activity), message: { role: "assistant", content: "" }, toolCalls: [] }).mockResolvedValueOnce({ rawText: JSON.stringify(activity2), message: { role: "assistant", content: "" }, toolCalls: [] });
    const client: ModelClient = { chat, listModels: vi.fn(), ping: vi.fn() };
    const envelope = await new CoursePlanner({ modelClient: client }).generateCoursePlan({ syllabus });
    expect(chat).toHaveBeenCalledTimes(3);
    expect(envelope.content.sections).toHaveLength(3);
    expect(envelope.content.sections.every((section) => section.activities.length === 1)).toBe(true);
  });
});
