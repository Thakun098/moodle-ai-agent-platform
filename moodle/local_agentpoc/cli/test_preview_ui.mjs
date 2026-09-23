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
const services = readFileSync(new URL("../db/services.php", import.meta.url), "utf8");
const createPage = readFileSync(new URL("../course/create.php", import.meta.url), "utf8");

function loadModule() {
    const state = {handlers: new Map(), modalCalls: [], values: new Map()};
    const fake$ = (selector) => new FakeSelection(selector, state);
    let module;
    runInNewContext(source, {
        define: (dependencies, factory) => { module = factory(fake$, {}); },
        JSON,
        fetch: () => Promise.reject(new Error("fetch must not run in static UI tests")),
        URL,
        window: {confirm: () => true, location: {href: "http://localhost/course/create.php", reload() {}}},
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
assert.match(source, /selected.item_type === 'CLO' && selected.status === 'REVIEWED'/, "CLO approval is available only after explicit review");
assert.match(source, /Approve CLO/, "reviewed CLO exposes one explicit authority approval action");
assert.match(source, /payload.use_source_as_is = true/, "source as-is approval is sent explicitly through the BFF after review");
assert.match(source, /unapprovedSourceOutcomes/, "Structure Continue is gated by pending source Outcome approval");
assert.match(source, /REVIEW REQUIRED · no Outcome mapping/, "missing model Outcome mappings are surfaced for Teacher review");
assert.match(template, /input-edit-section-objectives/, "Section editor exposes authorized Objective mappings");
assert.match(template, /input-edit-section-outcomes/, "Section editor exposes authorized Outcome mappings");
assert.match(source, /set_coverage_override/, "Teacher review exposes explicit external coverage only through the governed BFF action");
assert.match(source, /Derive Competency Candidates/, "Teacher can derive proposal-only Competency Candidates");
assert.match(source, /Approve Candidate/, "Teacher can approve a Competency Candidate");
assert.match(source, /UNALIGNED/, "unaligned Candidate state is visible for Teacher review");
assert.match(ajax, /case 'derive_competency_candidates'/, "Moodle BFF exposes Candidate derivation");
assert.match(client, /function decide_competency_candidate/, "Moodle BFF forwards Candidate decisions");

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
assert.match(source, /PRACTICE.*FORMATIVE.*SUMMATIVE/s, "Activity Intent exposes one Purpose selection");
assert.match(source, /selected_objective_ids/, "Activity Intent persists selected Objective IDs");
assert.match(source, /selected_outcome_ids/, "Activity Intent persists selected Outcome IDs");
assert.match(source, /Save Intent/, "generation instruction can be persisted before generation");
assert.match(source, /intent_revision/, "Activity Intent revision is visible in the persisted UI state");
assert.match(source, /activity-quiz-purpose-/, "Quiz Purpose control has a stable per-section selector");
assert.match(source, /learner context is unspecified/, "unspecified learner context requires visible Teacher acknowledgment");
assert.match(source, /Allow out-of-Section Outcome/, "out-of-Section Outcome selection is visibly override-gated");
assert.match(source, /get_activity_intents/, "Activity UI reloads persisted Activity Intents");
assert.match(source, /generate_activity/, "generation is per Activity");
assert.match(source, /confirm_activity_shell/, "insufficient evidence can explicitly create an Empty Shell");
assert.match(source, /Creating\.\.\./, "Activity generation exposes Creating state");
assert.match(source, /Retry exhausted/, "retry exhaustion is visible per Activity");
assert.match(source, /Stale - regenerate/, "Material replacement can surface a stale Activity");
assert.match(source, /Generated Activity Preview/, "Teacher can review generated Activity content in Step 3");
assert.match(source, /Teacher review required/, "AI-expanded Activity warning is visible before approval");
assert.match(source, /quality_review/, "structured AI self-review is rendered for Teacher review");
assert.match(source, /Outcome alignment/, "self-review PASS/WARN dimensions are visible");
assert.match(source, /generation_metadata/, "generation lineage metadata is visible in Activity preview");

// Ticket 04 — selected-question canonical QuizPlan review renderer.
assert.match(source, /appendQuestionNavigator\(intent, \$preview\)/, "Activity preview exposes the selected-question navigator");
assert.match(source, /renderCanonicalQuestionPreview\(previewQuestions\[previewIndex\], previewIndex, \$questionDetail\)/, "Activity preview uses the canonical renderer for one selected question");
assert.match(source, /question\.question/, "Quiz renderer reads the canonical question field");
assert.doesNotMatch(source, /question\.question_text \|\| question\.text \|\| question\.name/, "Quiz renderer does not fall back to legacy question fields");
assert.match(source, /correct_choice_refs/, "Multiple-choice preview marks the canonical correct choice");
assert.match(source, /Accepted answers/, "Short-answer preview displays accepted answers");
assert.match(source, /Case-sensitive/, "Short-answer preview displays case sensitivity");
assert.match(source, /Correct answer/, "True\/False preview displays the correct answer");
assert.match(source, /Grading guidance/, "Essay preview displays grading guidance");
assert.match(source, /Feedback/, "Quiz preview displays feedback");
assert.match(source, /Default mark/, "Quiz preview displays default mark");
assert.match(source, /renderQuizActivityPreview\(act, \$quizPreview\)/, "Official preview path reuses the Quiz renderer");

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

// Ticket 02 — teacher-selected dynamic Moodle Course Format.
assert.match(template, /id="course-format-select"/, "Step 1 renders a required Course Format dropdown");
assert.match(template, /\{\{#formats\}\}/, "Course Format options come from dynamic Moodle data");
assert.match(source, /courseFormat/, "selected Course Format is held in UI state");
assert.match(source, /course_format/, "selected Course Format is sent when creating the Run");
assert.match(source, /select a Moodle Course Format|Moodle Course Format/, "Run cannot start without a Course Format selection");
assert.match(source, /approve-summary-format/, "selected Course Format is shown in approval metadata");
assert.match(ajax, /case 'list_course_formats'/, "BFF exposes Moodle Course Format discovery");
assert.match(ajax, /required_param\('course_format'/, "BFF requires the teacher-selected Course Format");
assert.match(client, /course_format/, "BFF forwards Course Format to the AI Platform Run");
assert.match(services, /local_agentpoc_list_course_formats/, "Moodle webservice exposes format discovery");
assert.match(createPage, /list_course_formats::execute/, "Course Builder page receives formats from Moodle");

// Ticket 03 — upload-once deterministic File Resource.
assert.match(source, /plannedResources/, "Material state tracks deterministic planned resources");
assert.match(source, /File Resource Ready/, "uploaded material is immediately shown as a ready resource");
assert.match(ajax, /true,\s*true\s*\n\s*\);/, "Material upload seals the source for course publication by default");
assert.match(client, /create_material_snapshot/, "sealed Moodle material is forwarded once for grounding and planning");
assert.match(source, /set_resource_publication/, "teacher can remove or re-add a planned File Resource");
assert.match(source, /Include this file as a Moodle File Resource/, "resource publication is a teacher-controlled choice");
assert.match(ajax, /case 'set_resource_publication'/, "BFF persists File Resource publication selection");

// Ticket 05 — Official Preview renders the finalized approvable revision.
assert.match(template, /id="approve-official-preview"/, "Approve step has an Official Preview container");
assert.match(source, /function renderOfficialPreview/, "Official Preview has a dedicated renderer");
assert.match(source, /renderOfficialPreview\(preview, state\.currentEnvelope\)/, "Official Preview receives the finalized current envelope");
assert.match(source, /approve-preview-identity/, "Official Preview displays plan ID and revision");
assert.match(source, /Course Format/, "Official Preview displays selected Course Format");
assert.match(source, /preview\.execution_config\.course_format/, "Official Preview displays the Course Format persisted with the Run");
assert.doesNotMatch(source, /appendPreviewValue\(\$course, 'Course Format', state\.courseFormat/, "Official Preview does not trust transient Course Format state");
assert.match(source, /File Resources/, "Official Preview displays planned File Resources");
assert.match(source, /renderAssignmentActivityPreview/, "Official Preview displays full Assignment content");
assert.match(source, /renderQuizActivityPreview\(activity, \$activity\)/, "Official Preview reuses the canonical Quiz renderer");
assert.match(source, /Empty Shell/, "Official Preview displays Empty Shell indicators");
assert.match(source, /Teacher Review Required/, "Official Preview displays AI review indicators");

console.log("ADR-0002 approved four-step combined Activity UI static regression passed.");
