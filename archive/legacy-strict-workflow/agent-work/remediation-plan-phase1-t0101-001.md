# Phase 1 T0101 Correction and Finalization Plan 001

- **Remediation version:** 001
- **Requirements version:** 0.1 (approved)
- **Implementation plan version:** 0.1
- **Source draft audit:** `.agent-work/reports/audit-phase1-t0101-draft-001.md` — PASS
- **User authorization:** 2026-08-31; apply Feedback-01 and Feedback-02 exactly, run a final independent audit, and freeze PlanEnvelope v0.1 without redesign
- **Status:** ready for remediation implementation
- **Owner role:** Sol
- **Assigned implementer:** Luna
- **Next auditor:** Terra
- **Scope:** Phase 1 T0101 only; T0102 must not start

## Decision and Finding Classification

### Feedback-01 — ACCEPTED / EXACT

**Requested correction:** Replace only `properties.plan_id.description` in the PlanEnvelope schema with this exact string:

```text
Stable hyphenated RFC UUID identity shared by revisions of one plan.
```

**Classification rationale:** This is an accepted wording correction. It does not change the existing UUID pattern, supported UUID versions/variant, field type, required status, stable-identity semantics, or any other schema assertion.

### Feedback-02 — ACCEPTED / EXACT

**Requested correction:** Replace the entire `assumptions` array in `course-update.json` with exactly:

```json
["Existing Moodle course context is supplied to the workflow outside this common PlanEnvelope."]
```

The formatted JSON file may render the single array item on multiple lines, but its parsed value must be exactly the one-element array above.

**Classification rationale:** This is an accepted example-wording correction that clarifies the planning/execution boundary. It does not change the schema, example discriminants, example validity, or downstream execution contracts.

### Scope decision

Both items are accepted exactly as written. No requirement, contract rule, architecture decision, schema semantic, field set, constraint, example matrix, or validation posture is reopened. No redesign is authorized or required.

## Final Artifact Promotion Decision

The final schema must have one canonical product path. Luna will promote the reviewed schema as follows:

- **From:** `packages/contracts/schemas/draft/plan-envelope.v0.1.schema.json`
- **To:** `packages/contracts/schemas/plan-envelope.v0.1.schema.json`

After the final path has been created and verified, remove the old draft-path schema so the repository does not contain two live copies of PlanEnvelope v0.1. Preserve the schema `$schema`, `$id`, property set, required set, patterns, enums, minimums, root closure, and open-object `content` boundary exactly.

The final schema's lifecycle annotations are the only permitted non-feedback schema changes:

- `title` becomes exactly `PlanEnvelope v0.1`.
- `description` becomes exactly `Frozen common planning envelope for Phase 1 task T0101. Standards-compliant runtime validation is deferred to T0111.`
- `$comment` becomes exactly `The frozen envelope is declarative, provider-neutral, Moodle-light, and composable. It does not define downstream plan payloads.`

These annotation and path changes do not alter validation semantics. `$id` remains `urn:moodle-agent-poc:schema:planning:plan-envelope:0.1`.

The example directory is already versioned and is not renamed:

- `packages/contracts/examples/plan-envelope/v0.1/`

Only `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-update.json` may change, and only its `assumptions` value may change.

The audited draft review notes remain unchanged at `packages/contracts/review/plan-envelope-v0.1-draft.md` as historical review evidence. Do not rename, rewrite, or delete that file. Add a concise finalization record at:

- `packages/contracts/review/plan-envelope-v0.1-freeze.md`

That record must state: user authorization/date; the final canonical schema path and unchanged `$id`; both accepted exact corrections; the draft-to-final path mapping; the unchanged contract semantics and 7-valid/12-invalid matrix; the T0111 runtime-validation limitation; the preserved draft audit/report paths; and that T0102 was not started. It must describe the product artifact as frozen by user authorization while making clear that administrative T0101 completion is gated on Terra PASS over the exact final candidate.

## Preservation of Review Evidence

Before editing product artifacts, Luna must compute and record SHA-256 hashes for:

- the draft schema;
- `course-update.json`;
- `packages/contracts/review/plan-envelope-v0.1-draft.md`.

