# ExecutionRequest v0.1 DRAFT — T0113 Review

**Status:** DRAFT — T0113 remains unchecked and T0114 has not started.

ExecutionRequest references one approved PlanEnvelope revision and supplies only target context selected by the user or application. It does not duplicate `plan_type`, `operation`, approval metadata, execution state, or plan content.

## Proposed root contract

Required fields:

- `plan_id`: the same stable UUID identity used by PlanEnvelope.
- `revision`: positive integer selecting one explicit immutable plan revision.
- `target`: exactly one supported Moodle target shape.

The root and every target object reject unknown properties.

## Proposed target variants

| Intended flow | Target shape |
| --- | --- |
| Course create | `{ category_id }` |
| Add Assignment or Quiz to existing Section | `{ course_id, section_id }` |
| Update existing Assignment | `{ course_id, section_id, activity_id }` |
| Update existing Quiz | `{ course_id, section_id, quiz_id }` |

All IDs are positive integers. Category remains explicitly selected outside Agent planning.

The request does not repeat `plan_type` or `operation`. The executor loads the referenced plan revision and verifies that its plan type/operation is compatible with the supplied target variant. That compatibility is a domain invariant across two documents and is not enforceable by this isolated schema.

## Explicit exclusions

- No course-update target is proposed because whole-course update is outside the existing-course POC scope.
- No delete/remove target is proposed.
- No user identity, approval signature, timestamp, execution state, retry key, Moodle shortname, security field, or production context metadata is added.
- Target IDs are supplied by current Moodle state or explicit category selection; the Agent does not invent them.

## Examples

Intended valid: course create, existing-section create, assignment update, and quiz update.

Intended invalid: malformed plan ID, zero revision, missing/empty target, zero target ID, mixed target fields, and unknown root field.

## Validation boundary

Ajv Draft 2020-12 validation can enforce the structural request and target variants. Domain logic must additionally load the exact plan revision, confirm it is approved, reject a plan/target mismatch, and preserve `plan_id`/revision semantics. T0113 does not implement execution or persistence.

Executed results on 2026-09-01:

- PASS — Ajv compiled all 14 registered schemas, including the recursive draft schema directory.
- PASS — all 4 intended-valid ExecutionRequest examples were accepted.
- PASS — all 7 intended-invalid examples were rejected.
- PASS — compile-time target-union assertions and Ajv-backed `isExecutionRequest` narrowing checks.
- PASS — `pnpm typecheck`, 68/68 runtime tests, `pnpm build`, and compiled ESM validation smoke check.

## Single review decision

Please confirm or revise these four target variants and the decision not to duplicate `plan_type`/`operation`. After acceptance, the schema can move to its canonical path and T0113 can be checked. T0114 will remain separate.
