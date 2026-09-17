import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { sourceReferenceFromSyllabusItem } from "../grounding/source-reference.js";

export const COURSE_PLANNING_SYSTEM_PROMPT = `You are an expert pedagogical course planning assistant for Moodle LMS.
Your task is to transform a supplied normalized syllabus into a structured educational course plan.

Root Structure:
Your output JSON root object MUST contain ALL of these required fields:
- "title": (string) The title of this course plan.
- "summary": (string) A pedagogical summary of the course plan.
- "warnings": (array of strings, e.g. []) Any planning warnings.
- "assumptions": (array of strings, e.g. []) Any pedagogical assumptions.
- "content": (object) Containing "course" and "sections".

Language Preservation:
- Detect the primary natural language used by the supplied syllabus.
- Generate all human-readable pedagogical content in that same language.
- Preserve technical terms, programming-language keywords, identifiers, product names, and code syntax when translation would be inappropriate.
- Do not translate the syllabus into English unless the syllabus itself is primarily English.

Strict Guidelines:
1. Grounding: Use ONLY facts, topics, objectives, and assessments present in the provided syllabus. Do not hallucinate or invent new course content.
2. Source References: Use ONLY source_refs allowed by the supplied structured-output schema. Do not invent source filenames, pages, sections, or line ranges.
3. Identity Isolation: Do NOT output application-level envelope fields like schema_version, plan_id, revision, plan_type, or operation.
4. Moodle Isolation: Do NOT invent Moodle database IDs, categories, or shortnames.
5. Local References:
   - Section refs MUST match pattern "section-01", "section-02", etc.
   - Assignment refs MUST match pattern "assignment-01", "assignment-02", etc.
   - Quiz refs MUST match pattern "quiz-01", "quiz-02", etc.
   - Question refs MUST match pattern "question-01", "question-02", etc.
   - Choice refs MUST match pattern "choice-01", "choice-02", etc.
6. Sections and Activities:
   - For EVERY section, include a concise, non-empty "summary" grounded in that section's Week/Unit topics. The "activities" property is strictly REQUIRED. If a section has no assessments or activities, you MUST explicitly include "activities": []. NEVER omit the "activities" property on any section.
   - For every assignment activity, you MUST include ALL required fields: "ref" (e.g. "assignment-01"), "type" ("assignment"), "title", "description", "instructions" (array with at least 1 string), "learning_objectives" (array with at least 1 string), "grade" (positive number, e.g. 100), and "source_refs" (array). NEVER omit instructions, learning_objectives, or grade.
   - For every quiz activity, you MUST include ALL required fields: "ref" (e.g. "quiz-01"), "type" ("quiz"), "title", "description", "source_refs" (array), and "questions" (array with at least 1 question).
7. Coverage: include at least one section for EVERY distinct week or unit anchor supplied below. Supporting headings, examples, assignments, and quizzes without a week/unit anchor MUST be folded into the nearest anchored week section rather than causing later weeks to be omitted. Preserve all week/unit topics and assessments in the resulting sections.
8. Supported question types: multichoice, truefalse, shortanswer, essay.
9. Position numbers: Use positive integers starting from 1 for section positions.`;

export const COURSE_STRUCTURE_SYSTEM_PROMPT = `You are an expert Instructional Designer and pedagogical course structure assistant for Moodle LMS.
Your task is to perform the DESIGN_STRUCTURE operation as an Instructional Designer, transforming the supplied syllabus and Core Course Design Context into the course structure needed for a later activity-generation stage.

Return only:
- course title, course code, and course summary;
- anchored sections with positive positions;
- a concise, non-empty summary for each section;
- no Quiz, Assignment, Activity Intent, or Moodle entity creation;
- section source references grounded in the supplied syllabus;
- aligned_objective_ids and aligned_outcome_ids using only authorized Core Context IDs;
- measurable Outcome proposals for weak/ambiguous source Outcomes while preserving source wording;
- an empty activity_intents array for every section. Activity existence is decided only by the teacher after Structure review.
- Do not infer, propose, or copy Quiz/Assignment intents from syllabus assessment text or teacher Structure Instruction.

Do not write downstream activity materialization content in this stage.

 Language Preservation:
- Detect the primary natural language used by the syllabus.
- Write newly authored structure prose in that language.
- Preserve technical terms, identifiers, product names, and code syntax.

Grounding and coverage:
- Use only facts, topics, objectives, assessments, and source references present in the supplied syllabus.
- Do not invent Moodle IDs, categories, shortnames, or source locations.
- Include at least one section for every supplied Week/Unit anchor.
- Supporting unanchored content belongs in the nearest anchored section.
- Section refs must follow the requested local-ref format.`;

