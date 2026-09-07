import { createHash } from "node:crypto";
import type {
  AssignmentPlan,
  EssayQuestionPlan,
  MultipleChoiceQuestionPlan,
  QuestionPlan,
  ShortAnswerQuestionPlan,
  TrueFalseQuestionPlan,
} from "@moodle-agent-poc/contracts";
import { CourseExecutionError } from "./types.js";

export function generateCourseShortname(
  planId: string,
  revision: number,
  courseCode?: string,
  title?: string
): string {
  let base = "";
  if (courseCode && courseCode.trim().length > 0) {
    base = courseCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  } else if (title && title.trim().length > 0) {
    base = title
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 24);
  } else {
    base = "COURSE";
  }

  base = base.replace(/_+$/, "");
  if (!base) base = "COURSE";

  const hashSuffix = createHash("sha256")
    .update(`${planId}:${revision}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();

  return `${base}-${hashSuffix}`.slice(0, 100);
}

export function formatAssignmentIntro(plan: AssignmentPlan): string {
  const parts: string[] = [plan.description.trim()];

  if (plan.instructions.length > 0) {
    parts.push(
      "Instructions:\n" +
        plan.instructions.map((inst, idx) => `${idx + 1}. ${inst.trim()}`).join("\n")
    );
  }

  if (plan.learning_objectives.length > 0) {
    parts.push(
      "Learning Objectives:\n" +
        plan.learning_objectives.map((obj) => `- ${obj.trim()}`).join("\n")
    );
  }

  return parts.join("\n\n");
}

export function formatQuestionName(ordinal: number, questionText: string): string {
  const clean = questionText.replace(/\s+/g, " ").trim();
  const truncated = clean.length > 50 ? `${clean.slice(0, 47)}...` : clean;
  return `Q${ordinal} - ${truncated}`;
}

export function serializeQuestionToMcpArgs(
  activityId: number,
  question: QuestionPlan,
  ordinal: number
): Record<string, unknown> {
  const name = formatQuestionName(ordinal, question.question);
  const common = {
    activity_id: activityId,
    name,
    question_text: question.question,
    default_mark: question.default_mark,
  };

  switch (question.type) {
    case "multichoice": {
      const mcq = question as MultipleChoiceQuestionPlan;
      const correctRef = mcq.correct_choice_refs?.[0];
      if (!correctRef) {
        throw new CourseExecutionError(
          "INVALID_QUESTION_PLAN",
          `Multichoice question '${mcq.ref}' has no correct_choice_refs defined.`
        );
      }

      const hasCorrectChoice = mcq.choices.some((c) => c.ref === correctRef);
      if (!hasCorrectChoice) {
        throw new CourseExecutionError(
          "INVALID_QUESTION_PLAN",
          `Multichoice question '${mcq.ref}' correct_choice_ref '${correctRef}' does not match any choice in question.choices.`
        );
      }

      return {
        ...common,
        qtype: "multichoice",
        ...(mcq.feedback ? { general_feedback: mcq.feedback } : {}),
        options: {
          single: true,
          shuffle_answers: true,
          choices: mcq.choices.map((c) => ({
            text: c.text,
            fraction: c.ref === correctRef ? 1 : 0,
          })),
        },
      };
    }

    case "truefalse": {
      const tf = question as TrueFalseQuestionPlan;
      return {
        ...common,
        qtype: "truefalse",
        ...(tf.feedback ? { general_feedback: tf.feedback } : {}),
        options: { correct_answer: tf.correct_answer },
      };
    }

    case "shortanswer": {
      const sa = question as ShortAnswerQuestionPlan;
      return {
        ...common,
        qtype: "shortanswer",
        options: {
          accepted_answers: sa.accepted_answers,
          case_sensitive: sa.case_sensitive,
        },
      };
    }

    case "essay": {
      const eq = question as EssayQuestionPlan;
      const gradingGuidance = eq.grading_guidance
        .map((g, idx) => `${idx + 1}. ${g.trim()}`)
        .join("\n");

      return {
        ...common,
        qtype: "essay",
        options: {
          response_format: "editor",
          grading_guidance: gradingGuidance,
        },
      };
    }

    default: {
      const unk = question as { type?: string; ref?: string };
      throw new CourseExecutionError(
        "UNSUPPORTED_QUESTION_TYPE",
        `Unsupported question type '${unk.type}' for question ref '${unk.ref}'.`
      );
    }
  }
}

export function formatCourseUrl(moodleBaseUrl: string, courseId: number): string {
  const normalized = moodleBaseUrl.replace(/\/+$/, "");
  return `${normalized}/course/view.php?id=${courseId}`;
}
