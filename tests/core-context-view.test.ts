import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { deriveCoreCourseDesignContext } from "../packages/syllabus/src/core-course-design-context.js";
import { ingestSyllabus } from "../packages/syllabus/src/ingest.js";
describe("Teacher Core Context summary", () => {
  it("renders persisted source facts, missing-stage gates and escapes source HTML", async () => {
    let view: { render: (context: unknown) => string };
    runInNewContext(readFileSync("moodle/local_agentpoc/amd/src/core_context_view.js", "utf8"), { define: (_deps: unknown, factory: () => typeof view) => { view = factory(); } });
    const source = await ingestSyllabus({ filename: "course.md", content: Buffer.from("# Course\n## Learning Objectives\n- Develop skills\n## Learning Outcomes\n- <img src=x onerror=alert(1)>\nWeek 1: Intro") });
    const persisted = JSON.parse(JSON.stringify(deriveCoreCourseDesignContext(source, "view-run")));
    const html = view!.render(persisted);
    expect(html).toContain("Learning Objectives");
    expect(html).toContain("Source Learning Outcomes");
    expect(html).toContain("UNSPECIFIED");
    expect(html).toContain("REQUIRES_CONFIRMATION");
    expect(html).toContain("DERIVE_COMPETENCIES");
    expect(html).toContain("Source line");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(view!.render(JSON.parse(JSON.stringify(persisted)))).toBe(html);
  });
  it("routes hydration through the Moodle BFF, carrying only a run ID in the URL", () => {
    const js = readFileSync("moodle/local_agentpoc/amd/src/course_builder.js", "utf8");
    const bff = readFileSync("moodle/local_agentpoc/ajax.php", "utf8");
    const client = readFileSync("moodle/local_agentpoc/classes/api/ai_platform_client.php", "utf8");
    expect(js).toContain("callBff('get_instructional_design', {run_id: contextRunId})");
    expect(js).toContain("showCoreContext(result.core_context)");
    expect(bff).toContain("$client->get_core_context($runid)");
    expect(client).toContain("rawurlencode($runid) . '/core-context'");
  });
});
