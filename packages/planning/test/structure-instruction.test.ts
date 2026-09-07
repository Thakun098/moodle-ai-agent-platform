import { describe, expect, it } from "vitest";
import { interpretStructureInstruction } from "../src/instructions/structure-instruction.js";

describe("Structure Instruction", () => {
  it("preserves structure emphasis and warns about explicit activity selection", () => {
    const text = "เน้น recursion และให้มี quiz ทุกสัปดาห์";
    const result = interpretStructureInstruction(text);
    expect(result.originalInstruction).toBe(text);
    expect(result.warnings).toHaveLength(1);
    expect(result).not.toHaveProperty("activityRules");
  });
  it("accepts empty notes", () => {
    expect(interpretStructureInstruction()).toEqual({ originalInstruction: "", warnings: [] });
  });
});
