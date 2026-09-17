import { describe, expect, it } from "vitest";
import { deriveCompetencyMappings, decideCompetencyMapping, reconcileCompetencyMapping } from "../src/competency/competency-mapping.js";

describe("Teacher-confirmed competency mappings", () => {
  it("proposes both aligned Activities without granting mapping or evidence authority", () => {
    const result = deriveCompetencyMappings({
      approvedOutcomeIds: ["outcome-1"],
      activities: [
        { id: "quiz", status: "generated", outcomeIds: ["outcome-1"], intentRevision: 2, activityRevision: 1 },
        { id: "assignment", status: "generated", outcomeIds: ["outcome-1"], intentRevision: 3, activityRevision: 2 },
      ],
      competencies: [{ id: "competency", status: "APPROVED", outcomeIds: ["outcome-1"], revision: 4 }],
    });
    expect(result.map(pair => [pair.activityId, pair.competencyId, pair.sharedOutcomeIds])).toEqual([
      ["assignment", "competency", ["outcome-1"]], ["quiz", "competency", ["outcome-1"]],
    ]);
    expect(result.every(pair => pair.mapping === "PROPOSED" && pair.evidence === "UNDECIDED")).toBe(true);
  });
  it("requires mapping confirmation before a separate evidence decision and invalidates decisions on revision change", () => {
    const [candidate] = deriveCompetencyMappings({ approvedOutcomeIds: ["o"],
      activities: [{ id: "a", status: "generated", outcomeIds: ["o"], intentRevision: 1, activityRevision: 1 }],
      competencies: [{ id: "c", status: "APPROVED", outcomeIds: ["o"], revision: 1 }] });
    expect(() => decideCompetencyMapping(candidate!, "evidence", "CONFIRMED")).toThrow(/mapping/i);
    const confirmed = decideCompetencyMapping(candidate!, "mapping", "CONFIRMED");
    expect(confirmed.evidence).toBe("UNDECIDED");
    const eligible = decideCompetencyMapping(confirmed, "evidence", "CONFIRMED");
    expect(eligible.evidence).toBe("CONFIRMED");
    expect(decideCompetencyMapping(eligible, "evidence", "DECLINED").mapping).toBe("CONFIRMED");
    expect(reconcileCompetencyMapping(eligible, { ...candidate!, competencyRevision: 2 })).toMatchObject({ mapping: "STALE", evidence: "STALE" });
    expect(reconcileCompetencyMapping(eligible, { ...candidate!, activityRevision: 2 })).toMatchObject({ mapping: "STALE", evidence: "STALE" });
    expect(reconcileCompetencyMapping(eligible, undefined)).toMatchObject({ mapping: "STALE", evidence: "STALE" });
  });
});
