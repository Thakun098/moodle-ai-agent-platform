import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

class FakeSelection {
    constructor(selector, state) { this.selector = selector; this.state = state; }
    on(event, handler) { this.state.handlers.set(this.selector + ':' + event, handler); return this; }
    modal(action) { this.state.modalCalls.push({selector: this.selector, action}); return this; }
    val(value) { if (arguments.length > 0) this.state.values.set(this.selector, value); return this.state.values.get(this.selector) || ""; }
    text() { return this; } html() { return this; } empty() { return this; }
    addClass() { return this; } removeClass() { return this; } prop() { return this; }
    attr() { return this; } append() { return this; } animate() { return this; }
    toggleClass() { return this; }
    is() { return false; }
    offset() { return {top: 0}; }
}

const source = readFileSync(new URL("../amd/src/course_builder.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/course_builder.mustache", import.meta.url), "utf8");
const ajax = readFileSync(new URL("../ajax.php", import.meta.url), "utf8");
const client = readFileSync(new URL("../classes/api/ai_platform_client.php", import.meta.url), "utf8");
const lang = readFileSync(new URL("../lang/en/local_agentpoc.php", import.meta.url), "utf8");

function loadModule() {
    const state = {handlers: new Map(), modalCalls: [], values: new Map()};
    const fake$ = (selector) => new FakeSelection(selector, state);
    let module;
    runInNewContext(source, {
        define: (dependencies, factory) => { module = factory(fake$, {}); },
        JSON,
        fetch: () => Promise.reject(new Error("fetch must not run in static UI tests")),
        window: {confirm: () => true, location: {reload() {}}},
        alert: () => {},
        console
    });
    module.init({sesskey: "test", ajaxurl: "test", categories: []});
    return state;
}

const state = loadModule();
for (const selector of [
    '#modal-edit-section .close',
    '#modal-edit-section [data-dismiss="modal"]',
    '#modal-edit-title .close',
    '#modal-edit-title [data-dismiss="modal"]'
]) {
    const handler = state.handlers.get(selector + ':click');
    assert.equal(typeof handler, "function", `explicit dismiss handler is bound for ${selector}`);
    handler({preventDefault() {}});
    assert.equal(state.modalCalls.at(-1).action, "hide", `dismiss handler hides ${selector}`);
}

// Four-step wizard approved for ADR-0002.
assert.match(template, /step-item-1[\s\S]*Create Course Structure/, "step 1 is Create Course Structure");
assert.match(template, /step-item-2[\s\S]*Course Structure/, "step 2 is Course Structure");
assert.match(template, /step-item-3[\s\S]*Activity Structure/, "step 3 is Activity Structure");
assert.match(template, /step-item-4[\s\S]*Approve/, "step 4 is Approve");
assert.match(template, /line-3-4/, "progress bar has a fourth-step connector");
assert.match(template, /id="step-view-activities"/, "Activity Structure is a dedicated page");

// Step 1 and Step 2 semantics.
assert.match(lang, /Structure Instruction \(Optional\)/, "Step 1 instruction is structure-only");
assert.match(lang, /Generate Course Structure/, "Step 1 CTA generates Course Structure");
assert.match(lang, /These notes shape Course Structure only/, "Step 1 hint excludes implicit activities");
assert.doesNotMatch(source, /No planned activities/, "Step 2 no longer renders planned-activity messaging");
assert.doesNotMatch(source, /Planned Quiz|Planned Assignment/, "Step 2 has no implicit planned activities");

// Step 3 approved per-week combined Activity UI.
assert.match(source, /activity-week-card/, "Activity Structure renders one card per week");
assert.match(source, /Choose either, both, or none/, "each week supports Quiz, Assignment, both, or none");
assert.match(source, /Shared by Quiz \+ Assignment/, "one optional Material source is shared by both activities in a week");
assert.match(source, /No Material uploaded — syllabus fallback will be used/, "no-Material fallback is visible");
assert.match(source, /renderPanel\('quiz'/, "Quiz panel is rendered inside the week card");
assert.match(source, /renderPanel\('assignment'/, "Assignment panel is rendered inside the same week card");
assert.match(source, /Prompt \(Optional\)/, "each selected Activity gets an optional prompt");
assert.match(source, /question_count/, "Quiz advanced settings include question count");
assert.match(source, /question_type/, "Quiz advanced settings include question type");
assert.match(source, /choices_per_question/, "Quiz advanced settings include choices");
assert.match(source, /assignmentOptions/, "Assignment advanced settings are supported");
assert.match(source, /grade/, "Assignment grade default can be configured");
assert.match(source, /set_activity_intents/, "Activity UI persists explicit selection");
assert.match(source, /get_activity_intents/, "Activity UI reloads persisted Activity Intents");
assert.match(source, /generate_activity/, "generation is per Activity");
assert.match(source, /confirm_activity_shell/, "insufficient evidence can explicitly create an Empty Shell");
assert.match(source, /Creating\.\.\./, "Activity generation exposes Creating state");
assert.match(source, /Retry exhausted/, "retry exhaustion is visible per Activity");
assert.match(source, /Stale - regenerate/, "Material replacement can surface a stale Activity");
assert.match(source, /Generated Activity Preview/, "Teacher can review generated Activity content in Step 3");
assert.match(source, /Teacher review required/, "AI-expanded Activity warning is visible before approval");

// Step 3 progress/footer behavior.
assert.match(template, /activity-summary-selected/, "Step 3 shows selected Activity count");
assert.match(template, /activity-summary-ready/, "Step 3 shows ready Activity count");
assert.match(template, /activity-summary-remaining/, "Step 3 shows remaining Activity count");
assert.match(source, /Continue without Activities/, "zero-Activity course can continue explicitly");
assert.match(source, /Finalize Activity Structure/, "selected Activities use a distinct Finalize CTA");
assert.match(source, /activityLoadingCount/, "Finalize waits for Activity state loading to finish");

// Step 4 final preview and review gate.
assert.match(template, /approve-summary-empty-sections/, "Approve summary reports empty sections");
assert.match(template, /approve-activity-overview/, "Approve page summarizes Activities by week");
assert.match(source, /acknowledge_ai_expanded_content/, "approval sends AI-expanded-content acknowledgment");
assert.match(source, /btn-approve-execute.*disabled|prop\('disabled', state\.requiresAiReview\)/s, "Approve is disabled when explicit AI review is required");

// Moodle BFF/client wiring.
assert.match(ajax, /case 'set_activity_intents'/, "Moodle BFF exposes Activity selection action");
assert.match(ajax, /case 'generate_activity'/, "Moodle BFF exposes per-Activity generation action");
assert.match(client, /strtoupper\(\$method\) === 'PUT'/, "AI Platform client supports PUT for Activity selection");
assert.match(client, /function set_activity_intents/, "AI Platform client implements Activity selection");
assert.doesNotMatch(source, /confirmStructureAndShowMaterials/, "old Material-under-Structure navigation is removed");

console.log("ADR-0002 approved four-step combined Activity UI static regression passed.");
