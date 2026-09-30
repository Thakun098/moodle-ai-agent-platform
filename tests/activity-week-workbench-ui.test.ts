import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("moodle/local_agentpoc/amd/src/course_builder.js", "utf8");
const built = readFileSync("moodle/local_agentpoc/amd/build/course_builder.min.js", "utf8");

describe("UX/UI Ticket 04 Activity Week Workbench static contract", () => {
  it("keeps the checked-in AMD artifact synchronized and renders selected-Week tabs", () => {
    expect(built).toBe(source);
    expect(source).toContain("activity-week-rail");
    expect(source).toContain("activity-week-workspace");
    for (const label of ["Material", "Quiz", "Assignment"]) expect(source).toContain(`.text('${label}')`);
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain("aria-selected");
  });

  it("uses one Activity-level question navigator and no per-question regeneration", () => {
    expect(source).toContain("quiz-question-navigator");
    expect(source).toContain("quiz-question-detail");
    expect(source).toContain("selectedQuizQuestionByActivity");
    expect(source).not.toMatch(/Regenerate Question|regenerate_question|generate_question/iu);
  });

  it("keeps explicit Activity save and Teacher-triggered stale regeneration", () => {
    expect(source).toContain("Save Teacher Edit");
    expect(source).toContain("save_activity_edit");
    expect(source).toContain("Regenerate Activity");
    expect(source).toContain("generate_activity");
  });

  it("projects compact review context into the inspector without hiding generation settings there", () => {
    for (const marker of ["activity-context-inspector", "AI self-review", "Source references", "Competency mapping & evidence"]) {
      expect(source).toContain(marker);
    }
    expect(source).not.toContain("Advanced Settings");
    expect(source).not.toContain("activeAdvanced");
    expect(source).not.toMatch(/\$activityInspector\.append\(\$generationSettings\)/u);
  });

  it("renders visible Activity generation settings in the center panel before the prompt", () => {
    expect(source).toContain("activity-generation-settings");
    expect(source).toContain("Generation Settings");
    for (const label of ["Questions", "Type", "Choices", "Grade"]) expect(source).toContain(label);
    expect(source).toMatch(/\$panel\.append\(\$generationSettings\);[\s\S]*\$panel\.append\(\$promptLabel\)\.append\(\$prompt\);/u);
  });
});
