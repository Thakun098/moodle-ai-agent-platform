import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../amd/src/course_builder.js', import.meta.url), 'utf8');
const built = readFileSync(new URL('../amd/build/course_builder.min.js', import.meta.url), 'utf8');
const ajax = readFileSync(new URL('../ajax.php', import.meta.url), 'utf8');
const client = readFileSync(new URL('../classes/api/ai_platform_client.php', import.meta.url), 'utf8');
assert.equal(built, source, 'deployed AMD artifact matches source');
for (const name of ['get_competency_participation', 'preflight_competency_framework', 'decide_competency_participation']) {
    assert.ok(ajax.includes("case '" + name + "':"), 'authenticated BFF exposes ' + name);
    assert.ok(client.includes('function ' + name + '('), 'service-key client exposes ' + name);
}
assert.match(ajax, /'expected_revision' => required_param\('expected_revision', PARAM_INT\)/);

class Element {
    constructor(markup, elements) { this.markup = markup; this.properties = {}; this.handlers = {}; this.children = []; elements.push(this); }
    text(value) { this.label = value; return this; }
    prop(name, value) { this.properties[name] = value; return this; }
    attr() { return this; }
    addClass() { return this; }
    empty() { this.children = []; return this; }
    append(child) { this.children.push(child); return this; }
    find() { return this; }
}
const elements = [];
let ui;
runInNewContext(source.replace(/^    return \{\r?\n/m, `    return {
        test: {state: state, render: renderCompetencyCandidates, renderParticipation: renderCompetencyParticipation, mappings: refreshCompetencyMappings,
            resolved: competencyParticipationResolved, enabled: competencyDerivationEnabled,
            check: checkCompetencyReadiness, continueState: updateStructureContinueState,
            setBff: function(fn) { callBff = fn; }, setRender: function(fn) { renderAlignmentReview = fn; },
            setError: function(fn) { showError = fn; }, recover: recoverCompetencyApprovalError, continue: confirmStructureAndShowActivities,
            setReload: function(fn) { reloadInstructionalDesignAuthority = fn; }, setStep: function(fn) { setStep = fn; }},
`), {
    define: (_dependencies, factory) => { ui = factory(markup => {
        const element = new Element(markup, elements);
        element.on = (event, handler) => { element.handlers[event] = handler; return element; };
        return element;
    }, {}, {}); },
    window: {location: {href: 'http://localhost/course/create.php'}}, URL, console,
});
const test = ui.test;
test.state.runId = 'run-ticket35';
test.state.coreContext = {approved_learning_outcomes: [{outcome_id: 'clo1', text: 'Demonstrate a skill'}]};
const calls = [];
test.setBff((action, payload) => {
    calls.push({action, payload});
    return Promise.resolve({competency_participation: {status: 'ENABLED', revision: 2, framework_id: 7}, candidates: []});
});
test.setRender(() => {});
for (const status of ['UNRESOLVED', 'CHECK_FAILED', 'SELECTION_REQUIRED', 'BYPASSED', 'ENABLED']) {
    elements.length = 0;
    calls.length = 0;
    test.state.competencyParticipation = {status, revision: 1, reason: 'TEACHER_SKIP'};
    test.render(new Element('root', elements));
    const derive = elements.find(element => element.label === 'Derive Competency Candidates');
    assert.ok(derive, status + ' shows an explicit derive control');
    assert.equal(derive.properties.disabled, status !== 'ENABLED', status + ' derivation guard');
    derive.handlers.click();
    assert.equal(calls.filter(call => call.action === 'derive_competency_candidates').length, status === 'ENABLED' ? 1 : 0,
        status + ' does not issue derivation unless enabled');
    await new Promise(resolve => setImmediate(resolve));
}
test.state.competencyParticipation = {status: 'CHECK_FAILED'};
assert.equal(test.resolved(), false, 'unknown infrastructure failure blocks Activity Structure');
test.state.competencyParticipation = {status: 'BYPASSED', revision: 4, reason: 'TEACHER_SKIP'};
assert.equal(test.resolved(), true, 'explicit bypass can continue to Activity Structure');
elements.length = 0;
const candidates = [{candidate_id: 'keep-me', status: 'APPROVED', revision: 3}];
test.state.competencyCandidates = candidates;
test.renderParticipation(new Element('root', elements));
assert.ok(elements.some(element => element.label === 'Competencies Skipped by Teacher'));
const enable = elements.find(element => element.label === 'Use Competencies for this Course');
calls.length = 0;
enable.handlers.click();
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls[0].action, 'decide_competency_participation');
assert.equal(calls[0].payload.expected_revision, 4);
assert.equal(calls[0].payload.participation_action, 'enable');
assert.equal(test.state.competencyCandidates, candidates, 'participation retains Candidate review records');
assert.equal(calls.some(call => call.action === 'derive_competency_candidates'), false, 'enabling does not auto-derive');
test.state.competencyParticipation = {status: 'BYPASSED', reason: 'DEFAULT_SCALE_UNAVAILABLE'};
elements.length = 0;
test.renderParticipation(new Element('root', elements));
assert.ok(elements.some(element => element.label === 'Competencies Skipped because infrastructure is unavailable'));
calls.length = 0;
await test.mappings(new Element('mapping-root', elements), true);
assert.equal(calls.length, 0, 'bypass does not expose mapping/evidence mutations');
test.setError(() => {});
test.setBff(() => Promise.reject(new Error('Moodle token rejected')));
await test.check();
assert.equal(test.state.competencyParticipation.status, 'CHECK_FAILED', 'unknown/token failure does not turn into bypass');
assert.equal(test.resolved(), false, 'failed check requires an explicit resolution');
assert.equal(test.state.competencyCandidates, candidates, 'failed check preserves Candidate review records');
assert.equal(test.state.competencyPreflightInFlight, false, 'failed check makes Retry available');
test.state.coreContext.approved_learning_outcomes = [];
elements.length = 0;
test.render(new Element('root', elements));
assert.ok(elements.some(element => element.label === 'Retry Competency check'), 'readiness is visible even without approved Outcomes');
const steps = [];
let reloads = 0;
test.setReload(() => { reloads++; return Promise.resolve(); });
test.setStep(step => steps.push(step));
for (const code of ['COMPETENCY_FRAMEWORK_STALE', 'COMPETENCY_PREFLIGHT_REQUIRED', 'COMPETENCY_EXECUTION_SNAPSHOT_STALE', 'COMPETENCY_EXECUTION_SNAPSHOT_CONFLICT', 'COMPETENCY_PARTICIPATION_CONFLICT']) {
    test.state.approvedRevision = 5;
    test.state.stagedMode = false;
    await test.recover({details: {error: {code}}});
    assert.equal(steps.at(-1), 2, code + ' returns to Course Structure readiness');
    assert.equal(test.state.approvedRevision, null, 'obsolete approval is cleared');
    assert.equal(test.state.stagedMode, true, 'recovery restores the Course Structure readiness surface');
}
assert.equal(reloads, 5);
assert.equal(test.recover({details: {error: {code: 'UNRELATED_ERROR'}}}), null);
test.state.stagedMode = false;
test.state.competencyParticipation = null;
test.continue();
assert.equal(steps.at(-1), 3, 'legacy non-staged Continue retains its original flow');
test.state.stagedMode = true;
const stepCount = steps.length;
test.continue();
assert.equal(steps.length, stepCount, 'staged Continue requires resolved participation');
test.state.competencyParticipation = {status: 'CHECK_FAILED', reason: 'FRAMEWORK_AUTHORITY_CHANGED', revision: 6};
elements.length = 0;
test.renderParticipation(new Element('root', elements));
assert.ok(elements.some(element => element.label === 'Skip Competencies for this Course'), 'Framework change permits explicit Teacher bypass');
for (const malformed of [undefined, {}, {competency_participation: {status: 'UNRESOLVED'}}]) {
    let automaticChecks = 0;
    test.state.competencyParticipation = null;
    test.state.currentStructure = {};
    test.state.competencyAutoPreflightRunId = null;
    test.setBff(() => {
        automaticChecks++;
        // Stop the reproduction after three calls so a broken guard cannot hang this test.
        return Promise.resolve(automaticChecks < 3 ? malformed : {competency_participation: {status: 'CHECK_FAILED'}});
    });
    test.setRender(() => test.render(new Element('root', elements)));
    test.render(new Element('root', elements));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(automaticChecks, 1, 'indeterminate preflight response cannot create an automatic render/check loop');
    assert.equal(test.state.competencyParticipation.status, 'CHECK_FAILED', 'indeterminate preflight reports an actionable failure');
    test.state.competencyParticipation = null;
    test.render(new Element('root', elements));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(automaticChecks, 1, 'automatic checks stay bounded to one per run even after another unresolved render');
}
console.log('Ticket 35 Competency participation UI behavior and BFF checks passed.');
