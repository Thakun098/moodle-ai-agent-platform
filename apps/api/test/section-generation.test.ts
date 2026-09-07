import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test-model", ACTIVITY_CONTEXT_TOKEN_BUDGET: "100" });
const run = { runId: "run-1", status: "planning", model: "test-model" };
const structure = {
  id: "structure-1", runId: "run-1", revision: 1, title: "AI Structure", summary: "Structure", validationStatus: "valid", validationErrors: null, sealedAt: "2026-09-04T00:00:00.000Z", sealedByMoodleUserId: 42, createdAt: "2026-09-04T00:00:00.000Z",
  contentJson: { course: { title: "AI" }, sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Search", source_refs: [{ source: "syllabus.md", section: "Week 1" }], activity_intents: [{ ref: "assignment-01", type: "assignment", title: "Search lab", source_refs: [], origin: "syllabus" }] }] },
};
const snapshot = {
  id: "snapshot-1", runId: "run-1", structureRevision: 1, sectionRef: "section-01", revision: 1,
  filesJson: [{ filename: "lecture.md", mediaType: "text/markdown", byteSize: 10, sha256: "sha", moodleMaterialId: 7, useForGrounding: true, publishToCourse: false, extractionStatus: "success", extractedContentHash: "text-sha" }],
  extractorVersion: "materials-text-v1", normalizedText: "BFS uses a queue.", normalizedTextHash: "hash", estimatedTokens: 5, createdByMoodleUserId: 42, createdAt: "2026-09-04T00:00:00.000Z",
};

function makeRepos(hasSnapshot = true) {
  const drafts: any[] = [];
  const plans: any[] = [];
  return {
    drafts,
    plans,
    runRepo: { getRun: vi.fn().mockResolvedValue(run), updateStatus: vi.fn().mockResolvedValue({ ...run, status: "preview" }) },
    structureRepo: { getSealedRevision: vi.fn().mockResolvedValue(structure) },
    snapshotRepo: { getLatestSnapshot: vi.fn().mockResolvedValue(hasSnapshot ? snapshot : null), getSnapshot: vi.fn().mockResolvedValue(hasSnapshot ? snapshot : null) },
    activityIntentRepo: { list: vi.fn().mockResolvedValue([]) },
    draftRepo: {
      markStaleForSnapshot: vi.fn(),
      listSectionDrafts: vi.fn().mockImplementation(async () => drafts),
      saveDraft: vi.fn().mockImplementation(async (input: any) => { const record = { ...input, contentJson: input.content, status: "generated", materialSnapshotId: input.materialSnapshotId }; drafts.push(record); return record; }),
    },
    planRepo: {
      listRunPlans: vi.fn().mockImplementation(async () => [...plans].reverse()),
      getLatestRevision: vi.fn().mockImplementation(async (planId: string) => [...plans].reverse().find((plan) => plan.planId === planId) ?? null),
      savePlanRevision: vi.fn().mockImplementation(async (input: any) => { const record = { ...input, reviewRequirements: input.reviewRequirements ?? [] }; plans.push(record); return record; }),
    },
  };
}

function makeModelClient(): ModelClient {
  return { ping: vi.fn(), listModels: vi.fn(), chat: vi.fn().mockResolvedValue({ rawText: JSON.stringify({ type: "assignment", title: "Search lab", description: "Implement BFS using a queue.", instructions: ["Submit"], learning_objectives: ["Explain BFS"], grade: 100, source_refs: [{ source: "lecture.md", section: "section-01" }] }), message: { role: "assistant", content: "" }, toolCalls: [] }) };
}

describe("Section generation and finalization API", () => {
  it("retries a failed generation using the same snapshot and then finalizes", async () => {
    const repos = makeRepos();
    const modelClient = makeModelClient();
    vi.mocked(modelClient.chat).mockRejectedValueOnce(new Error("Invalid provider response"));
    const saveSnapshot = vi.fn();
    const app = buildApp({ config, runRepo: repos.runRepo as any, structureRevisionRepo: repos.structureRepo as any, snapshotRepo: { ...repos.snapshotRepo, saveSnapshot } as any, draftRepo: repos.draftRepo as any, activityIntentRepo: repos.activityIntentRepo as any, planRepo: repos.planRepo as any, modelClient, fastifyOptions: { logger: false } });
    try {
      const url = "/api/runs/run-1/sections/section-01/generate";
      const failed = await app.inject({ method: "POST", url });
      expect(failed.statusCode).toBeGreaterThanOrEqual(400);
      expect(repos.drafts).toHaveLength(0);
      const retry = await app.inject({ method: "POST", url });
      expect(retry.statusCode).toBe(200);
      expect(retry.json()).toMatchObject({ state: "GENERATED", material_snapshot_id: "snapshot-1" });
      expect(saveSnapshot).not.toHaveBeenCalled();
      expect(repos.drafts).toHaveLength(1);
      expect(repos.drafts[0].materialSnapshotId).toBe("snapshot-1");
      const finalized = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });

    expect(finalized.statusCode).toBe(201);
      expect(finalized.json().status).toBe("preview");
    } finally {
      await app.close();
    }
  });
  it("generates one Section activity and finalizes only after the draft is current", async () => {
    const repos = makeRepos();
    const app = buildApp({ config, runRepo: repos.runRepo as any, structureRevisionRepo: repos.structureRepo as any, snapshotRepo: repos.snapshotRepo as any, draftRepo: repos.draftRepo as any, activityIntentRepo: repos.activityIntentRepo as any, planRepo: repos.planRepo as any, modelClient: makeModelClient(), fastifyOptions: { logger: false } });
    const status = await app.inject({ method: "GET", url: "/api/runs/run-1/sections/section-01/generation-status" });
    expect(JSON.parse(status.body).material_files).toEqual([{ filename: "lecture.md", sha256: "sha" }]);
    const generated = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/generate" });
    expect(generated.statusCode).toBe(200);
    expect(JSON.parse(generated.body).state).toBe("GENERATED");
    expect(repos.drafts).toHaveLength(1);
    expect(repos.drafts[0].contentJson.source_refs[0].source).toBe("lecture.md");

    const finalized = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });
    expect(finalized.statusCode).toBe(201);
    expect(JSON.parse(finalized.body).status).toBe("preview");
    expect(repos.runRepo.updateStatus).toHaveBeenCalledWith("run-1", "preview");
    const repeated = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });
    expect(repeated.statusCode).toBe(200);
    expect(JSON.parse(repeated.body).reused).toBe(true);
    expect(repos.planRepo.savePlanRevision).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("blocks generation when the section has no sealed material snapshot", async () => {
    const repos = makeRepos(false);
    const app = buildApp({ config, runRepo: repos.runRepo as any, structureRevisionRepo: repos.structureRepo as any, snapshotRepo: repos.snapshotRepo as any, draftRepo: repos.draftRepo as any, activityIntentRepo: repos.activityIntentRepo as any, modelClient: makeModelClient(), fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/generate" });
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe("MATERIAL_REQUIRED");
    await app.close();
  });

  it("passes generation_instruction to the model and stores it outside frozen Activity content", async () => {
    const repos = makeRepos();
    const modelClient = makeModelClient();
    const app = buildApp({ config, runRepo: repos.runRepo as any, structureRevisionRepo: repos.structureRepo as any, snapshotRepo: repos.snapshotRepo as any, draftRepo: repos.draftRepo as any, activityIntentRepo: repos.activityIntentRepo as any, modelClient, fastifyOptions: { logger: false } });
    const response = await app.inject({
      method: "POST",
      url: "/api/runs/run-1/sections/section-01/generate",
      payload: { generation_instruction: "Make the steps beginner-friendly." },
    });
    expect(response.statusCode).toBe(200);
    expect((modelClient.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.messages[1]?.content).toContain("Make the steps beginner-friendly.");
    expect(repos.draftRepo.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ generationInstruction: "Make the steps beginner-friendly." }));
    expect(repos.drafts[0].contentJson).not.toHaveProperty("generation_instruction");
    await app.close();
  });
});
