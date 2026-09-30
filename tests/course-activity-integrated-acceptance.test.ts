import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("moodle/local_agentpoc/amd/src/course_builder.js", "utf8");
const built = readFileSync("moodle/local_agentpoc/amd/build/course_builder.min.js", "utf8");
const styles = readFileSync("moodle/local_agentpoc/styles.css", "utf8");
const template = readFileSync("moodle/local_agentpoc/templates/course_builder.mustache", "utf8");
const version = readFileSync("moodle/local_agentpoc/version.php", "utf8");
const intentValidator = readFileSync("packages/planning/src/activity/activity-intent.ts", "utf8");
const intentRoute = readFileSync("apps/api/src/routes/activity-intents.ts", "utf8");
const design = readFileSync("packages/planning/src/activity/activity-design.ts", "utf8");

describe("Issue 29 integrated Course/Activity workbench acceptance contract", () => {
  it("keeps Course Structure Week selection on the partial-navigation path", () => {
    expect(source).toContain("function selectWeekPartial(newRef)");
    const click = source.match(/\$week\.on\('click',[\s\S]*?selectWeekPartial\(section\.ref\);[\s\S]*?\}\);/)?.[0] ?? "";
    expect(click).toContain("guardedNavigate");
    expect(click).not.toContain("renderPreview(");
    expect(styles).toMatch(/grid-template-rows:\s*repeat\(10,\s*minmax\(0,\s*auto\)\)/);
    expect(styles).toMatch(/grid-auto-flow:\s*column/);
  });

  it("keeps Activity Week titles semantic while clamping only the visual title span", () => {
    expect(source).toContain("function activityWeekDisplayLabel(section)");
    expect(source).toContain('class="activity-week-nav-title font-weight-bold"');
    expect(source).toContain(".attr('title', label)");
    expect(source).toContain(".text(selectedActivityWeekLabel)");
    expect(source).not.toMatch(/label\.(?:slice|substring|substr)\(/);
    expect(template).toMatch(/\.activity-week-nav-title\s*\{[\s\S]*-webkit-line-clamp:\s*2[\s\S]*overflow:\s*hidden/);
    expect(template).toMatch(/\.activity-week-nav-item\s*\{[\s\S]*padding:\s*0\.75rem 0\.875rem[\s\S]*margin-bottom:\s*0\.45rem/);
  });

  it("keeps learner acknowledgment course-level and generation strict", () => {
    expect(intentValidator).toContain("allowUnacknowledgedLearnerContext?: boolean");
    expect(intentValidator).toContain("context.learner_context.teacher_acknowledged_unspecified === true");
    expect(intentRoute).toContain("allowUnacknowledgedLearnerContext: true");
    expect(design).not.toContain("allowUnacknowledgedLearnerContext");
    expect(source).toContain("function renderLearnerContextAcknowledgmentControl");
    expect(source).toContain("callBff('acknowledge_learner_context'");
    expect(source).not.toContain("quiz_learner_context_acknowledged");
    expect(source).not.toContain("assignment_learner_context_acknowledged");

    const generate = source.slice(
      source.indexOf("function generateSelectedActivity"),
      source.indexOf("function renderPanel", source.indexOf("function generateSelectedActivity"))
    );
    expect(generate).toContain("learnerContextNeedsAcknowledgment()");
    expect(generate).toContain("learner-context-shared-ack");
    expect(generate.indexOf("learnerContextNeedsAcknowledgment()")).toBeLessThan(generate.indexOf("callBff('generate_activity'"));
  });

  it("keeps the checked-in AMD build identical to source", () => {
    expect(built).toBe(source);
  });

  it("uses the next unused integrated Moodle plugin version", () => {
    expect(version).toContain("$plugin->version   = 2026093001;");
    expect(version).toContain("$plugin->release   = 'v0.1.55';");
  });
});
