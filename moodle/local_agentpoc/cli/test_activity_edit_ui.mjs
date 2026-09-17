import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../amd/src/course_builder.js", import.meta.url), "utf8");
const ajax = readFileSync(new URL("../ajax.php", import.meta.url), "utf8");
const client = readFileSync(new URL("../classes/api/ai_platform_client.php", import.meta.url), "utf8");

assert.match(source, /Edit Activity Content/, "generated Activity exposes Teacher content editing");
assert.match(source, /Save Teacher Edit/, "Teacher edit has explicit save action");
assert.match(source, /save_activity_edit/, "Teacher edit saves through Moodle BFF");
assert.match(source, /expected_activity_revision/, "Teacher edit uses Activity revision CAS");
assert.match(source, /content_provenance/, "Teacher-edited provenance is rendered from server state");
assert.match(source, /Teacher Edited · Activity revision/, "Teacher-edited lineage is human-visible");
assert.match(source, /source AI revision/, "source generated revision remains visible");
assert.match(source, /Current Teacher edit was revalidated deterministically\. No additional AI self-review call was made\./, "Teacher edit does not imply a fresh AI self-review");
assert.match(source, /Learning Objectives, grade, source references, Purpose and target LO\/CLO remain controlled/, "Assignment semantic authority is not edited as free content");
assert.match(source, /Question type\/count, default marks, refs, source references, Purpose and target LO\/CLO remain deterministic/, "Quiz deterministic fields stay outside the content editor");
assert.match(source, /provenance: ' \+ lineageText/, "Approve overview distinguishes current content provenance");
assert.match(source, /source AI self-review \(before Teacher edit\): Outcome/, "Approve overview attributes self-review to the source AI revision after Teacher edit");
assert.match(ajax, /case 'save_activity_edit'/, "Moodle BFF exposes Teacher edit save action");
assert.match(ajax, /\(int\)\$USER->id/, "BFF derives authenticated Moodle editor identity server-side");
assert.match(client, /function save_activity_edit/, "AI Platform client supports Activity edit save");
assert.match(client, /function get_activity_revisions/, "AI Platform client supports Activity revision history readback");

console.log("Ticket 22 Teacher Activity edit UI/BFF static regression passed.");
