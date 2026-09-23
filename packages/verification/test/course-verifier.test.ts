import { describe, expect, it, vi } from "vitest";
import type { CoursePlanEnvelope } from "@moodle-agent-poc/contracts";
import { verifyCoursePlan } from "../src/course-verifier.js";

const plan: CoursePlanEnvelope = {
  schema_version: "0.1", plan_id: "plan-v", revision: 1, plan_type: "course", operation: "create",
  title: "Verify", summary: "Verify", warnings: [], assumptions: [],
  content: {
    course: { title: "Verify Course", course_code: "VER101" },
    sections: [{
      ref: "section-01", position: 1, title: "Week 1", source_refs: [], activities: [
        { ref: "assignment-01", type: "assignment", title: "A1", description: "Desc", instructions: ["Do it"], learning_objectives: ["Learn"], grade: 10, source_refs: [] },
        { ref: "quiz-01", type: "quiz", title: "Q1", description: "Quiz desc", source_refs: [], questions: [
          { ref: "question-01", type: "truefalse", question: "Sky blue?", correct_answer: true, feedback: "Yes", default_mark: 1, source_refs: [] }
        ] }
      ]
    }]
  }
};

const resourcePlan: CoursePlanEnvelope = {
  ...plan,
  content: {
    ...plan.content,
    sections: [{
      ...plan.content.sections[0],
      resources: [{ ref: "resource-01-01", type: "resource", title: "Week 1 Material", filename: "week-1.md", moodle_material_id: 77, source_run_id: "run-v", source_structure_revision: 1, source_section_ref: "section-01", source_material_revision: 1, source_refs: [] }],
    }],
  },
};

function repos() {
  const verificationRepo = { recordVerification: vi.fn(async (x) => x) };
  const runRepo = { completeRun: vi.fn(async () => ({})), failRun: vi.fn(async () => ({})) };
  const mappingRepo = { listRunMappings: vi.fn(async () => [
    { localRef: "course", moodleId: 10 }, { localRef: "section-01", moodleId: 20 },
    { localRef: "assignment-01", moodleId: 30 }, { localRef: "quiz-01", moodleId: 40 },
    { localRef: "question-01", moodleId: 50 },
  ]) };
  return { verificationRepo, runRepo, mappingRepo } as any;
}

function manager(courseName = "Verify Course") {
  return {
    discoverTools: vi.fn(async () => []),
    callTool: vi.fn(async (name: string) => {
      if (name === "moodle_get_course_structure") return { status: "success", data: {
        course: { id: 10, category_id: 1, visible: 0, fullname: courseName },
        sections: [{ section_id: 20, section_num: 1, name: "Week 1", activities: [
          { activity_id: 30, module_name: "assign", name: "A1", intro: "Desc\n\nInstructions:\n1. Do it\n\nLearning Objectives:\n- Learn", grade: 10 },
          { activity_id: 40, module_name: "quiz", name: "Q1", intro: "Quiz desc", grade: 100 },
        ] }]
      } };
      return { status: "success", data: [{ question_bank_entry_id: 50, qtype: "truefalse", question_text: "Sky blue?", default_mark: 1, max_mark: 1, general_feedback: "Yes", answers: [{ text: "True", fraction: 1 }, { text: "False", fraction: 0 }] }] };
    })
  } as any;
}

function resourceRepos() {
  const value = repos();
  value.mappingRepo.listRunMappings = vi.fn(async () => [
    ...(await repos().mappingRepo.listRunMappings()),
    { localRef: "resource-01-01", moodleId: 60, moodleMetadata: { filename: "week-1.md" } },
  ]);
  return value;
}

function resourceManager(includeFiles: boolean) {
  const base = manager();
  base.callTool = vi.fn(async (name: string) => {
    if (name === "moodle_get_course_structure") return { status: "success", data: {
      course: { id: 10, category_id: 1, visible: 0, fullname: "Verify Course" },
      sections: [{ section_id: 20, section_num: 1, name: "Week 1", activities: [
        { activity_id: 30, module_name: "assign", name: "A1", intro: "Desc\n\nInstructions:\n1. Do it\n\nLearning Objectives:\n- Learn", grade: 10 },
        { activity_id: 40, module_name: "quiz", name: "Q1", intro: "Quiz desc", grade: 100 },
        { activity_id: 60, module_name: "resource", name: "Week 1 Material", intro: "", grade: 0, ...(includeFiles ? { files: ["week-1.md"] } : {}) },
      ] }],
    } };
    return { status: "success", data: [{ question_bank_entry_id: 50, qtype: "truefalse", question_text: "Sky blue?", default_mark: 1, max_mark: 1, general_feedback: "Yes", answers: [{ text: "True", fraction: 1 }, { text: "False", fraction: 0 }] }] };
  });
  return base;
}

describe("Phase 14 course verifier", () => {
  it("passes deterministic course read-back and completes run", async () => {
    const r = repos();
    const result = await verifyCoursePlan({ runId: "run-v", categoryId: 1, planEnvelope: plan, mcpClientManager: manager(), repositories: r });
    expect(result).toEqual({ plan_id: "plan-v", revision: 1, passed: true, issues: [] });
    expect(r.verificationRepo.recordVerification).toHaveBeenCalledOnce();
    expect(r.runRepo.completeRun).toHaveBeenCalledOnce();
    expect(r.runRepo.failRun).not.toHaveBeenCalled();
  });

  it("records deterministic mismatch and fails run", async () => {
    const r = repos();
    const result = await verifyCoursePlan({ runId: "run-v", categoryId: 1, planEnvelope: plan, mcpClientManager: manager("Wrong"), repositories: r });
    expect(result.passed).toBe(false);
    if (!result.passed) expect(result.issues.some((x) => x.path === "/course/fullname")).toBe(true);
    expect(r.runRepo.failRun).toHaveBeenCalledOnce();
  });

  it("does not trust create-resource mapping metadata when Moodle file read-back is absent", async () => {
    const result = await verifyCoursePlan({ runId: "run-v", categoryId: 1, planEnvelope: resourcePlan, mcpClientManager: resourceManager(false), repositories: resourceRepos() });
    expect(result.passed).toBe(false);
    if (!result.passed) expect(result.issues.some((issue) => issue.path.endsWith("/filename"))).toBe(true);
  });

  it("passes File Resource verification only when Moodle read-back contains the expected filename", async () => {
    const result = await verifyCoursePlan({ runId: "run-v", categoryId: 1, planEnvelope: resourcePlan, mcpClientManager: resourceManager(true), repositories: resourceRepos() });
    expect(result.passed).toBe(true);
  });
});


