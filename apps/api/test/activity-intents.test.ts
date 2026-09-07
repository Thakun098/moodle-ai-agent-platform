import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test-model" });

function makeRunRepo() {
  return { getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", model: "test-model" }) };
}

function makeStructureRepo() {
  return { getSealedRevision: vi.fn().mockResolvedValue({
    id: "structure-1", runId: "run-1", revision: 1, sealedAt: "2026-09-07T00:00:00Z",
    contentJson: { course: { title: "AI" }, sections: [{ ref: "section-01", position: 1, title: "Week 1: Search", summary: "Search", source_refs: [], activity_intents: [] }] },
  }) };
}

function makeIntentRepo() {
  const rows: any[] = [];
  return {
    rows,
    listSection: vi.fn().mockImplementation(async (_runId: string, revision: number, sectionRef: string) => rows.filter((r) => r.structureRevision === revision && r.sectionRef === sectionRef)),
    select: vi.fn().mockImplementation(async (input: any) => {
      const old = rows.find((r) => r.sectionRef === input.sectionRef && r.activityType === input.activityType);
      if (old) {
        if (old.status === "removed") Object.assign(old, input, { status: "selected", attemptCount: 0, reviewRequired: false });
        return old;
      }
      const row = { ...input, status: "selected", attemptCount: 0, groundingMode: null, materialSnapshotId: null, reviewRequired: false, shellConfirmedAt: null, error: null, updatedAt: "2026-09-07T00:00:00Z" };
      rows.push(row);
      return row;
    }),
    remove: vi.fn().mockImplementation(async (id: string) => { const row = rows.find((r) => r.id === id); if (!row || row.status === "creating") return false; row.status = "removed"; return true; }),
    getByRef: vi.fn().mockImplementation(async (_runId: string, revision: number, ref: string) => rows.find((r) => r.structureRevision === revision && r.activityRef === ref) ?? null),
  };
}

describe("Activity Intent API — ADR-0002", () => {
  it("selects Quiz and Assignment explicitly with deterministic defaults and no Material requirement", async () => {
    const repo = makeIntentRepo();
    const app = buildApp({ config, runRepo: makeRunRepo() as any, structureRevisionRepo: makeStructureRepo() as any, activityIntentRepo: repo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: true, assignment: true } });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.intents).toHaveLength(2);
    expect(body.intents.find((x: any) => x.activity_type === "quiz").options).toMatchObject({ question_count: 5, question_type: "multichoice", choices_per_question: 4, correct_choices_per_question: 1, default_mark: 1 });
    expect(body.intents.find((x: any) => x.activity_type === "assignment").options).toMatchObject({ grade: 100 });
    expect(body.intents.map((x: any) => x.activity_ref).sort()).toEqual(["assignment-01", "quiz-01"]);
    await app.close();
  });

  it("supports custom optional activity controls and partial selection", async () => {
    const repo = makeIntentRepo();
    const app = buildApp({ config, runRepo: makeRunRepo() as any, structureRevisionRepo: makeStructureRepo() as any, activityIntentRepo: repo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: true, quiz_options: { question_count: 8, choices_per_question: 3, question_type: "truefalse", title: "Checkpoint" } } });
    expect(response.statusCode).toBe(200);
    const intent = JSON.parse(response.body).intents[0];
    expect(intent.options).toMatchObject({ title: "Checkpoint", question_count: 8, question_type: "truefalse", choices_per_question: 3 });
    expect(intent.max_attempts).toBe(2);
    await app.close();
  });

  it("deselects only the requested Activity Intent and allows the sibling to remain", async () => {
    const repo = makeIntentRepo();
    const app = buildApp({ config, runRepo: makeRunRepo() as any, structureRevisionRepo: makeStructureRepo() as any, activityIntentRepo: repo as any, fastifyOptions: { logger: false } });
    await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: true, assignment: true } });
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: false } });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).intents.map((x: any) => x.activity_type)).toEqual(["assignment"]);
    await app.close();
  });

  it("requires a sealed Structure before selection", async () => {
    const structureRepo = { getSealedRevision: vi.fn().mockResolvedValue(null) };
    const app = buildApp({ config, runRepo: makeRunRepo() as any, structureRevisionRepo: structureRepo as any, activityIntentRepo: makeIntentRepo() as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/activity-intents", payload: { quiz: true } });
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe("STRUCTURE_NOT_SEALED");
    await app.close();
  });
});
