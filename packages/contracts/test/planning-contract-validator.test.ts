import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PLANNING_CONTRACTS_SCHEMA_ID,
  validateAgainstPlanningSchema,
  UnknownPlanningSchemaError,
  listPlanningSchemaIds,
  validatePlanEnvelope,
  validatePlanningContract,
  validateSourceReference,
} from "../src/index.js";

const examplesDirectory = fileURLToPath(new URL("../examples/", import.meta.url));

function loadJson(relativePath: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../examples/${relativePath}`, import.meta.url), "utf8"),
  );
}

function jsonFilenames(relativeDirectory: string): string[] {
  return readdirSync(`${examplesDirectory}/${relativeDirectory}`)
    .filter((filename) => filename.endsWith(".json"))
    .sort();
}

describe("planning schema registry", () => {
  it("compiles and registers every canonical schema", () => {
    const schemaIds = listPlanningSchemaIds();

    expect(schemaIds).toHaveLength(15);
    expect(schemaIds).toContain(PLANNING_CONTRACTS_SCHEMA_ID);
    const fileResourceSchemaId = "urn:moodle-agent-poc:schema:planning:file-resource-plan:0.1";
    expect(schemaIds.filter((schemaId) => schemaId === fileResourceSchemaId)).toHaveLength(1);
    expect(validateAgainstPlanningSchema(fileResourceSchemaId, {
      ref: "resource-01-01",
      type: "resource",
      title: "Week 1 Material",
      filename: "week-1.pdf",
      moodle_material_id: 77,
      source_run_id: "run-01",
      source_structure_revision: 2,
      source_section_ref: "section-01",
      source_material_revision: 3,
      source_refs: [],
    })).toEqual({ valid: true, errors: [] });
    expect(validateAgainstPlanningSchema(fileResourceSchemaId, {
      ref: "resource-01-01",
      type: "resource",
      title: "Week 1 Material",
      filename: "week-1.pdf",
      moodle_material_id: 77,
      source_refs: [],
    }).valid).toBe(false);
    expect(new Set(schemaIds).size).toBe(schemaIds.length);
  });

  it("rejects an unknown schema id with a typed error", () => {
    expect(() => validateAgainstPlanningSchema("urn:missing", {})).toThrow(
      UnknownPlanningSchemaError,
    );
  });
});

describe("PlanEnvelope v0.1 fixtures", () => {
  for (const filename of jsonFilenames("plan-envelope/v0.1/intended-valid")) {
    it(`accepts ${filename}`, () => {
      expect(
        validatePlanEnvelope(
          loadJson(`plan-envelope/v0.1/intended-valid/${filename}`),
        ),
      ).toEqual({ valid: true, errors: [] });
    });
  }

  for (const filename of jsonFilenames("plan-envelope/v0.1/intended-invalid")) {
    it(`rejects ${filename}`, () => {
      const result = validatePlanEnvelope(
        loadJson(`plan-envelope/v0.1/intended-invalid/${filename}`),
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  }
});

describe("SourceReference v0.1 fixtures", () => {
  for (const filename of jsonFilenames("source-reference/v0.1/intended-valid")) {
    it(`accepts ${filename}`, () => {
      expect(
        validateSourceReference(
          loadJson(`source-reference/v0.1/intended-valid/${filename}`),
        ),
      ).toEqual({ valid: true, errors: [] });
    });
  }

  for (const filename of jsonFilenames("source-reference/v0.1/intended-invalid")) {
    it(`rejects ${filename}`, () => {
      const result = validateSourceReference(
        loadJson(`source-reference/v0.1/intended-invalid/${filename}`),
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  }
});

describe("Planning Contracts v0.1 aggregate fixtures", () => {
  for (const filename of jsonFilenames("planning-contracts/v0.1/intended-valid")) {
    it(`accepts ${filename}`, () => {
      expect(
        validatePlanningContract(
          loadJson(`planning-contracts/v0.1/intended-valid/${filename}`),
        ),
      ).toEqual({ valid: true, errors: [] });
    });
  }

  const invalidSchemaByFile: Readonly<Record<string, string>> = {
    "assignment-empty-instructions.json":
      "urn:moodle-agent-poc:schema:planning:assignment-plan:0.1",
    "course-definition-has-category-id.json":
      "urn:moodle-agent-poc:schema:planning:course-definition:0.1",
    "essay-empty-grading-guidance.json":
      "urn:moodle-agent-poc:schema:planning:essay-question-plan:0.1",
    "multichoice-two-correct-refs.json":
      "urn:moodle-agent-poc:schema:planning:multiple-choice-question-plan:0.1",
    "plan-type-content-mismatch.json": PLANNING_CONTRACTS_SCHEMA_ID,
    "quiz-unknown-question-type.json":
      "urn:moodle-agent-poc:schema:planning:quiz-plan:0.1",
    "quiz-update-uses-ambiguous-questions.json": PLANNING_CONTRACTS_SCHEMA_ID,
    "section-invalid-ref.json":
      "urn:moodle-agent-poc:schema:planning:section-plan:0.1",
    "section-position-zero.json":
      "urn:moodle-agent-poc:schema:planning:section-plan:0.1",
    "shortanswer-empty-accepted-answers.json":
      "urn:moodle-agent-poc:schema:planning:short-answer-question-plan:0.1",
    "truefalse-nonboolean-answer.json":
      "urn:moodle-agent-poc:schema:planning:true-false-question-plan:0.1",
  };

  for (const [filename, schemaId] of Object.entries(invalidSchemaByFile)) {
    it(`rejects ${filename}`, () => {
      const result = validateAgainstPlanningSchema(
        schemaId,
        loadJson(`planning-contracts/v0.1/intended-invalid/${filename}`),
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          instancePath: expect.any(String),
          schemaPath: expect.any(String),
          keyword: expect.any(String),
          message: expect.any(String),
          params: expect.any(Object),
        }),
      );
    });
  }
});
