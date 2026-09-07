import { randomUUID } from "node:crypto";
import type { ModelClient } from "@moodle-agent-poc/agent-runtime";
import { describe, expect, it, vi } from "vitest";
import { PlanningError } from "../src/errors/planning-errors.js";
import { AssignmentPlanner } from "../src/planners/assignment-planner.js";
import type {
  AssignmentPlanningInput,
  AssignmentUpdateModelOutput,
} from "../src/types.js";

describe("AssignmentPlanner (T0509, R2)", () => {
  const sampleInput: AssignmentPlanningInput = {
    current: {
      ref: "assignment-01",
      title: "Algorithms Lab 1",
      description: "Implement sorting algorithms.",
      instructions: ["Submit python file."],
      learning_objectives: ["Understand algorithms"],
      grade: 50,
      source_refs: [{ source: "syllabus.md" }],
    },
    instruction: "Increase grade to 100 and add merge sort requirement.",
  };

  const validModelOutput: AssignmentUpdateModelOutput = {
    title: "Updated Sorting Lab",
    summary: "Increased grade weight and added merge sort.",
    warnings: [],
    assumptions: [],
    content: {
      ref: "assignment-01",
      type: "assignment",
      title: "Algorithms Lab 1 (Extended)",
      description: "Implement bubble sort and merge sort.",
      instructions: ["Submit python file.", "Include time complexity analysis."],
      learning_objectives: ["Understand algorithms", "Analyze time complexity"],
      grade: 100,
      source_refs: [{ source: "syllabus.md" }],
    },
  };

  it("plans assignment update generating valid AssignmentPlanEnvelope (operation=update)", async () => {
    const mockModelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        rawText: JSON.stringify(validModelOutput),
        message: { role: "assistant", content: JSON.stringify(validModelOutput) },
        toolCalls: [],
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const validPlanId = randomUUID();
    const planner = new AssignmentPlanner({ modelClient: mockModelClient });
    const envelope = await planner.planAssignmentUpdate({
      input: sampleInput,
      planId: validPlanId,
      revision: 2,
    });

    expect(envelope.schema_version).toBe("0.1");
    expect(envelope.plan_type).toBe("assignment");
    expect(envelope.operation).toBe("update");
    expect(envelope.plan_id).toBe(validPlanId);
    expect(envelope.revision).toBe(2);
    expect(envelope.content.grade).toBe(100);
    expect(envelope.content.instructions.length).toBe(2);
  });

  it("accepts source references grounded in input.source_context (R2)", async () => {
    const contextInput: AssignmentPlanningInput = {
      ...sampleInput,
      source_context: [{ source: "supplemental-reading.pdf", page: 5 }],
    };

    const outputWithContext: AssignmentUpdateModelOutput = {
      ...validModelOutput,
      content: {
        ...validModelOutput.content,
        source_refs: [{ source: "supplemental-reading.pdf", page: 5 }],
      },
    };

    const mockModelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        rawText: JSON.stringify(outputWithContext),
        message: { role: "assistant", content: JSON.stringify(outputWithContext) },
        toolCalls: [],
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const planner = new AssignmentPlanner({ modelClient: mockModelClient });
    const envelope = await planner.planAssignmentUpdate({
      input: contextInput,
      planId: randomUUID(),
      revision: 2,
    });

    expect(envelope.content.source_refs[0]?.source).toBe("supplemental-reading.pdf");
  });

  it("rejects ungrounded source references not in current state or source_context (R2)", async () => {
    const outputWithUngroundedSource: AssignmentUpdateModelOutput = {
      ...validModelOutput,
      content: {
        ...validModelOutput.content,
        source_refs: [{ source: "unauthorized-external.pdf" }],
      },
    };

    const mockModelClient: ModelClient = {
      chat: vi.fn().mockResolvedValue({
        rawText: JSON.stringify(outputWithUngroundedSource),
        message: { role: "assistant", content: JSON.stringify(outputWithUngroundedSource) },
        toolCalls: [],
      }),
      listModels: vi.fn(),
      ping: vi.fn(),
    };

    const planner = new AssignmentPlanner({ modelClient: mockModelClient });
    await expect(
      planner.planAssignmentUpdate({
        input: sampleInput,
        planId: randomUUID(),
        revision: 2,
      })
    ).rejects.toThrowError(PlanningError);
  });
});
