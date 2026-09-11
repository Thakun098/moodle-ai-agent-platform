import { describe, expect, it } from "vitest";
import { compareQuestionReadback, type ObservedQuestion } from "../src/verification/question-comparison.js";
import type { QuestionPlan } from "../src/planning/contracts.js";

const base = { ref: "q", question: "Question", default_mark: 2, source_refs: [] };
const observed = (overrides: Partial<ObservedQuestion>): ObservedQuestion => ({
  qtype: "multichoice", question_text: "Question", default_mark: 2, max_mark: 2, general_feedback: "feedback", answers: [], ...overrides,
});

describe("canonical question grading comparison", () => {
  const mcq: QuestionPlan = { ...base, type: "multichoice", choices: [{ ref: "a", text: "A" }, { ref: "b", text: "B" }], correct_choice_refs: ["a"], feedback: "feedback" };
  it("compares a multiset of choices and fractions, independent of order", () => {
    const valid = observed({ answers: [{ text: "B", fraction: 0 }, { text: "A", fraction: 1 }] });
    expect(compareQuestionReadback(valid, mcq)).toEqual([]);
    expect(compareQuestionReadback({ ...valid, answers: [{ text: "B", fraction: 1 }, { text: "A", fraction: 0 }] }, mcq)).toContain("answers");
    expect(compareQuestionReadback({ ...valid, answers: [...valid.answers, { text: "Extra", fraction: 1 }] }, mcq)).toContain("answers");
  });
  it("rejects missing/different slot mark and feedback", () => {
    const valid = observed({ answers: [{ text: "A", fraction: 1 }, { text: "B", fraction: 0 }] });
    expect(compareQuestionReadback({ ...valid, max_mark: 1 }, mcq)).toContain("max_mark");
    expect(compareQuestionReadback({ ...valid, general_feedback: "wrong" }, mcq)).toContain("feedback");
  });
  it("checks short-answer extras and explicit case sensitivity", () => {
    const plan: QuestionPlan = { ...base, type: "shortanswer", accepted_answers: ["Hello"], case_sensitive: false };
    const valid = observed({ qtype: "shortanswer", answers: [{ text: "Hello", fraction: 1 }], case_sensitive: false });
    expect(compareQuestionReadback(valid, plan)).toEqual([]);
    expect(compareQuestionReadback({ ...valid, case_sensitive: true }, plan)).toContain("case_sensitive");
    const { case_sensitive, ...missing } = valid;
    expect(compareQuestionReadback(missing, plan)).toContain("case_sensitive");
    expect(compareQuestionReadback({ ...valid, answers: [...valid.answers, { text: "*", fraction: 1 }] }, plan)).toContain("answers");
  });
  it("requires essay grading guidance from readback", () => {
    const plan: QuestionPlan = { ...base, type: "essay", grading_guidance: ["Clarity", "Accuracy"] };
    expect(compareQuestionReadback(observed({ qtype: "essay", grading_guidance: "1. Clarity\n2. Accuracy" }), plan)).toEqual([]);
    expect(compareQuestionReadback(observed({ qtype: "essay" }), plan)).toContain("grading_guidance");
  });
  it("supports localized true/false answers using the canonical boolean", () => {
    const plan: QuestionPlan = { ...base, type: "truefalse", correct_answer: false, feedback: "feedback" };
    const valid = observed({ qtype: "truefalse", correct_answer: false, answers: [{ text: "จริง", fraction: 0 }, { text: "เท็จ", fraction: 1 }] });
    expect(compareQuestionReadback(valid, plan)).toEqual([]);
    expect(compareQuestionReadback({ ...valid, correct_answer: true }, plan)).toContain("correct_answer");
  });
});
