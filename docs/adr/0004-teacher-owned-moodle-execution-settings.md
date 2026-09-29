# Teacher-owned Moodle execution settings

Status: Accepted

## Context

Moodle-specific choices such as Course Category and Course Format are execution configuration, not educational content to be inferred from the syllabus or selected by the model.

## Decision

The Teacher selects execution settings explicitly from the current Moodle environment. Course Format options are discovered from installed/available Moodle formats and the selected value is pinned to the run/plan execution context; the model does not choose or rewrite it.

## Consequence

Execution settings remain visible in the official Preview and flow unchanged into Moodle creation. Changes to model prompts or syllabus interpretation cannot silently change Moodle execution configuration.
