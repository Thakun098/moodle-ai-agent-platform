import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { courseStructureRoutes } from "../src/routes/course-structure.js";
import { loadConfig } from "../src/config/config-loader.js";

const syllabus: any = { schema_version: "0.1", metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 1, sha256: "a".repeat(64) }, course_title: "Loops", learning_objectives: [], schedule_or_topics: [], raw_text: "Loops" };

describe("Ticket 18 candidate authority safety", () => {
  it("keeps sealed authority when an edited Structure candidate fails validation", async () => {
    const sealed = { id: "sealed-1", runId: "run-structure", revision: 1, title: "Sealed", summary: "Sealed", contentJson: { course: { title: "Loops" }, sections: [] }, teacherConstraintsJson: { activityRules: [], warnings: [] }, validationStatus: "valid", sealedAt: "2026-09-14T00:00:00Z", sealedByMoodleUserId: 7, createdAt: "2026-09-14T00:00:00Z" };
    const unseal = vi.fn();
    const save = vi.fn();
    const runRepo = { getRun: vi.fn().mockResolvedValue({ runId: "run-structure", status: "planning", normalizedSyllabus: syllabus }), failRun: vi.fn() };
    const structureRepo = { getLatestRevision: vi.fn().mockResolvedValue(sealed), unsealRevisions: unseal, saveRevision: save };
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, _request, reply) => reply.status(422).send({ error: { code: (error as any).code, message: error.message, details: (error as any).details } }));
    app.register(courseStructureRoutes, { config: loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test" }), runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, structurePlanner: {} as any });
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/api/runs/run-structure/course-structure/revisions", payload: { edited_structure: { title: "Broken", summary: "Broken", content: { course: { title: "Loops" }, sections: [] } } } });
    expect(response.statusCode).toBe(422);
    expect(unseal).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(sealed.sealedAt).toBe("2026-09-14T00:00:00Z");
    await app.close();
  });
});