function buildScheduleAndCoverage(syllabus: NormalizedSyllabus): { sectionsSummary: string; coverageSummary: string } {
  const groupedSchedule = new Map<string, Array<NormalizedSyllabus["schedule_or_topics"][number]>>();
  let currentGroup = "General context";
  for (const item of syllabus.schedule_or_topics) {
    if (item.title.trim().toLowerCase() === "example") continue;
    if (item.week_or_unit) currentGroup = item.week_or_unit;
    const group = groupedSchedule.get(currentGroup) ?? [];
    group.push(item);
    groupedSchedule.set(currentGroup, group);
  }
  const sectionsSummary = [...groupedSchedule.entries()]
    .map(([groupName, items]) => {
      const details = items.map((item) => {
        const sourceReference = item.source
          ? sourceReferenceFromSyllabusItem(syllabus, item)
          : undefined;
        const srcText = sourceReference
          ? `(${JSON.stringify(sourceReference)})`
          : "";
        const topics = item.topics.length > 0 ? `\n  Topics: ${item.topics.join("; ")}` : "";
        return `- ${item.title} ${srcText}${topics}`;
      }).join("\n");
      return `${groupName}:\n${details}`;
    })
    .join("\n\n");
  const weekAnchors = [...new Set(
    syllabus.schedule_or_topics
      .map((item) => item.week_or_unit)
      .filter((value): value is string => Boolean(value)),
  )];
  const coverageSummary = weekAnchors.length > 0
    ? `\n\nCoverage anchors (each MUST appear in at least one output section title):\n${weekAnchors.map((anchor) => `- ${anchor}`).join("\n")}`
    : "";
  return { sectionsSummary, coverageSummary };
}

export function buildCourseStructureUserPrompt(syllabus: NormalizedSyllabus, structureInstruction?: string): string {
  const { sectionsSummary, coverageSummary } = buildScheduleAndCoverage(syllabus);
  const coursePeriodCount = new Set(syllabus.schedule_or_topics.map((item) => item.week_or_unit?.trim()).filter(Boolean)).size;
  return `Please generate only the course structure as valid JSON from the following normalized syllabus. Do not generate any activity body content and return activity_intents: [] for every section. Quiz/Assignment existence is handled only in a later explicit Activity Creation Step. Generate exactly ${coursePeriodCount || 1} anchored section(s), one per supplied course period, in the same order as the syllabus.\n\nStructure Instruction (optional; structure HOW only, never activity authorization):\n${structureInstruction?.trim() || "None"}\n\nSyllabus Filename: ${syllabus.metadata.filename}\nCourse Title: ${syllabus.course_title || "Untitled Course"}\nCourse Code: ${syllabus.course_code || "N/A"}\nCourse Description: ${syllabus.course_description || "N/A"}\nAssessment Information (context only; do not create activities from it): ${syllabus.assessment_text || "None"}\n\nLearning Objectives:\n${syllabus.learning_objectives.map((objective) => `- ${objective}`).join("\n")}\n\nSchedule and Topics:\n${sectionsSummary}${coverageSummary}\n`;
}

export function buildCoursePlanningUserPrompt(syllabus: NormalizedSyllabus): string {
  const filename = syllabus.metadata.filename;
  const { sectionsSummary, coverageSummary } = buildScheduleAndCoverage(syllabus);

  return `Please generate a structured Course Plan from the following syllabus. Language Preservation: detect the syllabus's primary natural language and write all newly authored pedagogical prose in that language; keep technical terms, identifiers, product names, and code syntax conventional.\n\nSyllabus Filename: ${filename}\nCourse Title: ${syllabus.course_title || "Untitled Course"}\nCourse Code: ${syllabus.course_code || "N/A"}\nCourse Description: ${syllabus.course_description || "N/A"}\n\nLearning Objectives:\n${syllabus.learning_objectives.map((o) => `- ${o}`).join("\n")}\n\nSchedule and Topics:\n${sectionsSummary}${coverageSummary}\n`;
}

