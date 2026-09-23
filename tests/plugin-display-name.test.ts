import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lang = readFileSync("moodle/local_agentpoc/lang/en/local_agentpoc.php", "utf8");
const services = readFileSync("moodle/local_agentpoc/db/services.php", "utf8");
const version = readFileSync("moodle/local_agentpoc/version.php", "utf8");
const upgrade = readFileSync("moodle/local_agentpoc/db/upgrade.php", "utf8");
const readme = readFileSync("README.md", "utf8");
const deployment = readFileSync("DEPLOYMENT.md", "utf8");

describe("Teacher AI Assistance 2 display identity", () => {
  it("uses the new product name in Moodle-facing display metadata", () => {
    expect(lang).toContain("$string['pluginname'] = 'Teacher AI Assistance 2';");
    expect(lang).toContain("$string['servicename'] = 'Teacher AI Assistance 2 Service';");
    expect(services).toContain("'Teacher AI Assistance 2 Service' =>");
    expect(readme).toContain("# Teacher AI Assistance 2");
    expect(deployment).toContain("# Teacher AI Assistance 2 — Deployment Guide");
  });

  it("preserves the existing Moodle technical identity for compatibility", () => {
    expect(version).toContain("$plugin->component = 'local_agentpoc';");
    expect(services).toContain("'shortname'       => 'local_agentpoc_service'");
    expect(upgrade).toContain("$DB->get_record('external_services', ['shortname' => 'local_agentpoc_service'])");
    expect(upgrade).toContain("$service->name = 'Teacher AI Assistance 2 Service';");
    expect(services).toContain("'local_agentpoc_list_course_formats'");
    expect(lang).toContain("$string['agentpoc:view']");
  });
});
