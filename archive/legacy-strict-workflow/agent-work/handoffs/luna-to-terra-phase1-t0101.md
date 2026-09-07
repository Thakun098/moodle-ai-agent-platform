# Luna to Terra Handoff — Phase 1 T0101 PlanEnvelope v0.1 DRAFT

- **Requirements version:** 0.1 (approved by user on 2026-08-31)
- **Implementation plan version:** 0.1
- **Assigned phase/task:** Phase 1 — T0101 only
- **Incoming state:** IMPLEMENTATION
- **Outgoing state requested:** AUDIT (Terra)
- **Implementer role:** Luna
- **Contract disposition:** DRAFT — not accepted, frozen, or complete

## Scope completed for audit

The exact planned T0101 review package is present under `packages/contracts`: one PlanEnvelope v0.1 DRAFT schema, seven intended-valid JSON examples, twelve syntactically valid intended-invalid JSON examples, and one human-review notes file. No downstream contract or runtime behavior was added.

### Exact product files

1. `packages/contracts/schemas/draft/plan-envelope.v0.1.schema.json`
2. `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-create-revision-1.json`
3. `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-create-revision-2.json`
4. `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-update.json`
5. `packages/contracts/examples/plan-envelope/v0.1/intended-valid/assignment-create.json`
6. `packages/contracts/examples/plan-envelope/v0.1/intended-valid/assignment-update.json`
7. `packages/contracts/examples/plan-envelope/v0.1/intended-valid/quiz-create.json`
8. `packages/contracts/examples/plan-envelope/v0.1/intended-valid/quiz-update.json`
9. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-schema-version.json`
10. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/malformed-plan-id.json`
11. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/non-positive-revision.json`
12. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-plan-type.json`
13. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-operation.json`
14. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-title.json`
15. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-summary.json`
16. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/invalid-warning-item.json`
17. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-assumption-item.json`
18. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/non-object-content.json`
19. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unknown-envelope-property.json`
20. `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/missing-required-field.json`
21. `packages/contracts/review/plan-envelope-v0.1-draft.md`

The handoff itself is the required lifecycle artifact and is not counted among the 21 product files.

## Draft behavior implemented

The schema proposes exactly the ten baseline envelope properties, all required:

- `$schema`: `https://json-schema.org/draft/2020-12/schema`
- `$id`: `urn:moodle-agent-poc:schema:planning:plan-envelope:0.1`
- DRAFT title/annotations; root object; root `additionalProperties: false`
- `schema_version`: string constant `0.1`
- `plan_id`: exact planned canonical UUID pattern, version nibble `1`–`8`, RFC variant nibble `8`, `9`, `a`, or `b`; no `format`
- `revision`: integer, minimum `1`
- `plan_type`: enum `course`, `assignment`, `quiz`
- `operation`: enum `create`, `update`
- `title`/`summary`: nonblank strings via `minLength: 1` and `pattern: "\\S"`
- `warnings`/`assumptions`: arrays of nonblank plain strings; empty arrays allowed
- `content`: object with `additionalProperties: true`, possibly empty, with no downstream fields defined

All six plan-type/operation combinations remain allowed at this common envelope layer. The schema contains no `$ref`, conditionals, defaults, transforms, custom keywords, external references, Moodle/provider/execution fields, or speculative production metadata.

## Seven proposed decisions represented

These remain proposals for Terra/user review, not frozen decisions:

1. Draft 2020-12 dialect for later composition and modern Ajv compatibility; T0111 still owns exact Ajv version/configuration.
2. Canonical hyphenated RFC UUID pattern rather than a `format` keyword or an early choice of UUID version.
3. Closed root (`additionalProperties: false`) to reject misspellings and accidental operational/provider fields.
4. All ten baseline fields required; empty arrays/object represent explicit absence.
5. Nonblank title, summary, warning, and assumption strings; diagnostics remain plain strings with no speculative size/uniqueness policy.
6. Open object `content` placeholder so T0101 proves the boundary without defining T0102–T0110 payloads.
7. All six plan-type/operation pairs allowed; downstream/domain restrictions remain outside the common envelope.

## Example count and matrix

- JSON files parsed: **20** total = 1 schema + 7 intended-valid + 12 intended-invalid.
- Intended-valid files: **7**.
- Intended-invalid files: **12**, each syntactically valid and isolated to its named mutation.
- Covered pairs: `course|create`, `course|update`, `assignment|create`, `assignment|update`, `quiz|create`, `quiz|update`.
- `course-create-revision-1.json` and `course-create-revision-2.json` share `plan_id` `11111111-1111-4111-8111-111111111111` and use revisions 1 and 2.
- Every intended-valid envelope has exactly ten root keys, `{}` content, artificial UUID/text values, and no downstream payload field.
- Invalid matrix: unsupported schema version; malformed UUID; revision 0; unsupported plan type; unsupported operation; whitespace-only title; whitespace-only summary; numeric warning item; whitespace-only assumption item; array content; unknown root property; and missing `summary` only.

