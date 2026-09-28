import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";
import { loadConfig } from "../src/config/config-loader.js";
import { registerErrorHandler } from "../src/plugins/error-handler.js";
import { instructionalDesignRoutes } from "../src/routes/instructional-design.js";

const config = loadConfig({ DATABASE_URL: "postgresql://unused/unused", OLLAMA_MODEL: "test", INSTRUCTIONAL_DESIGN_SERVICE_KEY: "test-key" });

const context: CoreCourseDesignContext = {
  schema_version: "0.1",
  policy_version: "instructional-design.v0.1",
  revision: 2,
  run_id: "run-1",
  source_syllabus: { normalized_syllabus_version: "0.1", filename: "syllabus.md", sha256: "a".repeat(64), text_sha256: "b".repeat(64) },
  course: {},
  learner_context: { revision: 1, status: "UNSPECIFIED", target_learners: [], education_level: [], year_level: [], prerequisites: [], prior_knowledge: [], teacher_acknowledged_unspecified: false },
  learning_objectives: [],
  source_learning_outcomes: [{ source_outcome_id: "source-outcome-1", source_text: "Explain classes", source_refs: [], measurable_status: "MEASURABLE", review_required: false }],
  approved_learning_outcomes: [{ outcome_id: "outcome-1", text: "Explain classes", source_outcome_ids: ["source-outcome-1"], source_refs: [], approval_origin: "SOURCE_AS_IS", approved_by_teacher: true, revision: 2 }],
  schedule_or_topics: [], assessment_requirements: [], grading_policy: [], constraints: [], missing_information: [],
  provenance: { extractor_version: "test", location_basis: "NORMALIZED_RAW_TEXT_LINES" },
};

function fixture() {
  let current = context;
  const runRepo = {
    getRun: vi.fn().mockResolvedValue({ runId: "run-1", status: "planning" }),
    getCoreCourseDesignContext: vi.fn().mockImplementation(async () => current),
    saveCoreCourseDesignContextRevision: vi.fn().mockImplementation(async (next: CoreCourseDesignContext) => { current = next; }),
  };
  const candidateRepo = { invalidateApprovedForOutcome: vi.fn().mockResolvedValue(1) };
  const structureRepo = { markAlignmentStale: vi.fn(), getLatestRevision: vi.fn().mockResolvedValue(null), getSealedRevision: vi.fn().mockResolvedValue({ revision: 4 }) };
  const activityIntentRepo = { markStaleForContext: vi.fn().mockResolvedValue(2) };
  return { runRepo, candidateRepo, structureRepo, activityIntentRepo, current: () => current };
}

async function createApp(repos: ReturnType<typeof fixture>) {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.register(instructionalDesignRoutes, {
    config,
    runRepo: repos.runRepo as any,
    candidateRepo: repos.candidateRepo as any,
    structureRevisionRepo: repos.structureRepo as any,
    activityIntentRepo: repos.activityIntentRepo as any,
  });
  await app.ready();
  return app;
}

const request = {
  method: "POST" as const,
  url: "/api/runs/run-1/outcomes/approve",
  headers: { "x-agentpoc-instructional-design-key": "test-key" },
  payload: { source_outcome_id: "source-outcome-1", teacher_text: "Design and implement classes", recommended_text: "Explain classes", teacher_id: 7 },
};

describe("Outcome revision invalidates dependent Competency approval", () => {
  it("returns dependent approved Candidates to review before publishing the changed Outcome wording", async () => {
    const repos = fixture();
    const app = await createApp(repos);
    const response = await app.inject(request);

    expect(response.statusCode).toBe(200);
    expect(response.json().core_context.approved_learning_outcomes[0].text).toBe("Design and implement classes");
    expect(repos.candidateRepo.invalidateApprovedForOutcome).toHaveBeenCalledWith("run-1", "outcome-1");
    expect(repos.candidateRepo.invalidateApprovedForOutcome.mock.invocationCallOrder[0]).toBeLessThan(
      repos.runRepo.saveCoreCourseDesignContextRevision.mock.invocationCallOrder[0]!,
    );
    expect(repos.activityIntentRepo.markStaleForContext).toHaveBeenCalledWith("run-1", 4, 3);
    expect(repos.activityIntentRepo.markStaleForContext.mock.invocationCallOrder[0]).toBeLessThan(
      repos.runRepo.saveCoreCourseDesignContextRevision.mock.invocationCallOrder[0]!,
    );
    expect(repos.structureRepo.markAlignmentStale).toHaveBeenCalledWith("run-1", 3);
    await app.close();
  });

  it("does not publish the new Core Context revision if dependent Candidate invalidation fails", async () => {
    const repos = fixture();
    repos.candidateRepo.invalidateApprovedForOutcome.mockRejectedValueOnce(new Error("candidate write failed"));
    const app = await createApp(repos);
    const response = await app.inject(request);

    expect(response.statusCode).toBe(500);
    expect(repos.runRepo.saveCoreCourseDesignContextRevision).not.toHaveBeenCalled();
    expect(repos.current().revision).toBe(2);
    expect(repos.structureRepo.markAlignmentStale).not.toHaveBeenCalled();
    await app.close();
  });
});