The hashes and the exact promotion mapping must be recorded in `.agent-work/handoffs/luna-to-terra-phase1-t0101-remediation-001.md`. The following existing evidence files are immutable in this phase and must remain byte-for-byte unchanged:

- `.agent-work/requirements-phase1-t0101.md`
- `.agent-work/implementation-plan-phase1-t0101.md`
- `.agent-work/handoffs/sol-to-luna-phase1-t0101.md`
- `.agent-work/handoffs/luna-to-terra-phase1-t0101.md`
- `.agent-work/reports/audit-phase1-t0101-draft-001.md`
- `packages/contracts/review/plan-envelope-v0.1-draft.md`

The new finalization record and final audit must link the reviewed draft path to the canonical final path so the earlier report remains understandable even though the live schema is promoted out of `schemas/draft/`.

## Luna Implementation Scope

Luna must perform only this ordered work:

1. Read applicable governance and all artifacts listed in the Sol-to-Luna handoff.
2. Record the required pre-change hashes.
3. Create the canonical final schema from the audited draft, applying only Feedback-01 and the three exact lifecycle annotation replacements above.
4. Remove the old draft-path schema only after equivalence checks pass.
5. Apply Feedback-02 to `course-update.json` exactly.
6. Add `packages/contracts/review/plan-envelope-v0.1-freeze.md` with the factual finalization record described above.
7. Run every validation in this plan.
8. Write `.agent-work/handoffs/luna-to-terra-phase1-t0101-remediation-001.md` with exact files, hashes, commands, results, deviations, limitations, and Terra audit focus.
9. Only after all Luna checks pass, update `.agent-work/status.md` to `AUDIT`, Terra active, final candidate audit pending. Luna must leave `task.md` and `soc.md` unchanged.

## Files Luna May Change

- `packages/contracts/schemas/draft/plan-envelope.v0.1.schema.json` (remove only after promotion verification)
- `packages/contracts/schemas/plan-envelope.v0.1.schema.json` (new canonical final path)
- `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-update.json`
- `packages/contracts/review/plan-envelope-v0.1-freeze.md` (new)
- `.agent-work/handoffs/luna-to-terra-phase1-t0101-remediation-001.md` (new)
- `.agent-work/status.md`

No other product, governance, dependency, generated, test, example, schema, handoff, audit, task, or SOC file may change during Luna implementation.

## Required Validation

Run from `C:\moodle-prac\ai-platform` and record actual commands and results.

### Deterministic contract checks

1. Parse the final schema and all 19 examples as JSON; assert the count remains 20 JSON documents.
2. Assert the canonical schema exists and the old draft schema does not exist.
3. Assert `$schema` and `$id` are unchanged and the final `title`, `description`, and `$comment` equal the exact values in this plan.
4. Assert `properties.plan_id.description` equals Feedback-01 exactly.
5. Compare the parsed pre-change schema with the final schema after excluding only `title`, `description`, `$comment`, and `properties.plan_id.description`; assert deep equality. This proves validation semantics did not change.
6. Assert the schema still has exactly ten properties and ten required names, the same UUID pattern, positive revision rule, enums, nonblank text/array-item rules, closed root, open object `content`, and no `$ref`, conditional, default, transform, custom keyword, or `format`.
7. Assert parsed `course-update.json.assumptions` equals Feedback-02 exactly. Compare the pre-change and final parsed example after excluding only `assumptions`; assert deep equality.
8. Assert the other 18 example files are byte-for-byte unchanged, all seven intended-valid examples still satisfy the existing dependency-free evaluator, all twelve intended-invalid examples still produce exactly their documented sole error, all six `plan_type|operation` pairs remain covered, and the revision-identity pair remains unchanged.
9. Assert the historical draft review notes and the six immutable `.agent-work` evidence files above are byte-for-byte unchanged.
10. Assert the freeze record contains the authorization, exact corrections, promotion mapping, semantic-preservation statement, validation limitation, preserved evidence references, Terra gate, and no T0102 claim.
11. Assert `task.md` still has T0101 `[ ]`, `soc.md` has no T0101 completion entry, T0102 remains `[ ]`, and no T0102 artifact was created.