The complete file-by-file matrix, rules, and review gate are in `packages/contracts/review/plan-envelope-v0.1-draft.md`.

## Validation performed and actual results

All checks were run from `C:\moodle-prac\ai-platform` without adding a checker file or dependency.

1. **JSON syntax/count:** inline `node -e` enumeration plus `JSON.parse` over the schema and both example directories. **PASS** — exactly 20 files parsed.
2. **Schema metadata/constraints:** inline `node -e` assertions for dialect, id, DRAFT title, root closure, exact ten properties/required names, const/enum/minimum/pattern rules, and content object/open boundary. **PASS**.
3. **Reference/forbidden-key scan:** recursive inline Node scan. **PASS** — no `$ref`, conditional, default, or format keyword found.
4. **Valid matrix/structure:** inline Node assertions. **PASS** — seven files, six pairs, ten root keys, non-array object content, and shared revision identity.
5. **Invalid isolation:** inline Node assertions restore each fixture's named mutation and compare it to a conforming baseline. **PASS** — all twelve parse and isolate one documented mutation.
6. **Preservation:** inline PowerShell checks. **PASS** — `packages/contracts/src/index.ts` is exactly `export {};`, T0101 remains unchecked, no T0101 SOC completion heading exists, and `TECH_STACK.md` still says `Ajv: TBD`. No Git metadata exists in this project, so a repository diff cannot be produced; preservation is established by the scoped `apply_patch` targets and explicit protected-file checks. Package/config/lockfile and baseline files were not targeted.
7. **Workspace regressions:** `pnpm typecheck`, `pnpm test`, and `pnpm build`. **PASS** after rerunning with approved access to the installed pnpm runtime: typecheck/build completed for all nine workspaces; Vitest exited 0 with the existing `--passWithNoTests` no-test result. The first sandbox-only `pnpm typecheck` attempt failed before pnpm startup with `EPERM` opening the external Corepack cache; this was an environment access issue, not a project test failure.

An additional final lifecycle gate initially produced a false property-count failure due to PowerShell's `PSObject.Properties.Count` accessor behavior on the deserialized schema. The assertion was corrected to count the explicit property collection and passed; no artifact changed during either attempt.

These checks are syntax/structure/manual consistency checks only. They do not constitute standards-compliant JSON Schema validation. No Ajv or `ajv-formats` was installed, no Ajv version was chosen, no runtime validator/API/test/type export was added, and no online schema service was used. T0111 owns executable validator infrastructure; T0112 owns TypeScript alignment.

## Preservation and scope confirmations

- `task.md` was not edited; T0101 remains `[ ]`.
- `soc.md` was not edited; no T0101 completion entry was added.
- `AGENTS.md`, `POC_BASELINE.md`, `Implementation.md`, `PLANNING_CONTRACT.md`, and `TECH_STACK.md` were not edited.
- `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`, root package/workspace files, and `pnpm-lock.yaml` were not edited.
- No TypeScript/runtime source, generated contract output, package script, dependency, test, or application behavior was added.
- No SourceReference, CourseDefinition, SectionPlan, AssignmentPlan, QuizPlan, question-plan, ExecutionRequest, VerificationResult, planning, preview, persistence, MCP, Moodle, or T0102 work was started.
- No `content` example contains a downstream field; all valid content placeholders are `{}`.
- Existing Phase 0 generated `packages/contracts/dist` filenames/observed sizes remained unchanged; no `dist` path was an implementation edit target.

## Deviations, limitations, and blockers

- **No contract deviation:** the implementation follows plan 0.1 exactly.
- **Environment limitation:** the nested project has no Git metadata, so preservation cannot be backed by `git diff`; the explicit content/status checks and scoped edits are recorded above.
- **Regression invocation limitation:** default sandbox access could not open the external Corepack pnpm cache; approved reruns passed.
- **Validation limitation:** Ajv/runtime validation is intentionally deferred to T0111. Do not treat intended-valid/invalid labels or the regression pass as schema certification.
- **Blockers:** none for Terra's independent audit. The contract remains unapproved and must stop at the user review gate.

## Terra audit focus

Please independently inspect the actual files (not only this handoff) for:

- exact dialect/id/DRAFT labeling and absence of speculative envelope fields/references;
- root closure versus deliberately open object `content`;
- all-required and nonblank-string behavior;
- UUID, positive revision, enum, and all-combination proposals;
- complete valid matrix and stable revision identity;
- one-violation isolation across all twelve invalid fixtures;
- review-note accuracy, explicit seven-question decision gate, and correct DRAFT/not-frozen wording;
- no Ajv/dependency/runtime TypeScript/T0102/task/SOC changes;
- truthfulness of dependency-free validation evidence and the stated validation limits.

Terra must not freeze or accept T0101. After audit, the next action is explicit user contract review; user acceptance must be recorded before any later T0101 freeze/completion step, and acceptance must not automatically start T0102.
