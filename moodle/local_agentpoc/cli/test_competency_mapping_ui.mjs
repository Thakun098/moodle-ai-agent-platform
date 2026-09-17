import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../amd/src/course_builder.js", import.meta.url), "utf8");
const ajax = readFileSync(new URL("../ajax.php", import.meta.url), "utf8");
const client = readFileSync(new URL("../classes/api/ai_platform_client.php", import.meta.url), "utf8");

assert.match(source, /Competency mappings and evidence/, "Activity review exposes mapping/evidence review");
assert.match(source, /Outcome alignment proposes a mapping\. Confirm the mapping first, then separately decide whether this Activity may serve as Competency Evidence\./, "UI explains alignment is not evidence");
assert.match(source, /Confirm mapping/, "mapping confirmation is explicit");
assert.match(source, /Decline mapping/, "mapping decline is explicit");
assert.match(source, /Confirm evidence eligibility/, "evidence confirmation is separate");
assert.match(source, /Decline evidence eligibility/, "evidence decline is separate");
assert.match(source, /pair\.mapping !== 'CONFIRMED'/, "evidence controls stay disabled before mapping confirmation");
assert.match(source, /approve-competency-mapping-review/, "Final Preview contains read-only mapping/evidence review");
assert.match(source, /Shared Outcomes:/, "mapping rationale is Outcome-traceable");
assert.match(source, /The Activity or Competency changed\. Review and confirm the current mapping again; evidence requires a new decision\./, "stale state is Teacher-visible");
assert.match(ajax, /case 'get_competency_mappings'/, "Moodle BFF exposes mapping readback");
assert.match(ajax, /case 'decide_competency_mapping'/, "Moodle BFF exposes mapping decision");
assert.match(ajax, /'teacher_id' => \(int\)\$USER->id/, "Teacher identity comes from authenticated Moodle session");
assert.match(client, /function get_competency_mappings/, "AI Platform client supports mapping readback");
assert.match(client, /function decide_competency_mapping/, "AI Platform client supports decisions");

console.log("Ticket 23 competency mapping/evidence UI/BFF static regression passed.");