describe("Ticket 24 native Competency verification", () => {
  const snapshot = {
    runId: "run-v", planId: "plan-v", revision: 1, mappingReviewRevision: 4, frameworkId: 7, capturedAt: "2026-09-16T00:00:00.000Z",
    competencies: [{ candidateId: "competency-1", competencyRevision: 2, name: "Design classes", description: "Design", outcomeIds: ["o1"], idnumber: "AGENTPOC-C1" }],
    mappings: [{ activityIntentId: "intent-1", activityRef: "assignment-01", competencyId: "competency-1", intentRevision: 1, activityRevision: 1, competencyRevision: 2, evidence: "CONFIRMED" as const }],
  };

  function competencyRepos() {
    const r = repos();
    const ids: Record<string, number> = { course: 10, "section-01": 20, "assignment-01": 30, "quiz-01": 40, "question-01": 50, "competency:competency-1": 90 };
    r.mappingRepo.findMoodleIdByLocalRef = vi.fn(async (_runId: string, _planId: string, _revision: number, ref: string) => ids[ref] ?? null);
    return r;
  }

  function competencyManager(ruleOutcome: number, includeCompetency = true, description = "Design", extraCompetencies: any[] = [], extraLinks: any[] = []) {
    const base = manager();
    const original = base.callTool;
    base.callTool = vi.fn(async (name: string, args: any) => {
      if (name === "moodle_get_course_competencies") return { status: "success", data: {
        course_id: 10,
        course_competencies: includeCompetency ? [{ course_link_id: 901, competency_id: 90, framework_id: 7, idnumber: "AGENTPOC-C1", shortname: "Design classes", description }, ...extraCompetencies] : extraCompetencies,
        activity_links: includeCompetency ? [{ link_id: 902, activity_id: 30, competency_id: 90, rule_outcome: ruleOutcome }, ...extraLinks] : extraLinks,
      } };
      return original(name, args);
    });
    return base;
  }

  it("passes only when native Course Competency identity and evidence rule exactly match the approved snapshot", async () => {
    const result = await verifyCoursePlan({ runId: "run-v", categoryId: 1, planEnvelope: plan, mcpClientManager: competencyManager(1), repositories: competencyRepos(), competencySnapshot: snapshot, competencyFrameworkId: 8 });
    expect(result.passed).toBe(true);
  });

  it("rejects changed native Competency description even when identity and links still match", async () => {
    const result = await verifyCoursePlan({ runId: "run-v", categoryId: 1, planEnvelope: plan, mcpClientManager: competencyManager(1, true, "Different description"), repositories: competencyRepos(), competencySnapshot: snapshot, competencyFrameworkId: 8 });
    expect(result.passed).toBe(false);
    if (!result.passed) expect(result.issues.some((entry) => entry.path === "/competencies/course")).toBe(true);
  });

  it("rejects extra Course Competencies and activity links even outside the pinned framework", async () => {
    const extra = { course_link_id: 903, competency_id: 91, framework_id: 8, idnumber: "OTHER", shortname: "Extra", description: "Extra" };
    const result = await verifyCoursePlan({ runId: "run-v", categoryId: 1, planEnvelope: plan, mcpClientManager: competencyManager(1, true, "Design", [extra], [{ link_id: 904, activity_id: 30, competency_id: 91, rule_outcome: 0 }]), repositories: competencyRepos(), competencySnapshot: snapshot, competencyFrameworkId: 8 });
    expect(result.passed).toBe(false);
    if (!result.passed) expect(result.issues.some((entry) => entry.path === "/competencies/course" || entry.path === "/competencies/activity-links")).toBe(true);
  });

  it("verifies explicit empty authority and rejects any native Course Competency", async () => {
    const empty = { ...snapshot, competencies: [], mappings: [] };
    const extra = { course_link_id: 903, competency_id: 91, framework_id: 8, idnumber: "OTHER", shortname: "Extra", description: "Extra" };
    const result = await verifyCoursePlan({ runId: "run-v", categoryId: 1, planEnvelope: plan, mcpClientManager: competencyManager(1, false, "Design", [extra]), repositories: competencyRepos(), competencySnapshot: empty, competencyFrameworkId: 7 });
    expect(result.passed).toBe(false);
    if (!result.passed) expect(result.issues.some((entry) => entry.path === "/competencies/course")).toBe(true);
  });
  it("fails when Moodle readback silently changes evidence behavior", async () => {
    const result = await verifyCoursePlan({ runId: "run-v", categoryId: 1, planEnvelope: plan, mcpClientManager: competencyManager(0), repositories: competencyRepos(), competencySnapshot: snapshot, competencyFrameworkId: 8 });
    expect(result.passed).toBe(false);
    if (!result.passed) expect(result.issues.some((entry) => entry.path === "/competencies/activity-links")).toBe(true);
  });
});
