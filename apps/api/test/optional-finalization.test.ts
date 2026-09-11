import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test-model" });
const normalizedSyllabus = {
  schema_version: "0.1" as const,
  metadata: { filename: "syllabus.md", media_type: "text/markdown", byte_size: 20, sha256: "a".repeat(64) },
  course_title: "CS",
  learning_objectives: [],
  schedule_or_topics: [{ week_or_unit: "Week 1", title: "Recursion", topics: [], source: { kind: "line" as const, start_line: 1, end_line: 1 } }],
  raw_text: "Week 1 Recursion",
};

const structure = {
  id: "structure-1", runId: "run-1", revision: 1, title: "CS Structure", summary: "CS", validationStatus: "valid" as const, validationErrors: null,
  sealedAt: "2026-09-07T00:00:00Z", sealedByMoodleUserId: 7, createdAt: "2026-09-07T00:00:00Z", teacherConstraintsJson: { activityRules: [], warnings: [] },
  contentJson: { course: { title: "CS" }, sections: [{ ref: "section-01", position: 1, title: "Week 1", summary: "Recursion", source_refs: [{ source: "syllabus.md", section: "lines 1-1" }], activity_intents: [] }] },
};

function reverseObjectKeyOrder(value: any): any {
  if (Array.isArray(value)) return value.map(reverseObjectKeyOrder);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).reverse().map((key) => [key, reverseObjectKeyOrder(value[key])]),
  );
}

function baseRepos(intents: any[]) {
  const saved: any[] = [];
  return {
    saved,
    runRepo: {
      getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning", model: "test-model", normalizedSyllabus }),
      updateStatus: vi.fn().mockResolvedValue({ runId: "run-1", status: "preview" }),
    },
    structureRepo: { getSealedRevision: vi.fn().mockResolvedValue(structure) },
    intentRepo: { list: vi.fn().mockResolvedValue(intents) },
    snapshotRepo: { getSnapshot: vi.fn().mockResolvedValue(null), getLatestSnapshot: vi.fn().mockResolvedValue(null) },
    planRepo: {
      listRunPlans: vi.fn().mockImplementation(async () => [...saved].reverse()),
      getLatestRevision: vi.fn().mockImplementation(async (planId: string) => {
        const plan = [...saved].reverse().find((candidate) => candidate.planId === planId);
        if (!plan) return null;
        return { ...plan, rawEnvelope: reverseObjectKeyOrder(plan.rawEnvelope), reviewRequirements: reverseObjectKeyOrder(plan.reviewRequirements) };
      }),
      savePlanRevision: vi.fn().mockImplementation(async (input: any) => {
        const record = { ...input, planId: input.planId, revision: input.revision, rawEnvelope: input.rawEnvelope, reviewRequirements: input.reviewRequirements ?? [] };
        saved.push(record);
        return record;
      }),
    },
  };
}

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: "intent-1", runId: "run-1", structureRevision: 1, sectionRef: "section-01", activityRef: "assignment-01", activityType: "assignment",
    status: "generated", attemptCount: 1, maxAttempts: 2, optionsJson: { title: "Assignment: Week 1", grade: 100 },
    groundingMode: "SYLLABUS_SCOPED_AI", materialSnapshotId: null, reviewRequired: true, shellConfirmedAt: null,
    contentJson: { ref: "assignment-01", type: "assignment", title: "Assignment: Week 1", description: "Practice recursion", instructions: ["Solve one task"], learning_objectives: ["Apply recursion"], grade: 100, source_refs: [{ source: "syllabus.md", section: "lines 1-1" }] },
    generationInstruction: null, error: null, createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z",
    ...overrides,
  };
}

