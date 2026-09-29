import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("moodle/local_agentpoc/amd/src/course_builder.js", "utf8");
const styles = readFileSync("moodle/local_agentpoc/styles.css", "utf8");

function sliceFunction(name: string, nextName: string) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Issue 27: Course Structure selector partial navigation", () => {
  it("routes Week selector clicks through guarded partial navigation instead of a full preview rebuild", () => {
    expect(source).toMatch(
      /\$week\.on\('click',[\s\S]*?guardedNavigate\(function\(\) \{[\s\S]*?selectWeekPartial\(section\.ref\);[\s\S]*?\}\);[\s\S]*?\}\);/
    );

    const selectorClick = source.match(/\$week\.on\('click',[\s\S]*?\n\s*\}\);/)?.[0] ?? "";
    expect(selectorClick).toContain("selectWeekPartial(section.ref)");
    expect(selectorClick).not.toContain("renderPreview(");
  });

  it("updates selected state, URL, ARIA state, workspace content, and alignment review without clearing the workbench shell", () => {
    const partial = sliceFunction("selectWeekPartial", "renderAlignmentReview");
    expect(partial).toContain("state.selectedWeekRef = newRef");
    expect(partial).toContain("url.searchParams.set('week_ref', newRef)");
    expect(partial).toContain("window.history.replaceState");
    expect(partial).toContain("updateWeekNavSelection(newRef)");
    expect(partial).toContain("renderWeekWorkspaceContent(sections, $workspace)");
    expect(partial).toContain("renderAlignmentReview(");
    expect(partial).not.toContain("$container.empty()");
    expect(partial).not.toContain("renderPreview(");

    const navUpdate = sliceFunction("updateWeekNavSelection", "renderWeekWorkspaceContent");
    expect(navUpdate).toContain("toggleClass('active week-nav-current', isNew)");
    expect(navUpdate).toContain(".attr('aria-current', isNew ? 'true' : 'false')");

    const workspace = sliceFunction("renderWeekWorkspaceContent", "renderSectionCard");
    expect(workspace).toContain("$workspace.empty()");
    expect(workspace).toContain("renderSectionCard(sec, idx, $workspace)");
    expect(workspace).not.toContain("$container.empty()");
    expect(workspace).not.toContain(".week-review-rail");
  });

  it("keeps a selected Week recovery banner inside the partial workspace instead of prepending above the workbench shell", () => {
    expect(source).toContain("function showRecoveryBanner(surface, entityRef, serverRevision, applyDraft, $hostOverride)");
    const workspace = sliceFunction("renderWeekWorkspaceContent", "renderSectionCard");
    expect(workspace).toMatch(/showRecoveryBanner\('structure-week',[\s\S]*?\}, \$workspace\);/);
  });

  it("uses the same section-card renderer after full and partial navigation so edit/delete/review behavior stays identical", () => {
    expect(source).toContain("renderSectionCard(sec, idx, $workspace)");
    expect(source).toMatch(/visibleSections\.forEach\(function\(sec\)[\s\S]*?renderSectionCard\(sec, idx, \$cards\)/);
    const card = sliceFunction("renderSectionCard", "selectWeekPartial");
    expect(card).toContain("guardedNavigate(function() { openEditSectionModal(idx); })");
    expect(card).toContain("deleteSection(idx)");
    expect(card).toContain("callBff('mark_week_reviewed'");
  });

  it("uses deterministic 10-row CSS grid flow rather than height-based column approximation", () => {
    expect(styles).toMatch(/\.week-review-nav-list\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(
      /@media\s*\(min-width:\s*768px\)[\s\S]*\.week-review-nav-list\s*\{[\s\S]*grid-template-rows:\s*repeat\(10,\s*minmax\(0,\s*auto\)\)[\s\S]*grid-auto-flow:\s*column[\s\S]*grid-auto-columns:\s*minmax\(0,\s*1fr\)/
    );
    expect(styles).not.toMatch(/\.week-review-nav-list\s*\{[\s\S]{0,400}column-count:/);
    expect(styles).not.toContain("max-height: 480px");
  });

  it("adds deliberate Week-card padding and desktop column separation without changing the 10-row flow", () => {
    expect(styles).toMatch(
      /\.week-review-nav-list\s*>\s*\.week-review-nav-item\s*\{[\s\S]*padding:\s*0\.625rem\s+0\.75rem/
    );
    expect(styles).toMatch(
      /@media\s*\(min-width:\s*768px\)[\s\S]*\.week-review-nav-list\s*\{[\s\S]*row-gap:\s*0\.5rem[\s\S]*column-gap:\s*0\.875rem/
    );
  });

  it("gives the two-column selector enough desktop width and keeps compact viewports overflow-safe", () => {
    expect(source).toContain('class="col-md-6 mb-3 week-review-rail"');
    expect(source).toContain('class="col-md-6 week-review-workspace"');
    expect(styles).toMatch(/\.week-review-rail\s*\{[\s\S]*overflow-x:\s*hidden/);
    expect(styles).not.toMatch(/@media\s*\(min-width:\s*1200px\)[\s\S]*\.week-review-rail\s*\{[\s\S]*max-width:\s*340px/);
  });
});
