import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function loadHelpers(path) {
    let helpers;
    const source = readFileSync(path, "utf8");
    runInNewContext(source, {
        define: (_dependencies, factory) => {
            helpers = factory();
        }
    });
    return helpers;
}

const helpers = loadHelpers(new URL("../amd/src/contract_helpers.js", import.meta.url));

{
    const target = {summary: "Existing summary"};
    helpers.setOptionalString(target, "summary", "");
    assert.equal("summary" in target, false, "empty optional summary must be omitted");
}

{
    const target = {summary: "Existing summary"};
    helpers.setOptionalString(target, "summary", "   ");
    assert.equal("summary" in target, false, "whitespace-only optional summary must be omitted");
}

{
    const target = {};
    helpers.setOptionalString(target, "summary", "  New summary  ");
    assert.equal(target.summary, "New summary", "non-empty summary must be preserved after trim");
}

{
    const sections = [
        {ref: "section-01", position: 1},
        {ref: "section-03", position: 4},
        {ref: "section-topic", position: 2}
    ];
    const original = structuredClone(sections);
    const descriptor = helpers.nextSectionDescriptor(sections);
    assert.match(descriptor.ref, /^section-[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(descriptor.ref, "section-04");
    assert.equal(descriptor.position, 5);
    assert.deepEqual(sections, original, "descriptor generation must not mutate prior revision data");

    const addedSection = {
        ref: descriptor.ref,
        position: descriptor.position,
        title: "New Section " + descriptor.number,
        source_refs: [],
        activities: []
    };
    assert.deepEqual(Object.keys(addedSection).sort(), ["activities", "position", "ref", "source_refs", "title"]);
    assert.equal("order" in addedSection, false);
}

{
    const envelope = {
        content: {
            sections: [
                {ref: "section-01", position: 1, title: "Week 1", source_refs: [], activities: [{type: "assignment", title: "A1"}]},
                {ref: "section-02", position: 2, title: "Week 2", source_refs: [], activities: [{type: "quiz", title: "Q1"}]},
                {ref: "section-03", position: 3, title: "Week 3", source_refs: [], activities: []}
            ]
        }
    };
    const original = structuredClone(envelope);
    const withoutSection = helpers.removeSection(envelope, 1);
    assert.equal(withoutSection.content.sections.length, 2, "delete Section removes the selected section");
    assert.deepEqual(Array.from(withoutSection.content.sections, (section) => section.position), [1, 2]);
    assert.equal(envelope.content.sections.length, 3, "delete Section must not mutate the previous revision");
    assert.equal(JSON.stringify(envelope), JSON.stringify(original));

    const withoutAssignment = helpers.removeActivity(envelope, 0, 0);
    assert.equal(withoutAssignment.content.sections[0].activities.length, 0, "delete Assignment removes the exact activity");
    const withoutQuiz = helpers.removeActivity(envelope, 1, 0);
    assert.equal(withoutQuiz.content.sections[1].activities.length, 0, "delete Quiz removes the exact activity");
    assert.equal(JSON.stringify(envelope), JSON.stringify(original), "delete Activity must not mutate the previous revision");
}

console.log("Preview contract helper tests passed (16 assertions).");
