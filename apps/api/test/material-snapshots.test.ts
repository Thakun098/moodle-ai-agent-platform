import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test-model" });

function multipart(files: Array<{ name: string; content: string; materialId: number }>) {
  const boundary = "----MaterialSnapshotBoundary";
  const chunks: Buffer[] = [];
  const field = (name: string, value: string) => chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  field("structure_revision", "1");
  field("moodle_user_id", "42");
  field("material_metadata", JSON.stringify(files.map((file) => ({ moodle_material_id: file.materialId, use_for_grounding: true, publish_to_course: true }))));
  for (const [index, file] of files.entries()) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="material_file_${index}"; filename="${file.name}"\r\nContent-Type: text/plain\r\n\r\n${file.content}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("MaterialSnapshot API", () => {
  it("deduplicates equal SHA-256 files and reuses an identical current snapshot on retry", async () => {
    let latest: any = null;
    const snapshotRepo = {
      getLatestSnapshot: vi.fn().mockImplementation(async () => latest),
      saveSnapshot: vi.fn().mockImplementation(async (input: any) => {
        latest = { ...input, filesJson: input.files };
        return latest;
      }),
    };
    const activityIntentRepo = { markStaleForSection: vi.fn().mockResolvedValue(2) };
    const materialStateRepo = { getState: vi.fn().mockResolvedValue(null), markReady: vi.fn().mockResolvedValue({}), markFailed: vi.fn().mockResolvedValue({}) };
    const app = buildApp({
      config,
      runRepo: { getRun: vi.fn().mockResolvedValue({ runId: "run-1" }) } as any,
      structureRevisionRepo: { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { sections: [{ ref: "section-01" }] } }) } as any,
      snapshotRepo: snapshotRepo as any,
      activityIntentRepo: activityIntentRepo as any,
      materialStateRepo: materialStateRepo as any,
      fastifyOptions: { logger: false },
    });
    const duplicateUpload = multipart([
      { name: "week-1.txt", content: "BFS uses a FIFO queue.", materialId: 10 },
      { name: "week-1-copy.txt", content: "BFS uses a FIFO queue.", materialId: 11 },
    ]);
    const first = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/material-snapshots", ...duplicateUpload });
    expect(first.statusCode).toBe(201);
    expect(JSON.parse(first.body).planned_resources).toEqual([expect.objectContaining({ title: "week-1", filename: "week-1.txt", moodle_material_id: 10 })]);
    expect(snapshotRepo.saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ moodleMaterialId: 10 })] }));
    expect(snapshotRepo.saveSnapshot.mock.calls[0]?.[0]?.files).toHaveLength(1);
    expect(activityIntentRepo.markStaleForSection).toHaveBeenCalledWith("run-1", 1, "section-01");
    expect(materialStateRepo.markReady).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-1", structureRevision: 1, sectionRef: "section-01", snapshotRevision: 1 }));

    snapshotRepo.saveSnapshot.mockClear();
    activityIntentRepo.markStaleForSection.mockClear();
    const retry = multipart([{ name: "week-1.txt", content: "BFS uses a FIFO queue.", materialId: 10 }]);
    const second = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/material-snapshots", ...retry });
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).snapshot.reused).toBe(true);
    expect(JSON.parse(second.body).snapshot.revision).toBe(1);
    expect(snapshotRepo.saveSnapshot).not.toHaveBeenCalled();
    expect(activityIntentRepo.markStaleForSection).not.toHaveBeenCalled();
    await app.close();
  });

  it("reads back the latest authoritative MaterialSnapshot for reload without mutating state", async () => {
    const latest = {
      id: "snapshot-7", runId: "run-1", structureRevision: 1, sectionRef: "section-01", revision: 7,
      filesJson: [{ filename: "week-1.txt", sha256: "b".repeat(64), mediaType: "text/plain", byteSize: 20, extractionStatus: "success", extractedText: "BFS", extractor: "plain", moodleMaterialId: 10, useForGrounding: true, publishToCourse: true }],
      extractorVersion: "materials.v1", normalizedText: "BFS", normalizedTextHash: "c".repeat(64), estimatedTokens: 3, createdByMoodleUserId: 42, createdAt: "2026-09-21T00:00:00Z",
    };
    const snapshotRepo = { getLatestSnapshot: vi.fn().mockResolvedValue(latest), saveSnapshot: vi.fn() };
    const app = buildApp({
      config,
      runRepo: { getRun: vi.fn().mockResolvedValue({ runId: "run-1" }) } as any,
      structureRevisionRepo: { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { sections: [{ ref: "section-01" }] } }) } as any,
      snapshotRepo: snapshotRepo as any, activityIntentRepo: { markStaleForSection: vi.fn() } as any,
      materialStateRepo: { getState: vi.fn().mockResolvedValue({ status: "ready", snapshotId: "snapshot-7", snapshotRevision: 7, errorCode: null, errorMessage: null }), markReady: vi.fn(), markFailed: vi.fn() } as any,
      fastifyOptions: { logger: false },
    });
    const response = await app.inject({ method: "GET", url: "/api/runs/run-1/sections/section-01/material-snapshots/latest" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ run_id: "run-1", section_ref: "section-01", snapshot: { id: "snapshot-7", revision: 7, files: [{ filename: "week-1.txt" }] } });
    expect(snapshotRepo.saveSnapshot).not.toHaveBeenCalled();
    await app.close();
  });



  it("reads back authoritative Material failure state distinctly from fallback", async () => {
    const snapshotRepo = { getLatestSnapshot: vi.fn().mockResolvedValue(null), saveSnapshot: vi.fn() };
    const materialStateRepo = {
      getState: vi.fn().mockResolvedValue({ status: "failed", snapshotId: null, snapshotRevision: null, errorCode: "MATERIAL_EXTRACTION_FAILED", errorMessage: "No readable text" }),
      markReady: vi.fn(), markFailed: vi.fn(),
    };
    const app = buildApp({
      config,
      runRepo: { getRun: vi.fn().mockResolvedValue({ runId: "run-1" }) } as any,
      structureRevisionRepo: { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { sections: [{ ref: "section-01" }] } }) } as any,
      snapshotRepo: snapshotRepo as any,
      activityIntentRepo: { markStaleForSection: vi.fn() } as any,
      materialStateRepo: materialStateRepo as any,
      fastifyOptions: { logger: false },
    });
    const response = await app.inject({ method: "GET", url: "/api/runs/run-1/sections/section-01/material-snapshots/latest" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "failed", snapshot: null, error: { code: "MATERIAL_EXTRACTION_FAILED", message: "No readable text" } });
    await app.close();
  });

  it("persists a failed Material operation so reload can recover the failure state", async () => {
    const snapshotRepo = { getLatestSnapshot: vi.fn().mockResolvedValue(null), saveSnapshot: vi.fn() };
    const materialStateRepo = { getState: vi.fn().mockResolvedValue(null), markReady: vi.fn(), markFailed: vi.fn().mockResolvedValue({ status: "failed" }) };
    const app = buildApp({
      config,
      runRepo: { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning" }) } as any,
      structureRevisionRepo: { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { sections: [{ ref: "section-01" }] } }) } as any,
      snapshotRepo: snapshotRepo as any,
      activityIntentRepo: { markStaleForSection: vi.fn() } as any,
      materialStateRepo: materialStateRepo as any,
      fastifyOptions: { logger: false },
    });
    const upload = multipart([{ name: "empty.txt", content: "", materialId: 10 }]);
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/material-snapshots", ...upload });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("MATERIAL_EXTRACTION_FAILED");
    expect(materialStateRepo.markFailed).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-1", structureRevision: 1, sectionRef: "section-01", errorCode: "MATERIAL_EXTRACTION_FAILED",
    }));
    expect(snapshotRepo.saveSnapshot).not.toHaveBeenCalled();
    await app.close();
  });

  it("blocks a changed MaterialSnapshot after execution authority is frozen", async () => {
    const snapshotRepo = { getLatestSnapshot: vi.fn().mockResolvedValue(null), saveSnapshot: vi.fn() };
    const activityIntentRepo = { markStaleForSection: vi.fn() };
    const app = buildApp({
      config,
      runRepo: { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "completed" }) } as any,
      structureRevisionRepo: { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { sections: [{ ref: "section-01" }] } }) } as any,
      snapshotRepo: snapshotRepo as any, activityIntentRepo: activityIntentRepo as any,
      materialStateRepo: { getState: vi.fn().mockResolvedValue(null), markReady: vi.fn(), markFailed: vi.fn() } as any,
      fastifyOptions: { logger: false },
    });
    const upload = multipart([{ name: "week-1.txt", content: "Changed authority.", materialId: 10 }]);
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/sections/section-01/material-snapshots", ...upload });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("INSTRUCTIONAL_DESIGN_MUTATION_LOCKED");
    expect(snapshotRepo.saveSnapshot).not.toHaveBeenCalled();
    expect(activityIntentRepo.markStaleForSection).not.toHaveBeenCalled();
    await app.close();
  });
});