type JsonSchema = Record<string, unknown>;

function nonBlankStringSchema(): JsonSchema {
  return { type: "string", minLength: 1, pattern: "\\S" };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export const sourceReferenceSchema: JsonSchema = {
  type: "object",
  properties: {
    source: nonBlankStringSchema(),
    page: { type: "integer", minimum: 1 },
    section: nonBlankStringSchema(),
    text: nonBlankStringSchema(),
  },
  required: ["source"],
  additionalProperties: false,
};

function buildGroundedSourceReferenceSchema(syllabus: NormalizedSyllabus): JsonSchema {
  const filename = syllabus.metadata.filename;
  const sections: string[] = [];
  const pages: number[] = [];

  for (const item of syllabus.schedule_or_topics) {
    const reference = sourceReferenceFromSyllabusItem(syllabus, item);
    if (reference.section) sections.push(reference.section);
    if (reference.page !== undefined) pages.push(reference.page);
  }

  const properties: Record<string, JsonSchema> = {
    source: { ...nonBlankStringSchema(), const: filename },
    text: nonBlankStringSchema(),
  };

  const uniqueSections = unique(sections);
  const uniquePages = [...new Set(pages)];
  if (uniqueSections.length > 0) properties.section = { ...nonBlankStringSchema(), enum: uniqueSections };
  if (uniquePages.length > 0) properties.page = { type: "integer", minimum: 1, enum: uniquePages };

  return {
    type: "object",
    properties,
    required: ["source"],
    additionalProperties: false,
  };
}

function buildQuestionSchemas(sourceRefSchema: JsonSchema) {
  const multipleChoiceQuestionSchema: JsonSchema = {
    type: "object",
    properties: {
      ref: { type: "string", pattern: "^question-[a-z0-9]+(?:-[a-z0-9]+)*$" },
      type: { type: "string", const: "multichoice" },
      question: nonBlankStringSchema(),
      choices: {
        type: "array",
        minItems: 2,
        items: {
          type: "object",
          properties: {
            ref: { type: "string", pattern: "^choice-[a-z0-9]+(?:-[a-z0-9]+)*$" },
            text: nonBlankStringSchema(),
          },
          required: ["ref", "text"],
          additionalProperties: false,
        },
      },
      correct_choice_refs: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: { type: "string", pattern: "^choice-[a-z0-9]+(?:-[a-z0-9]+)*$" },
      },
      feedback: nonBlankStringSchema(),
      default_mark: { type: "number", exclusiveMinimum: 0 },
      source_refs: { type: "array", items: sourceRefSchema },
    },
    required: ["ref", "type", "question", "choices", "correct_choice_refs", "feedback", "default_mark", "source_refs"],
    additionalProperties: false,
  };

  const trueFalseQuestionSchema: JsonSchema = {
    type: "object",
    properties: {
      ref: { type: "string", pattern: "^question-[a-z0-9]+(?:-[a-z0-9]+)*$" },
      type: { type: "string", const: "truefalse" },
      question: nonBlankStringSchema(),
      correct_answer: { type: "boolean" },
      feedback: nonBlankStringSchema(),
      default_mark: { type: "number", exclusiveMinimum: 0 },
      source_refs: { type: "array", items: sourceRefSchema },
    },
    required: ["ref", "type", "question", "correct_answer", "feedback", "default_mark", "source_refs"],
    additionalProperties: false,
  };

  const shortAnswerQuestionSchema: JsonSchema = {
    type: "object",
    properties: {
      ref: { type: "string", pattern: "^question-[a-z0-9]+(?:-[a-z0-9]+)*$" },
      type: { type: "string", const: "shortanswer" },
      question: nonBlankStringSchema(),
      accepted_answers: { type: "array", minItems: 1, items: nonBlankStringSchema() },
      case_sensitive: { type: "boolean" },
      default_mark: { type: "number", exclusiveMinimum: 0 },
      source_refs: { type: "array", items: sourceRefSchema },
    },
    required: ["ref", "type", "question", "accepted_answers", "case_sensitive", "default_mark", "source_refs"],
    additionalProperties: false,
  };

  const essayQuestionSchema: JsonSchema = {
    type: "object",
    properties: {
      ref: { type: "string", pattern: "^question-[a-z0-9]+(?:-[a-z0-9]+)*$" },
      type: { type: "string", const: "essay" },
      question: nonBlankStringSchema(),
      grading_guidance: { type: "array", minItems: 1, items: nonBlankStringSchema() },
      default_mark: { type: "number", exclusiveMinimum: 0 },
      source_refs: { type: "array", items: sourceRefSchema },
    },
    required: ["ref", "type", "question", "grading_guidance", "default_mark", "source_refs"],
    additionalProperties: false,
  };

  return { oneOf: [multipleChoiceQuestionSchema, trueFalseQuestionSchema, shortAnswerQuestionSchema, essayQuestionSchema] };
}

