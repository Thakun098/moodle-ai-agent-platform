import { describe, expect, it, vi } from "vitest";
import { BoundedMaterialContextProvider, type MaterialSnapshot } from "../src/index.js";

const snapshot: MaterialSnapshot = {
  id: "snapshot-1",
  runId: "run-1",
  structureRevision: 1,
  sectionRef: "section-01",
  revision: 1,
  files: [{
    moodleMaterialId: 7,
    filename: "lecture.md",
    mediaType: "text/markdown",
    byteSize: 10,
    sha256: "sha",
    useForGrounding: true,
    publishToCourse: false,
    extractionStatus: "success",
    extractedContentHash: "text-sha",
  }],
  extractorVersion: "materials-text-v1",
  normalizedText: "BFS uses a queue.",
  normalizedTextHash: "hash",
  estimatedTokens: 5,
  createdByMoodleUserId: 42,
  createdAt: "2026-09-04T00:00:00.000Z",
};

describe("BoundedMaterialContextProvider", () => {
  it("returns only the current snapshot's bounded material context", async () => {
    const provider = new BoundedMaterialContextProvider({ getSnapshot: vi.fn().mockResolvedValue(snapshot) }, 10);
    await expect(provider.getContext("snapshot-1")).resolves.toEqual({
      snapshotId: "snapshot-1",
      sectionRef: "section-01",
      text: "BFS uses a queue.",
      sourceRefs: [{ source: "lecture.md", section: "section-01" }],
      estimatedTokens: 5,
    });
  });

  it("blocks over-budget context instead of truncating it", async () => {
    const provider = new BoundedMaterialContextProvider({ getSnapshot: vi.fn().mockResolvedValue({ ...snapshot, normalizedText: "x".repeat(45) }) }, 10);
    await expect(provider.getContext("snapshot-1")).rejects.toMatchObject({
      code: "MATERIAL_CONTEXT_TOO_LARGE",
      details: { estimated_tokens: 12, configured_budget: 10, section_ref: "section-01" },
    });
  });

  it("fails when the requested snapshot does not exist", async () => {
    const provider = new BoundedMaterialContextProvider({ getSnapshot: vi.fn().mockResolvedValue(null) }, 10);
    await expect(provider.getContext("missing")).rejects.toMatchObject({ code: "MATERIAL_SNAPSHOT_NOT_FOUND" });
  });
});
