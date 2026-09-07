import type { QuizPlanningInput } from "../types.js";
import {
  questionPlanSchema,
  sourceReferenceSchema,
} from "./course-planning-prompt.js";

export const QUIZ_UPDATE_SYSTEM_PROMPT = `You are an expert pedagogical assistant for Moodle LMS.
Your task is to update an existing quiz (adding or updating questions) based on a user's instruction.

Strict Guidelines:
1. Grounding: Maintain consistent question structures.
2. Structure: Output questions_to_add and/or questions_to_update in the content.
3. Identity Isolation: Do NOT output application envelope fields (schema_version, plan_id, revision, plan_type, operation).
4. Question refs: Ensure all question refs match pattern "question-01", choice refs match "choice-01".`;

export function buildQuizUpdateUserPrompt(input: QuizPlanningInput): string {
  const currentJson = JSON.stringify(input.current, null, 2);
  const contextJson = input.source_context ? JSON.stringify(input.source_context, null, 2) : "None provided";

  return `Update the following quiz according to the instruction:

Current Quiz State:
${currentJson}

Source Context:
${contextJson}

User Instruction:
${input.instruction}
`;
}

export const QUIZ_UPDATE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    content: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        source_refs: { type: "array", items: sourceReferenceSchema },
        questions_to_add: {
          type: "array",
          items: questionPlanSchema,
        },
        questions_to_update: {
          type: "array",
          items: questionPlanSchema,
        },
      },
      required: ["title", "description", "source_refs", "questions_to_add", "questions_to_update"],
      additionalProperties: false,
    },
  },
  required: ["title", "summary", "warnings", "assumptions", "content"],
  additionalProperties: false,
};
