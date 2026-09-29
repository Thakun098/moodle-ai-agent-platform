import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("moodle/local_agentpoc/amd/src/course_builder.js", "utf8");
const template = readFileSync("moodle/local_agentpoc/templates/course_builder.mustache", "utf8");

describe("UX/UI review follow-up: Activity workspace", () => {
  it("uses more desktop viewport width and gives the Activity workspace the dominant column", () => {
    expect(template).toContain("#step-view-activities");
    expect(template).toMatch(/#step-view-activities\s*\{[\s\S]*width:\s*min\(1760px,\s*calc\(100vw - 2rem\)\)/);
    expect(template).toMatch(/\.activity-week-workspace\s*\{[\s\S]*flex:\s*0 0 63%[\s\S]*max-width:\s*63%/);
  });

  it("bounds both Week rails and gives the selected Week an explicit state", () => {
    expect(template).toMatch(/\.week-review-rail\s*\{[\s\S]*max-height:\s*640px[\s\S]*overflow-y:\s*auto/);
    expect(template).toMatch(/\.activity-week-rail\s*\{[\s\S]*max-height:\s*640px[\s\S]*overflow-y:\s*auto/);
    expect(template).toMatch(/\.week-review-nav-item\.week-nav-current[\s\S]*\.activity-week-nav-item\.week-nav-current/);
    expect(source).toContain("week-selected-context");
    expect(source).toContain("activity-selected-week-context");
  });

  it("clamps Activity Week selector titles to two lines without truncating the source label", () => {
    expect(source).toContain('class="activity-week-nav-title font-weight-bold"');
    expect(source).not.toContain('activity-week-nav-title d-block');
    expect(template).toMatch(/\.activity-week-nav-title\s*\{[\s\S]*display:\s*-webkit-box[\s\S]*-webkit-line-clamp:\s*2[\s\S]*overflow:\s*hidden/);
    expect(source).not.toMatch(/label\.(?:slice|substring|substr)\(/);
  });

  it("spaces Activity Week cards and keeps long labels inside the compact selector", () => {
    expect(template).toMatch(/\.activity-week-nav-item\s*\{[\s\S]*padding:\s*0\.75rem 0\.875rem[\s\S]*margin-bottom:\s*0\.45rem[\s\S]*overflow:\s*hidden/);
    expect(template).toMatch(/\.activity-week-nav-item \.badge\s*\{[\s\S]*display:\s*inline-block[\s\S]*margin-top:\s*0\.45rem/);
    expect(template).toMatch(/\.activity-week-rail\s*\{[\s\S]*min-width:\s*0/);
  });

  it("keeps the full Activity Week label in the selected workspace and accessible selector text", () => {
    expect(source).toContain("function activityWeekDisplayLabel(section)");
    expect(source).toContain(".attr('title', label)");
    expect(source).not.toContain(".attr('aria-label', label + ' — ' + status)");
    expect(source).toContain(".text(selectedActivityWeekLabel)");
    expect(source).toMatch(/selectedActivityWeekLabel = activityWeekDisplayLabel\(selectedActivityWeek\)/);
    expect(source).toMatch(/label = activityWeekDisplayLabel\(section\)/);
  });

  it("makes Activity tabs visibly selectable and gives the active tab a strong selected state", () => {
    expect(template).toMatch(/\.activity-review-tabs \.nav-link\s*\{[\s\S]*font-weight:\s*600/);
    expect(template).toMatch(/\.activity-review-tabs \.nav-link\.active\s*\{[\s\S]*background:\s*#0f6cbf[\s\S]*color:\s*#fff/);
  });

  it("auto-saves a selected Material file without requiring a second Upload click", () => {
    expect(source).toContain("Selecting a file saves automatically");
    expect(source).toMatch(/\$file\.on\('change',[\s\S]*saveSelectedMaterial\(file\)/);
    expect(source).toContain("Learning Material saved, but Activity status refresh failed");
  });

  it("soft-warns for missing LO/CLO and persists an explicit Teacher-review exception before generation", () => {
    expect(source).toContain("activity-alignment-review-warning");
    expect(source).toContain("You may still generate, but this Activity will be marked Teacher Review Required");
    expect(source).toContain("kind: 'MISSING_ALIGNMENT'");
    expect(source).toContain("Confirm Teacher Review Required before generating '");
    expect(source).toContain("without a required LO/CLO.");
  });

  it("uses one approval acknowledgment for every revision-scoped Teacher review requirement", () => {
    expect(source).toMatch(/reviewRequirements \|\| \[\]\)\.some\(function\(item\) \{ return item && item\.code; \}\)/);
    expect(template).toContain("generated without selected LO/CLO alignment");
    expect(template).toContain("I have reviewed every flagged Activity and acknowledge the current Plan revision.");
  });

  it("preflights unspecified learner acknowledgment locally without auto-acknowledging", () => {
    const generateBlock = source.slice(source.indexOf("function generateSelectedActivity"), source.indexOf("function renderPanel"));
    expect(generateBlock).toContain("Confirm that learner context is unspecified before generating this Activity.");
    expect(generateBlock).toContain("state.coreContext.learner_context.status === 'UNSPECIFIED'");
    expect(generateBlock).toContain("$learnerAck.trigger('focus')");
    expect(generateBlock).not.toContain("$learnerAck.prop('checked', true)");
  });

  it("labels the no-material generation path as Syllabus fallback without predicting the server grounding mode", () => {
    expect(source).toContain("Source: Syllabus fallback");
    expect(source).toContain("AI expansion remains Teacher Review Required");
  });

});
