import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  EXECUTION_REQUEST_SCHEMA_ID,
  isExecutionRequest,
  listPlanningSchemaIds,
  validateExecutionRequest,
} from "../src/index.js";

const examplesDirectory = fileURLToPath(
  new URL("../examples/execution-request/v0.1/", import.meta.url),
);

function loadExample(group: "intended-valid" | "intended-invalid", filename: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../examples/execution-request/v0.1/${group}/${filename}`, import.meta.url), "utf8"),
  );
}

function filenames(group: "intended-valid" | "intended-invalid"): string[] {
  return readdirSync(`${examplesDirectory}/${group}`)
    .filter((filename) => filename.endsWith(".json"))
    .sort();
}

describe("ExecutionRequest v0.1 DRAFT", () => {
  it("registers the draft schema without changing frozen contract IDs", () => {
    expect(listPlanningSchemaIds()).toContain(EXECUTION_REQUEST_SCHEMA_ID);
    expect(listPlanningSchemaIds()).toHaveLength(15);
  });

  for (const filename of filenames("intended-valid")) {
    it(`accepts ${filename}`, () => {
      const value = loadExample("intended-valid", filename);

      expect(validateExecutionRequest(value)).toEqual({ valid: true, errors: [] });
      expect(isExecutionRequest(value)).toBe(true);
    });
  }

  for (const filename of filenames("intended-invalid")) {
    it(`rejects ${filename}`, () => {
      const value = loadExample("intended-invalid", filename);
      const result = validateExecutionRequest(value);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(isExecutionRequest(value)).toBe(false);
    });
  }
});
