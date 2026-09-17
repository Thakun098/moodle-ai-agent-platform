import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../amd/src/course_builder.js', import.meta.url), 'utf8');

assert.match(source, /function semanticDisplayLabel\(/, 'UI has a human-readable semantic label formatter');
assert.match(source, /function objectiveDisplayLabel\(/, 'LO/Objectives resolve to readable source text');
assert.match(source, /function outcomeDisplayLabel\(/, 'CLO/Outcomes resolve to readable approved text');
assert.match(source, /LO \/ Objectives:/, 'Structure review shows human-readable LO/Objectives');
assert.match(source, /CLO \/ Outcomes:/, 'Structure review shows human-readable CLO/Outcomes');
assert.match(source, /Target CLO \/ Outcomes/, 'Activity target control names CLO/Outcome explicitly');
assert.match(source, /outside this Section \(override required\)/, 'Out-of-Section Outcomes are visibly marked');
assert.match(source, /data-outside-section/, 'Out-of-Section Outcome options carry an explicit UI gate marker');
assert.match(source, /setOutcomeOverrideAvailability/, 'Out-of-Section Outcome options are gated by Teacher override state');
assert.match(source, /overrideReady = \$overrideAck\.is\(':checked'\) && \$overrideReason\.val\(\)\.trim\(\) !== ''/, 'Override requires both acknowledgment and a reason before options unlock');
assert.match(source, /Select Teacher override and enter a reason before targeting an out-of-Section CLO/, 'UI rejects accidental outside-Section selection before calling the backend');
assert.doesNotMatch(source, /objectiveOptions = alignedObjectiveIds\.map\(function\(id\) \{ return \{id: id, label: id\}; \}\)/, 'Activity LO options no longer render hashes as labels');
assert.doesNotMatch(source, /item\.outcome_id \+ ' · ' \+ item\.text/, 'Activity CLO options no longer prefix the visible label with the hash ID');
assert.match(source, /\.attr\('title', id\)/, 'Opaque IDs remain available as non-primary diagnostic metadata');

console.log('Ticket 21 Activity alignment UI regression passed.');