describe("Optional Activity Finalization — ADR-0002", () => {
  it("finalizes a structure-only CoursePlan when no Activity was selected", async () => {
    const repos = baseRepos([]);
    const app = buildApp({ config, runRepo: repos.runRepo as any, structureRevisionRepo: repos.structureRepo as any, activityIntentRepo: repos.intentRepo as any, snapshotRepo: repos.snapshotRepo as any, planRepo: repos.planRepo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });
    expect(response.statusCode).toBe(201);
    expect(repos.saved[0].rawEnvelope.content.sections[0].activities).toEqual([]);
    expect(repos.saved[0].reviewRequirements).toEqual([]);
    expect(repos.runRepo.updateStatus).toHaveBeenCalledWith("run-1", "preview");
    await app.close();
  });

  it("blocks Finalization while a selected Activity has no terminal result", async () => {
    const repos = baseRepos([intent({ status: "selected", groundingMode: null, reviewRequired: false, contentJson: null, attemptCount: 0 })]);
    const app = buildApp({ config, runRepo: repos.runRepo as any, structureRevisionRepo: repos.structureRepo as any, activityIntentRepo: repos.intentRepo as any, snapshotRepo: repos.snapshotRepo as any, planRepo: repos.planRepo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(JSON.parse(response.body).error.code).toBe("COURSE_NOT_READY_FOR_FINALIZATION");
    expect(repos.planRepo.savePlanRevision).not.toHaveBeenCalled();
    await app.close();
  });

  it("persists a revision-scoped AI review requirement for syllabus-scoped AI content", async () => {
    const repos = baseRepos([intent()]);
    const app = buildApp({ config, runRepo: repos.runRepo as any, structureRevisionRepo: repos.structureRepo as any, activityIntentRepo: repos.intentRepo as any, snapshotRepo: repos.snapshotRepo as any, planRepo: repos.planRepo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });
    expect(response.statusCode).toBe(201);
    expect(repos.saved[0].reviewRequirements).toEqual([{ code: "AI_EXPANDED_CONTENT", activity_ref: "assignment-01" }]);
    expect(repos.saved[0].rawEnvelope.warnings.join(" ")).toMatch(/Teacher Review Required/);
    await app.close();
  });

  it("allows a confirmed Empty Activity Shell and keeps its warning without AI review requirement", async () => {
    const shell = intent({
      status: "shell", groundingMode: "INSUFFICIENT_EVIDENCE", reviewRequired: false, shellConfirmedAt: "2026-09-07T01:00:00Z",
      contentJson: { ref: "assignment-01", type: "assignment", title: "Assignment: Week 1", description: "Content pending teacher input.", instructions: ["To be provided by teacher."], learning_objectives: ["To be provided by teacher."], grade: 100, source_refs: [] },
    });
    const repos = baseRepos([shell]);
    const app = buildApp({ config, runRepo: repos.runRepo as any, structureRevisionRepo: repos.structureRepo as any, activityIntentRepo: repos.intentRepo as any, snapshotRepo: repos.snapshotRepo as any, planRepo: repos.planRepo as any, fastifyOptions: { logger: false } });
    const response = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });
    expect(response.statusCode).toBe(201);
    expect(repos.saved[0].reviewRequirements).toEqual([]);
    expect(repos.saved[0].rawEnvelope.warnings.join(" ")).toMatch(/Empty Activity Shell/);
    await app.close();
  });
  it("reuses an unchanged Final CoursePlan even when JSONB key order changes, and creates Revision N+1 after Activity content changes", async () => {
    const selected = intent();
    const repos = baseRepos([selected]);
    const app = buildApp({ config, runRepo: repos.runRepo as any, structureRevisionRepo: repos.structureRepo as any, activityIntentRepo: repos.intentRepo as any, snapshotRepo: repos.snapshotRepo as any, planRepo: repos.planRepo as any, fastifyOptions: { logger: false } });

    const first = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });
    expect(first.statusCode).toBe(201);
    expect(repos.saved[0].revision).toBe(1);
    const planId = repos.saved[0].planId;

    const unchanged = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });
    expect(unchanged.statusCode).toBe(200);
    expect(JSON.parse(unchanged.body).reused).toBe(true);
    expect(repos.saved).toHaveLength(1);

    selected.contentJson = { ...selected.contentJson, description: "Revised recursion practice" };
    const revised = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });
    expect(revised.statusCode).toBe(201);
    expect(repos.saved).toHaveLength(2);
    expect(repos.saved[1].planId).toBe(planId);
    expect(repos.saved[1].revision).toBe(2);
    expect(repos.saved[1].rawEnvelope.revision).toBe(2);
    await app.close();
  });

  it("removes a planned File Resource from the finalized plan without deleting its MaterialSnapshot", async () => {
    const repos = baseRepos([]);
    const run = { runId: "run-1", status: "planning", model: "test-model", normalizedSyllabus, syllabusMetadata: {} as Record<string, unknown> };
    repos.runRepo.getRun = vi.fn().mockResolvedValue(run);
    repos.runRepo.setResourcePublication = vi.fn().mockImplementation(async (_runId: string, sectionRef: string, publish: boolean) => {
      const publication = (run.syllabusMetadata.resource_publication as Record<string, boolean> | undefined) ?? {};
      run.syllabusMetadata.resource_publication = { ...publication, [sectionRef]: publish };
      return { ...run };
    });
    const snapshot = {
      id: "snapshot-1", runId: "run-1", structureRevision: 1, sectionRef: "section-01", revision: 1,
      filesJson: [{ moodleMaterialId: 77, filename: "Week_01_Material.pdf", publishToCourse: true, useForGrounding: true, extractionStatus: "success" }],
    };
    repos.snapshotRepo.getLatestSnapshot = vi.fn().mockResolvedValue(snapshot);
    const app = buildApp({ config, runRepo: repos.runRepo as any, structureRevisionRepo: repos.structureRepo as any, activityIntentRepo: repos.intentRepo as any, snapshotRepo: repos.snapshotRepo as any, planRepo: repos.planRepo as any, fastifyOptions: { logger: false } });

    const remove = await app.inject({ method: "PUT", url: "/api/runs/run-1/sections/section-01/resource-publication", payload: { publish: false } });
    expect(remove.statusCode).toBe(200);
    expect(JSON.parse(remove.body).publish).toBe(false);

    const finalized = await app.inject({ method: "POST", url: "/api/runs/run-1/plans/course/finalize" });
    expect(finalized.statusCode).toBe(201);
    expect(repos.saved[0].rawEnvelope.content.sections[0].resources).toEqual([]);
    expect(repos.snapshotRepo.getLatestSnapshot).toHaveBeenCalled();
    await app.close();
  });

});
