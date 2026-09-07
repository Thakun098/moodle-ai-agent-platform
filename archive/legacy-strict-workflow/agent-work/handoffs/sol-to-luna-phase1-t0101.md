# Sol to Luna Handoff — Phase 1 T0101 PlanEnvelope v0.1 DRAFT

- **Requirements version:** 0.1 (approved by user on 2026-08-31)
- **Approval evidence:** `Approved. T0101 Requirements v0.1 are accepted. Proceed with planning and produce the PlanEnvelope v0.1 DRAFT for review. Do not freeze T0101 or proceed to T0102 until I explicitly approve the proposed contract.`
- **Implementation plan version:** 0.1
- **Assigned phase/task:** Phase 1 — T0101 only
- **Incoming state:** IMPLEMENTATION
- **Implementer role:** Luna
- **Contract disposition:** DRAFT; user contract approval is still required

## Required Reading Order

Before editing, read completely:

1. `AGENTS.md`
2. `POC_BASELINE.md`
3. `Implementation.md`
4. `PLANNING_CONTRACT.md`
5. `TECH_STACK.md`
6. `task.md`
7. latest entries in `soc.md`
8. `.agent-work/requirements-phase1-t0101.md`
9. `.agent-work/implementation-plan-phase1-t0101.md`
10. `.agent-work/status.md`
11. this handoff

Preserve the prior Phase 0 lifecycle artifacts and audited PASS evidence. The older generic `.agent-work/requirements.md`, `.agent-work/implementation-plan.md`, and generic handoffs describe completed Phase 0 and are context only, not the source of scope for T0101.

## Exact Scope

Implement only the approved T0101 DRAFT review package defined by plan 0.1:

- create one draft PlanEnvelope JSON Schema;
- create seven intended-valid JSON examples;
- create twelve syntactically valid intended-invalid JSON examples;
- create one Markdown review-notes file;
- run dependency-free JSON syntax and structural consistency checks;
- run existing root workspace regression commands without claiming they validate the schema;
- write `.agent-work/handoffs/luna-to-terra-phase1-t0101.md`;
- update `.agent-work/status.md` to AUDIT only after that handoff is complete.

Do not freeze or complete T0101. Do not start T0102.

## Exact Product Files to Create

Create exactly these 21 product files:

```text
packages/contracts/schemas/draft/plan-envelope.v0.1.schema.json

packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-create-revision-1.json
packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-create-revision-2.json
packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-update.json
packages/contracts/examples/plan-envelope/v0.1/intended-valid/assignment-create.json
packages/contracts/examples/plan-envelope/v0.1/intended-valid/assignment-update.json
packages/contracts/examples/plan-envelope/v0.1/intended-valid/quiz-create.json
packages/contracts/examples/plan-envelope/v0.1/intended-valid/quiz-update.json

packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-schema-version.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/malformed-plan-id.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/non-positive-revision.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-plan-type.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-operation.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-title.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-summary.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/invalid-warning-item.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-assumption-item.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/non-object-content.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unknown-envelope-property.json
packages/contracts/examples/plan-envelope/v0.1/intended-invalid/missing-required-field.json

packages/contracts/review/plan-envelope-v0.1-draft.md
```

In addition, create/update only the lifecycle handoff and status files named in this handoff. Use `apply_patch` for all repository edits.

## Required Draft Schema

Implement the exact proposal in `.agent-work/implementation-plan-phase1-t0101.md`:

- Draft 2020-12 `$schema` URI;
- stable `$id` `urn:moodle-agent-poc:schema:planning:plan-envelope:0.1`;
- title visibly containing `PlanEnvelope v0.1 DRAFT` and annotation that it is not frozen;
- object root with `additionalProperties: false`;
- exactly ten envelope properties, all required;
- `schema_version` constant `0.1`;
- `plan_id` constrained by the exact RFC UUID pattern in the plan, without a `format` keyword or dependency;
- positive integer `revision`;
- plan types `course`, `assignment`, and `quiz`;
- operations `create` and `update`;
- non-whitespace `title`, `summary`, warning items, and assumption items;
- empty warning/assumption arrays allowed;
- warning/assumption entries remain plain strings;
- `content` is an object with `additionalProperties: true`, and may be empty;
- all six plan-type/operation combinations allowed;
- no `$ref`, conditional, default, custom keyword, or downstream payload rule.

Do not improvise a different constraint. If a planned constraint proves internally inconsistent, stop and return to Sol rather than silently changing the proposal.

## Required Examples and Review Notes

- Use artificial conforming UUIDs and generic, non-sensitive educational text.
- All 19 example files must be syntactically valid JSON.
- Every intended-valid example has exactly the ten envelope keys and `{}` as `content`.
- Cover all six `plan_type|operation` pairs.
- `course-create-revision-1.json` and `course-create-revision-2.json` share the same `plan_id`, keep `plan_type: "course"` and `operation: "create"`, and use revisions 1 and 2.
- Every intended-invalid example starts from an otherwise conforming envelope and has only its filename's named violation.
- `missing-required-field.json` should omit only `summary`, while all present values remain conforming.
- Review notes must reproduce the full example matrix, explain the seven proposals and rationale, identify all paths, state checks/results, and disclose that intended outcomes have not been run through Ajv or another standards-compliant validator.
- Review notes must ask the user to accept, revise, or question the DRAFT and state that contract acceptance will not automatically begin T0102.