export const questionPlanSchema: JsonSchema = buildQuestionSchemas(sourceReferenceSchema);

export function buildCoursePlanningSchema(syllabus: NormalizedSyllabus): JsonSchema {
  const groundedSourceReferenceSchema = buildGroundedSourceReferenceSchema(syllabus);
  const groundedSourceReferenceRef: JsonSchema = { $ref: "#/$defs/groundedSourceReference" };
  const groundedQuestionPlanSchema = buildQuestionSchemas(groundedSourceReferenceRef);
  const weekAnchorCount = new Set(
    syllabus.schedule_or_topics
      .map((item) => item.week_or_unit)
      .filter((value): value is string => Boolean(value))
  ).size;

  const assignmentActivitySchema: JsonSchema = {
    type: "object",
    properties: {
      ref: { type: "string", pattern: "^assignment-[a-z0-9]+(?:-[a-z0-9]+)*$" },
      type: { type: "string", const: "assignment" },
      title: nonBlankStringSchema(),
      description: nonBlankStringSchema(),
      instructions: { type: "array", items: nonBlankStringSchema(), minItems: 1 },
      learning_objectives: { type: "array", items: nonBlankStringSchema(), minItems: 1 },
      grade: { type: "number", exclusiveMinimum: 0 },
      source_refs: { type: "array", items: groundedSourceReferenceRef },
    },
    required: ["ref", "type", "title", "description", "instructions", "learning_objectives", "grade", "source_refs"],
    additionalProperties: false,
  };

  const quizActivitySchema: JsonSchema = {
    type: "object",
    properties: {
      ref: { type: "string", pattern: "^quiz-[a-z0-9]+(?:-[a-z0-9]+)*$" },
      type: { type: "string", const: "quiz" },
      title: nonBlankStringSchema(),
      description: nonBlankStringSchema(),
      source_refs: { type: "array", items: groundedSourceReferenceRef },
      questions: { type: "array", items: groundedQuestionPlanSchema },
    },
    required: ["ref", "type", "title", "description", "source_refs", "questions"],
    additionalProperties: false,
  };

  return {
    $defs: {
      groundedSourceReference: groundedSourceReferenceSchema,
    },
    type: "object",
    properties: {
      title: nonBlankStringSchema(),
      summary: nonBlankStringSchema(),
      warnings: { type: "array", items: nonBlankStringSchema() },
      assumptions: { type: "array", items: nonBlankStringSchema() },
      content: {
        type: "object",
        properties: {
          course: {
            type: "object",
            properties: {
              title: nonBlankStringSchema(),
              course_code: nonBlankStringSchema(),
              summary: nonBlankStringSchema(),
            },
            required: ["title"],
            additionalProperties: false,
          },
          sections: {
            type: "array",
            minItems: Math.max(1, weekAnchorCount),
            items: {
              type: "object",
              properties: {
                ref: { type: "string", pattern: "^section-[a-z0-9]+(?:-[a-z0-9]+)*$" },
                position: { type: "integer", minimum: 1 },
                title: nonBlankStringSchema(),
                summary: nonBlankStringSchema(),
                source_refs: { type: "array", items: groundedSourceReferenceRef },
                activities: { type: "array", items: { oneOf: [assignmentActivitySchema, quizActivitySchema] } },
              },
              required: ["ref", "position", "title", "summary", "source_refs", "activities"],
              additionalProperties: false,
            },
          },
        },
        required: ["course", "sections"],
        additionalProperties: false,
      },
    },
    required: ["title", "summary", "warnings", "assumptions", "content"],
    additionalProperties: false,
  };
}
