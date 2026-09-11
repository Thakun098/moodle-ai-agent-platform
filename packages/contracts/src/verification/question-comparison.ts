import type { QuestionPlan } from "../planning/contracts.js";

/** Canonical Moodle readback fields shared by course and standalone quiz verification. */
export interface ObservedQuestion {
  qtype: string;
  question_text: string;
  default_mark: number;
  max_mark: number;
  general_feedback?: string;
  correct_answer?: boolean;
  case_sensitive?: boolean;
  grading_guidance?: string;
  answers: Array<{ text: string; fraction: number }>;
}

function sameNumber(actual: unknown, expected: number): boolean {
  return typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7;
}

/** Returns every mismatching contract field; missing readback is never evidence of a match. */
export function compareQuestionReadback(actual: ObservedQuestion, expected: QuestionPlan): string[] {
  const errors: string[] = [];
  if (actual.qtype !== expected.type) errors.push("type");
  if (actual.question_text !== expected.question) errors.push("question_text");
  if (!sameNumber(actual.default_mark, expected.default_mark)) errors.push("default_mark");
  if (!sameNumber(actual.max_mark, expected.default_mark)) errors.push("max_mark");
  if ("feedback" in expected && (actual.general_feedback ?? "") !== expected.feedback) errors.push("feedback");
  const answers = Array.isArray(actual.answers) ? actual.answers : [];

  if (expected.type === "multichoice" || expected.type === "shortanswer") {
    const wanted = expected.type === "multichoice"
      ? expected.choices.map(choice => ({ text: choice.text, fraction: expected.correct_choice_refs.includes(choice.ref) ? 1 : 0 }))
      : expected.accepted_answers.map(text => ({ text, fraction: 1 }));
    // Multiset equality also rejects extra accepted answers and duplicate choices.
    const remaining = [...answers];
    let matches = wanted.length === remaining.length;
    for (const answer of wanted) {
      const index = remaining.findIndex(candidate => candidate.text === answer.text && sameNumber(candidate.fraction, answer.fraction));
      if (index < 0) matches = false;
      else remaining.splice(index, 1);
    }
    if (!matches) errors.push("answers");
    if (expected.type === "shortanswer" && actual.case_sensitive !== expected.case_sensitive) errors.push("case_sensitive");
  } else if (expected.type === "truefalse") {
    // The boolean readback uses Moodle's trueanswer ID and is independent of site language.
    if (typeof actual.correct_answer === "boolean") {
      if (actual.correct_answer !== expected.correct_answer || answers.length !== 2 ||
          answers.filter(a => sameNumber(a.fraction, 1)).length !== 1 ||
          answers.filter(a => sameNumber(a.fraction, 0)).length !== 1) errors.push("correct_answer");
    } else {
      const trueAnswer = answers.find(a => a.text.toLowerCase() === "true");
      const falseAnswer = answers.find(a => a.text.toLowerCase() === "false");
      if (answers.length !== 2 || !trueAnswer || !falseAnswer ||
          !sameNumber(trueAnswer.fraction, expected.correct_answer ? 1 : 0) ||
          !sameNumber(falseAnswer.fraction, expected.correct_answer ? 0 : 1)) errors.push("correct_answer");
    }
  } else {
    const guidance = expected.grading_guidance.map((line, index) => `${index + 1}. ${line.trim()}`).join("\n");
    if (actual.grading_guidance !== guidance) errors.push("grading_guidance");
  }
  return errors;
}
