import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  isVerificationResult,
  validateVerificationResult,
} from "../src/index.js";

const examplesDirectory = fileURLToPath(
  new URL("../examples/verification-result/v0.1/", import.meta.url),
);

function loadExample(
  group: "intended-valid" | "intended-invalid",
  filename: string,
): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../examples/verification-result/v0.1/${group}/${filename}`, import.meta.url),
      "utf8",
    ),
  );
}

function filenames(group: "intended-valid" | "intended-invalid"): string[] {
  return readdirSync(`${examplesDirectory}/${group}`)
    .filter((filename) => filename.endsWith(".json"))
    .sort();
}

describe("VerificationResult v0.1", () => {
  for (const filename of filenames("intended-valid")) {
    it(`accepts ${filename}`, () => {
      const value = loadExample("intended-valid", filename);
      expect(validateVerificationResult(value)).toEqual({ valid: true, errors: [] });
      expect(isVerificationResult(value)).toBe(true);
    });
  }

  for (const filename of filenames("intended-invalid")) {
    it(`rejects ${filename}`, () => {
      const value = loadExample("intended-invalid", filename);
      const result = validateVerificationResult(value);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(isVerificationResult(value)).toBe(false);
    });
  }

  it("narrows passed and failed result shapes", () => {
    const passed: unknown = loadExample("intended-valid", "passed.json");
    const failed: unknown = loadExample("intended-valid", "failed-mismatch.json");

    if (!isVerificationResult(passed) || !isVerificationResult(failed)) {
      throw new Error("Expected valid verification fixtures");
    }

    if (passed.passed) {
      expect(passed.issues).toEqual([]);
    }

    if (!failed.passed) {
      expect(failed.issues[0].kind).toBe("mismatch");
    }
  });
});