These are dependency-free syntax, structure, and equivalence checks only. They must not be represented as standards-compliant JSON Schema validation; T0111 remains unchanged.

### Workspace regressions

Run and truthfully record:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

These commands exercise the existing workspace baseline, not executable validation of PlanEnvelope.

## Luna-to-Terra Handoff Requirements

The handoff must include:

- requirements, implementation-plan, remediation-plan, and source-audit versions;
- user authorization and both `ACCEPTED / EXACT` classifications;
- pre-change and final SHA-256 evidence;
- exact created, changed, promoted, and removed paths;
- a machine-readable or explicit list of the four permitted schema member changes;
- confirmation that Feedback-02 is the only example data change;
- commands and actual results for every deterministic and regression check;
- confirmation that immutable evidence, all other examples, dependencies, TypeScript/runtime source, `task.md`, and `soc.md` were untouched;
- validation limitations, deviations, blockers, and Terra's exact audit focus;
- a request for Terra to write `.agent-work/reports/audit-phase1-t0101-final-001.md` and issue `PASS`, `PASS_WITH_NOTES`, or `CHANGES_REQUIRED` without modifying product files.

## Terra Final-Candidate Gate

Terra must independently audit the exact final candidate after Luna's handoff. Terra must inspect the actual canonical schema, example tree, freeze record, protected evidence, plan, and Luna's recorded equivalence results; rerun the deterministic checks and proportional workspace regressions; and verify that only the authorized textual corrections, schema annotation/path promotion, and new freeze record occurred.

Terra must write `.agent-work/reports/audit-phase1-t0101-final-001.md`. A `PASS` is required for automatic administrative completion. `PASS_WITH_NOTES` requires explicit user acceptance of the notes before completion. `CHANGES_REQUIRED` returns to Sol for narrowly scoped classification and another remediation cycle. Terra must not edit product artifacts, `task.md`, or `soc.md`.

No product byte audited by Terra may change after PASS. If a product change is needed, the candidate must be re-audited.

## Post-PASS Administrative Completion

Only after Terra returns `PASS` on the exact final candidate may the lifecycle owner perform these administrative edits:

1. Change only the T0101 checkbox in `task.md` from `[ ]` to `[x]`; leave T0102 `[ ]`.
2. Append one factual T0101 `DONE` entry to `soc.md` using its template. Record the final schema path, Feedback-01/02 corrections, draft-to-final promotion, final audit report/disposition, actual validation commands/results, T0111 validation limitation, and that T0102 did not start. Do not present planned checks as completed.
3. Update `.agent-work/status.md` to `COMPLETE`, active role `None`, current phase `Phase 1 — T0101 complete`, latest audit `.agent-work/reports/audit-phase1-t0101-final-001.md` — PASS, no blockers, and next action `Await explicit user authorization before T0102`.

These administrative edits must not alter the already-audited schema, examples, or review records. Do not create a T0102 requirements artifact, plan, schema, handoff, status transition, or implementation.

## Prohibited Changes and Stop Conditions

- Do not change schema validation semantics beyond Feedback-01, which is annotation-only.
- Do not change any example except the exact Feedback-02 assumptions value.
- Do not edit or replace the audited draft review notes or prior audit/handoff evidence.
- Do not add Ajv, a format plugin, a package script, a test file, a TypeScript type/export, runtime behavior, dependency, or lockfile change.
- Do not alter `AGENTS.md`, `POC_BASELINE.md`, `Implementation.md`, `PLANNING_CONTRACT.md`, `TECH_STACK.md`, or Phase 0 evidence.
- Do not start T0102 or any later task.
- Stop and write a blocker handoff if equivalence checks reveal another product difference, an immutable evidence file changed, a required regression fails after the approved retry route, or any file outside the allowed scope would need modification.

## Completion Criteria for Luna

Luna is ready to hand off only when the exact corrections and promotion are complete, all checks pass, all unrelated semantics/evidence are preserved, the remediation handoff is complete, `task.md` and `soc.md` remain untouched, and status has moved to `AUDIT` with Terra active.
