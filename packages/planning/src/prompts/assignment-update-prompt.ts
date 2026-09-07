import type { AssignmentPlanningInput } from "../types.js";

export const ASSIGNMENT_UPDATE_SYSTEM_PROMPT = `You are an expert pedagogical assistant for Moodle LMS.
Your task is to update an existing assignment based on a user's instruction and grounded source context.

Strict Guidelines:
1. Grounding: Preserve unchanged elements and apply modifications requested in the instruction.
2. Source References: Include source_refs if grounded source material is provided.
3. Identity Isolation: Do NOT output application envelope fields (schema_version, plan_id, revision, plan_type, operation).
4. Local Reference: Preserve or refine the assignment ref.`;

export function buildAssignmentUpdateUserPrompt(input: AssignmentPlanningInput): string {
  const currentJson = JSON.stringify(input.current, null, 2);
  const contextJson = input.source_context ? JSON.stringify(input.source_context, null, 2) : "None provided";

  return `Update the following assignment according to the instruction:

Current Assignment State:
${currentJson}

Source Context:
${contextJson}

User Instruction:
${input.instruction}
`;
}

export const ASSIGNMENT_UPDATE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    content: {
      type: "object",
      properties: {
        ref: { type: "string" },
        type: { type: "string", const: "assignment" },
        title: { type: "string" },
        description: { type: "string" },
        instructions: { type: "array", items: { type: "string" }, minItems: 1 },
        learning_objectives: { type: "array", items: { type: "string" }, minItems: 1 },
        grade: { type: "number" },
        source_refs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source: { type: "string" },
              page: { type: "integer" },
              section: { type: "string" },
              text: { type: "string" },
            },
            required: ["source"],
            additionalProperties: false,
          },
        },
      },
      required: ["ref", "type", "title", "description", "instructions", "learning_objectives", "grade", "source_refs"],
      additionalProperties: false,
    },
  },
  required: ["title", "summary", "warnings", "assumptions", "content"],
  additionalProperties: false,
};
