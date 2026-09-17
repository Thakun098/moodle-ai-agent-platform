import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("UX/UI Ticket 01 Outcome Review Workbench", () => {
  it("renders a dedicated selected-outcome focus surface with explicit save semantics", () => {
    const template = readFileSync("moodle/local_agentpoc/templates/course_builder.mustache", "utf8");
    const js = readFileSync("moodle/local_agentpoc/amd/src/course_builder.js", "utf8");
    const built = readFileSync("moodle/local_agentpoc/amd/build/course_builder.min.js", "utf8");
    expect(built).toBe(js);

    expect(template).toContain('id="outcome-review-workbench"');
    expect(template).toContain('#step-view-review {');
    expect(template).toContain('width: min(1600px, calc(100vw - 6rem))');
    expect(template).toContain('flex: 0 0 22%');
    expect(template).toContain('flex: 0 0 53%');
    expect(template).toContain('flex: 0 0 25%');
    expect(js).toContain("function renderOutcomeReviewWorkbench()");
    expect(js).toContain("callBff('get_outcome_reviews', {run_id: state.runId})");
    expect(js).toContain("callBff('save_outcome_review'");
    expect(js).toContain("Pending review");
    expect(js).toContain("Needs revision");
    expect(js).toContain("Reviewed");
    expect(js).toContain("CLO Approved");
    expect(js).toContain("Save review");
    expect(js).toContain("Approve CLO");
    expect(js).not.toContain("Bulk Approve");
    expect(js).toContain('id="outcome-review-text"');
    expect(js).toContain('for="outcome-review-text"');
    expect(js).toContain('id="outcome-review-status"');
    expect(js).toContain('for="outcome-review-status"');
    expect(js).toContain("function focusOutcomeReviewSelection()");
    const workbench = js.slice(js.indexOf("function renderOutcomeReviewWorkbench()"), js.indexOf("function loadOutcomeReviews()"));
    expect(workbench.indexOf("var $next")).toBeGreaterThan(workbench.indexOf("This CLO is approved"));
    expect(workbench).toContain("focusOutcomeReviewSelection();");
  });

  it("routes review state through the Moodle BFF rather than mutating local authority only", () => {
    const bff = readFileSync("moodle/local_agentpoc/ajax.php", "utf8");
    const client = readFileSync("moodle/local_agentpoc/classes/api/ai_platform_client.php", "utf8");
    expect(bff).toContain("case 'get_outcome_reviews':");
    expect(bff).toContain("case 'save_outcome_review':");
    expect(client).toContain("/outcome-reviews");
  });
});
