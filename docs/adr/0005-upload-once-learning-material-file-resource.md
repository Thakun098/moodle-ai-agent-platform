# Upload-once Learning Material and planned File Resource

Status: Accepted

## Context

A Teacher may upload one Learning Material file both to ground Activity generation and to expose that same file to learners in Moodle. Requiring a second upload duplicates work and risks the Moodle resource diverging from the grounding source.

## Decision

Uploading Section Learning Material also creates a planned Moodle File Resource from the same file, using the filename without extension as its deterministic title. The Teacher may remove or replace the planned resource independently; doing so does not delete the Material Snapshot used for grounding.

## Consequence

The File Resource is deterministic plan content and is not part of the AI generation state machine. Moodle mutation still waits for Final Plan approval and execution.
