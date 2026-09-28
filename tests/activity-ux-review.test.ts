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

  it("makes Activity tabs visibly selectable and gives the active tab a strong selected state", () => {
    expect(template).toMatch(/\.activity-review-tabs \.nav-link\s*\{[\s\S]*font-weight:\s*600/);
    expect(template).toMatch(/\.activity-review-tabs \.nav-link\.active\s*\{[\s\S]*background:\s*#0f6cbf[\s\S]*color:\s*#fff/);
  });

  it("auto-saves a selected Material file without requiring a second Upload click", () => {
    expect(source).toContain("Selecting a file saves automatically");
    expect(source).toMatch(/\$file\.on\('change',[\s\S]*saveSelectedMaterial\(file\)/);
    expect(source).toContain("Learning Material saved, but Activity status refresh failed");
  });
});
