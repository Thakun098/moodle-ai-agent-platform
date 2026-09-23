import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("moodle/local_agentpoc/amd/src/course_builder.js", "utf8");
const built = readFileSync("moodle/local_agentpoc/amd/build/course_builder.min.js", "utf8");

describe("UX/UI Ticket 05 recoverable local drafts static contract", () => {
  it("pins local recovery snapshots to the current run, surface, entity and base server revision", () => {
    expect(source).toContain("function recoverySnapshotKey");
    expect(source).toContain("localStorage");
    expect(source).toContain("base_revision");
    expect(source).toContain("run_id");
    expect(source).toContain("surface");
    expect(source).toContain("entity_ref");
  });

  it("guards in-app navigation with exactly Save, Discard and Cancel", () => {
    expect(source).toContain("function guardDraftNavigation");
    expect(source).toContain(".text('Save')");
    expect(source).toContain(".text('Discard')");
    expect(source).toContain(".text('Cancel')");
    expect(source).toContain("draft-navigation-modal");
  });

  it("offers matching recovery explicitly and conflicts stale recovery without auto-applying it", () => {
    expect(source).toContain("Restore draft");
    expect(source).toContain("Draft conflict");
    expect(source).toContain("Review draft");
    expect(source).toMatch(/snapshot\.base_revision\s*===\s*Number\(serverRevision\)/u);
    expect(source).not.toMatch(/auto[- ]?restore|auto[- ]?merge/iu);
  });

  it("covers both Course Structure and Activity content editors", () => {
    expect(source).toContain("structure-week");
    expect(source).toContain("activity-content");
    expect(source).toContain("persistStructureDraft");
    expect(source).toContain("persistActivityDraft");
  });

  it("does not overwrite a recovery snapshot from a different base revision", () => {
    expect(source).toContain("function hasRecoveryConflict");
    expect(source).toMatch(/existing\s*&&\s*existing\.base_revision\s*!==\s*Number\(baseRevision\)\) return false/u);
    expect(source).toContain("Resolve the Draft conflict for this Week before starting a new edit.");
    expect(source).toContain("Resolve the Draft conflict for this Activity before starting a new edit.");
  });

  it("reconciles recovery state only through explicit restore, discard, or successful save paths", () => {
    expect(source).toContain("discardRecoverySnapshot");
    expect(source).toContain("clearRecoverySnapshotAfterSave");
    expect(source).toContain("restoreRecoverySnapshot");
    expect(built).toBe(source);
  });
});
