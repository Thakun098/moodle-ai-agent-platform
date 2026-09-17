import { describe, expect, it } from "vitest";
import { assertCompetencyExecutionSnapshotCurrent } from "../src/services/competency-execution-snapshot-service.js";

describe("Ticket 24 competency execution snapshot current-state guard", () => {
  it("ignores confirmed mappings whose Competency is no longer approved", async () => {
    const snapshot = {
      runId: "run-1",
      planId: "plan-1",
      revision: 1,
      mappingReviewRevision: 7,
      capturedAt: "2026-09-16T00:00:00.000Z",
      competencies: [{ candidateId: "approved-c", competencyRevision: 2, name: "Approved", description: "Approved", outcomeIds: ["o1"], idnumber: "AGENTPOC-1" }],
      mappings: [{ evidence: "CONFIRMED" as const, activityRef: "assignment-01", competencyId: "approved-c", intentRevision: 1, activityIntentId: "a1", activityRevision: 2, competencyRevision: 2 }],
    };
    const approvedCandidate = { candidateId: "approved-c", revision: 2, name: "Approved", description: "Approved", derivedFromOutcomeIdsJson: ["o1"], status: "APPROVED" };
    const rejectedCandidate = { candidateId: "rejected-c", revision: 3, name: "Rejected", description: "Rejected", derivedFromOutcomeIdsJson: ["o1"], status: "REJECTED" };
    const approvedMapping = { activityId: "a1", activityRef: "assignment-01", competencyId: "approved-c", intentRevision: 1, activityRevision: 2, competencyRevision: 2, evidence: "CONFIRMED", mapping: "CONFIRMED", available: true };
    const rejectedMapping = { activityId: "a1", activityRef: "assignment-01", competencyId: "rejected-c", intentRevision: 1, activityRevision: 2, competencyRevision: 3, evidence: "CONFIRMED", mapping: "CONFIRMED", available: true };

    await expect(assertCompetencyExecutionSnapshotCurrent(snapshot as any, {
      candidateRepo: { list: async () => [approvedCandidate, rejectedCandidate] } as any,
      activityIntentRepo: { get: async () => ({ id: "a1", status: "generated", activityRef: "assignment-01", intentRevision: 1, activityRevision: 2 }) } as any,
      reviewRepo: { review: async () => ({ revision: 7, mappings: [approvedMapping, rejectedMapping] }) } as any,
    })).resolves.toBeUndefined();
  });
});
