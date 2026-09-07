# ExecutionRequest v0.1 Freeze Record

**Status:** Frozen on 2026-09-01 after user-authorized Phase 1 completion.

## Contract

ExecutionRequest references one explicit plan revision and supplies exactly one Moodle target context:

- course create: `{ category_id }`
- add Assignment/Quiz to existing Section: `{ course_id, section_id }`
- Assignment update: `{ course_id, section_id, activity_id }`
- Quiz update: `{ course_id, section_id, quiz_id }`

The request contains only `plan_id`, `revision`, and `target`. It does not duplicate `plan_type` or `operation`; the executor loads the referenced plan revision and performs compatibility checks as a domain invariant.

All IDs are positive integers, all objects reject unknown properties, delete/remove targets remain out of scope, and execution/persistence behavior is not implemented by this contract.
