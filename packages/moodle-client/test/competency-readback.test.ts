import { describe, expect, it } from "vitest";
import { parseCourseCompetencyReadback } from "../src/response-validators.js";

describe("native Course Competency readback", () => {
  const response = {
    course_id: 25,
    course_competencies: [{ course_link_id: 1, competency_id: 6, framework_id: 2, idnumber: "AGENTPOC-1", shortname: "Design classes", description: "Teacher-approved definition" }],
    activity_links: [{ link_id: 2, activity_id: 120, competency_id: 6, rule_outcome: 1 }],
  };

  it("preserves the native description used by Course verification", () => {
    expect(parseCourseCompetencyReadback(response).courseCompetencies[0]?.description).toBe("Teacher-approved definition");
  });

  it("rejects a readback that omits the description", () => {
    const { description: _description, ...withoutDescription } = response.course_competencies[0]!;
    expect(() => parseCourseCompetencyReadback({ ...response, course_competencies: [withoutDescription] })).toThrow();
  });
});
