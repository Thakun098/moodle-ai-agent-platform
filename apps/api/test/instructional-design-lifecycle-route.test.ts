import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test-model" });

describe("Instructional Design HTTP lifecycle guard", () => {
  it("blocks Activity Intent mutation after execution has been claimed", async () => {
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "executing" }) };
    const structureRepo = { getSealedRevision: vi.fn().mockResolvedValue({
      runId: "run-1", revision: 1, sealedAt: "2026-09-16T00:00:00Z",
      contentJson: { sections: [{ ref: "section-01", position: 1, title: "Week 1", aligned_objective_ids: [], aligned_outcome_ids: [] }] },
    }) };
    const intentRepo = { listSection: vi.fn().mockResolvedValue([]), select: vi.fn(), remove: vi.fn() };
    const app = buildApp({
      config,
      runRepo: runRepo as any,
      structureRevisionRepo: structureRepo as any,
      activityIntentRepo: intentRepo as any,
      fastifyOptions: { logger: false },
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/runs/run-1/sections/section-01/activity-intents",
      payload: { quiz: true },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("INSTRUCTIONAL_DESIGN_MUTATION_LOCKED");
    expect(intentRepo.select).not.toHaveBeenCalled();
    await app.close();
  });
});
