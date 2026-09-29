import { describe, expect, it } from "vitest";
import { ingestSyllabus } from "../src/ingest.js";

describe("course period limit", () => {
  it.each([1, 8, 10, 18, 20])("accepts %i course periods", async (count) => {
    const content = Buffer.from(Array.from({ length: count }, (_, i) => `## Unit ${i + 1}: Programming topic ${i + 1}\n- Practical exercises`).join("\n\n"));
    const syllabus = await ingestSyllabus({ filename: "units.md", content });
    expect(syllabus.schedule_or_topics).toHaveLength(count);
  });
  it("rejects 21 periods explicitly rather than truncating", async () => {
    const content = Buffer.from(Array.from({ length: 21 }, (_, i) => `## Unit ${i + 1}: Programming topic ${i + 1}\n- Practical exercises`).join("\n\n"));
    await expect(ingestSyllabus({ filename: "units.md", content })).rejects.toMatchObject({ code: "COURSE_PERIOD_LIMIT_EXCEEDED", statusCode: 422, details: { observed: 21, max: 20 } });
  });
});
