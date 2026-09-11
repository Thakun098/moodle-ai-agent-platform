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
    const app = buildApp({
      config,
      runRepo: { getRun: vi.fn().mockResolvedValue({ runId: "run-1" }) } as any,
      structureRevisionRepo: { getSealedRevision: vi.fn().mockResolvedValue({ revision: 1, contentJson: { sections: [{ ref: "section-01" }] } }) } as any,
      snapshotRepo: snapshotRepo as any,
      activityIntentRepo: activityIntentRepo as any,
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
});