## Required Validation

Run every dependency-free and regression check in the implementation plan and record actual outcomes. At minimum prove:

1. exactly 20 new JSON files exist and all parse with Node.js `JSON.parse`;
2. schema metadata and every planned keyword/value are structurally present;
3. the schema contains no `$ref` anywhere;
4. all intended-valid files have exactly ten root keys, use object content, cover all six discriminant pairs, and demonstrate the shared plan identity/revision pair;
5. every intended-invalid file is parseable and isolates the documented single mutation;
6. `packages/contracts/src/index.ts` remains exactly `export {};`;
7. no package manifest, TypeScript config, lockfile, `TECH_STACK.md`, `task.md`, or `soc.md` change was made;
8. `pnpm typecheck`, `pnpm test`, and `pnpm build` pass, while clearly described as existing-workspace regression checks only.

Use inline Node/PowerShell assertions as needed; do not commit a checker or test. Do not use an online validator. Do not claim JSON Schema conformance beyond syntax and structural/manual consistency before T0111.

## Prohibited Changes

- Do not edit `task.md`; T0101 must remain `[ ]`.
- Do not edit `soc.md`; no T0101 completion record is allowed.
- Do not edit `PLANNING_CONTRACT.md`, `TECH_STACK.md`, `POC_BASELINE.md`, `Implementation.md`, or `AGENTS.md`.
- Do not edit `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`, any generated `dist` file, root `package.json`, `pnpm-workspace.yaml`, or `pnpm-lock.yaml`.
- Do not install Ajv, `ajv-formats`, or any dependency; do not choose an Ajv version.
- Do not add package scripts, TypeScript types, exported schema objects, runtime validation, Vitest tests, or generated code.
- Do not define SourceReference, CourseDefinition, SectionPlan, AssignmentPlan, QuizPlan, question plans, ExecutionRequest, VerificationResult, or any non-empty `content` payload.
- Do not add Moodle/category/shortname/ID fields, provider/model metadata, execution state, approval data, AuthN/AuthZ, context lineage, dependency manifests, rollback, RAG, or production concerns.
- Do not start T0102 or any downstream phase.
- Preserve all user-owned and Phase 0 files.

## Known Risks and Assumptions

- UUID pattern, closed root, all-required fields, nonblank text, open object content, and all six combinations are deliberately reviewable proposals; they are not yet frozen.
- `additionalProperties: true` inside content is a temporary T0101 boundary, not adequate validation for real plan payloads.
- Dependency-free structural assertions can detect drift from the plan but cannot substitute for JSON Schema/Ajv evaluation.
- Existing `pnpm test` still uses the approved Phase 0 no-tests posture; a pass provides no schema-test evidence.
- The nested project may not have a usable local Git history. Preservation must be established through scoped edits/read-only inspection rather than relying solely on `git diff`.

## Stop Conditions

Stop safely, preserve partial work, and write a blocker section in the Luna-to-Terra handoff if:

- any proposal must change to produce internally consistent artifacts;
- a downstream content field or schema reference appears necessary;
- a dependency, package/source/config change, online validator, or runtime implementation appears necessary;
- the example matrix cannot isolate one violation per invalid file;
- a baseline/frozen decision conflict is discovered;
- existing overlapping user content would be overwritten;
- any required check fails and cannot be corrected within the exact DRAFT file scope;
- new user authority or a contract decision is required.

Do not retry without new evidence and do not broaden scope to clear a blocker.

## Completion Checklist

- [ ] Read all required documents in order.
- [ ] Create the exact one-file PlanEnvelope v0.1 DRAFT schema.
- [ ] Create all seven intended-valid examples.
- [ ] Create all twelve syntactically valid intended-invalid examples.
- [ ] Create complete human-review notes with all seven decisions and the approval gate.
- [ ] Run JSON syntax, schema-structure, reference, matrix, invalid-isolation, preservation, and workspace regression checks.
- [ ] Record truthful commands/results and validation limitations.
- [ ] Confirm no Ajv, dependency, TypeScript/runtime, T0102+, task, or SOC change.
- [ ] Keep every contract artifact labeled DRAFT and T0101 unchecked.
- [ ] Write `.agent-work/handoffs/luna-to-terra-phase1-t0101.md` with requirements/plan versions, changed files, behavior, decisions, deviations, tests/results, limitations, blockers, and audit focus.
- [ ] Only after the Luna-to-Terra handoff is complete, update `.agent-work/status.md` from IMPLEMENTATION to AUDIT with Terra active.

## Required Terra Audit Focus

Ask Terra to independently inspect actual files—not only this handoff—and verify:

- exact schema dialect/identity/rules and absence of speculative fields/references;
- root closure versus deliberately open object content;
- all-required and nonblank-string behavior;
- UUID/revision/enumeration proposals;
- coverage of all six combinations and stable revision identity;
- single-violation isolation of every intended-invalid example;
- review-note accuracy and visible DRAFT/user-approval gate;
- absence of Ajv/dependencies/runtime TypeScript/T0102/task/SOC changes;
- truthfulness of the dependency-free validation evidence.

