import { randomUUID } from "node:crypto";
import type { PlanRepository, PocPlanRecord } from "@moodle-agent-poc/agent-runtime";
import type { CoursePlanEnvelope } from "@moodle-agent-poc/contracts";
import { describe, expect, it, vi } from "vitest";
import { PlanningError } from "../src/errors/planning-errors.js";
import { PlanRevisionHelper } from "../src/revisions/plan-revision-helper.js";

describe("PlanRevisionHelper (T0508, Remediated R7, R8, Phase 6 Grounding)", () => {
  const planId = randomUUID();

  const initialEnvelope: CoursePlanEnvelope = {
    schema_version: "0.1",
    plan_id: planId,
    revision: 1,
    plan_type: "course",
    operation: "create",
    title: "Initial Course Plan",
    summary: "Version 1",
    warnings: [],
    assumptions: [],
    content: {
      course: { title: "CS101" },
      sections: [
        {
          ref: "section-01",
          position: 1,
          title: "Introduction",
          source_refs: [{ source: "syllabus.md", section: "Week 1" }],
          activities: [],
        },
      ],
    },
  };

  const initialRecord: PocPlanRecord = {
    id: randomUUID(),
    planId,
    runId: "run-original-1",
    planType: "course",
    operation: "create",
    revision: 1,
    title: initialEnvelope.title,
    summary: initialEnvelope.summary,
    content: initialEnvelope.content as unknown as Record<string, unknown>,
    rawEnvelope: initialEnvelope,
    validationStatus: "valid",
    validationErrors: null,
    executionContext: { target: { category_id: 1 } },
    createdAt: new Date().toISOString(),
  };

  it("creates direct user edit incrementing revision to N + 1 and preserving runId (R7)", async () => {
    const mockPlanRepo: PlanRepository = {
      getLatestRevision: vi.fn().mockResolvedValue(initialRecord),
      savePlanRevision: vi.fn().mockImplementation((data) =>
        Promise.resolve({
          ...initialRecord,
          id: data.id,
          revision: data.revision,
          title: data.title,
          summary: data.summary,
          content: data.content,
          rawEnvelope: data.rawEnvelope,
        })
      ),
    } as unknown as PlanRepository;

    const helper = new PlanRevisionHelper(mockPlanRepo);

    const editedEnvelope: CoursePlanEnvelope = {
      ...initialEnvelope,
      title: "User Edited Course Plan",
      summary: "User refined title and section name",
      content: {
        ...initialEnvelope.content,
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Introduction to Advanced CS",
            source_refs: [{ source: "syllabus.md", section: "Week 1" }],
            activities: [],
          },
        ],
      },
    };

    const saved = await helper.createDirectUserEdit({
      planId,
      editedEnvelope,
      changeSummary: "Direct instructor title refinement",
    });

    expect(saved.revision).toBe(2);
    expect(saved.title).toBe("User Edited Course Plan");
    expect(saved.summary).toBe("User refined title and section name");
    expect(mockPlanRepo.savePlanRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        planId,
        runId: "run-original-1", // preserved original runId (R7)
        revision: 2,
        validationStatus: "valid",
        executionContext: initialRecord.executionContext,
      })
    );
  });

  it("accepts an editor-style added Section and leaves the previous revision unchanged", async () => {
    const mockPlanRepo: PlanRepository = {
      getLatestRevision: vi.fn().mockResolvedValue(initialRecord),
      savePlanRevision: vi.fn().mockImplementation((data) =>
        Promise.resolve({ ...initialRecord, id: data.id, revision: data.revision, rawEnvelope: data.rawEnvelope })
      ),
    } as unknown as PlanRepository;
    const helper = new PlanRevisionHelper(mockPlanRepo);
    const editedEnvelope = structuredClone(initialEnvelope);
    editedEnvelope.content.sections.push({
      ref: "section-02",
      position: 2,
      title: "New Section 2",
      source_refs: [],
      activities: [],
    });

    const saved = await helper.createDirectUserEdit({ planId, editedEnvelope });

    expect(saved.revision).toBe(2);
    expect(saved.rawEnvelope.content.sections).toHaveLength(2);
    expect(saved.rawEnvelope.content.sections[1]).toEqual({
      ref: "section-02",
      position: 2,
      title: "New Section 2",
      source_refs: [],
      activities: [],
    });
    expect(initialEnvelope.content.sections).toHaveLength(1);
    expect(initialEnvelope.content.sections[0]).not.toHaveProperty("summary");
  });

  it("rejects direct user edit introducing invented source references (Phase 6 Grounding)", async () => {
    const mockPlanRepo: PlanRepository = {
      getLatestRevision: vi.fn().mockResolvedValue(initialRecord),
      savePlanRevision: vi.fn(),
    } as unknown as PlanRepository;

    const helper = new PlanRevisionHelper(mockPlanRepo);

    const editedEnvelopeWithInventedSource: CoursePlanEnvelope = {
      ...initialEnvelope,
      content: {
        ...initialEnvelope.content,
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Introduction",
            // Invented source file and non-existent section
            source_refs: [{ source: "invented_document.pdf", section: "Chapter 99" }],
            activities: [],
          },
        ],
      },
    };

    await expect(
      helper.createDirectUserEdit({
        planId,
        editedEnvelope: editedEnvelopeWithInventedSource,
      })
    ).rejects.toThrowError(PlanningError);
  });

  it("rejects user edit attempting to change runId to another run (R7)", async () => {
    const mockPlanRepo: PlanRepository = {
      getLatestRevision: vi.fn().mockResolvedValue(initialRecord),
      savePlanRevision: vi.fn(),
    } as unknown as PlanRepository;

    const helper = new PlanRevisionHelper(mockPlanRepo);

    await expect(
      helper.createDirectUserEdit({
        planId,
        runId: "run-different-999", // Attempted run lineage drift
        editedEnvelope: initialEnvelope,
      })
    ).rejects.toThrowError(PlanningError);
  });

  it("rejects user edit attempting to change plan_type or operation (R8)", async () => {
    const mockPlanRepo: PlanRepository = {
      getLatestRevision: vi.fn().mockResolvedValue(initialRecord),
      savePlanRevision: vi.fn(),
    } as unknown as PlanRepository;

    const helper = new PlanRevisionHelper(mockPlanRepo);

    const driftedEnvelope: any = {
      ...initialEnvelope,
      plan_type: "quiz", // Attempted drift from "course" to "quiz"
      operation: "update",
    };

    await expect(
      helper.createDirectUserEdit({
        planId,
        editedEnvelope: driftedEnvelope,
      })
    ).rejects.toThrowError(PlanningError);
  });

  it("creates agent re-plan incrementing revision to N + 1 and preserving runId (R7)", async () => {
    const mockPlanRepo: PlanRepository = {
      getLatestRevision: vi.fn().mockResolvedValue(initialRecord),
      savePlanRevision: vi.fn().mockImplementation((data) =>
        Promise.resolve({
          ...initialRecord,
          id: data.id,
          revision: data.revision,
          title: data.title,
          summary: data.summary,
          content: data.content,
          rawEnvelope: data.rawEnvelope,
        })
      ),
    } as unknown as PlanRepository;

    const helper = new PlanRevisionHelper(mockPlanRepo);

    const saved = await helper.createAgentRePlan({
      planId,
      newPayload: {
        title: "Agent Re-planned Course",
        summary: "Added second section",
        content: {
          course: { title: "CS101" },
          sections: [
            {
              ref: "section-01",
              position: 1,
              title: "Introduction",
              source_refs: [{ source: "syllabus.md", section: "Week 1" }],
              activities: [],
            },
            {
              ref: "section-02",
              position: 2,
              title: "Algorithms",
              source_refs: [{ source: "syllabus.md", section: "Week 1" }],
              activities: [],
            },
          ],
        },
      },
    });

    expect(saved.revision).toBe(2);
    expect(saved.title).toBe("Agent Re-planned Course");
    expect(mockPlanRepo.savePlanRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        planId,
        runId: "run-original-1", // preserved original runId
        revision: 2,
      })
    );
  });

  it("rejects direct edit that combines valid provenance fields from different existing SourceReference tuples", async () => {
    const tupleEnvelope: CoursePlanEnvelope = {
      ...initialEnvelope,
      content: {
        course: { title: "CS101" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Introduction",
            source_refs: [
              { source: "syllabus.md", page: 3 },
              { source: "syllabus.md", section: "Week 2" },
            ],
            activities: [],
          },
        ],
      },
    };
    const tupleRecord: PocPlanRecord = {
      ...initialRecord,
      rawEnvelope: tupleEnvelope,
      content: tupleEnvelope.content as unknown as Record<string, unknown>,
    };
    const mockPlanRepo: PlanRepository = {
      getLatestRevision: vi.fn().mockResolvedValue(tupleRecord),
      savePlanRevision: vi.fn(),
    } as unknown as PlanRepository;
    const helper = new PlanRevisionHelper(mockPlanRepo);

    const editedEnvelope: CoursePlanEnvelope = {
      ...tupleEnvelope,
      content: {
        course: { title: "CS101" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Introduction",
            source_refs: [{ source: "syllabus.md", page: 3, section: "Week 2" }],
            activities: [],
          },
        ],
      },
    };

    await expect(
      helper.createDirectUserEdit({ planId, editedEnvelope })
    ).rejects.toMatchObject({ code: "PLAN_DOMAIN_INVALID" });
    expect(mockPlanRepo.savePlanRevision).not.toHaveBeenCalled();
  });

  it("rejects direct edit that changes SourceReference text while keeping source location unchanged", async () => {
    const textEnvelope: CoursePlanEnvelope = {
      ...initialEnvelope,
      content: {
        course: { title: "CS101" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Introduction",
            source_refs: [
              {
                source: "syllabus.md",
                section: "Week 1",
                text: "Original syllabus statement",
              },
            ],
            activities: [],
          },
        ],
      },
    };
    const textRecord: PocPlanRecord = {
      ...initialRecord,
      rawEnvelope: textEnvelope,
      content: textEnvelope.content as unknown as Record<string, unknown>,
    };
    const mockPlanRepo: PlanRepository = {
      getLatestRevision: vi.fn().mockResolvedValue(textRecord),
      savePlanRevision: vi.fn(),
    } as unknown as PlanRepository;
    const helper = new PlanRevisionHelper(mockPlanRepo);

    const editedEnvelope: CoursePlanEnvelope = {
      ...textEnvelope,
      content: {
        course: { title: "CS101" },
        sections: [
          {
            ref: "section-01",
            position: 1,
            title: "Introduction",
            source_refs: [
              {
                source: "syllabus.md",
                section: "Week 1",
                text: "Invented replacement statement",
              },
            ],
            activities: [],
          },
        ],
      },
    };

    await expect(
      helper.createDirectUserEdit({ planId, editedEnvelope })
    ).rejects.toMatchObject({ code: "PLAN_DOMAIN_INVALID" });
    expect(mockPlanRepo.savePlanRevision).not.toHaveBeenCalled();
  });});

