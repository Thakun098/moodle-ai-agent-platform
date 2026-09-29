import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test-model" });

const syllabus = {
  schema_version: "0.1" as const,
  metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 20, sha256: "a".repeat(64) },
  course_title: "AI",
  learning_objectives: ["Explain search"],
  schedule_or_topics: [{ week_or_unit: "Week 1", title: "Search", topics: ["BFS"], source: { kind: "line" as const, start_line: 1, end_line: 2 } }],
  raw_text: "Week 1 Search",
};

function makeRunRepo(normalizedSyllabus: typeof syllabus | any = syllabus) {
  const run = { runId: "run-1", status: "pending", normalizedSyllabus, model: "test-model" };
  return {
    getRun: vi.fn().mockResolvedValue(run),
    updateStatus: vi.fn().mockImplementation(async (_runId: string, status: string) => ({ ...run, status })),
    failRun: vi.fn(),
  };
}

function makeStructureRepo() {
  const revisions: any[] = [];
  return {
    revisions,
    getLatestRevision: vi.fn().mockImplementation(async () => revisions[revisions.length - 1] ?? null),
    getSealedRevision: vi.fn().mockImplementation(async () => [...revisions].reverse().find((item) => item.sealedAt) ?? null),
    getRevision: vi.fn().mockImplementation(async (_runId: string, revision: number) => revisions.find((item) => item.revision === revision) ?? null),
    listRevisions: vi.fn().mockImplementation(async () => [...revisions].reverse()),
    unsealRevisions: vi.fn().mockImplementation(async () => { for (const item of revisions) { item.sealedAt = null; item.sealedByMoodleUserId = null; } }),
    saveRevision: vi.fn().mockImplementation(async (input: any) => {
      const record = { ...input, contentJson: input.content, validationErrors: input.validationErrors ?? null, sealedAt: null, sealedByMoodleUserId: null, createdAt: input.createdAt ?? "2026-09-07T00:00:00.000Z" };
      revisions.push(record);
      return record;
    }),
    sealRevision: vi.fn().mockImplementation(async ({ revision, moodleUserId }: any) => {
      for (const item of revisions) { item.sealedAt = null; item.sealedByMoodleUserId = null; }
      const record = revisions.find((item) => item.revision === revision);
      record.sealedAt = "2026-09-07T01:00:00.000Z";
      record.sealedByMoodleUserId = moodleUserId ?? null;
      return record;
    }),
  };
}

function makePlanner() {
  return { plan: vi.fn().mockResolvedValue({
    title: "AI Structure",
    summary: "Structure summary",
    warnings: [],
    assumptions: [],
    content: { course: { title: "AI" }, sections: [{
      ref: "section-01", position: 1, title: "Week 1: Search", summary: "Search fundamentals",
      source_refs: [{ source: "syllabus.md", section: "Week 1" }],
      activityIntents: [{ ref: "quiz-model", type: "quiz", title: "Must be discarded", source_refs: [], origin: "syllabus" }],
    }] },
  }) };
}

