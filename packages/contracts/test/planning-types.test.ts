import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isPlanEnvelope,
  isPlanningContract,
  isSourceReference,
} from "../src/index.js";

function loadJson(relativePath: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../examples/${relativePath}`, import.meta.url), "utf8"),
  );
}

describe("Ajv-backed TypeScript guards", () => {
  it("narrows a complete course planning contract", () => {
    const value: unknown = loadJson(
      "planning-contracts/v0.1/intended-valid/course-create-complete.json",
    );

    expect(isPlanningContract(value)).toBe(true);
    if (!isPlanningContract(value)) {
      throw new Error("Expected a valid planning contract");
    }

    expect(value.plan_type).toBe("course");
    if (value.plan_type === "course") {
      expect(value.content.sections[0].activities).toHaveLength(2);
    }
  });

  it("narrows quiz update content to explicit mutation arrays", () => {
    const value: unknown = loadJson(
      "planning-contracts/v0.1/intended-valid/quiz-update.json",
    );

    expect(isPlanningContract(value)).toBe(true);
    if (
      !isPlanningContract(value) ||
      value.plan_type !== "quiz" ||
      value.operation !== "update"
    ) {
      throw new Error("Expected a valid quiz update contract");
    }

    expect(value.content.questions_to_add).toEqual([]);
    expect(value.content.questions_to_update).toEqual([]);
  });

  it("rejects an ambiguous quiz update before narrowing", () => {
    const value: unknown = loadJson(
      "planning-contracts/v0.1/intended-invalid/quiz-update-uses-ambiguous-questions.json",
    );

    expect(isPlanningContract(value)).toBe(false);
  });

  it("narrows SourceReference and outer PlanEnvelope independently", () => {
    const source: unknown = loadJson(
      "source-reference/v0.1/intended-valid/source-page.json",
    );
    const envelope: unknown = loadJson(
      "plan-envelope/v0.1/intended-valid/course-create-revision-1.json",
    );

    expect(isSourceReference(source)).toBe(true);
    expect(isPlanEnvelope(envelope)).toBe(true);

    if (isSourceReference(source)) {
      expect(source.page).toBe(1);
    }
  });
});
