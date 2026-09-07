import type {
  AnyPlanEnvelope,
  ExecutionRequest,
} from "@moodle-agent-poc/contracts";
import { describe, expect, it } from "vitest";
import { assertExecutionTargetCompatible } from "../src/domain/execution-compatibility.js";
import { PlanningError } from "../src/errors/planning-errors.js";

describe("Execution Compatibility Matrix (T0606)", () => {
  it("accepts valid course/create with category_id", () => {
    const plan: AnyPlanEnvelope = {
      schema_version: "0.1",
      plan_id: "11111111-1111-1111-1111-111111111111",
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Title",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {},
    };
    const req: ExecutionRequest = {
      plan_id: plan.plan_id,
      revision: 1,
      target: { category_id: 10 },
    };

    expect(() => assertExecutionTargetCompatible(plan, req)).not.toThrow();
  });

  it("rejects course/create with missing or non-positive category_id", () => {
    const plan: AnyPlanEnvelope = {
      schema_version: "0.1",
      plan_id: "11111111-1111-1111-1111-111111111111",
      revision: 1,
      plan_type: "course",
      operation: "create",
      title: "Title",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {},
    };
    const req: ExecutionRequest = {
      plan_id: plan.plan_id,
      revision: 1,
      target: { category_id: 0 } as any,
    };

    expect(() => assertExecutionTargetCompatible(plan, req)).toThrow(PlanningError);
  });

  it("accepts valid assignment/create with course_id and section_id", () => {
    const plan: AnyPlanEnvelope = {
      schema_version: "0.1",
      plan_id: "22222222-2222-2222-2222-222222222222",
      revision: 1,
      plan_type: "assignment",
      operation: "create",
      title: "Title",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {},
    };
    const req: ExecutionRequest = {
      plan_id: plan.plan_id,
      revision: 1,
      target: { course_id: 100, section_id: 2 },
    };

    expect(() => assertExecutionTargetCompatible(plan, req)).not.toThrow();
  });

  it("accepts valid assignment/update with course_id, section_id, and activity_id", () => {
    const plan: AnyPlanEnvelope = {
      schema_version: "0.1",
      plan_id: "22222222-2222-2222-2222-222222222222",
      revision: 1,
      plan_type: "assignment",
      operation: "update",
      title: "Title",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {},
    };
    const req: ExecutionRequest = {
      plan_id: plan.plan_id,
      revision: 1,
      target: { course_id: 100, section_id: 2, activity_id: 55 },
    };

    expect(() => assertExecutionTargetCompatible(plan, req)).not.toThrow();
  });

  it("rejects assignment/update with missing activity_id", () => {
    const plan: AnyPlanEnvelope = {
      schema_version: "0.1",
      plan_id: "22222222-2222-2222-2222-222222222222",
      revision: 1,
      plan_type: "assignment",
      operation: "update",
      title: "Title",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {},
    };
    const req: ExecutionRequest = {
      plan_id: plan.plan_id,
      revision: 1,
      target: { course_id: 100, section_id: 2 } as any,
    };

    expect(() => assertExecutionTargetCompatible(plan, req)).toThrow(PlanningError);
  });

  it("accepts valid quiz/create with course_id and section_id", () => {
    const plan: AnyPlanEnvelope = {
      schema_version: "0.1",
      plan_id: "33333333-3333-3333-3333-333333333333",
      revision: 1,
      plan_type: "quiz",
      operation: "create",
      title: "Title",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {},
    };
    const req: ExecutionRequest = {
      plan_id: plan.plan_id,
      revision: 1,
      target: { course_id: 100, section_id: 5 },
    };

    expect(() => assertExecutionTargetCompatible(plan, req)).not.toThrow();
  });

  it("accepts valid quiz/update with course_id, section_id, and quiz_id", () => {
    const plan: AnyPlanEnvelope = {
      schema_version: "0.1",
      plan_id: "33333333-3333-3333-3333-333333333333",
      revision: 2,
      plan_type: "quiz",
      operation: "update",
      title: "Title",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {},
    };
    const req: ExecutionRequest = {
      plan_id: plan.plan_id,
      revision: 2,
      target: { course_id: 100, section_id: 5, quiz_id: 88 },
    };

    expect(() => assertExecutionTargetCompatible(plan, req)).not.toThrow();
  });

  it("rejects quiz/update with missing quiz_id", () => {
    const plan: AnyPlanEnvelope = {
      schema_version: "0.1",
      plan_id: "33333333-3333-3333-3333-333333333333",
      revision: 2,
      plan_type: "quiz",
      operation: "update",
      title: "Title",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {},
    };
    const req: ExecutionRequest = {
      plan_id: plan.plan_id,
      revision: 2,
      target: { course_id: 100, section_id: 5 } as any,
    };

    expect(() => assertExecutionTargetCompatible(plan, req)).toThrow(PlanningError);
  });

  it("rejects unsupported course/update operation with PLAN_DOMAIN_INVALID", () => {
    const plan: AnyPlanEnvelope = {
      schema_version: "0.1",
      plan_id: "11111111-1111-1111-1111-111111111111",
      revision: 1,
      plan_type: "course",
      operation: "update",
      title: "Title",
      summary: "Summary",
      warnings: [],
      assumptions: [],
      content: {},
    };
    const req: ExecutionRequest = {
      plan_id: plan.plan_id,
      revision: 1,
      target: { category_id: 10 } as any,
    };

    expect(() => assertExecutionTargetCompatible(plan, req)).toThrowError(
      /Course update operation is not supported/
    );
  });
});