describe("Course Structure API — ADR-0002", () => {
  it("generates an activity-free structure and treats activity language in Structure Notes as warning only", async () => {
    const runRepo = makeRunRepo();
    const structureRepo = makeStructureRepo();
    const planner = makePlanner();
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, structurePlanner: planner as any, fastifyOptions: { logger: false } });

    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure", payload: { teacher_instruction: "เน้น recursion และให้มี quiz ทุกสัปดาห์" } });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.structure_revision.content.sections[0].activity_intents).toEqual([]);
    expect(body.structure_revision.teacher_constraints.activityRules).toEqual([]);
    expect(body.structure_revision.teacher_constraints.originalInstruction).toContain("recursion");
    expect(body.structure_revision.teacher_constraints.warnings[0]).toMatch(/Activity Creation Step/);
    expect(planner.plan).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ activityRules: [] }), "test-model", expect.any(Number), "json");
    await app.close();
  });

  it("sanitizes legacy activity_intents from an edited Structure revision", async () => {
    const runRepo = makeRunRepo();
    const structureRepo = makeStructureRepo();
    const planner = makePlanner();
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, structurePlanner: planner as any, fastifyOptions: { logger: false } });
    expect((await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure" })).statusCode).toBe(201);

    const edited = await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure/revisions", payload: {
      edited_structure: {
        title: "Edited",
        summary: "Edited summary",
        content: { course: { title: "AI" }, sections: [{
          ref: "section-01", position: 1, title: "Week 1: Search", summary: "Edited search",
          source_refs: [{ source: "syllabus.md", section: "Week 1" }],
          activity_intents: [{ ref: "quiz-old", type: "quiz", title: "Old", source_refs: [], origin: "teacher_instruction" }],
        }] },
      },
    } });
    expect(edited.statusCode).toBe(201);
    expect(JSON.parse(edited.body).structure_revision.content.sections[0].activity_intents).toEqual([]);
    await app.close();
  });

  it("seals a valid structure and keeps the run in planning", async () => {
    const runRepo = makeRunRepo();
    const structureRepo = makeStructureRepo();
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, structurePlanner: makePlanner() as any, fastifyOptions: { logger: false } });
    expect((await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure" })).statusCode).toBe(201);
    const sealed = await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure/seal", payload: { revision: 1, moodle_user_id: 42 } });
    expect(sealed.statusCode).toBe(200);
    expect(JSON.parse(sealed.body).structure_revision.sealed_by_moodle_user_id).toBe(42);
    await app.close();
  });

  it("rejects initial structure generation when a revision already exists", async () => {
    const runRepo = makeRunRepo();
    const structureRepo = makeStructureRepo();
    structureRepo.revisions.push({ revision: 1 });
    const modelClient: ModelClient = { ping: vi.fn(), listModels: vi.fn(), chat: vi.fn() };
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, modelClient, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure" });
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe("CONFLICT");
    await app.close();
  });

  it("records a teacher-authorized syllabus coverage override when deleting a covered section and allows sealing", async () => {
    const threeWeekSyllabus = {
      ...syllabus,
      schedule_or_topics: [1, 2, 3].map((week) => ({
        week_or_unit: `สัปดาห์ที่ ${week}`,
        title: `Topic ${week}`,
        topics: [],
        source: { kind: "line" as const, start_line: week },
      })),
    };
    const runRepo = makeRunRepo(threeWeekSyllabus);
    const structureRepo = makeStructureRepo();
    structureRepo.revisions.push({
      id: "s1", runId: "run-1", revision: 1, title: "Structure", summary: "Full coverage", validationStatus: "valid", validationErrors: null,
      sealedAt: null, sealedByMoodleUserId: null, teacherConstraintsJson: { activityRules: [], warnings: [] }, createdAt: "2026-09-07T00:00:00.000Z",
      contentJson: {
        course: { title: "AI" },
        sections: [1, 2, 3].map((week) => ({
          ref: `section-0${week}`, position: week, title: `สัปดาห์ที่ ${week}: Topic ${week}`, summary: `Topic ${week}`,
          source_refs: [{ source: "syllabus.md", section: `สัปดาห์ที่ ${week}` }], activity_intents: [],
          aligned_objective_ids: [], aligned_outcome_ids: [], alignment_status: "CURRENT",
        })),
      },
    });
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, fastifyOptions: { logger: false } });

    const edited = await app.inject({
      method: "POST",
      url: "/api/runs/run-1/course-structure/revisions",
      payload: {
        edited_structure: {
          title: "Structure",
          summary: "Teacher removed Week 2",
          content: {
            course: { title: "AI" },
            sections: [
              { ...structureRepo.revisions[0].contentJson.sections[0], position: 1 },
              { ...structureRepo.revisions[0].contentJson.sections[2], position: 2 },
            ],
          },
        },
      },
    });

    expect(edited.statusCode).toBe(201);
    const revision = JSON.parse(edited.body).structure_revision;
    expect(revision.teacher_constraints.syllabus_coverage_overrides).toEqual([
      expect.objectContaining({ anchor: "สัปดาห์ที่ 2", acknowledged: true }),
    ]);

    const sealed = await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure/seal", payload: { revision: 2 } });
    expect(sealed.statusCode).toBe(200);
    await app.close();
  });

  it("does not auto-authorize coverage loss when no section was deleted", async () => {
    const threeWeekSyllabus = {
      ...syllabus,
      schedule_or_topics: [1, 2, 3].map((week) => ({
        week_or_unit: `สัปดาห์ที่ ${week}`,
        title: `Topic ${week}`,
        topics: [],
        source: { kind: "line" as const, start_line: week },
      })),
    };
    const runRepo = makeRunRepo(threeWeekSyllabus);
    const structureRepo = makeStructureRepo();
    structureRepo.revisions.push({
      id: "s1", runId: "run-1", revision: 1, title: "Structure", summary: "Full coverage", validationStatus: "valid", validationErrors: null,
      sealedAt: null, sealedByMoodleUserId: null, teacherConstraintsJson: { activityRules: [], warnings: [] }, createdAt: "2026-09-07T00:00:00.000Z",
      contentJson: {
        course: { title: "AI" },
        sections: [1, 2, 3].map((week) => ({
          ref: `section-0${week}`, position: week, title: `สัปดาห์ที่ ${week}: Topic ${week}`, summary: `Topic ${week}`,
          source_refs: [{ source: "syllabus.md", section: `สัปดาห์ที่ ${week}` }], activity_intents: [],
          aligned_objective_ids: [], aligned_outcome_ids: [], alignment_status: "CURRENT",
        })),
      },
    });
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, fastifyOptions: { logger: false } });

    const edited = await app.inject({
      method: "POST",
      url: "/api/runs/run-1/course-structure/revisions",
      payload: {
        edited_structure: {
          title: "Structure",
          summary: "Broken provenance",
          content: {
            course: { title: "AI" },
            sections: structureRepo.revisions[0].contentJson.sections.map((section: any) => ({
              ...section,
              title: "Generic topic",
              source_refs: [],
            })),
          },
        },
      },
    });

    expect(edited.statusCode).toBe(201);
    const revision = JSON.parse(edited.body).structure_revision;
    expect(revision.teacher_constraints.syllabus_coverage_overrides ?? []).toEqual([]);

    const sealed = await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure/seal", payload: { revision: 2 } });
    expect(sealed.statusCode).toBe(422);
    expect(JSON.parse(sealed.body).error.details.missingAnchors).toEqual(["สัปดาห์ที่ 1", "สัปดาห์ที่ 2", "สัปดาห์ที่ 3"]);
    await app.close();
  });

  it("rechecks coverage within the <=20-period boundary before sealing", async () => {
    const eightWeekSyllabus = { ...syllabus, schedule_or_topics: Array.from({ length: 8 }, (_, i) => ({ week_or_unit: `Week ${i + 1}`, title: `Topic ${i + 1}`, topics: [], source: { kind: "line" as const, start_line: i + 1 } })) };
    const runRepo = makeRunRepo(eightWeekSyllabus);
    const structureRepo = makeStructureRepo();
    structureRepo.revisions.push({
      id: "s1", runId: "run-1", revision: 1, title: "Incomplete", summary: "Missing Week 4", validationStatus: "valid", validationErrors: null,
      sealedAt: null, sealedByMoodleUserId: null, teacherConstraintsJson: { activityRules: [], warnings: [] }, createdAt: "2026-09-07T00:00:00.000Z",
      contentJson: { course: { title: "AI" }, sections: [1,2,3,5,6,7,8].map((w, i) => ({ ref: `section-${String(i + 1).padStart(2,"0")}`, position: i + 1, title: `Week ${w}`, summary: `Topic ${w}`, source_refs: [], activity_intents: [] })) },
    });
    const app = buildApp({ config, runRepo: runRepo as any, structureRevisionRepo: structureRepo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/course-structure/seal", payload: { revision: 1 } });
    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error.details.missingAnchors).toEqual(["Week 4"]);
    await app.close();
  });
});
