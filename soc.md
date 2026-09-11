# soc.md

## Purpose

This file is the **append-only development progress log** for the POC.

Every Agent/developer must add an entry after completing a task from `task.md`.

The next Agent should be able to understand:

- what was implemented,
- why it was implemented that way,
- which files changed,
- what was tested,
- what passed or failed,
- what decisions were made,
- what remains incomplete,
- what should happen next.

This is not a replacement for source control history; it is a human/Agent-readable continuity log.

---

## Mandatory Rule

A task from `task.md` is not complete until:

1. implementation is complete,
2. relevant tests were run,
3. the checkbox is marked `[x]`,
4. a completion entry is appended here.

If a task is blocked or partial, record it here but do **not** mark the task done.

---

## Entry Template

Copy this template for every completed/blocked task.

````md
---

## YYYY-MM-DD HH:mm — TASK-ID — Short Task Name

**Status:** DONE | BLOCKED | PARTIAL | FAILED

### Summary

Briefly explain what was done.

### Files Changed

- `path/to/file`
- `path/to/file`

### Implementation Notes

- Important technical details.
- Important behavior.
- Important assumptions.
- Relevant contract or architecture impact.

### Tests / Validation

Commands/checks performed:

```bash
pnpm test ...
pnpm typecheck
```

Result:

- PASS / FAIL
- Relevant output summary

### Decisions Made

- None

or:

- Decision made and why.
- State whether it changes a previously frozen decision.

### Known Limitations / Follow-up

- Limitation or follow-up.
- Reference another task ID when possible.

### Next Suggested Task

`TASK-ID — Task name`

---
````

---

## Logging Rules

### Be factual

Record what actually exists in the codebase. Do not describe planned work as completed.

### Mention failed tests

If tests fail, state which tests and why.

### Record contract changes

If a JSON Schema, MCP tool schema, API shape, or planning contract changes, explicitly record:

- old behavior,
- new behavior,
- reason,
- impacted files/tasks.

### Record architecture deviations

If implementation cannot follow `AGENTS.md`, `POC_BASELINE.md`, `Implementation.md`, or `PLANNING_CONTRACT.md`, record the deviation before proceeding.

Do not silently work around a frozen decision.

### Keep entries concise but sufficient

The next Agent should be able to continue without reverse engineering the previous task.

---

# Progress Entries

---

## 2026-08-31 14:02 — T0001 — Initialize pnpm workspace

**Status:** DONE

### Summary

Initialized the private pnpm workspace with the approved Node.js 24.18.0 and pnpm 11.25.0 baseline, safe environment example, ignore rules, and generated lockfile.

### Files Changed

- `package.json`
- `pnpm-workspace.yaml`
- `.node-version`
- `.gitignore`
- `.env.example`
- `pnpm-lock.yaml`

### Implementation Notes

- Root development dependencies are exactly TypeScript 5.9.3 and Vitest 3.2.4.
- The workspace globs are limited to `apps/*` and `packages/*`.
- pnpm 11 required a reviewed, package-specific build approval for esbuild; `pnpm-workspace.yaml` commits the sole allowlist entry `allowBuilds.esbuild: true` so frozen installs remain reproducible.

### Tests / Validation

Commands: `node --version`, `corepack install --global pnpm@11.25.0`, `pnpm --version`, `pnpm install`, `pnpm install --frozen-lockfile`, `pnpm list --depth -1 --recursive`.

Result: PASS — Node `v24.18.0`, pnpm `11.25.0`, frozen install succeeded, and nine child workspaces were listed.

### Decisions Made

- **Architecture decisions:** None; the frozen POC architecture and approved workspace layout were unchanged.
- **Implementation/toolchain decisions:** Established Node.js `24.18.0`, pnpm `11.25.0`, TypeScript `5.9.3`, and Vitest `3.2.4` as the exact Phase 0 baseline versions. These are implementation baseline decisions and do not change the frozen POC architecture.

### Known Limitations / Follow-up

- No application dependencies are included until later phases.

### Next Suggested Task

`T0002 — Configure TypeScript`

---

## 2026-08-31 14:02 — T0002 — Configure TypeScript

**Status:** DONE

### Summary

Added the shared strict NodeNext TypeScript configuration, root project references, and reusable child configs.

### Files Changed

- `tsconfig.base.json`
- `tsconfig.json`
- `apps/*/tsconfig.json`
- `packages/*/tsconfig.json`

### Implementation Notes

- Shared settings include `strict`, ES2022, NodeNext, composite/declaration/source maps, and the approved safety flags.
- All nine child configs extend the shared base and compile `src/**/*.ts` into `dist`.

### Tests / Validation

Command: `pnpm typecheck`.

Result: PASS — all nine workspace typechecks completed successfully.

### Decisions Made

- **Architecture decisions:** None; no frozen architecture decision changed.
- **Implementation/toolchain decisions:** Selected ES2022 with NodeNext modules and the documented strict compiler safety flags for the shared TypeScript baseline. These are implementation baseline decisions and do not change the frozen POC architecture.

### Known Limitations / Follow-up

- Entry points are intentionally behavior-free scaffolds.

### Next Suggested Task

`T0003 — Create repository structure`

---

## 2026-08-31 14:02 — T0003 — Create repository structure

**Status:** DONE

### Summary

Created all approved app, package, Moodle boundary, and test directories with nine minimal private Node workspace manifests and `export {};` entrypoints.

### Files Changed

- `apps/api/**`
- `apps/moodle-mcp-server/**`
- `packages/contracts/**`
- `packages/agent-runtime/**`
- `packages/syllabus/**`
- `packages/planning/**`
- `packages/execution/**`
- `packages/verification/**`
- `packages/moodle-client/**`
- `moodle/local_agentpoc/.gitkeep`
- `tests/.gitkeep`

### Implementation Notes

- No application behavior, runtime dependencies, or speculative APIs were added.
- Moodle and tests are retained but are not pnpm workspaces.

### Tests / Validation

Read-only checks confirmed all 11 required boundaries, nine behavior-free entrypoints, and valid JSON manifests/configs. Recursive pnpm listing confirmed nine Node workspaces.

Result: PASS.

### Decisions Made

- **Architecture decisions:** None; the exact approved repository boundaries were used.
- **Implementation/toolchain decisions:** Activated nine private Node workspaces with behavior-free `export {};` entrypoints while retaining Moodle and shared tests as non-workspace boundaries. These are implementation baseline decisions and do not change the frozen POC architecture.

### Known Limitations / Follow-up

- Boundary placeholders await later phase tasks.

### Next Suggested Task

`T0004 — Add development commands`

---

## 2026-08-31 14:02 — T0004 — Add development commands

**Status:** DONE

### Summary

Added root typecheck, test, and recursive build commands that execute from the project root and propagate child failures.

### Files Changed

- `package.json`
- `DEVELOPMENT.md`

### Implementation Notes

- Root test uses `vitest run --passWithNoTests` because Phase 0 contains no tests.
- Linting and formatting are explicitly deferred.

### Tests / Validation

Commands: `pnpm typecheck`, `pnpm test`, `pnpm build`.

Result: PASS — all nine child typechecks/builds completed; Vitest reported no test files and exited 0 as configured.

### Decisions Made

- **Architecture decisions:** None; the approved development-command boundary was unchanged.
- **Implementation/toolchain decisions:** Used Vitest `--passWithNoTests` for the behavior-free Phase 0 scaffold and deferred lint/format selection until source conventions exist. These are implementation baseline decisions and do not change the frozen POC architecture.

### Known Limitations / Follow-up

- Later phases should remove the no-tests allowance when behavior tests are present.

### Next Suggested Task

`T0005 — Create local development environment`

---

## 2026-08-31 14:02 — T0005 — Create local development environment

**Status:** DONE

### Summary

Added the pinned PostgreSQL 17/pgvector 0.8.6 Compose service, idempotent extension initialization, and documented lifecycle/validation/recovery workflow.

### Files Changed

- `compose.yaml`
- `docker/postgres/init/001-enable-vector.sql`
- `DEVELOPMENT.md`

### Implementation Notes

- Compose defines only `postgres`, uses persistent named `postgres_data`, a read-only init mount, and a `pg_isready` health check.
- The service uses `pgvector/pgvector:0.8.6-pg17-bookworm`; no vector retrieval or application migrations were added.

### Tests / Validation

Commands: `docker compose config`; `docker compose up -d postgres`; `docker compose ps`; `docker compose exec -T postgres pg_isready -U moodle_agent_poc -d moodle_agent_poc`; `docker compose exec -T postgres psql -U moodle_agent_poc -d moodle_agent_poc -Atc "SELECT extversion FROM pg_extension WHERE extname = 'vector';"`; `docker compose down`; `docker volume inspect ai-platform_postgres_data --format '{{.Name}}'`.

Result: PASS — config resolved; service became healthy; readiness succeeded; pgvector returned `0.8.6`; normal shutdown preserved the named volume. Initial immediate readiness probe raced startup but the bounded health wait passed.

### Decisions Made

- **Architecture decisions:** None; the frozen PostgreSQL + pgvector local-development architecture was unchanged.
- **Implementation/toolchain decisions:** Selected PostgreSQL `17`, pgvector `0.8.6`, and Docker image `pgvector/pgvector:0.8.6-pg17-bookworm`, with loopback-only publication and reversible normal shutdown. These are implementation baseline decisions and do not change the frozen POC architecture.

### Known Limitations / Follow-up

- Docker Compose used the directory project name `ai-platform` because no `.env` file was present during validation; the named volume was therefore `ai-platform_postgres_data`. `.env.example` documents the optional `moodle-agent-poc` project name.

### Next Suggested Task

`T0101 — Freeze PlanEnvelope v0.1 JSON Schema`

---

## 2026-08-31 15:54 — T0101 — Freeze PlanEnvelope v0.1 JSON Schema

**Status:** DONE

### Summary

Created, reviewed, corrected, independently audited, and froze the declarative PlanEnvelope v0.1 JSON Schema and its review fixtures. T0102 was not started.

### Files Changed

- `packages/contracts/schemas/plan-envelope.v0.1.schema.json`
- `packages/contracts/schemas/draft/plan-envelope.v0.1.schema.json` (created for draft review, then removed after canonical promotion)
- `packages/contracts/examples/plan-envelope/v0.1/intended-valid/**` (7 files)
- `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/**` (12 files)
- `packages/contracts/review/plan-envelope-v0.1-draft.md`
- `packages/contracts/review/plan-envelope-v0.1-freeze.md`
- `.agent-work/requirements-phase1-t0101.md`
- `.agent-work/implementation-plan-phase1-t0101.md`
- `.agent-work/remediation-plan-phase1-t0101-001.md`
- `.agent-work/handoffs/sol-to-luna-phase1-t0101.md`
- `.agent-work/handoffs/luna-to-terra-phase1-t0101.md`
- `.agent-work/handoffs/sol-to-luna-phase1-t0101-remediation-001.md`
- `.agent-work/handoffs/luna-to-terra-phase1-t0101-remediation-001.md`
- `.agent-work/reports/audit-phase1-t0101-draft-001.md`
- `.agent-work/reports/audit-phase1-t0101-final-001.md`
- `.agent-work/status.md`
- `task.md`
- `soc.md`

### Implementation Notes

- The frozen envelope contains exactly `schema_version`, `plan_id`, `revision`, `plan_type`, `operation`, `title`, `summary`, `warnings`, `assumptions`, and `content`.
- Applied Feedback-01 exactly to the `plan_id` description and Feedback-02 exactly to the course-update assumption before final audit.
- Promoted the reviewed schema from the draft path to the sole canonical schema path without changing validation semantics.
- The contract remains declarative, provider-neutral, and Moodle-light; no downstream payload, Executor, MCP, Moodle, or T0102 behavior was added.

### Tests / Validation

Commands/checks performed:

```text
Dependency-free JSON parse, schema-structure, semantic-equivalence, fixture-matrix, invalid-isolation, and SHA-256 preservation checks
pnpm typecheck
pnpm test
pnpm build
```

Result:

- PASS — 20 JSON documents parsed; seven intended-valid and twelve intended-invalid fixtures retained their expected coverage and isolation.
- PASS — Feedback-01 and Feedback-02 matched exactly; the final schema preserved all validation-bearing members.
- PASS — workspace typecheck, Phase 0 Vitest baseline, and build completed.
- PASS — Terra final audit `.agent-work/reports/audit-phase1-t0101-final-001.md` found no validated findings.

### Decisions Made

- **Architecture decisions:** None; the frozen POC architecture was unchanged.
- **Contract decisions:** PlanEnvelope v0.1 uses JSON Schema Draft 2020-12, a closed ten-field root, a stable hyphenated RFC UUID pattern, positive revisions, explicit plan/operation enums, nonblank preview and diagnostic text, and an open object-only `content` composition boundary. All six plan-type/operation combinations remain allowed at the envelope layer.
- These are accepted T0101 contract decisions and do not introduce downstream implementation behavior.

### Known Limitations / Follow-up

- Standards-compliant Ajv/runtime validation remains deferred to T0111; current checks are dependency-free syntax, structure, equivalence, and fixture-consistency checks.
- T0102 remains unchecked and must not begin without separate user authorization.

### Next Suggested Task

`T0102 — Freeze SourceReference v0.1` (await explicit authorization)

---

## 2026-09-01 — T0102 — Freeze SourceReference v0.1

**Status:** DONE

### Summary

Created, reviewed, and froze the minimal reusable SourceReference v0.1 contract. The user reviewed the completed Luna handoff and reported PASS. No PlanEnvelope field or plan-specific content schema was changed.

### Files Changed

- `packages/contracts/schemas/draft/source-reference.v0.1.schema.json` (created for review, then removed after promotion)
- `packages/contracts/schemas/source-reference.v0.1.schema.json`
- `packages/contracts/examples/source-reference/v0.1/intended-valid/**` (8 files)
- `packages/contracts/examples/source-reference/v0.1/intended-invalid/**` (9 files)
- `packages/contracts/review/source-reference-v0.1-draft.md`
- `packages/contracts/review/source-reference-v0.1-freeze.md`
- `.agent-work/requirements-phase1-t0102.md`
- `.agent-work/implementation-plan-phase1-t0102.md`
- `.agent-work/handoffs/sol-to-luna-phase1-t0102.md`
- `.agent-work/handoffs/luna-to-terra-phase1-t0102.md`
- `.agent-work/status.md`
- `task.md`
- `soc.md`

### Implementation Notes

- SourceReference contains only `source`, `page`, `section`, and `text`; only `source` is required.
- The contract remains a small QA/hallucination-review building block rather than production Context Management or lineage.
- T0102 does not specialize PlanEnvelope `content`; T0103–T0110 own later content composition.

### Tests / Validation

Dependency-free JSON parsing, schema-structure checks, eight-valid/nine-invalid fixture evaluation and isolation, frozen-T0101 SHA-256 preservation, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed as recorded in `.agent-work/handoffs/luna-to-terra-phase1-t0102.md`.

### Decisions Made

- **Architecture decisions:** None; the frozen PlanEnvelope and POC architecture were unchanged.
- **Contract decisions:** SourceReference uses a required nonblank free-form `source`, optional one-based `page`, optional nonblank `section` and source-grounded `text`, a closed four-field root, and source-only validity.

### Known Limitations / Follow-up

- JSON Schema cannot prove source naming consistency, excerpt grounding, or page accuracy.
- Ajv/runtime validation remains deferred to T0111; TypeScript alignment remains deferred to T0112.

### Next Suggested Task

`Planning Contracts v0.1 — bundled review for T0103–T0110`

---

## 2026-09-01 — T0103–T0110 — Freeze Planning Contracts v0.1 Bundle

**Status:** DONE

### Summary

Created and froze one combined Planning Contracts v0.1 bundle covering CourseDefinition, SectionPlan, AssignmentPlan, QuizPlan, and all four POC v1 question variants. The user returned `PASS_WITH_ONE_TARGETED_CHANGE`; the requested Quiz Update semantics correction was applied and focused checks passed without splitting or fully re-auditing the bundle.

### Files Changed

- `packages/contracts/schemas/course-definition.v0.1.schema.json`
- `packages/contracts/schemas/section-plan.v0.1.schema.json`
- `packages/contracts/schemas/assignment-plan.v0.1.schema.json`
- `packages/contracts/schemas/quiz-plan.v0.1.schema.json`
- `packages/contracts/schemas/multiple-choice-question-plan.v0.1.schema.json`
- `packages/contracts/schemas/true-false-question-plan.v0.1.schema.json`
- `packages/contracts/schemas/short-answer-question-plan.v0.1.schema.json`
- `packages/contracts/schemas/essay-question-plan.v0.1.schema.json`
- `packages/contracts/schemas/course-plan-content.v0.1.schema.json`
- `packages/contracts/schemas/quiz-update-content.v0.1.schema.json`
- `packages/contracts/schemas/planning-contracts.v0.1.schema.json`
- `packages/contracts/examples/planning-contracts/v0.1/intended-valid/**` (3 files)
- `packages/contracts/examples/planning-contracts/v0.1/intended-invalid/**` (11 files)
- `packages/contracts/review/planning-contracts-v0.1-draft.md`
- `packages/contracts/review/planning-contracts-v0.1-freeze.md`
- `.agent-work/status.md`
- `task.md`
- `soc.md`

### Implementation Notes

- The aggregate schema composes the frozen PlanEnvelope and selects `content` according to `plan_type` without adding root fields.
- `quiz/create` uses `QuizPlan.questions`; `quiz/update` uses explicit `questions_to_add` and `questions_to_update` arrays.
- Empty Quiz Update arrays mean no question mutations; existing questions remain unchanged unless listed for update; removal is unsupported.
- Execution target IDs remain outside planning and belong to T0113.

### Tests / Validation

- PASS — all 13 canonical schemas parse, schema IDs are unique, and all 30 `$ref` targets resolve.
- PASS — 3 aggregate valid examples and 11 mapped invalid examples passed the focused dependency-free evaluator expectations.
- PASS — targeted Quiz Update ambiguity assertions and canonical-path checks.
- PASS — frozen PlanEnvelope SHA-256 remained `2372EBF32A363F4CDDF0929B672CD440F8B4C13C916142766C225B229EDFE571`.
- PASS — original bundle `pnpm typecheck`, `pnpm test`, and `pnpm build`; focused post-correction `pnpm typecheck`.

### Decisions Made

- **Architecture decisions:** None; PlanEnvelope root, SourceReference, and the frozen POC architecture were unchanged.
- **Contract decisions:** Accepted the combined required/optional fields, local-ref patterns, activity/question discriminated unions, positive grade/mark rules, create/update content mappings, and the explicit non-destructive Quiz Update semantics documented in the freeze record.

### Known Limitations / Follow-up

- Ajv/runtime validation remains deferred to T0111; TypeScript alignment remains deferred to T0112.
- Ref uniqueness, position collisions, choice-reference membership, grounding, educational correctness, and cross-revision identity remain domain invariants.

### Next Suggested Task

`T0111 — Implement Ajv JSON Schema validation` (not started)

---

## 2026-09-01 10:31 — T0111 — Implement Ajv JSON Schema validation

**Status:** DONE

### Summary

Added an Ajv Draft 2020-12 schema registry and public validation API for all 13 frozen planning schemas. Added fixture-driven tests covering PlanEnvelope, SourceReference, aggregate Planning Contracts, component failures, normalized errors, and unknown schema handling.

### Files Changed

- `package.json`
- `packages/contracts/package.json`
- `pnpm-lock.yaml`
- `TECH_STACK.md`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/validation/planning-contract-validator.ts`
- `packages/contracts/test/planning-contract-validator.test.ts`
- `task.md`
- `soc.md`
- `.agent-work/status.md`

### Implementation Notes

- Pinned Ajv `8.20.0` and used its dedicated `Ajv2020` class for JSON Schema Draft 2020-12.
- Registered all canonical schemas by `$id`; unresolved or duplicate schema relationships fail during module initialization/compilation.
- Exposed validators for PlanEnvelope, SourceReference, aggregate Planning Contracts, and arbitrary registered planning schema IDs.
- Returned normalized validation errors rather than exposing mutable Ajv error state.
- Added `@types/node` `24.13.3` to match the pinned Node 24 runtime and support filesystem-based schema loading.

### Tests / Validation

Commands/checks performed:

```text
pnpm typecheck
pnpm test
pnpm build
node --input-type=module -e <compiled runtime validation smoke check>
```

Result:

- Initial typecheck failed because Node type declarations were absent and the default Ajv CommonJS import was not constructable under NodeNext. Added matching Node 24 typings and switched to Ajv's named `Ajv2020` export; rerun passed across all nine workspaces.
- Initial test run passed 51/52 tests; the unknown-schema test exposed Ajv URI parsing before the public typed error. Added a registry-membership guard before `getSchema`; rerun passed all 52 tests.
- Build passed across all nine workspaces.
- Compiled runtime smoke check passed with 13 registered schemas and a valid aggregate course plan.

### Decisions Made

- **Architecture decisions:** None; schema ownership and frozen contract boundaries were unchanged.
- **Implementation/toolchain decisions:** Selected Ajv `8.20.0`, `Ajv2020`, `allErrors: true`, and strict mode with only `strictTypes: false` because the frozen composition schemas establish object type through their outer PlanEnvelope/allOf branch. No format plugin was added because the contracts use no `format` keyword.
- **API decisions:** Validation accepts `unknown`, returns a discriminated valid/error result, normalizes error fields, and throws `UnknownPlanningSchemaError` for unregistered schema IDs.

### Known Limitations / Follow-up

- T0112 still owns TypeScript types aligned with the accepted planning schemas.
- Domain invariants such as ref uniqueness, section-position collisions, choice-reference membership, grounding, and stable identity across revisions remain outside Ajv validation of one document.

### Next Suggested Task

`T0112 — Align TypeScript types with schemas`

---

## 2026-09-01 10:51 — T0112 — Align TypeScript Types with Schemas

**Status:** DONE

### Summary

Added TypeScript interfaces, tuple constraints, discriminated unions, public exports, Ajv-backed type guards, compile-time alignment assertions, and runtime narrowing tests for all frozen planning contracts.

### Files Changed

- `packages/contracts/package.json`
- `packages/contracts/tsconfig.type-tests.json`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/planning/contracts.ts`
- `packages/contracts/src/validation/planning-contract-validator.ts`
- `packages/contracts/type-tests/planning-contracts.type-test.ts`
- `packages/contracts/test/planning-types.test.ts`
- `task.md`
- `soc.md`
- `.agent-work/status.md`

### Implementation Notes

- Added typed representations for PlanEnvelope, SourceReference, CourseDefinition, SectionPlan, AssignmentPlan, QuizPlan, QuizUpdateContent, all four question variants, and derived plan/content unions.
- Represented schema cardinality where TypeScript can express it: non-empty arrays, at-least-two choices, and exactly one correct choice reference.
- Preserved Quiz create/update discrimination: create uses `questions`; update uses `questions_to_add` and `questions_to_update`.
- Added `isPlanEnvelope`, `isSourceReference`, and `isPlanningContract` guards backed by the T0111 Ajv validators.
- Added a separate compile-only type-test configuration so alignment assertions run during the normal workspace typecheck without entering production output.

### Tests / Validation

Commands/checks performed:

```text
pnpm typecheck
pnpm test
pnpm build
node --input-type=module -e <compiled type-guard runtime smoke check>
```

Result:

- Typecheck passed across all nine workspaces, including the new compile-time type assertions.
- Initial runtime run passed 55/56 tests; one test incorrectly expected page `4` while the frozen fixture contains page `1`. Source trace confirmed the validator did not define that value and the test expectation was corrected. Rerun passed all 56 tests.
- Build passed and emitted the expected public `.d.ts` declarations.
- Compiled runtime guards accepted the frozen quiz-update and SourceReference examples.

### Decisions Made

- **Architecture decisions:** None; frozen JSON Schemas remain the runtime source of truth.
- **Type decisions:** Used discriminated unions for plan, activity, and question variants; tuple types for schema minimum/exact cardinality; optional properties only where the schema permits omission.
- **API decisions:** Type guards narrow from `unknown` only after Ajv validation, preventing unchecked casts at input boundaries.

### Known Limitations / Follow-up

- Regex formats, positive numeric constraints, unique refs, reference membership, grounding, position collisions, and cross-revision invariants remain runtime/domain checks rather than TypeScript type guarantees.
- Future schema changes must update both the frozen schema fixtures and compile-time alignment tests.

### Next Suggested Task

`T0113 — Freeze ExecutionRequest v0.1`

---

---

## 2026-09-01 11:17 — T0113 — Freeze ExecutionRequest v0.1

**Status:** DONE

### Summary

Accepted and froze ExecutionRequest v0.1 after review. The contract references one explicit plan revision and supplies only the Moodle target context required for execution.

### Files Changed

- `packages/contracts/schemas/execution-request.v0.1.schema.json`
- `packages/contracts/review/execution-request-v0.1-freeze.md`
- `packages/contracts/src/planning/contracts.ts`
- `packages/contracts/src/validation/planning-contract-validator.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/test/execution-request-validator.test.ts`
- `packages/contracts/type-tests/planning-contracts.type-test.ts`
- `task.md`
- `soc.md`

### Implementation Notes

- Supported targets are course create, existing-section create, Assignment update, and Quiz update.
- `plan_type` and `operation` are not duplicated; the executor must load the referenced plan revision and enforce target compatibility as a domain invariant.
- The draft schema was promoted to the canonical schema path and draft wording was removed.
- Planning schema loading was restored to canonical-only behavior after promotion.

### Tests / Validation

- PASS — `pnpm typecheck`.
- PASS — `pnpm test`: 74/74 tests across 4 files.
- PASS — `pnpm build` across all nine workspaces.

### Decisions Made

- ExecutionRequest remains intentionally minimal: `plan_id`, `revision`, and exactly one closed target object.
- Delete/remove targets and production execution metadata remain out of scope.

### Known Limitations / Follow-up

- Plan/target compatibility requires plan lookup and domain validation during execution.

### Next Suggested Task

`T0114 — Freeze VerificationResult v0.1`

---

## 2026-09-01 11:17 — T0114 — Freeze VerificationResult v0.1

**Status:** DONE

### Summary

Defined and froze the final Phase 1 contract, VerificationResult v0.1, including TypeScript types, Ajv-backed validation, fixtures, runtime tests, and compile-time narrowing checks.

### Files Changed

- `packages/contracts/schemas/verification-result.v0.1.schema.json`
- `packages/contracts/review/verification-result-v0.1-freeze.md`
- `packages/contracts/examples/verification-result/v0.1/intended-valid/**`
- `packages/contracts/examples/verification-result/v0.1/intended-invalid/**`
- `packages/contracts/src/verification/contracts.ts`
- `packages/contracts/src/validation/verification-result-validator.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/test/verification-result-validator.test.ts`
- `packages/contracts/type-tests/verification-result.type-test.ts`
- `task.md`
- `soc.md`
- `.agent-work/status.md`

### Implementation Notes

- Root fields are `plan_id`, `revision`, `passed`, and `issues`.
- `passed: true` requires `issues: []`; `passed: false` requires at least one issue.
- Issue kinds are `mismatch`, `missing`, `unexpected`, and `read_error`.
- Issues require `kind`, `path`, and `message`; `expected` and `actual` are optional JSON values.
- VerificationResult uses a separate validator boundary and does not change the planning-schema registry API.

### Tests / Validation

- PASS — `pnpm typecheck` across all nine workspaces, including compile-only type tests.
- PASS — `pnpm test`: 74/74 tests; VerificationResult suite 6/6.
- PASS — `pnpm build` across all nine workspaces.

### Decisions Made

- VerificationResult records deterministic expected-vs-actual verification only; production audit/security/timestamp/rollback metadata is excluded.
- Phase 14 owns comparison logic and persistence around this frozen result shape.

### Known Limitations / Follow-up

- The schema does not itself perform Moodle read-back or semantic comparison.

### Next Suggested Task

`T0201 — Configure Drizzle + PostgreSQL`

---

## 2026-09-01 12:00 — T0201 — Configure Drizzle + PostgreSQL

**Status:** DONE

### Summary

Configured Drizzle ORM (0.45.2), Drizzle Kit (0.31.10), and the PostgreSQL driver (`pg` 8.23.0) within `packages/agent-runtime`, adding root `drizzle.config.ts`, connection pooling with fail-fast `DATABASE_URL` validation, and migration infrastructure.

### Files Changed

- `packages/agent-runtime/package.json`
- `packages/contracts/package.json`
- `packages/agent-runtime/tsconfig.json`
- `TECH_STACK.md`
- `drizzle.config.ts`
- `packages/agent-runtime/src/db/connection.ts`
- `packages/agent-runtime/src/db/index.ts`
- `packages/agent-runtime/src/db/migrate.ts`
- `packages/agent-runtime/test/db-connection.test.ts`
- `task.md`
- `soc.md`

### Implementation Notes

- `DATABASE_URL` is strictly required and fails fast if missing or blank (no implicit fallback).
- Persistence ownership is assigned exclusively to `packages/agent-runtime`.
- Root `drizzle.config.ts` outputs migrations to `db/migrations/` using cross-platform path normalization.

### Tests / Validation

- PASS — `pnpm typecheck` across all 9 workspaces.
- PASS — `packages/agent-runtime/test/db-connection.test.ts` (3/3 tests passing fail-fast checks).
- PASS — `pnpm build` across all 9 workspaces.

### Decisions Made

- Ownership of persistence models, DB clients, and repositories belongs to `packages/agent-runtime`.
- Pinned Drizzle ORM 0.45.2 and pg 8.23.0.

### Known Limitations / Follow-up

- Migrations require active PostgreSQL service during execution.

### Next Suggested Task

`T0202 — Create poc_run migration/model`

---

## 2026-09-01 12:00 — T0202 — Create poc_run migration/model

**Status:** DONE

### Summary

Created the `poc_run` table schema in Drizzle and generated the SQL migration to track run lifecycle, syllabus metadata, model identifier, execution timestamps, status, and final results.

### Files Changed

- `packages/agent-runtime/src/db/schema/runs.ts`
- `packages/agent-runtime/src/db/schema/index.ts`
- `db/migrations/0000_mean_morlocks.sql`
- `packages/agent-runtime/test/schema.test.ts`
- `task.md`
- `soc.md`

### Implementation Notes

- `run_id` serves as the primary key (`varchar(36)` UUID).
- `status` supports `pending | planning | preview | executing | completed | failed`.
- `syllabus_metadata` stores JSONB metadata (filename, byte size, hash, media type).

### Tests / Validation

- PASS — `packages/agent-runtime/test/schema.test.ts` column definitions verified.
- PASS — `drizzle-kit generate` produced SQL migration.

### Decisions Made

- Proposed status enum values: `pending`, `planning`, `preview`, `executing`, `completed`, `failed`.

### Known Limitations / Follow-up

- Data access methods added in T0208.

### Next Suggested Task

`T0203 — Create poc_plan migration/model`

---

## 2026-09-01 12:00 — T0203 — Create poc_plan migration/model

**Status:** DONE

### Summary

Created the `poc_plan` table schema and SQL migration for immutable plan revisions with a required `run_id NOT NULL` foreign key and a unique `(plan_id, revision)` constraint.

### Files Changed

- `packages/agent-runtime/src/db/schema/plans.ts`
- `packages/agent-runtime/src/db/schema/index.ts`
- `db/migrations/0000_mean_morlocks.sql`
- `packages/agent-runtime/test/schema.test.ts`
- `task.md`
- `soc.md`

### Implementation Notes

- `run_id` is defined as `NOT NULL` referencing `poc_run(run_id) ON DELETE CASCADE`.
- `UNIQUE(plan_id, revision)` constraint enforces plan revision immutability.
- Stores `raw_envelope` (typed as `AnyPlanEnvelope`), `content` JSONB, and `validation_status` / `validation_errors`.

### Tests / Validation

- PASS — `packages/agent-runtime/test/schema.test.ts` schema tests.
- PASS — SQL migration generated with `ON DELETE CASCADE`.

### Decisions Made

- Enforced `run_id NOT NULL` so every plan revision is explicitly tied to a generating run.

### Known Limitations / Follow-up

- None.

### Next Suggested Task

`T0204 — Create poc_message migration/model`

---

## 2026-09-01 12:00 — T0204 — Create poc_message migration/model

**Status:** DONE

### Summary

Created the `poc_message` table schema and SQL migration to record Agent conversation steps, roles (`system`, `user`, `assistant`, `tool`), content, and tool call payloads.

### Files Changed

- `packages/agent-runtime/src/db/schema/messages.ts`
- `packages/agent-runtime/src/db/schema/index.ts`
- `db/migrations/0000_mean_morlocks.sql`
- `packages/agent-runtime/test/schema.test.ts`
- `task.md`
- `soc.md`

### Implementation Notes

- Foreign key `run_id NOT NULL REFERENCES poc_run(run_id) ON DELETE CASCADE`.
- Ordered by `step_number` and `created_at`.

### Tests / Validation

- PASS — `packages/agent-runtime/test/schema.test.ts`.

### Decisions Made

- Message roles typed as `"system" | "user" | "assistant" | "tool"`.

### Known Limitations / Follow-up

- None.

### Next Suggested Task

`T0205 — Create poc_tool_call migration/model`

---

## 2026-09-01 12:00 — T0205 — Create poc_tool_call migration/model

**Status:** DONE

### Summary

Created the `poc_tool_call` table schema and SQL migration to log every MCP tool call, step number, input arguments, normalized result, latency duration, status, and errors.

### Files Changed

- `packages/agent-runtime/src/db/schema/tool-calls.ts`
- `packages/agent-runtime/src/db/schema/index.ts`
- `db/migrations/0000_mean_morlocks.sql`
- `packages/agent-runtime/test/schema.test.ts`
- `task.md`
- `soc.md`

### Implementation Notes

- `tool_call_id` has a unique constraint to ensure no duplicate call records.
- Foreign key `run_id NOT NULL REFERENCES poc_run(run_id) ON DELETE CASCADE`.

### Tests / Validation

- PASS — `packages/agent-runtime/test/schema.test.ts`.

### Decisions Made

- Status options: `"success" | "error" | "timeout"`.

### Known Limitations / Follow-up

- None.

### Next Suggested Task

`T0206 — Create poc_execution_mapping migration/model`

---

## 2026-09-01 12:00 — T0206 — Create poc_execution_mapping migration/model

**Status:** DONE

### Summary

Created the `poc_execution_mapping` table schema and SQL migration with revision-aware uniqueness `UNIQUE(run_id, plan_id, revision, local_ref)` to map plan-local references to materialized Moodle IDs.

### Files Changed

- `packages/agent-runtime/src/db/schema/execution-mappings.ts`
- `packages/agent-runtime/src/db/schema/index.ts`
- `db/migrations/0000_mean_morlocks.sql`
- `packages/agent-runtime/test/schema.test.ts`
- `task.md`
- `soc.md`

### Implementation Notes

- `UNIQUE(run_id, plan_id, revision, local_ref)` ensures that within a run executing a specific plan revision, local refs (e.g. `quiz-01`) map deterministically to Moodle IDs.
- `target_type` covers `course | section | assignment | quiz | question`.

### Tests / Validation

- PASS — `packages/agent-runtime/test/schema.test.ts`.

### Decisions Made

- Uniqueness is explicitly revision-aware `(run_id, plan_id, revision, local_ref)`.

### Known Limitations / Follow-up

- None.

### Next Suggested Task

`T0207 — Create poc_verification migration/model`

---

## 2026-09-01 12:00 — T0207 — Create poc_verification migration/model

**Status:** DONE

### Summary

Created the `poc_verification` table schema and SQL migration strictly aligned with the frozen `VerificationResult v0.1` contract, storing `plan_id`, `revision`, `passed`, `issues`, expected projection, and observed Moodle structure.

### Files Changed

- `packages/agent-runtime/src/db/schema/verifications.ts`
- `packages/agent-runtime/src/db/schema/index.ts`
- `db/migrations/0000_mean_morlocks.sql`
- `packages/agent-runtime/test/schema.test.ts`
- `task.md`
- `soc.md`

### Implementation Notes

- Typed issues match `VerificationIssue[]` from `@moodle-agent-poc/contracts`.
- Foreign key `run_id NOT NULL REFERENCES poc_run(run_id) ON DELETE CASCADE`.

### Tests / Validation

- PASS — `packages/agent-runtime/test/schema.test.ts`.

### Decisions Made

- Aligned with frozen `VerificationResult v0.1` schema without adding unneeded production audit fields.

### Known Limitations / Follow-up

- None.

### Next Suggested Task

`T0208 — Add data access/repository layer`

---

## 2026-09-01 12:00 — T0208 — Add data access/repository layer

**Status:** DONE

### Summary

Implemented type-safe repository classes (`RunRepository`, `PlanRepository`, `MessageRepository`, `ToolCallRepository`, `ExecutionMappingRepository`, `VerificationRepository`) providing clean data access methods and validating contracts at boundaries.

### Files Changed

- `packages/agent-runtime/src/repositories/run-repository.ts`
- `packages/agent-runtime/src/repositories/plan-repository.ts`
- `packages/agent-runtime/src/repositories/message-repository.ts`
- `packages/agent-runtime/src/repositories/tool-call-repository.ts`
- `packages/agent-runtime/src/repositories/execution-mapping-repository.ts`
- `packages/agent-runtime/src/repositories/verification-repository.ts`
- `packages/agent-runtime/src/repositories/index.ts`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-runtime/test/persistence.integration.test.ts`
- `task.md`
- `soc.md`

### Implementation Notes

- `VerificationRepository.recordVerification` validates incoming records with `validateVerificationResult`.
- `ExecutionMappingRepository.setMapping` provides atomic upsert capability on conflict.
- `PlanRepository.savePlanRevision` enforces unique revision storage.

### Tests / Validation

- PASS — `packages/agent-runtime/test/persistence.integration.test.ts` with real PostgreSQL container.
- PASS — `pnpm typecheck` & `pnpm build`.

### Decisions Made

- Repositories encapsulate all Drizzle query building, exposing clean async methods to higher layers.

### Known Limitations / Follow-up

- None.

### Next Suggested Task

`T0209 — Add minimal operation idempotency persistence`

---

## 2026-09-01 12:00 — T0209 — Add minimal operation idempotency persistence

**Status:** DONE

### Summary

Implemented atomic, mutation-aware idempotency persistence using the `poc_idempotency_key` table, `IdempotencyRepository`, and key format `${run_id}:${plan_id}:${revision}:${local_ref}:${tool_name}`.

### Files Changed

- `packages/agent-runtime/src/db/schema/idempotency.ts`
- `packages/agent-runtime/src/repositories/idempotency-repository.ts`
- `packages/agent-runtime/src/repositories/index.ts`
- `packages/agent-runtime/test/persistence.integration.test.ts`
- `task.md`
- `soc.md`

### Implementation Notes

- Key format: `${runId}:${planId}:${revision}:${localRef}:${toolName}`.
- `tryAcquire` uses atomic `INSERT ... ON CONFLICT DO NOTHING` to transition between `in_flight`, `cached` (with stored result payload), or `acquired`.
- Allows controlled retry upon prior failure by transitioning `failed` $\rightarrow$ `in_flight`.
- Tested with real PostgreSQL instance under concurrency and retry conditions.

### Tests / Validation

- PASS — Real PostgreSQL integration test in `persistence.integration.test.ts` (92/92 total monorepo tests passing).
- PASS — `pnpm typecheck` and `pnpm build` across all workspaces.

### Decisions Made

- Idempotency key uses `${runId}:${planId}:${revision}:${localRef}:${toolName}` as approved.

### Known Limitations / Follow-up

- None. Phase 2 is complete.

### Next Suggested Task

`T0209 — Phase 2 Targeted Remediation`

---

## 2026-09-01 13:20 — Phase 2 Targeted Remediation — Acceptance Hardening

**Status:** DONE

### Summary

Applied the 5 targeted Phase 2 acceptance hardening items: atomic idempotency retry conditional updates with concurrency tests, `varchar(255)` idempotency key capacity, immutable execution mapping Moodle ID enforcement, composite plan-revision foreign keys `(plan_id, revision)`, and `PlanRepository` valid-state schema guard.

### Files Changed

- `packages/agent-runtime/src/db/schema/idempotency.ts`
- `packages/agent-runtime/src/db/schema/execution-mappings.ts`
- `packages/agent-runtime/src/db/schema/verifications.ts`
- `packages/agent-runtime/src/repositories/idempotency-repository.ts`
- `packages/agent-runtime/src/repositories/execution-mapping-repository.ts`
- `packages/agent-runtime/src/repositories/plan-repository.ts`
- `db/migrations/0000_gifted_donald_blake.sql`
- `packages/agent-runtime/test/schema.test.ts`
- `packages/agent-runtime/test/persistence.integration.test.ts`
- `soc.md`

### Implementation Notes

1. **Atomic Idempotency Retry**: `IdempotencyRepository.tryAcquire()` conditionally updates failed records using `WHERE idempotency_key = ? AND status = 'failed' RETURNING *`. Under concurrent `Promise.all()` retries, exactly one caller transitions to `acquired` while losing callers receive `in_flight`.
2. **Idempotency Key Capacity**: Increased `poc_idempotency_key.idempotency_key` to `varchar(255)` to accommodate long `local_ref` and `tool_name` combinations.
3. **Decision A1 (Immutable Moodle ID)**: `ExecutionMappingRepository.setMapping()` allows safe repeat with identical `moodle_id` (refreshing metadata) and throws an explicit mapping conflict error if a different `moodle_id` is supplied for the same `(run_id, plan_id, revision, local_ref)`.
4. **Decision A2 (Composite Plan-Revision Foreign Keys)**: Added composite foreign keys referencing `poc_plan(plan_id, revision) ON DELETE CASCADE` on `poc_execution_mapping`, `poc_verification`, and `poc_idempotency_key`. Foreign key violations are tested on nonexistent revisions.
5. **Decision A3 (Valid-State Guard)**: `PlanRepository.savePlanRevision()` validates `rawEnvelope` using `validatePlanningContract()` when `validationStatus === "valid"`, throwing an explicit error on invalid schemas while allowing `validationStatus === "invalid"` records for debugging.

### Tests / Validation

- PASS — Real PostgreSQL integration test suite in `persistence.integration.test.ts` (17 integration tests covering concurrency, foreign keys, immutability, and valid guard).
- PASS — Total monorepo tests: 101/101 passing (7 test suites).
- PASS — `pnpm typecheck` across all 9 workspaces.
- PASS — `pnpm build` across all 9 workspaces.

### Decisions Made

- Adopted Decisions A1, A2, and A3 as approved.
- Upgraded idempotency key column length to `varchar(255)`.

### Known Limitations / Follow-up

- None. Phase 2 is fully hardened and accepted.

### Next Suggested Task

`T0301 — Bootstrap Fastify API app` (Phase 3)

---

## 2026-09-01 13:46 — T0301–T0306 — Phase 3: Fastify AI Platform Skeleton

**Status:** DONE

### Summary

Bootstrapped the Fastify HTTP API service (`apps/api`) for the Moodle AI Platform POC with liveness-only `/health` endpoint, canonical Fastify `request.id` correlation, optional `x-run-id` validation/attachment, centralized error handling with sanitized 500 responses, structured Pino logging, and strongly typed fail-fast configuration loading.

### Tasks Completed

- **T0301 — Bootstrap Fastify API app**: Installed Fastify v5.12.1 in `apps/api`, created application factory `buildApp()` and server entrypoint `server.ts`.
- **T0302 — Add health endpoint**: Implemented `GET /health` as liveness-only check (Decision D1) returning `{ status: "ok", uptime, timestamp }` without external database queries.
- **T0303 — Add central error shape**: Implemented central error handler formatting client and server errors into `{ error: { code, message, details, request_id } }` with sanitized 500 responses (no stack trace or internal query leaks) and custom not-found handler.
- **T0304 — Add run ID/request correlation**: Configured Fastify canonical `request.id` (Decision D2), returned `x-request-id` response header, and attached optional validated `x-run-id` (UUID format, Decision D3).
- **T0305 — Add structured development logging**: Configured Fastify/Pino logger with request serializers including `request_id`, `run_id`, method, url, status, and duration.
- **T0306 — Add configuration loader**: Implemented `loadConfig()` with required fail-fast `DATABASE_URL`, `OLLAMA_MODEL=gemma4:e2b` default (Decision D4), strict numeric bounds validation (port, agent steps, timeouts), and optional Moodle/MCP/Ollama settings.

### Files Changed

- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/config/config-loader.ts`
- `apps/api/src/plugins/correlation.ts`
- `apps/api/src/plugins/error-handler.ts`
- `apps/api/src/routes/health.ts`
- `apps/api/src/app.ts`
- `apps/api/src/server.ts`
- `apps/api/src/index.ts`
- `apps/api/test/config-loader.test.ts`
- `apps/api/test/health.test.ts`
- `apps/api/test/correlation.test.ts`
- `apps/api/test/error-handler.test.ts`
- `TECH_STACK.md`
- `.env.example`
- `task.md`
- `soc.md`

### Tests / Validation

- PASS — `apps/api/test/config-loader.test.ts` (5 tests)
- PASS — `apps/api/test/health.test.ts` (1 test)
- PASS — `apps/api/test/correlation.test.ts` (5 tests)
- PASS — `apps/api/test/error-handler.test.ts` (3 tests)
- PASS — Total monorepo tests: 115/115 passing across 11 test suites.
- PASS — `pnpm typecheck` across all 9 workspaces.
- PASS — `pnpm build` across all 9 workspaces.

### Decisions Made

- Adopted Decisions D1, D2, D3, and D4 as approved.
- Excluded `@fastify/cors` and `@fastify/sensible` until immediate POC requirements arise.

### Known Limitations / Follow-up

- None. Phase 3 is complete.

### Next Suggested Task

`T0401 — Define minimal NormalizedSyllabus contract` (Phase 4)

---

## 2026-09-01 14:44 — T0401–T0409 — Phase 4: Syllabus Ingestion

**Status:** DONE

### Summary

Implemented the complete deterministic Syllabus Ingestion system across `packages/contracts`, `packages/syllabus`, `packages/agent-runtime`, and `apps/api`. Implemented `NormalizedSyllabus` JSON Schema v0.1 with Ajv validation, deterministic extractors for `.txt`, `.md`, `.docx` (Mammoth), and `.pdf` (pdf-parse v2), scanned PDF `OCR_REQUIRED` detection, format-specific provenance tracking (line, paragraph, page), and the `POST /api/runs` multipart file upload endpoint (10 MB limit) with `poc_run` lifecycle persistence.

### Tasks Completed

- **T0401 — Define minimal NormalizedSyllabus contract**: Defined JSON Schema `normalized-syllabus.v0.1.schema.json` (Draft 2020-12) and TypeScript interfaces with optional `course_title` (Decision P4-D1), stable arrays, and `SyllabusMetadata` with raw byte SHA-256.
- **T0402 — Add `.txt` ingestion**: Deterministic UTF-8 plain-text extraction with line provenance (`kind: "line"`).
- **T0403 — Add `.md` ingestion**: Explicit Markdown structure parsing (headings, bullet lists, weekly units, objectives, assessment) with line-range provenance.
- **T0404 — Add `.docx` text extraction**: Deterministic DOCX extraction using `mammoth` with 1-based paragraph sequence index provenance (`kind: "paragraph"`).
- **T0405 — Add machine-readable `.pdf` text extraction**: Deterministic PDF extraction using `pdf-parse` v2 with page provenance (`kind: "page"`).
- **T0406 — Reject/flag scanned PDF requiring OCR**: Implemented text-density heuristic returning typed error `OCR_REQUIRED` (HTTP 422, Decision P4-D7) without OCR dependencies, distinct from `EXTRACTION_FAILED`.
- **T0407 — Add syllabus upload endpoint**: Implemented `POST /api/runs` using `@fastify/multipart` (10 MB limit, Decision P4-D5 & P4-D6) creating `poc_run` with `status: "pending"`, persisting `normalized_syllabus` JSONB in PostgreSQL, and handling failed transitions.
- **T0408 — Preserve minimal source-position metadata when practical**: Captured format-specific `SyllabusSourceLocation` across all four formats (line, paragraph, page).
- **T0409 — Add syllabus extraction tests**: Created fixtures and comprehensive test suites covering valid/partial/corrupted TXT, MD, DOCX, machine-readable PDF, scanned PDF, empty files, files > 10 MB, and multipart upload route tests.

### Files Changed

- `packages/contracts/schemas/normalized-syllabus.v0.1.schema.json`
- `packages/contracts/src/syllabus/contracts.ts`
- `packages/contracts/src/validation/syllabus-validator.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/validation/planning-contract-validator.ts`
- `packages/contracts/test/syllabus-validator.test.ts`
- `packages/agent-runtime/src/db/schema/runs.ts`
- `packages/agent-runtime/src/db/index.ts`
- `packages/agent-runtime/src/repositories/run-repository.ts`
- `packages/agent-runtime/test/schema.test.ts`
- `db/migrations/0000_flippant_agent_zero.sql`
- `packages/syllabus/package.json`
- `packages/syllabus/tsconfig.json`
- `packages/syllabus/src/errors/ingestion-errors.ts`
- `packages/syllabus/src/types.ts`
- `packages/syllabus/src/normalizer/deterministic-normalizer.ts`
- `packages/syllabus/src/extractors/text-extractor.ts`
- `packages/syllabus/src/extractors/markdown-extractor.ts`
- `packages/syllabus/src/extractors/docx-extractor.ts`
- `packages/syllabus/src/extractors/pdf-extractor.ts`
- `packages/syllabus/src/ingest.ts`
- `packages/syllabus/src/index.ts`
- `packages/syllabus/test/fixtures/valid-syllabus.md`
- `packages/syllabus/test/fixtures/valid-syllabus.txt`
- `packages/syllabus/test/fixtures/partial-syllabus.txt`
- `packages/syllabus/test/syllabus-ingestion.test.ts`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/src/routes/runs.ts`
- `apps/api/src/app.ts`
- `apps/api/src/index.ts`
- `apps/api/test/runs.test.ts`
- `TECH_STACK.md`
- `task.md`
- `soc.md`

### Tests / Validation

- PASS — `packages/contracts/test/syllabus-validator.test.ts` (6 tests)
- PASS — `packages/syllabus/test/syllabus-ingestion.test.ts` (11 tests)
- PASS — `apps/api/test/runs.test.ts` (4 tests)
- PASS — Total monorepo tests: 136/136 passing across 14 test suites.
- PASS — `pnpm typecheck` across all 9 workspaces.
- PASS — `pnpm build` across all 9 workspaces.

### Decisions Made

- Adopted Decisions P4-D1 through P4-D7 as approved.
- DOCX paragraph provenance convention: 1-based index in the sequence of extracted non-empty paragraphs.
- Normalized syllabus and raw text persisted in `poc_run.normalized_syllabus` JSONB column.

### Known Limitations / Follow-up

- None. Phase 4 is complete.

### Next Suggested Task

`T0501 — Implement Ollama client abstraction` (Phase 5)

---

## 2026-09-01 15:06 — Phase 4 Targeted Remediation — Final Acceptance

**Status:** DONE

### Summary

Applied targeted remediation addressing all 6 review findings (R1–R6), expanded API/lifecycle integration tests (R7), preserved `GET /api/runs/:runId` (P4-D9), and enforced file extension/MIME consistency (P4-D8). Fastify health/correlation/error tests are completely independent of PostgreSQL.

### Remediation Details

- **R1 — Fastify / Health Independence from PostgreSQL**: Refactored `runsRoutes` to resolve `RunRepository` lazily inside route handlers instead of plugin registration time. Booting Fastify via `buildApp()` without `DATABASE_URL` now succeeds cleanly for `/health`, correlation, and error handlers.
- **R2 — Restored Additive Migration History**: Restored Phase 2 baseline migration as `0000_gifted_donald_blake.sql` and added incremental Phase 4 migration `0001_add_normalized_syllabus.sql` (`ALTER TABLE "poc_run" ADD COLUMN "normalized_syllabus" jsonb;`) with updated `meta/_journal.json`.
- **R3 — Corrected DOCX Paragraph Provenance**: Updated deterministic normalizer and `docx-extractor.ts` to build an explicit sequence of non-empty paragraphs and map provenance as strict 1-based sequential indices (`1, 2, 3...`) regardless of blank lines in the source.
- **R4 — Enforced P4-D8 File Type Consistency**: Generic MIME (`application/octet-stream`) falls back to file extension; recognized MIME conflicting with file extension (e.g. `.pdf` + `text/plain`, `.docx` + `application/pdf`) is rejected with typed error `UNSUPPORTED_FILE_TYPE` (HTTP 415).
- **R5 — Persisted SHA-256 in `poc_run.syllabus_metadata`**: Computes SHA-256 immediately upon receiving raw upload buffer and saves `sha256` directly in `poc_run.syllabus_metadata` alongside `normalized_syllabus.metadata.sha256`.
- **R6 — Sanitized Parser Errors**: Sanitized client-facing messages for DOCX/PDF errors ("The uploaded DOCX file could not be read.", "The uploaded PDF file could not be read.") and set `details: null` so raw parser/library internals are never serialized to HTTP clients. Original exceptions are preserved in Error `cause` and logged server-side via `request.log.warn({ err, run_id }, ...)`.
- **R7 & R8 — Expanded API & Run Lifecycle Integration Tests**: Expanded `apps/api/test/runs.test.ts` (12 tests) verifying `.md`, `.txt`, `.docx`, `.pdf`, >10MB (413), unsupported (415), MIME mismatch (415), generic MIME fallback, corrupt DOCX/PDF failure transitions (`status === "failed"` in DB), and `GET /api/runs/:runId` inspection (P4-D9).

### Files Changed

- `apps/api/src/routes/runs.ts`
- `apps/api/src/plugins/error-handler.ts`
- `apps/api/test/runs.test.ts`
- `db/migrations/0000_gifted_donald_blake.sql`
- `db/migrations/0001_add_normalized_syllabus.sql`
- `db/migrations/meta/_journal.json`
- `packages/syllabus/src/normalizer/deterministic-normalizer.ts`
- `packages/syllabus/src/extractors/docx-extractor.ts`
- `packages/syllabus/src/extractors/pdf-extractor.ts`
- `packages/syllabus/src/ingest.ts`
- `packages/syllabus/test/syllabus-ingestion.test.ts`
- `soc.md`
- `.agent-work/status.md`

### Tests / Validation

- PASS — Phase 3 DB-independent tests: `apps/api/test/health.test.ts`, `apps/api/test/correlation.test.ts`, `apps/api/test/error-handler.test.ts` (9 tests passing with `DATABASE_URL=""`).
- PASS — Total monorepo tests: **146/146 tests passing** across 14 test suites.
- PASS — `pnpm typecheck` across all 9 workspaces.
- PASS — `pnpm build` across all 9 workspaces.

### Decisions Made

- Adopted Decisions P4-D8 (File Type Mismatch Policy) and P4-D9 (Retain GET /api/runs/:runId) as approved.

### Known Limitations / Follow-up

- None. Phase 4 is Final Accepted.

### Next Suggested Task

`T0501 — Implement Ollama client abstraction` (Phase 5)

---

## 2026-09-01 16:10 — T0501–T0512 — Phase 5: Ollama and Planning

**Status:** DONE

### Summary

Implemented Phase 5 Planning and Ollama integration across `packages/agent-runtime` and `packages/planning`:
- **T0501 & T0502 — LLM Transport & Configuration (P5-D1, P5-D2)**: Implemented `ModelClient` abstraction and `OllamaModelClient` in `packages/agent-runtime/src/llm/` wrapping official `ollama@0.6.3` with `stream: false`, 60s timeout default, structured outputs (`format: JSONSchema`), tool calling support, and custom error translation (`ModelClientError`).
- **T0503 & T0504 — Model & Native Tool-Calling Proof**:
  - Proved basic chat request/response with local Ollama (`gemma4:e2b`).
  - Proved native tool calling in isolation with dummy tool `lookup_dummy_topic` returning structured arguments `{"topic_name":"Binary Search Trees"}`.
- **T0505 & T0506 — Course Planner & Canonical Ajv Contract Validation**:
  - `CoursePlanner` takes `NormalizedSyllabus` $\rightarrow$ invokes LLM with structured output schema $\rightarrow$ composes application-owned `CoursePlanEnvelope` (`plan_type: "course"`, `operation: "create"`, `revision: 1`, `plan_id: UUID`) $\rightarrow$ validates against canonical `PlanEnvelope v0.1` Ajv schema.
- **T0507 — Plan Persistence**: Persists valid course plans to `poc_plan` PostgreSQL table via `PlanRepository.savePlanRevision()`.
- **T0508 — Plan Revision Helper**: Implemented `PlanRevisionHelper` managing immutable plan revisions for direct user edits (`createDirectUserEdit`, rev $N+1$) and agent re-planning (`createAgentRePlan`, rev $N+1$).
- **T0509 — Assignment Planner**: Implemented `AssignmentPlanner` for updating existing assignments (`AssignmentPlanEnvelope`, `operation: "update"`).
- **T0510 — Quiz Planner**: Implemented `QuizPlanner` for updating existing quizzes (`QuizUpdatePlanEnvelope`, `operation: "update"`, `questions_to_add`, `questions_to_update`).
- **T0511 — Planning Prompt Fixtures**: Created structured prompt generators and JSON Schema fixtures for course planning, assignment update, and quiz update with strict grounding instructions and discriminated union question definitions (`multichoice`, `truefalse`, `shortanswer`, `essay`).
- **T0512 — Planning Tests & Level C Live Acceptance**:
  - Unit & integration tests for all planners and domain validator.
  - Reproducible root runner `pnpm smoke:ollama` (`tsx scripts/smoke-test-ollama.ts`) executing live T0503, T0504, and live CoursePlanner generation against local Ollama.
- **Deterministic Domain Assertions (P5-D4, Correction 3 & 5)**: Implemented `PlanningDomainValidator` verifying provenance allowlists derived from Phase 4 syllabus metadata, section position uniqueness & positive values, local ref uniqueness (`section-*`, `assignment-*`, `quiz-*`, `question-*`, `choice-*`), and multiple choice choice-reference existence.

### Files Changed

- `TECH_STACK.md`
- `package.json`
- `pnpm-lock.yaml`
- `packages/agent-runtime/package.json`
- `packages/agent-runtime/src/llm/types.ts`
- `packages/agent-runtime/src/llm/model-client.ts`
- `packages/agent-runtime/src/llm/ollama-client.ts`
- `packages/agent-runtime/src/llm/index.ts`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-runtime/test/ollama-client.test.ts`
- `packages/planning/package.json`
- `packages/planning/tsconfig.json`
- `packages/planning/src/types.ts`
- `packages/planning/src/errors/planning-errors.ts`
- `packages/planning/src/domain/planning-domain-validator.ts`
- `packages/planning/src/prompts/course-planning-prompt.ts`
- `packages/planning/src/prompts/assignment-update-prompt.ts`
- `packages/planning/src/prompts/quiz-update-prompt.ts`
- `packages/planning/src/planners/course-planner.ts`
- `packages/planning/src/planners/assignment-planner.ts`
- `packages/planning/src/planners/quiz-planner.ts`
- `packages/planning/src/revisions/plan-revision-helper.ts`
- `packages/planning/src/index.ts`
- `packages/planning/test/planning-domain-validator.test.ts`
- `packages/planning/test/course-planner.test.ts`
- `packages/planning/test/assignment-planner.test.ts`
- `packages/planning/test/quiz-planner.test.ts`
- `packages/planning/test/plan-revision-helper.test.ts`
- `scripts/smoke-test-ollama.ts`
- `task.md`
- `soc.md`
- `.agent-work/status.md`

### Tests / Validation

- PASS — `pnpm smoke:ollama`:
  - Step 1: Ollama reachable (found 24 models including `gemma4:e2b`).
  - Step 2 (T0503): Chat response received in 33.9s ("An algorithm is a finite sequence of well-defined, unambiguous steps designed to solve a specific problem.").
  - Step 3 (T0504): Native tool calling received in 7.5s (Function: `lookup_dummy_topic`, Arguments: `{"topic_name":"Binary Search Trees"}`).
  - Step 4 (T0505/T0506): CoursePlan generated and validated with real Ollama (`Plan ID: 046c89c9-457e-4b1a-9535-3c39e88fbac3`, `Revision: 1`, `Title: Introduction to Artificial Intelligence (CS201)`).
- PASS — Total monorepo tests: **166/166 tests passing** across 20 test files (0 failures).
- PASS — `pnpm typecheck` across all 9 workspaces (0 errors).
- PASS — `pnpm build` across all 9 workspaces (0 errors).

### Decisions Made

- Adopted Decisions P5-D1 through P5-D4 as approved baseline.

### Known Limitations / Follow-up

- Live CoursePlanner generation initially encountered `UND_ERR_HEADERS_TIMEOUT` during independent review, prompting Targeted Remediation R1–R14 and Decision P5-D5.

---

## 2026-09-01 17:05 — Phase 5 Targeted Remediation (R1–R14, P5-D5)

**Status:** DONE (Phase 5 Final Accepted)

### Summary

Completed targeted remediation addressing all code review findings (R1–R14):
- **R1 & P5-D5 — Ollama Timeout & Transport Error Classification**:
  - Adopted approved baseline `AGENT_MODEL_TIMEOUT_MS=360000` (6 minutes) across `OllamaModelClient` and `apps/api/src/config/config-loader.ts`.
  - Differentiated Undici/transport timeouts (`UND_ERR_HEADERS_TIMEOUT`, `UND_ERR_CONNECT_TIMEOUT`, `UND_ERR_BODY_TIMEOUT`, `HeadersTimeoutError`) into `MODEL_TIMEOUT`.
  - Maintained `OLLAMA_UNAVAILABLE` strictly for real connection failures (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`).
  - Added request abort controller on timeout to terminate underlying transport requests.
- **R2 & R3 — Enforced P5-D4 Grounding in Assignment and Quiz Planners**:
  - `AssignmentPlanner` builds allowlist from `input.current.source_refs` + `input.source_context` and passes to domain validation.
  - `QuizPlanner` builds allowlist from `input.current.source_refs` + `input.current.questions[].source_refs` + `input.source_context`.
- **R4 — Validated Question-Level `source_refs`**: Pass provenance allowlist into `validateQuestionsDomain()` ensuring every question variant (`multichoice`, `truefalse`, `shortanswer`, `essay`) has grounded `source_refs`.
- **R5 — Enforced Global Question-Ref Uniqueness Within CoursePlan**: In `CoursePlan` validation, enforced that question refs are globally unique across all quizzes in the course plan.
- **R6 — Enforced Disjoint Quiz Add/Update Question Sets**: In `QuizUpdateContent` domain validation, enforced `refs(questions_to_add) ∩ refs(questions_to_update) = ∅`.
- **R7 & R8 — Enforced Run Lineage and Plan Identity Immutability**:
  - `PlanRevisionHelper` preserves original `runId` across revisions and rejects caller-supplied `runId` mismatches.
  - `PlanRevisionHelper.createDirectUserEdit()` prevents `plan_type` and `operation` drift across revisions.
- **R9 — Strict T0504 Assertion in Smoke Test**: Asserts that `toolResult.toolCalls.length > 0`, `function.name === "lookup_dummy_topic"`, and valid non-empty `arguments.topic_name` string; exits non-zero otherwise.
- **R10 — Strict Native Tool Argument Parsing**: Throws `MODEL_RESPONSE_INVALID` on malformed JSON string or non-object tool arguments rather than silently converting to `{}`.
- **R11 — Tightened Provenance Allowlist Matching**: Enforced source-qualified allowlist matching (`${source}::section::...`, `${source}::page::...`) to prevent cross-source leakage.
- **R12 & R13 — Test Expansion and Full Verification**: Expanded deterministic test suite from 166 to 172 tests covering all positive and negative remediation paths.

### Files Changed

- `apps/api/src/config/config-loader.ts`
- `apps/api/test/config-loader.test.ts`
- `packages/agent-runtime/src/llm/ollama-client.ts`
- `packages/agent-runtime/test/ollama-client.test.ts`
- `packages/planning/src/domain/planning-domain-validator.ts`
- `packages/planning/src/prompts/course-planning-prompt.ts`
- `packages/planning/src/prompts/quiz-update-prompt.ts`
- `packages/planning/src/planners/course-planner.ts`
- `packages/planning/src/planners/assignment-planner.ts`
- `packages/planning/src/planners/quiz-planner.ts`
- `packages/planning/src/revisions/plan-revision-helper.ts`
- `packages/planning/test/planning-domain-validator.test.ts`
- `packages/planning/test/assignment-planner.test.ts`
- `packages/planning/test/quiz-planner.test.ts`
- `packages/planning/test/plan-revision-helper.test.ts`
- `scripts/smoke-test-ollama.ts`
- `soc.md`
- `.agent-work/status.md`

### Tests / Validation

- PASS — `pnpm smoke:ollama` (All 4 live acceptance steps passing independently):
  - Step 1: Ollama reachable (24 models found including `gemma4:e2b`).
  - Step 2 (T0503): Chat response received in 32.5s ("An algorithm is a finite set of unambiguous instructions designed to solve a specific problem.").
  - Step 3 (T0504): Native tool calling received in 8.7s with strict assertions passing (`Function: lookup_dummy_topic`, `Arguments: {"topic_name":"Binary Search Trees"}`).
  - Step 4 (T0505/T0506): CoursePlan generated and validated with real Ollama in 165.7s (`Plan ID: 1c4daaf9-ff65-431c-b8dc-62c4a522386d`, `Revision: 1`, `Title: Introduction to Artificial Intelligence (CS201)`).
- PASS — Total monorepo tests: **172/172 tests passing** across 20 test files (0 failures).
- PASS — `pnpm typecheck` across all 9 workspaces (0 errors).
- PASS — `pnpm build` across all 9 workspaces (0 errors).

### Decisions Made

- Adopted Decision P5-D5 (`AGENT_MODEL_TIMEOUT_MS=360000`) as approved baseline.

### Known Limitations / Follow-up

- None. Phase 5 is Final Accepted.

### Next Suggested Task

`T0601 — Add CoursePlan preview endpoint` (Phase 6)

---

## 2026-09-01 17:18 — Phase 5 Final Closure — Grounded Structured Output & Reproducible Live Acceptance

**Status:** DONE — FINAL ACCEPTED

### Summary

Applied the final targeted Phase 5 closure after independent re-review found that live CoursePlanner generation could still produce schema-valid but provenance-invalid `SourceReference.section` strings. The planner now constrains source references at generation time using a dynamic JSON Schema derived from the actual `NormalizedSyllabus` provenance, while retaining canonical Ajv validation and deterministic domain validation as downstream gates.

### Files Changed

- `packages/planning/src/prompts/course-planning-prompt.ts`
- `packages/planning/src/planners/course-planner.ts`
- `packages/planning/test/course-planner.test.ts`
- `packages/agent-runtime/src/llm/ollama-client.ts`
- `scripts/smoke-test-ollama.ts`
- `.env.example`
- `TECH_STACK.md`
- `soc.md`
- `.agent-work/status.md`

### Implementation Notes

- CoursePlanner now builds its structured-output schema per syllabus via `buildCoursePlanningSchema(syllabus)`.
- Generated `SourceReference.source` is constrained to the actual syllabus filename using `const`.
- Generated line/paragraph/page references are constrained to enums derived from the actual Phase 4 provenance. Invalid model-generated values such as `"></section-01"` can no longer satisfy the structured-output schema for the reviewed syllabus.
- Canonical `validatePlanningContract()` remains the acceptance gate after model generation; deterministic `PlanningDomainValidator` remains the second grounding/domain gate.
- `smoke-test-ollama.ts` now fails if the exact configured model is not installed instead of warning and continuing.
- P5-D5 remains `AGENT_MODEL_TIMEOUT_MS=360000`.
- Corrected timeout semantics: with `ollama@0.6.3` and Phase 5 `stream:false`, the timeout is an application/logical timeout. The SDK's `abort()` only aborts tracked streamed requests, so true non-stream transport cancellation is deferred to T1011 rather than being falsely claimed as implemented in Phase 5.
- `.env.example` now documents `OLLAMA_BASE_URL` and `AGENT_MODEL_TIMEOUT_MS` explicitly.

### Tests / Validation

Commands/checks performed:

```text
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:ollama
```

Result:

- PASS — `pnpm typecheck` across all 9 workspaces.
- PASS — `pnpm test`: **174/174 tests passing** across 20 test files.
- PASS — `pnpm build` across all 9 workspaces.
- PASS — `pnpm smoke:ollama` exited 0 with all four live acceptance steps:
  - Step 1: Ollama reachable; exact configured model `gemma4:e2b` installed.
  - T0503: basic chat PASS in 103.0s.
  - T0504: native tool call PASS in 10.4s (`lookup_dummy_topic`, `{"topic_name":"Binary Search Trees"}`).
  - T0505/T0506: live CoursePlanner PASS in 109.2s; generated revision 1 with one validated section.

### Decisions Made

- No new architecture decision. P5-D1 through P5-D5 remain unchanged.
- True non-stream transport cancellation is explicitly deferred to T1011; Phase 5 retains logical timeout classification only.

### Known Limitations / Follow-up

- Non-stream underlying HTTP work may continue after the Phase 5 logical timeout because the pinned Ollama SDK does not expose per-request cancellation for non-stream calls. T1011 owns final model/run timeout and cancellation behavior.

### Next Suggested Task

`T0601 — Add CoursePlan preview endpoint` (Phase 6)

---

## 2026-09-02 09:28 — Phase 6 Completion — Preview Endpoints, Direct Edits, and Execution Target Validation (T0601–T0606)

**Status:** DONE

### Summary

Completed all Phase 6 tasks (T0601–T0606) implementing the preview layer, immutable plan revision lifecycle, and explicit execution target validation for the Moodle AI Platform POC.

### Tasks Completed

- **T0601 — Add CoursePlan preview endpoint**: `POST /api/runs/:runId/plans/course` generates `CoursePlan` via `CoursePlanner`, transitions run status through `pending` -> `planning` -> `preview` (or `failed` on error), persists revision 1 to `poc_plan`, and returns `{ plan, preview }`.
- **T0602 — Add AssignmentPlan preview endpoint**: Generic `GET /api/plans/:planId` and `GET /api/plans/:planId/preview` render structured preview for persisted `AssignmentPlan` envelopes.
- **T0603 — Add QuizPlan preview endpoint**: Generic `GET /api/plans/:planId` and `GET /api/plans/:planId/preview` render structured preview for persisted `QuizPlan` and `QuizUpdatePlan` envelopes.
- **T0604 — Show warnings, assumptions, and source refs**: Implemented pure `buildPlanPreview()` projection aggregating envelope warnings, assumptions, deduplicated nested source references (by `source + page + section + text`), and structural metrics (`sections`, `assignments`, `quizzes`, `questions`, and `questions_by_type`).
- **T0605 — Support direct plan edits before execution**: `POST /api/plans/:planId/revisions` creates immutable revision N+1 via `PlanRevisionHelper.createDirectUserEdit`. Enforces provenance grounding (`new revision source_refs ⊆ source provenance already in latest revision`), preserves `run_id`, and prevents `plan_type`/`operation` drift.
- **T0606 — Ensure execution targets an explicit plan revision**: `POST /api/executions/validate` validates `ExecutionRequest` schema with Ajv (requires explicit `plan_id` and numeric `revision`), verifies exact `(plan_id, revision)` exists and is valid in `poc_plan`, and asserts `plan_type + operation` compatibility against the target matrix with zero mutation side-effects.

### Files Changed

- `packages/planning/src/preview/plan-preview.ts` [NEW]
- `packages/planning/src/domain/execution-compatibility.ts` [NEW]
- `packages/planning/src/revisions/plan-revision-helper.ts` [MODIFIED]
- `packages/planning/src/index.ts` [MODIFIED]
- `packages/planning/test/plan-preview.test.ts` [NEW]
- `packages/planning/test/execution-compatibility.test.ts` [NEW]
- `packages/planning/test/plan-revision-helper.test.ts` [MODIFIED]
- `apps/api/package.json` [MODIFIED]
- `apps/api/src/plugins/error-handler.ts` [MODIFIED]
- `apps/api/src/routes/runs.ts` [MODIFIED]
- `apps/api/src/routes/plans.ts` [NEW]
- `apps/api/src/routes/executions.ts` [NEW]
- `apps/api/src/app.ts` [MODIFIED]
- `apps/api/test/plans.test.ts` [NEW]
- `apps/api/test/executions.test.ts` [NEW]
- `task.md` [MODIFIED]
- `soc.md` [MODIFIED]
- `.agent-work/status.md` [MODIFIED]

### Implementation Notes

- **Read-Only Derived Projection**: `PlanPreview` is a pure read-only projection derived from `PlanEnvelope`. Purity tests verify `buildPlanPreview()` never mutates the input envelope.
- **Strict Grounding for Direct Edits**: Direct edits cannot inject invented external documents or citations; all referenced provenance in revision N+1 must be a subset of the provenance in the latest persisted revision.
- **Execution Target Matrix**:
  - `course` + `create` ↔ `{ category_id }`
  - `assignment` + `create` ↔ `{ course_id, section_id }`
  - `assignment` + `update` ↔ `{ course_id, section_id, activity_id }`
  - `quiz` + `create` ↔ `{ course_id, section_id }`
  - `quiz` + `update` ↔ `{ course_id, section_id, quiz_id }`
  - `course` + `update` ↔ unsupported (rejected with 422)
- **Typed Error Mapping**: `PlanningError` and `ModelClientError` map to distinct HTTP status codes (422, 502, 503, 504) while preserving the standard API error shape.

### Tests / Validation

- PASS — `pnpm test`: **201/201 tests passing** across 24 test files (0 failures).
- PASS — `pnpm typecheck`: All 9 workspace packages typecheck cleanly with `strict: true` and `exactOptionalPropertyTypes: true` (0 errors).
- PASS — `pnpm build`: All 9 workspace packages build cleanly (0 errors).

### Decisions Made

- Adopted Phase 6 user review feedback: deferred standalone assignment/quiz generation endpoints to Phase 12/13; unified preview endpoints via generic plan retrieval.
- Enforced strict provenance grounding on direct user edits in `PlanRevisionHelper`.

### Known Limitations / Follow-up

- Moodle mutation and MCP execution routes belong to Phase 10/11. `POST /api/executions/validate` is strictly a validation gate.

### Next Suggested Task

`T0701 — Create local_agentpoc plugin skeleton` (Phase 7 — Moodle POC Plugin)

---


---

## 2026-09-02 09:41 — Phase 6 Targeted Remediation — Final Acceptance Hardening

**Status:** DONE — FINAL ACCEPTED

### Summary

Applied the four targeted Phase 6 code-review remediations without expanding scope: exact direct-edit provenance subset enforcement, duplicate initial CoursePlan lineage prevention per Run, strict revision query parsing, and fully detached Preview source-reference projections.

### Files Changed

- `packages/planning/src/revisions/plan-revision-helper.ts`
- `packages/planning/src/preview/plan-preview.ts`
- `packages/planning/test/plan-revision-helper.test.ts`
- `packages/planning/test/plan-preview.test.ts`
- `apps/api/src/routes/plans.ts`
- `apps/api/test/plans.test.ts`
- `soc.md`
- `.agent-work/status.md`

### Implementation Notes

- Direct user edits now compare complete `SourceReference` tuples `(source, page, section, text)` against the latest persisted revision. Valid fields from different references cannot be recombined, and source text cannot be silently changed.
- `POST /api/runs/:runId/plans/course` now returns HTTP 409 when a `course/create` plan already exists for the Run, forcing subsequent changes through revision lifecycle rather than creating a second plan lineage.
- `?revision=` parsing now accepts only canonical positive-integer strings; values such as `1abc`, `1.5`, `0`, and `-1` return HTTP 400 instead of being partially parsed.
- Preview construction now clones nested `SourceReference` objects as well as arrays, so mutating a returned preview cannot mutate the canonical PlanEnvelope in memory.

### Tests / Validation

Commands:

```text
pnpm typecheck
pnpm test
pnpm build
```

Result:

- PASS — `pnpm typecheck` across all 9 workspaces.
- PASS — `pnpm test`: **206/206 tests passing** across 24 test files.
- PASS — `pnpm build` across all 9 workspaces.
- Added focused regression coverage for mixed provenance tuple rejection, changed source text rejection, duplicate initial CoursePlan generation (409), malformed revision queries (400), and detached preview source refs.

### Decisions Made

- No new architecture or contract decisions. Frozen Phase 1 contracts and Phase 6 scope remain unchanged.

### Known Limitations / Follow-up

- The duplicate initial-plan guard is a POC application-level lifecycle guard. Distributed/concurrent orchestration hardening remains outside current Phase 6 scope.

### Next Suggested Task

`T0701 — Create local_agentpoc plugin skeleton` (Phase 7)

---

## 2026-09-02 10:45 — T0701–T0721 — Phase 7 Moodle POC Plugin (`local_agentpoc`)

**Status:** DONE

### Summary

Implemented the Moodle local plugin `local_agentpoc` (Tasks **T0701 — T0721**) targeting **Moodle 5.1.x** (`public/` layout). The plugin registers and exposes 14 canonical external web service functions strictly adhering to Moodle External API conventions (parameters validation, context validation, capability checks with `local/agentpoc:view` and `local/agentpoc:manage` plus core Moodle capabilities). All operations leverage official Moodle internal PHP APIs with **zero direct database SQL mutations for high-level business entities**. Verified end-to-end via CLI smoke test suite against live Moodle container and full TypeScript/Vitest test suites.

### Tasks Completed

- **T0701**: Created `local_agentpoc` plugin skeleton (`version.php`, `lang/en/local_agentpoc.php`, `db/access.php`, `db/services.php`, `lib.php`).
- **T0702**: Implemented `local_agentpoc_list_course_categories` with permission and visibility filtering (`core_course_category::get_all(['visible' => 1])`).
- **T0703**: Implemented `local_agentpoc_create_course` with required shortname (P7-D5), category existence check, and default hidden visibility (`visible = 0`).
- **T0704**: Implemented `local_agentpoc_create_section` keeping `section_id` (`course_sections.id`) and `section_num` (relative section number) distinct (R7).
- **T0705**: Implemented `local_agentpoc_get_course_structure` returning complete hierarchical tree of course, sections, and activities.
- **T0706 & T0707**: Implemented `local_agentpoc_create_assignment` with frozen defaults (`onlinetext = 1`, `file = 0`, `duedate = 0`, `groupmode = 0`, `completion = 0`, grade from plan / fallback 100) via `add_moduleinfo()`.
- **T0708**: Implemented `local_agentpoc_get_assignment` using canonical activity ID (CMID / `course_modules.id`) as primary identifier (P7-D2).
- **T0709**: Implemented `local_agentpoc_update_assignment` via `get_moduleinfo_data()` and `update_moduleinfo()`.
- **T0710**: Implemented `local_agentpoc_create_quiz` with frozen defaults (`deferredfeedback`, `attempts = 0`, `shuffleanswers = 1`, `questionsperpage = 1`) via `add_moduleinfo()`.
- **T0711**: Implemented `local_agentpoc_get_quiz` by activity ID (CMID).
- **T0712**: Implemented `local_agentpoc_update_quiz` via `update_moduleinfo()`.
- **T0713**: Implemented `local_agentpoc_get_quiz_questions` returning question bank entry IDs, concrete question IDs, versions, and question slots.
- **T0714–T0717**: Implemented `local_agentpoc_create_quiz_question` for all 4 supported question types (`multichoice`, `truefalse`, `shortanswer`, `essay`) saving into the Quiz activity context (`context_module::instance($quizcmid)`, P7-D3).
- **T0718**: Implemented `local_agentpoc_add_question_to_quiz` using stable `question_bank_entry_id` (R12) via `quiz_add_quiz_question()` and recomputed sumgrades.
- **T0719**: Implemented `local_agentpoc_update_quiz_question` operating on existing `question_bank_entry_id` and creating a new concrete question version under the same bank entry (P7-D4).
- **T0720**: Confirmed zero direct DB SQL mutations for business entities (Course, Section, Assignment, Quiz, Question).
- **T0721**: Implemented Moodle PHPUnit tests (`tests/agentpoc_test.php`) and end-to-end CLI smoke test script (`cli/test_agentpoc.php`).

### Files Created / Changed

- `ai-platform/moodle/local_agentpoc/version.php`
- `ai-platform/moodle/local_agentpoc/lang/en/local_agentpoc.php`
- `ai-platform/moodle/local_agentpoc/db/access.php`
- `ai-platform/moodle/local_agentpoc/db/services.php`
- `ai-platform/moodle/local_agentpoc/lib.php`
- `ai-platform/moodle/local_agentpoc/classes/helper.php`
- `ai-platform/moodle/local_agentpoc/classes/external/list_course_categories.php`
- `ai-platform/moodle/local_agentpoc/classes/external/create_course.php`
- `ai-platform/moodle/local_agentpoc/classes/external/create_section.php`
- `ai-platform/moodle/local_agentpoc/classes/external/get_course_structure.php`
- `ai-platform/moodle/local_agentpoc/classes/external/create_assignment.php`
- `ai-platform/moodle/local_agentpoc/classes/external/get_assignment.php`
- `ai-platform/moodle/local_agentpoc/classes/external/update_assignment.php`
- `ai-platform/moodle/local_agentpoc/classes/external/create_quiz.php`
- `ai-platform/moodle/local_agentpoc/classes/external/get_quiz.php`
- `ai-platform/moodle/local_agentpoc/classes/external/update_quiz.php`
- `ai-platform/moodle/local_agentpoc/classes/external/get_quiz_questions.php`
- `ai-platform/moodle/local_agentpoc/classes/external/create_quiz_question.php`
- `ai-platform/moodle/local_agentpoc/classes/external/update_quiz_question.php`
- `ai-platform/moodle/local_agentpoc/classes/external/add_question_to_quiz.php`
- `ai-platform/moodle/local_agentpoc/tests/agentpoc_test.php`
- `ai-platform/moodle/local_agentpoc/cli/test_agentpoc.php`
- Synchronized to Moodle 5.1 target: `moodle/public/local/agentpoc/`
- `task.md`
- `soc.md`
- `.agent-work/status.md`

### Tests / Validation

1. **Moodle Plugin Installation**: `php /var/www/html/admin/cli/upgrade.php --non-interactive` -> `local_agentpoc` installed and services registered successfully.
2. **PHP Linting (`php -l`)**: 0 syntax errors across all 21 PHP files in container.
3. **Moodle Live E2E CLI Smoke Test (`cli/test_agentpoc.php`)**: All 12 smoke tests PASSED:
   - `[1/12] Authenticated as admin user`
   - `[2/12] [PASS] list_course_categories`
   - `[3/12] [PASS] create_course` (hidden course)
   - `[4/12] [PASS] create_section`
   - `[5/12] [PASS] create_assignment` (CMID 7)
   - `[6/12] [PASS] get_assignment` (frozen defaults: onlinetext=1, file=0, duedate=0)
   - `[7/12] [PASS] update_assignment`
   - `[8/12] [PASS] create_quiz` (CMID 8)
   - `[9/12] [PASS] create_quiz_question` (multichoice, truefalse, shortanswer, essay)
   - `[10/12] [PASS] add_question_to_quiz & get_quiz_questions` (4 questions slotted)
   - `[11/12] [PASS] update_quiz_question` (bank entry stable, version 2 created)
   - `[12/12] [PASS] get_course_structure` (complete tree verified)
4. **TypeScript Typecheck**: `pnpm typecheck` -> 0 errors across 9 workspaces.
5. **Vitest Test Suite**: `pnpm test` -> **206/206 tests passing** across 24 test files.
6. **Production Build**: `pnpm build` -> 0 errors across 9 workspaces.

### Decisions Implemented

- **P7-D1 = B**: Moodle 5.1.x target baseline (`$plugin->requires = 2025100600;`, branch 501, PHP 8.3).
- **P7-D2 = A**: CMID (`course_modules.id`) is canonical `activity_id` across public APIs.
- **P7-D3 = B**: Question categories belong to Quiz activity context (`context_module::instance($quizcmid)`).
- **P7-D4 = B**: `question_bank_entry_id` is stable question identity; `question_id` is concrete version record.
- **P7-D5 = B**: Course `shortname` is required input; plugin does not generate shortnames.

### Next Suggested Task

`T0801 — Implement AI-platform-side Moodle client abstraction` (Phase 8)

---

## 2026-09-02 11:20 — T0701–T0721 — Phase 7 Targeted Remediation & Final Acceptance

**Status:** DONE (FINAL ACCEPTED)

### Summary

Applied targeted remediation to `local_agentpoc` following independent Moodle 5.1 code review (P7-R1 through P7-R14). Hardened authorization on `get_quiz_questions` to teacher level (`mod/quiz:manage` + `moodle/question:viewall`), preserved native Moodle activity-creation gates (`can_add_moduleinfo`), fixed Quiz slot resolution to track actual new slot instead of assuming last slot, added duplicate question rejection (`errorquestionalreadyinquiz`), enforced strict JSON options decoding, added deterministic multichoice/shortanswer validations, enforced positive grades/marks and section positions >= 1, installed composer/PHPUnit runtime dependencies, and successfully executed all 16 Moodle PHPUnit integration tests.

### Remediation Details

- **P7-R1 (Hardened Quiz Questions Authorization)**: Updated `classes/external/get_quiz_questions.php` and `db/services.php` to require `local/agentpoc:view`, `mod/quiz:manage`, and `moodle/question:viewall`. Verified learners cannot access question answer/fraction data.
- **P7-R2 (Native Activity Creation Gate)**: Updated `create_assignment.php` and `create_quiz.php` to call `can_add_moduleinfo($course, $modulename, $sectionnum)` before `add_moduleinfo()`, enforcing native `moodle/course:manageactivities`, section checks, and enabled module checks.
- **P7-R3 & P7-R4 (Quiz Slot Resolution & Duplicate Rejection)**: Updated `add_question_to_quiz.php` to capture slot IDs prior to insertion, accurately locate the newly added slot across any page placement, and reject duplicate question adds with `errorquestionalreadyinquiz` when `quiz_add_quiz_question()` returns `false`.
- **P7-R5 & P7-R6 (Strict JSON & Shortanswer Validation)**: Enforced strict `json_decode()` error checking with `JSON_ERROR_NONE` and required non-empty, non-blank `accepted_answers` array for shortanswer questions without inventing default answers.
- **P7-R7 (Multichoice Validation)**: Enforced at least 2 choices, non-empty choice text, exactly 1 correct answer (`fraction = 1.0`), and all other choices `fraction = 0.0`.
- **P7-R8 & P7-R9 (Positive Value & Section Position Validations)**: Enforced `grade > 0`, `defaultmark > 0`, `maxmark > 0`, and `position >= 1`.
- **P7-R11 & P7-R12 (PHPUnit Execution & Expanded Test Coverage)**: Installed Composer 2.10.3 and PHPUnit 11.5.55 in the Docker container, ran `admin/tool/phpunit/cli/init.php`, and verified all 16 unit/integration tests in `tests/agentpoc_test.php` passing (45 assertions).

### Files Changed

- `ai-platform/moodle/local_agentpoc/lang/en/local_agentpoc.php`
- `ai-platform/moodle/local_agentpoc/db/services.php`
- `ai-platform/moodle/local_agentpoc/classes/external/get_quiz_questions.php`
- `ai-platform/moodle/local_agentpoc/classes/external/create_assignment.php`
- `ai-platform/moodle/local_agentpoc/classes/external/update_assignment.php`
- `ai-platform/moodle/local_agentpoc/classes/external/create_quiz.php`
- `ai-platform/moodle/local_agentpoc/classes/external/create_section.php`
- `ai-platform/moodle/local_agentpoc/classes/external/create_quiz_question.php`
- `ai-platform/moodle/local_agentpoc/classes/external/update_quiz_question.php`
- `ai-platform/moodle/local_agentpoc/classes/external/add_question_to_quiz.php`
- `ai-platform/moodle/local_agentpoc/tests/agentpoc_test.php`
- Synchronized to `moodle/public/local/agentpoc/`
- `soc.md`
- `.agent-work/status.md`

### Tests / Validation

1. **PHP Syntax (`php -l`)**: 0 errors across all 21 PHP files.
2. **Moodle PHPUnit Test Suite (`tests/agentpoc_test.php`)**: **16/16 tests PASS (45 assertions, 0 errors, 0 failures)**:
   - `test_list_course_categories` (PASS)
   - `test_create_hidden_course` (PASS)
   - `test_create_section` (PASS)
   - `test_create_section_negative_position_rejected` (PASS)
   - `test_create_and_update_assignment` (PASS)
   - `test_create_assignment_negative_grade_rejected` (PASS)
   - `test_create_assignment_manageactivities_required` (PASS)
   - `test_create_quiz_manageactivities_required` (PASS)
   - `test_quiz_and_question_types_lifecycle` (PASS)
   - `test_create_quiz_question_strict_json` (PASS)
   - `test_multichoice_validation_rejected` (PASS)
   - `test_shortanswer_empty_accepted_answers_rejected` (PASS)
   - `test_add_question_to_earlier_page_and_duplicate_rejection` (PASS)
   - `test_get_quiz_questions_learner_denied` (PASS)
   - `test_get_course_structure` (PASS)
   - `test_capability_denied` (PASS)
3. **Moodle Live E2E CLI Smoke Test (`cli/test_agentpoc.php`)**: **12/12 scenarios PASS**.
4. **TypeScript Typecheck (`pnpm typecheck`)**: 0 errors across 9 workspaces.
5. **Vitest Test Suite (`pnpm test`)**: **206/206 tests PASS** across 24 test files.
6. **Production Build (`pnpm build`)**: 0 errors across 9 workspaces.

### Next Suggested Task

`T0801 — Implement AI-platform-side Moodle client abstraction` (Phase 8)

---

## 2026-09-02 12:15 — T0801–T0804 — Phase 8 Moodle Client (`packages/moodle-client`)

**Status:** DONE (FINAL ACCEPTED)

### Summary

Implemented `@moodle-agent-poc/moodle-client` (Phase 8, Tasks T0801 — T0804) providing a strongly typed, robust HTTP client abstraction wrapping all 14 canonical `local_agentpoc` Moodle Web Services with typed parameter serialization, discriminated union question options (P8-D2), pure observed response normalization (P8-D3), strict runtime response shape validation, AbortController timeout handling (R13), deterministic domain error classification (R5, R6), zero token leakage (R14), 30 comprehensive unit tests, and live HTTP integration tests executed against live Moodle 5.1.x (P8-D4).

### Key Architecture & Implementation Details

1. **Client Interface & Transport (`client.ts`, `http.ts`, `types.ts`) (T0801)**:
   - Config accepts `baseUrl` as Moodle root URL, automatically constructing `/webservice/rest/server.php` and normalizing trailing slashes (P8-D1, R9).
   - Secret `token` is safely encapsulated and never exposed in logs, URLs, error messages, or error properties (R14).
   - `timeoutMs` defaults to 30,000ms and utilizes `AbortController` without automatic retries (R12, R13).
   - All 14 canonical external functions exposed with clean camelCase TypeScript methods (R2).

2. **Type-Safe Question Options (`serializers.ts`) (P8-D2, R3)**:
   - Discriminated union types for question parameters: `multichoice`, `truefalse`, `shortanswer`, `essay`.
   - `serializeQuestionOptions` converts typed options into `qtype_options_json` internally.
   - Omitted optional undefined/null parameters from form payload (`appendDefined`, R10) while preserving false booleans and 0 numbers.

3. **Response Normalization & Runtime Validation (`response-validators.ts`) (T0802, R1, R4, P8-D3)**:
   - All response models match the exact observed return structures of `local_agentpoc`.
   - No request-derived enrichment: response objects only contain data actually returned by Moodle (P8-D3, R17).
   - Strict runtime validators verify required field types and throw `MoodleResponseError` on malformed success bodies (R4).

4. **Domain Error Normalization (`errors.ts`) (T0803, R5, R6, R7)**:
   - Full domain error hierarchy rooted in `MoodleClientError`:
     - `MoodleNetworkError`: Connection refused, DNS failure, timeout/abort
     - `MoodleAuthenticationError`: `invalidtoken`, `invalidlogin`
     - `MoodleAuthorizationError`: `required_capability_exception`, `nopermissions`, `accessexception` (R6)
     - `MoodleInvalidParameterError`: `invalid_parameter_exception`, `invalidparameter`
     - `MoodleResourceNotFoundError`: missing course, section, activity, or question
     - `MoodleConflictError`: `errorquestionalreadyinquiz`, `errorshortnameexists`
     - `MoodleResponseError`: malformed success body from Moodle
     - `MoodleApiError`: generic Moodle exception / non-200 HTTP failure
   - Inspects JSON payloads for Moodle exception objects even when returned with HTTP 200 (R7).

5. **Phase 7 Hardening Patch (`local_agentpoc`) (R11)**:
   - Applied hardening patch to `classes/external/create_quiz_question.php` and `update_quiz_question.php` requiring boolean `correct_answer` in True/False question options.
   - Added `test_truefalse_missing_correct_answer_rejected` to `tests/agentpoc_test.php`.
   - Re-verified Moodle PHPUnit suite: **17/17 tests PASS** (46 assertions).

6. **Testing & Live Verification (T0804, P8-D4)**:
   - Unit test suite (`test/moodle-client.test.ts`): 30 tests covering all 14 methods, serializers, error mapping, timeout, and response validation.
   - Live integration test (`test/moodle-client.integration.test.ts`): executed end-to-end against live Moodle container creating course, section, assignment, quiz, MCQ/TF questions, slotting questions, inspecting structure, and verifying duplicate rejection exception mapping.

### Files Changed

- `packages/moodle-client/package.json`
- `packages/moodle-client/src/types.ts`
- `packages/moodle-client/src/errors.ts`
- `packages/moodle-client/src/serializers.ts`
- `packages/moodle-client/src/response-validators.ts`
- `packages/moodle-client/src/http.ts`
- `packages/moodle-client/src/client.ts`
- `packages/moodle-client/src/index.ts`
- `packages/moodle-client/test/moodle-client.test.ts`
- `packages/moodle-client/test/moodle-client.integration.test.ts`
- `ai-platform/moodle/local_agentpoc/classes/external/create_quiz_question.php`
- `ai-platform/moodle/local_agentpoc/classes/external/update_quiz_question.php`
- `ai-platform/moodle/local_agentpoc/tests/agentpoc_test.php`
- `ai-platform/moodle/local_agentpoc/cli/create_token.php`
- Synchronized to `moodle/public/local/agentpoc/`
- `task.md`
- `soc.md`
- `.agent-work/status.md`

### Tests / Validation

1. **Unit Tests (`packages/moodle-client/test/moodle-client.test.ts`)**: **30/30 tests PASS**.
2. **Live HTTP Integration Tests (`test/moodle-client.integration.test.ts`)**: **1/1 test PASS (2502ms)** against live Moodle 5.1 container.
3. **Monorepo Vitest Suite (`pnpm test`)**: **236/236 tests PASS** (1 integration test skipped when opt-in env var not set).
4. **TypeScript Typecheck (`pnpm typecheck`)**: **0 errors** across all 9 workspaces.
5. **Production Build (`pnpm build`)**: **0 errors** across all 9 workspaces.
6. **Moodle PHPUnit Test Suite (`tests/agentpoc_test.php`)**: **17/17 tests PASS** (46 assertions).
7. **Moodle CLI E2E Smoke Test (`cli/test_agentpoc.php`)**: **12/12 scenarios PASS**.

### Next Suggested Task

`T0901 — Bootstrap Moodle MCP Server` (Phase 9)

---





## 2026-09-02 — Phase 8 Final Remediation and Independent Verification

Phase 8 targeted remediation was completed directly after review findings P8-F1 through P8-F3.

### Changes
- Revoked all existing permanent tokens for the admin user on `local_agentpoc_service`, then generated a fresh Moodle Web Service token.
- Verified the previously exposed token now returns Moodle `invalidtoken`.
- Stored the fresh token only in the local gitignored `.env`; no token is hardcoded in source/tests.
- Tightened `UpdateEssayQuestionParams` so `options` is required when `qtype: 'essay'` is present; metadata-only updates continue to use `UpdateQuizQuestionMetadataOnly` with neither `qtype` nor `options`.
- Added update-question serialization coverage for true/false (`correctAnswer: false`), short answer (`acceptedAnswers` → `accepted_answers`), and essay (`gradingGuidance`/word limits → Moodle snake_case keys).
- Existing Phase 8 remediation remains in place: no raw JSON fallback, real package test scripts, strict timeout validation, `MoodleResponseError` for 2xx non-JSON responses, and `MoodleNetworkError` for response-body read failures.

### Independent Verification
- `pnpm --filter @moodle-agent-poc/moodle-client test`: **43/43 PASS**.
- Fresh-token live Moodle REST integration: **1/1 PASS**.
- Old exposed token direct REST request: **rejected with `invalidtoken`**.
- Moodle PHPUnit `public/local/agentpoc/tests/agentpoc_test.php`: **17/17 PASS, 46 assertions**.
- Moodle CLI smoke `public/local/agentpoc/cli/test_agentpoc.php`: **12/12 PASS**.
- `pnpm typecheck`: **PASS** across all applicable workspaces.
- `pnpm test`: **249/249 PASS**, 1 opt-in live integration test skipped in normal suite.
- `pnpm build`: **PASS** across all applicable workspaces.

### Result
**Phase 8 — FINAL ACCEPTED.** No remaining Phase 8 blockers. Proceed to Phase 9 (MCP Server).

---

## 2026-09-02 14:42 — T0901–T0914 — Phase 9 MCP Server (Final Accepted)

### Summary

Completed Phase 9 from the existing MCP implementation. The server exposes the 14 canonical Moodle tools through the official `@modelcontextprotocol/sdk` 1.30.0 using the frozen stdio transport, with an exported server factory and injected `MoodleClient` boundary. Public MCP inputs and normalized results remain snake_case while the Phase 8 client remains camelCase. No `packages/moodle-client` or Moodle plugin files were changed.

### Targeted Completion Fixes

- Tightened the public question-update schema so metadata-only updates reject `qtype` and `options` keys entirely; qtype-bearing updates require options for all four supported qtypes, including essay. Essay creation may still omit options.
- Updated question-tool type narrowing to match the stricter metadata union without weakening runtime validation.
- Removed raw unexpected-error objects from stderr diagnostics. Unexpected failures now emit only a fixed safe diagnostic, preventing token-bearing messages or stacks from escaping.

### Phase 9 Decisions / Behavior

- `@modelcontextprotocol/sdk` remains pinned to **1.30.0** and `zod` to **4.5.4**.
- Stdio is canonical for the local POC; stdout is reserved for JSON-RPC and diagnostics are written to stderr.
- Every tool uses structured `structuredContent` success/error envelopes plus compact text fallback, with input and output schemas and handler-side runtime validation.
- Secrets remain environment-sourced; the live integration loaded the existing gitignored `.env` token without printing it.
- T0913/T0914 deterministic proofs use an injected fake `MoodleClient`; they do not use an LLM or real Moodle. The stdio subprocess smoke is separate.

### Files Changed

- `apps/moodle-mcp-server/src/schemas/tool-schemas.ts`
- `apps/moodle-mcp-server/src/tools/question-tools.ts`
- `apps/moodle-mcp-server/src/errors.ts`
- `apps/moodle-mcp-server/test/tool-schemas.test.ts`
- `apps/moodle-mcp-server/test/mcp-server.test.ts`
- `task.md`
- `.agent-work/status.md`
- `soc.md`

### Validation

- MCP package tests: **50/50 PASS** across 3 test files.
- Separate stdio subprocess smoke: **1/1 PASS**.
- Opt-in live MCP-to-Moodle integration: **1/1 PASS**.
- `pnpm typecheck`: **PASS** across 9 workspace projects.
- `pnpm test`: **299/299 PASS**, 2 opt-in live integrations skipped in the normal suite.
- `pnpm build`: **PASS** across 9 workspace projects.

### Limitations / Next Work

- Live integration creates POC Moodle state and does not delete it; cleanup remains manual per the frozen POC rules.
- The normal monorepo test run skips the two opt-in live integrations; the Phase 9 live MCP integration was run explicitly and passed.

---

## 2026-09-02 15:10 — T1001–T1014 — Phase 10 Agent Tool Runtime (Final Accepted)

### Summary

Implemented the generic Agent Tool Runtime in `packages/agent-runtime` (Tasks T1001–T1014) complying with all frozen decisions P10-D1 through P10-D9. The runtime bridges Ollama native tool calling with the Moodle MCP Server, providing pre-compiled Ajv schema validation, sequential execution of model tool calls, complete message/tool persistence, execution mapping & idempotency primitives, canonical JSON loop detection, multi-level timeouts, transient-only bounded retry, and deterministic error classification.

### Key Implementation Highlights

- **P10-D1 & P10-D2 (Local-Ref Ownership & Source):** `localRef` and `targetType` are execution context metadata supplied by the caller (never by LLM and never passed over MCP). MCP tool arguments strictly match Phase 9 schemas.
- **P10-D3 (Run Lifecycle Ownership):** Agent loop completion does not mark the run complete. The run remains `executing` until higher-level Phase 11 execution and Phase 14 verification finish.
- **P10-D4 (Full Message Persistence):** Initial system prompt, initial user instruction, assistant messages, and all tool messages are persisted to `poc_message` with sequential steps.
- **P10-D5 (Tool Call Identity):** Model tool-call ID is preserved when present, with `crypto.randomUUID()` fallback.
- **P10-D6 (Sequential Tool Calls):** Multiple tool calls from one model turn execute sequentially in returned order.
- **P10-D7 & P10-D8 (Error & Retry Classification):** `CONFLICT`, `INVALID_ARGUMENTS`, `INVALID_PARAMETER`, `RESOURCE_NOT_FOUND` are model-correctable; `AUTH_ERROR` and `PERMISSION_DENIED` halt execution immediately. Transient errors (`NETWORK_ERROR`, transport timeout) are retried up to `maxRetries` (default 2) within the same idempotency acquisition.
- **P10-D9 (Idempotency States):** Uses Phase 2 `IdempotencyRepository`. `cached` returns stored payload without MCP call; `in_flight` rejects with `IDEMPOTENCY_IN_FLIGHT`.
- **Tool Schema Registry (T1002, T1003, T1005):** MCP `inputSchema` is compiled once with Ajv 2020 on discovery and cached. Direct mapping converts MCP definitions to `ModelToolDefinition[]`.
- **Deterministic Loop Detection (T1010):** Uses canonicalized JSON arguments (sorted keys) to detect 3 consecutive identical calls and halt with `REPEATED_TOOL_CALL_DETECTED`.
- **Timeout Layers (T1011):** Independent model timeout (`MODEL_TIMEOUT`), tool timeout (`TOOL_TIMEOUT`), and overall run deadline (`RUN_TIMEOUT`).
- **No Phase 11 Plan Traversal:** Phase 10 remains a generic Agent/MCP runtime. Plan traversal belongs exclusively to Phase 11.

### Files Created / Modified

- `packages/agent-runtime/package.json`
- `packages/agent-runtime/src/mcp/mcp-tool-registry.ts`
- `packages/agent-runtime/src/mcp/mcp-client-manager.ts`
- `packages/agent-runtime/src/mcp/index.ts`
- `packages/agent-runtime/src/agent/types.ts`
- `packages/agent-runtime/src/agent/agent-loop.ts`
- `packages/agent-runtime/src/agent/index.ts`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-runtime/test/mcp-tool-registry.test.ts`
- `packages/agent-runtime/test/mcp-client-manager.test.ts`
- `packages/agent-runtime/test/agent-loop.test.ts`
- `task.md`
- `.agent-work/status.md`
- `soc.md`

### Validation

- Agent Runtime package tests: **56/56 PASS** across 7 test files.
- Monorepo Vitest suite (`pnpm test`): **321/321 PASS**, 2 opt-in live integrations skipped in normal suite.
- TypeScript Typecheck (`pnpm typecheck`): **PASS (0 errors)** across all 9 workspaces.
- Production Build (`pnpm build`): **PASS (0 errors)** across all 9 workspaces.

### Limitations / Next Work

- Phase 11 Course Execution will use the generic Agent Tool Runtime with Plan-aware course traversal.

---

## 2026-09-02 15:26 — Phase 10 Targeted Remediation Pass (P10-RD1 to P10-RD5, R6 to R14) (Final Accepted)

### Summary

Executed targeted remediation for Phase 10 based on code review feedback:
1. **P10-RD1 (MCP SDK Request Timeout):** Replaced custom `Promise.race` with native MCP SDK request options (`signal: controller.signal`, `timeout: timeoutMs`, `maxTotalTimeout: timeoutMs`).
2. **P10-RD2 (Mutation Tool Timeout Policy):** Canonicalized `MUTATING_TOOLS`. Mutation `TOOL_TIMEOUT` is never automatically retried (treated as uncertain outcome, leaving reconciliation to higher layer). Read-only `TOOL_TIMEOUT` and transient `NETWORK_ERROR` remain eligible for bounded retry.
3. **P10-RD3 (Full Resolver Input Descriptor):** Updated `toolContextResolver` to receive `ToolContextResolutionInput` (`toolCallId`, `toolName`, `arguments`, `stepNumber`, `callIndex`). Verified multi-call same-tool bindings remain outside MCP tool arguments.
4. **P10-RD4 (Question Mapping Identity):** Removed `question_id` fallback from question mapping; strictly requires `question_bank_entry_id`.
5. **P10-RD5 (Discovered MCP Schema Validation):** Schema compilation failure throws `McpToolSchemaError` (`MCP_TOOL_SCHEMA_INVALID`) immediately on startup/discovery.
6. **R6 (Precise MCP Exception Classification):** Catch block distinguishes `TOOL_TIMEOUT`, `NETWORK_ERROR`, `MCP_PROTOCOL_ERROR`, and `INVALID_MCP_RESPONSE`.
7. **R7 (Repeated-Call Detection Order):** Signature tracking occurs before schema validation; 3 consecutive identical invalid calls trigger `REPEATED_TOOL_CALL_DETECTED`.
8. **R8 (Strict Structured Content Envelope):** Success requires `status === "success"` and defined `data`; error requires `status === "error"`, `code: string`, and `message: string`. Malformed envelopes yield `INVALID_MCP_RESPONSE`.
9. **R9 (Mutation-Only Idempotency):** Idempotency applies exclusively to `MUTATING_TOOLS`. Read tools do not acquire keys.
10. **R10 (Materialization Mapping Matrix):** Local-ref mappings are created only by create/materializing tools (`moodle_create_course`, `moodle_create_section`, `moodle_create_assignment`, `moodle_create_quiz`, `moodle_create_quiz_question`).
11. **R11 (Max-Step Tool Persistence):** When `maxSteps` is reached, requested tool call attempts are persisted into `poc_tool_call` as rejected records before throwing `MAX_STEPS_EXCEEDED`.
12. **R12 (Run Deadline Bounds Model Chat):** Effective model timeout is capped by remaining run deadline (`Math.min(modelTimeoutMs, runDeadline - now)`).
13. **R13 (Retry Delay Deadline Check):** Retry delay throws `RUN_TIMEOUT` if the delay would exceed the remaining run time.
14. **R14 (AgentLoopResult Status):** Return status typed as `"finished" | "failed"`. Confirmed `RunRepository.completeRun()` is never invoked by Phase 10.

### Files Modified

- `packages/agent-runtime/src/agent/types.ts`
- `packages/agent-runtime/src/mcp/mcp-tool-registry.ts`
- `packages/agent-runtime/src/mcp/mcp-client-manager.ts`
- `packages/agent-runtime/src/agent/agent-loop.ts`
- `packages/agent-runtime/test/mcp-tool-registry.test.ts`
- `packages/agent-runtime/test/mcp-client-manager.test.ts`
- `packages/agent-runtime/test/agent-loop.test.ts`
- `task.md`
- `.agent-work/status.md`
- `soc.md`

### Validation

- Agent Runtime tests: **68/68 PASS** across 7 test files (24 tests in `agent-loop.test.ts`, 7 tests in `mcp-client-manager.test.ts`).
- Monorepo Vitest suite (`pnpm test`): **333/333 PASS** across 31 test files (2 live integration tests skipped in normal suite).
- Monorepo Typecheck (`pnpm typecheck`): **PASS (0 errors)** across all 9 workspaces.
- Monorepo Production Build (`pnpm build`): **PASS (0 errors)** across all 9 workspaces.



---

## 2026-09-02 15:51 — Phase 10 Final Hardening — Uncertain Mutation Outcomes, Deadline Semantics, and Mapping Integrity

**Status:** DONE — FINAL ACCEPTED

### Summary

Applied the final three Phase 10 review findings directly in `packages/agent-runtime` and independently re-verified the package and monorepo. Mutation timeouts now persist a non-reacquirable `uncertain` idempotency state, overall run deadlines are distinguished from model/tool-local timeouts when the run deadline is the effective cap, and required materialization mappings now fail explicitly when the canonical Moodle identity is missing.

### Files Changed

- `packages/agent-runtime/src/db/schema/idempotency.ts`
- `packages/agent-runtime/src/repositories/idempotency-repository.ts`
- `packages/agent-runtime/src/agent/types.ts`
- `packages/agent-runtime/src/agent/agent-loop.ts`
- `packages/agent-runtime/test/agent-loop.test.ts`
- `packages/agent-runtime/test/persistence.integration.test.ts`
- `packages/agent-runtime/test/phase10-final-hardening.test.ts`
- `.agent-work/status.md`
- `soc.md`

### Implementation Notes

1. **Uncertain mutation timeout state**
   - Added `uncertain` to `PocIdempotencyStatus`.
   - Added `IdempotencyRepository.recordUncertain()` and `AcquireResult.state === "uncertain"`.
   - `tryAcquire()` never reacquires an `uncertain` operation. The higher execution layer must perform read-back reconciliation before any later retry decision.
   - A mutation `TOOL_TIMEOUT` is normalized to `MUTATION_OUTCOME_UNCERTAIN`; if an idempotency key exists it is persisted as `uncertain`, not `failed`.
   - Added typed `IdempotencyUncertainError` for later attempts against an uncertain key.

2. **Correct run-deadline timeout semantics**
   - Model calls still use `min(modelTimeoutMs, remainingRunTime)`, but a timeout whose effective limit was the run deadline now raises `RUN_TIMEOUT` instead of `MODEL_TIMEOUT`.
   - Tool calls similarly distinguish a tool-local timeout from a timeout capped by the overall run deadline. Run-bound tool timeout raises `RUN_TIMEOUT` and, for mutations with idempotency context, records the operation as `uncertain` before halting.
   - Existing retry delays remain bounded by remaining run time.

3. **Required materialization mapping integrity**
   - Added typed `MappingIdMissingError` (`MAPPING_ID_MISSING`).
   - For a materializing create tool with caller-supplied mapping context, absence of the canonical Moodle identity is now an explicit runtime failure rather than a silent mapping skip.
   - Canonical IDs remain: course → `course_id`, section → `section_id`, assignment/quiz → `activity_id`, question → `question_bank_entry_id` only.
   - Cached idempotent success results also re-run required mapping persistence so resume/recovery cannot silently bypass mapping creation.

### Tests / Validation

Commands executed:

```text
pnpm --filter @moodle-agent-poc/agent-runtime test
pnpm typecheck
pnpm test
pnpm build
```

Results:

- PASS — Agent Runtime: **71/71 tests** across 8 test files.
- PASS — Added real-PostgreSQL coverage proving `uncertain` cannot be reacquired until reconciliation.
- PASS — Added focused timeout regression tests proving model/tool timeouts capped by the overall deadline are classified as `RUN_TIMEOUT`.
- PASS — Missing `question_bank_entry_id` on a materializing question call now raises `MappingIdMissingError` and does not create a mapping.
- PASS — `pnpm typecheck` across all 9 applicable workspace projects.
- PASS — monorepo `pnpm test`: **336/336 tests**, 2 opt-in live integrations skipped.
- PASS — `pnpm build` across all 9 applicable workspace projects.

### Decisions Made

- No new architecture decision. This implements the already-approved Phase 10 review decisions, especially the rule that a timed-out mutation has an uncertain Moodle outcome and must not be blindly reacquired/retried.
- No Phase 11 plan traversal or verification behavior was introduced.

### Known Limitations / Follow-up

- Phase 11 owns read-back reconciliation policy for `uncertain` mutations and may later transition an uncertain logical operation to a known completed/absent state based on Moodle System-of-Record observations.
- No automatic compensation/rollback was added.

### Next Suggested Task

`T1101 — Begin Phase 11 Course Execution` only when explicitly requested.

---

## 2026-09-02 16:25 — Phase 11 — Course Execution Complete (T1101 to T1110)

**Status:** DONE

### Summary

Implemented Phase 11 Course Execution according to the approved architecture and all frozen decisions (`P11-D1` to `P11-D8`, `C1` to `C7`). Built a dedicated `@moodle-agent-poc/execution` package that deterministically orchestrates Moodle course materialization (Course -> Sections -> Activities -> Questions -> Quiz Slots) using Phase 10 safe runtime tool calls (`executeRuntimeToolCall`), mapping local plan refs to canonical Moodle IDs, handling errors with partial state preservation without rollback, transitioning run status to `awaiting_verification`, and exposing Fastify API endpoints (`GET /api/categories`, `POST /api/runs/:runId/execute`).

### Files Changed

- `packages/agent-runtime/src/db/schema/runs.ts` (added `"awaiting_verification"` status)
- `packages/agent-runtime/src/agent/types.ts` (exported `SafeToolRepositories`, `SafeToolExecutionContext`, `SafeToolExecutionOptions`)
- `packages/agent-runtime/src/agent/agent-loop.ts` (exported `executeRuntimeToolCall`)
- `packages/execution/package.json` (created new package with workspace deps)
- `packages/execution/tsconfig.json` (created TypeScript config)
- `packages/execution/src/types.ts` (defined `CourseExecutionConfig`, `CourseExecutionResult`, `CategoryItem`, `CourseExecutionError`)
- `packages/execution/src/serializers.ts` (deterministic formatting for shortname, intro, question name, question MCP args, course URL)
- `packages/execution/src/category-service.ts` (`listCourseCategories` via MCP tool)
- `packages/execution/src/course-executor.ts` (`CourseExecutor` and `executeCoursePlan`)
- `packages/execution/src/index.ts` (module exports)
- `packages/execution/test/serializers.test.ts` (11 unit tests)
- `packages/execution/test/category-service.test.ts` (2 unit tests)
- `packages/execution/test/course-executor.test.ts` (8 unit tests)
- `packages/execution/test/course-executor.integration.test.ts` (live integration fixture)
- `apps/api/package.json` (added `@moodle-agent-poc/execution` dep and test script)
- `apps/api/src/plugins/error-handler.ts` (handled `CourseExecutionError`)
- `apps/api/src/routes/categories.ts` (`GET /api/categories` endpoint)
- `apps/api/src/routes/executions.ts` (`POST /api/runs/:runId/execute` endpoint)
- `apps/api/src/app.ts` (registered routes and options)
- `apps/api/test/course-execution.test.ts` (6 API integration tests)

### Implementation Notes

1. **Deterministic Execution Sequence (P11-D1)**: No LLM in the execution loop. Follows exact order: Course -> Sections (sorted by `position`) -> Activities (array order) -> Questions (all 4 qtypes) -> Quiz Slots.
2. **Run State Lifecycle (P11-D2)**: Transitions run to `awaiting_verification` upon successful execution. Does NOT complete run (Phase 14 verification ownership).
3. **Authorization Semantics (P11-D3)**: `POST /api/runs/:runId/execute` with `{ plan_id, revision, target: { category_id } }` verifies plan ownership, `validationStatus === "valid"`, `plan_type === "course"`, and `operation === "create"`.
4. **Deterministic Shortname (P11-D4, C4)**: `${normalized(course_code || title)}-${sha256(plan_id:revision).slice(0, 6)}`. Generated prior to course creation tool call.
5. **Deterministic Serialization (P11-D5, P11-D6, P11-D7, P11-D8, C1–C3, C6, C7)**:
   - Assignment intro: description + numbered instructions + bulleted learning objectives.
   - Question name: `Q{ordinal} - {truncated question_text}`.
   - Question MCP args: True/False sends `correct_answer: boolean`; Short Answer sends `case_sensitive: boolean`; Multiple Choice computes `fraction: 1` for `correct_choice_refs[0]` and `0` for others; Essay serializes rubric criteria into `graderinfo` with `response_format: "editor"`.
   - Quiz mapping maps `quiz ref -> activity_id` (C6). Question mapping maps `question ref -> question_bank_entry_id` (C7).
   - Quiz slot addition: invokes `moodle_add_question_to_quiz` sequentially in plan order with `max_mark: default_mark`.
6. **Course View URL (T1109)**: `${moodleBaseUrl}/course/view.php?id=${course_id}`.
7. **Partial State Preservation on Failure (T1110)**: On error, fails run (`status: "failed"`), does NOT delete created Moodle entities or mappings.

### Tests / Validation

- PASS: `packages/execution` test suite: **21/21 tests** PASS (1 live integration skipped).
- PASS: `apps/api` test suite: **47/47 tests** PASS.
- PASS: Monorepo `pnpm typecheck`: **9/9 workspaces** passed with 0 errors.
- PASS: Monorepo `pnpm test`: **363/363 tests** PASS across 36 test files (3 live integrations skipped).
- PASS: Monorepo `pnpm build`: **9/9 workspaces** built with 0 errors.

### Decisions Made

- Implemented all frozen Phase 11 decisions `P11-D1` through `P11-D8` and contract corrections `C1` through `C7`.
- `executeRuntimeToolCall` reused directly from `@moodle-agent-poc/agent-runtime` for single-tool execution with idempotency and mapping persistence.

### Next Suggested Task

Phase 12 (Targeted Assignment Updates) or Phase 13 (Targeted Quiz Updates).

---


## 2026-09-02 — Phase 11 Course Execution Final Hardening / Acceptance

### Scope
- Reviewed and hardened Phase 11 implementation for T1101–T1110 against frozen P11-D1–P11-D8 and Phase 9/10 contracts.

### Remediations applied
- Fixed multichoice serialization to send Phase 9-compatible booleans: `single: true`, `shuffle_answers: true`.
- Added orchestration `localRef` context to `moodle_add_question_to_quiz`, so quiz-slot mutations participate in Phase 10 mutation idempotency without creating an execution mapping.
- API-created MCP clients now honor `MCP_SERVER_COMMAND` / `MCP_SERVER_ARGS` configuration and are closed in `finally`; injected/shared MCP managers remain caller-owned.
- `/api/runs/:runId/execute` now forwards configured `agentToolTimeoutMs` and `agentRunTimeoutMs` into CourseExecutor / Phase 10 safe runtime.
- Added Phase 11 hardening regression coverage proving frozen boolean multichoice schema behavior and quiz-slot idempotency context.

### Verified Phase 11 behavior
- Deterministic approved-plan traversal; no LLM-driven execution sequence.
- Reuses Phase 10 `executeRuntimeToolCall` safety primitive.
- Exact plan revision / run ownership / valid course-create request checks occur before mutation.
- Deterministic shortname, assignment intro, question naming, essay guidance, section/activity/question ordering.
- Quiz refs map to `activity_id`; question refs map to `question_bank_entry_id`.
- Slot marks use Plan `default_mark`.
- Successful materialization transitions run to `awaiting_verification`; Phase 11 does not call `completeRun()`.
- Partial Moodle state, mappings, tool calls, and uncertain idempotency state are preserved on failure; no rollback.

### Validation
- `pnpm --filter @moodle-agent-poc/execution test`: 22/22 passed; 1 opt-in live integration skipped.
- `pnpm --filter @moodle-agent-poc/api test`: 47/47 passed.
- `pnpm typecheck`: PASS across 9 workspace projects.
- `pnpm test`: 364/364 passed; 3 opt-in integrations skipped.
- `pnpm build`: PASS across 9 workspace projects.

### Status
- T1101–T1110 complete.
- Phase 11 Final Accepted.
- Next planned phase: Phase 12 — Existing Assignment Update.

## 2026-09-02 17:32 (Asia/Bangkok) — Phase 12 Existing Assignment Update Final Accepted

Completed T1201–T1206.

Implementation summary:
- Added `packages/execution/src/assignment-executor.ts` with existing-assignment read normalization, deterministic reverse parsing of the Phase 11 assignment intro format, assignment create/update execution, and deterministic read-back verification.
- T1201 reads Moodle assignment state through `moodle_get_assignment` using canonical `activity_id`; API endpoint `GET /api/assignments/:activityId` exposes observed and planning-normalized state.
- T1202 adds `POST /api/runs/:runId/plans/assignment-update`: reads current Moodle state first, checks requested course/section against observed state, then invokes the existing Phase 5 `AssignmentPlanner` with instruction + optional source context and persists the exact plan revision through the planner repository path.
- T1203 reuses the generic Phase 6 `/api/plans/:planId/preview?revision=N` preview path; planning route returns a preview URL and transitions run `planning -> preview`.
- T1204 extends generic `POST /api/runs/:runId/execute` dispatch to `assignment/create` and `assignment/update` after frozen ExecutionRequest validation/compatibility checks. Mutations use Phase 10 `executeRuntimeToolCall` rather than bypassing runtime safeguards.
- Assignment update idempotency uses the plan-local assignment ref with `moodle_update_assignment`; assignment create uses the same ref plus targetType=`assignment`, creating the canonical local-ref -> `activity_id` mapping.
- T1205 performs deterministic post-mutation read-back with `moodle_get_assignment` and compares activity/course/section identity, materialized name, deterministic intro, and grade. Verified assignment flows call the higher-level `RunRepository.completeRun`; mismatches fail the run without rolling back Moodle state.
- T1206 supports an approved `AssignmentPlanEnvelope` with operation=`create` targeting frozen `ExistingSectionTarget {course_id, section_id}`, materializing through `moodle_create_assignment`, mapping the created `activity_id`, and verifying the created assignment.
- Added `apps/api/src/routes/assignments.ts` and BuildApp wiring for assignment state/planning endpoints.
- Existing Course execution dispatch remains supported and regression-tested.

Validation:
- `pnpm --filter @moodle-agent-poc/execution test`: 25/25 passed, 1 opt-in live integration skipped.
- `pnpm --filter @moodle-agent-poc/api test`: 49/49 passed.
- `pnpm typecheck`: PASS.
- `pnpm test`: 369/369 passed, 3 opt-in live integrations skipped.
- `pnpm build`: PASS.

Known POC behavior:
- For assignments previously materialized by this platform, the deterministic intro formatter is reverse-parsed back into description/instructions/learning objectives for update planning.
- For external Moodle assignments whose intro does not match the platform formatter, the full intro is preserved as `description` and structured instruction/objective arrays start empty; the planner may populate them based on the teacher instruction.
- No direct Moodle DB mutation is introduced; all mutations continue through MCP -> Moodle client -> `local_agentpoc`.

Phase 12 verdict: FINAL ACCEPTED. Next planned phase: Phase 13 Existing Quiz Update.

## 2026-09-02 — Phase 13 Existing Quiz Update — Final Accepted

Completed T1301–T1309.

Implementation summary:
- Added `packages/execution/src/quiz-executor.ts` with deterministic Moodle read/update/create/read-back flows.
- Added `GET /api/quizzes/:activityId` for observed Quiz metadata + question slots and a planning-safe observed-state projection.
- Added `POST /api/runs/:runId/plans/quiz-update` using the existing `QuizPlanner`, exact Moodle read state, explicit target, and preview lifecycle.
- Preserved frozen `QuizUpdateTarget {course_id, section_id, quiz_id}`. Because Phase 9 tools use canonical CMID/activity_id, Phase 13 deterministically resolves `quiz_id -> activity_id` through `moodle_get_course_structure` and validates course/section ownership before mutation.
- Existing question refs are projected deterministically by slot order (`question-01`, `question-02`, ...). Execution re-reads current slots and resolves update refs back to stable `question_bank_entry_id`; frozen Plan schema remains free of Moodle IDs.
- Introduced `ExistingQuizQuestionState` as an observed-state planning DTO instead of pretending Moodle read-back can reconstruct a complete `QuestionPlan`. This avoids fabricating unsupported fields such as essay grading guidance.
- Quiz update flow updates metadata, updates existing questions where supported, creates new questions, adds new question slots, and performs deterministic read-back verification before `completeRun()`.
- Quiz create-in-existing-section flow creates the Quiz, creates/slotted questions, records canonical mappings, read-backs, verifies, then completes the run.
- No rollback/deletion is performed on failure; partial Moodle state and runtime records are preserved.
- Added Phase 13 API and execution tests.

Additional runtime hardening found while implementing Phase 13:
- Mutating `NETWORK_ERROR` is no longer blindly retried. Since dispatch/commit status may be ambiguous, it is normalized as `MUTATION_OUTCOME_UNCERTAIN`, persisted as idempotency `uncertain`, and requires read-back reconciliation before retry. Read-only transient network failures remain retryable.

Verification:
- Agent Runtime: 72/72 passed.
- Execution package: 28/28 passed, 1 opt-in live integration skipped.
- API package: 51/51 passed.
- Monorepo: 375/375 passed, 3 opt-in live integrations skipped.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.

Status: Phase 13 FINAL ACCEPTED. Next phase: Phase 14 Verification Engine.

## 2026-09-02 — Phase 14 Verification Engine — Final Accepted

Completed T1401–T1410.

Implementation summary:
- Added `packages/verification` deterministic course verification engine.
- Builds expected Course structure projection from the exact immutable CoursePlan revision plus persisted execution mappings.
- Reads actual Moodle state through `moodle_get_course_structure` and `moodle_get_quiz_questions`; verification is read-only and does not use an LLM.
- Compares course title/ID, section identity/order/name, Assignment type/name/intro/grade, Quiz type/name/intro, quiz question count, stable `question_bank_entry_id`, qtype, question text, and default mark.
- Produces the frozen `VerificationResult v0.1` issue kinds (`mismatch`, `missing`, `read_error`) with deterministic paths and expected/actual payloads.
- Persists verification through `VerificationRepository`, including expected and observed course structures.
- Successful verification calls `RunRepository.completeRun()`; failed/read-error verification records issues and marks the run failed without Moodle rollback/mutation.
- Added `POST /api/runs/:runId/verify` for exact course plan revision verification and `GET /api/runs/:runId/verification?plan_id=...&revision=...` for latest persisted result.
- API validates run/plan ownership and only accepts valid `course/create` plans.
- Added verification package/API regression tests.

Validation evidence:
- `pnpm --filter @moodle-agent-poc/verification test`: 2/2 PASS.
- `pnpm --filter @moodle-agent-poc/api test`: 52/52 PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: 378/378 PASS, 3 opt-in integration tests skipped.
- `pnpm build`: PASS.

Status: Phase 14 FINAL ACCEPTED. Next roadmap phase: Phase 15 — Test Fixtures and QA.


## 2026-09-02 23:02 — Phase 15 Final QA — Multi-Provider Repeated Planning Baseline

**Status:** DONE — FINAL ACCEPTED

Completed T1501–T1512.

### QA infrastructure
- Added `@moodle-agent-poc/qa` with frozen fixtures, technical metrics collector, planning/human quality rubrics, repeated-run report validation, and strict separation of technical results from AI-quality results.
- Frozen fixtures:
  - `synthetic-basic.md`
  - `representative-software-engineering.md`
  - `representative-project-management.md`
- Technical collector measures tool-schema validity, MCP/tool execution success, verification pass rate, and model/tool/total latency summaries.
- Human AI quality remains `not_evaluated` unless scored through the explicit rubric; automated technical success is never substituted for pedagogical quality.

### Model-provider abstraction / QA support
- Existing `ModelClient` boundary now supports configurable `ollama`, `groq`, and `unsloth` providers.
- Added `OpenAICompatibleModelClient` for LAN/OpenAI-compatible serving.
- Unsloth uses `json_object` plus adapter-level injection of the exact planner JSON Schema; frozen Plan contracts remain unchanged and Ajv/domain validation remains authoritative.
- Groq keeps provider-side structured-output handling.
- `.env.example` documents all three providers without storing secrets.

### Official repeated planning batches (3 fixtures × 3 repetitions, temperature 0)
- **Groq / `openai/gpt-oss-20b`:** 2/9 valid (22.22%); successful mean latency 3.0415 s; p95 3.217 s.
- **Unsloth LAN / Gemma 4 E4B IT GGUF Q5_K_M:** 5/9 valid (55.56%); successful mean latency 24.7898 s; p95 31.257 s.
- Local Ollama `gemma4:e2b` exploratory partial batch produced 5/5 observed valid plans but was stopped before 9 trials due roughly 122–266 s latency; it is explicitly not treated as an official comparable rate.

### Key findings
- Provider/backend choice materially changes structured-output semantics; adapters must preserve the frozen planning contract rather than mutate it for a backend.
- Groq is much faster but the tested model/provider combination had low first-attempt CoursePlan validity.
- Unsloth LAN is slower than Groq but materially more reliable after fixing schema visibility at the provider adapter.
- The current hardest model failure is the assignment-vs-quiz/question union in the representative project-management fixture.
- Phase 15 does not choose the final model. Real Moodle E2E technical + AI findings remain Phase 16 work.

### Artifacts
- `packages/qa/QA_PROTOCOL.md`
- `packages/qa/PHASE15_RESULTS.md`
- `packages/qa/results/phase15-repeated-planning-groq.json`
- `packages/qa/results/phase15-repeated-planning-unsloth.json`
- `scripts/phase15-repeated-planning.ts`

### Verification evidence
- `pnpm typecheck` — PASS
- `pnpm test` — **385/385 PASS**, 3 opt-in integration tests skipped
- `pnpm build` — PASS

**Next:** Phase 16 — End-to-End Demo (T1601–T1615).

---

## 2026-09-03 — Preview Editor Actions and Runtime Verification (T1617)

**Status:** DONE

### UI / Revision Fixes

- Added explicit AMD handlers for Cancel and `×` in both Section and Course edit modals; handlers call `.modal('hide')` and do not invoke save.
- Added functional Delete action for every Section and every Assignment/Quiz activity. Both paths clone the immutable envelope, POST `save_revision`, update state only from the response, and re-render.
- Section deletion requires confirmation, rejects deleting the final remaining section, and normalizes remaining `position` values to `1..N`.
- Activity deletion requires confirmation and removes the exact activity from the selected section.
- Added pure contract helpers and tests for optional-string omission, deterministic Section descriptors, deletion, position normalization, and previous-revision immutability.
- Kept generated Section summaries non-empty and Week/Unit grouping guidance in the Course Planner; frozen Planning Contract files remain unchanged.

### Runtime Verification

- Port 3000 had no listening process when checked; health was refused.
- Started a fresh API process from the current `.env` on port 3000 (current PID 1384), with startup log resolving `modelProvider=groq` and `model=openai/gpt-oss-120b`.
- Created a new run `347749ee-7f3b-4e4a-872a-02188d2124d0`; response metadata recorded `openai/gpt-oss-120b`.
- Groq planning request completed successfully with model 120B; the API run returned a valid CoursePlan and the server startup/runtime model was 120B. No 20B fallback is configured.
- The service remains running on port 3000 for manual UI testing.

### Files Changed

- `moodle/public/local/agentpoc/amd/src/course_builder.js`
- `moodle/public/local/agentpoc/amd/src/contract_helpers.js`
- `moodle/public/local/agentpoc/amd/build/course_builder.min.js`
- `moodle/public/local/agentpoc/amd/build/contract_helpers.min.js`
- `moodle/public/local/agentpoc/cli/test_preview_contract.mjs`
- `moodle/public/local/agentpoc/cli/test_preview_ui.mjs`
- mirrored files under `ai-platform/moodle/local_agentpoc`
- `packages/planning/test/plan-revision-helper.test.ts`
- `apps/api/test/config-loader.test.ts`
- `task.md`
- `soc.md`

### Validation

- Preview contract tests: 16 assertions passed per plugin copy.
- Modal explicit-dismiss tests: 4 assertions passed per plugin copy.
- Planning revision/planner tests: 18/18 passed.
- Planning typecheck: PASS.
- API regression suite and model configuration tests: PASS.
- Monorepo suite: 402 passed, 3 opt-in integrations skipped.
- API health after restart: 200.

The Moodle BFF E2E runner was corrected to use the fixture's UTF-16LE encoding and form-urlencoded revision payload. Its upload and run-model recording passed, and API logs showed 120B on the generation request; subsequent generation retries were rejected by Groq's external rate limit, so the BFF flow was not repeated further to avoid consuming quota. The previously completed direct API E2E remains the functional Execute/Verify evidence.

Direct revision endpoint smoke check against the existing OOP plan also passed: delete Section created revision 2 with 5 sections and normalized positions; delete Activity created revision 3; revision 1 remained at 6 sections with its original activity intact.

---

## 2026-09-03 — Syllabus Language Preservation and Plan Summary Semantics (T1514)

**Status:** DONE

### Language Preservation

- Added explicit language-preservation rules to the Course Planning system prompt and one reinforced instruction in the user prompt.
- The model must detect the syllabus's primary natural language and use it for human-readable course/section/activity/question prose, while preserving technical identifiers and code syntax.
- Added runtime validation so generated sections cannot omit or emit blank summaries, including for non-strict providers.
- Existing Week/Unit grouping remains the default, so the language rule does not reintroduce over-segmentation.

### Plan Summary Semantics

- Confirmed `poc_plan.summary` is the pedagogical Plan summary: it mirrors the required envelope `summary` and is used by API/preview consumers.
- Fixed `PlanRevisionHelper` so the revision change note supplied by the UI no longer overwrites `poc_plan.summary` or `rawEnvelope.summary`.
- Renamed the internal parameter to `changeSummary` to make the distinction explicit. The current POC has no separate DB column for change notes; the request-level note is therefore not persisted as the Plan summary.

### Files Changed

- `packages/planning/src/prompts/course-planning-prompt.ts`
- `packages/planning/src/planners/course-planner.ts`
- `packages/planning/src/revisions/plan-revision-helper.ts`
- `packages/planning/test/course-planner.test.ts`
- `packages/planning/test/plan-revision-helper.test.ts`
- `apps/api/src/routes/plans.ts`
- `apps/api/test/plans.test.ts`
- `task.md`
- `soc.md`

### Validation

- Thai language regression: 12 CoursePlanner tests passed, including Thai summary/section/assignment/quiz content, technical terms (`C#`, `.NET`, `if / else`), and frozen schema/domain/provenance validation.
- English CoursePlanner coverage remains passing.
- Plan revision semantics test verifies change note does not replace the pedagogical `poc_plan.summary`.
- API suite: 64/64 passed.
- Planning typecheck: PASS.

### Scope / Limitation

No language field was added to `NormalizedSyllabus`; no frozen Planning Contract or Moodle core file was modified. A separate persisted revision-change-note field remains future work if audit history needs it.

---

## 2026-09-03 — Runtime Rebuild and Model Configuration Verification (T1515)

**Status:** DONE

- Rebuilt `@moodle-agent-poc/planning` and `@moodle-agent-poc/api` after language-preservation and summary-semantics changes.
- Restarted the API from the current `.env` on port 3000; current process PID is 17720.
- Startup log resolved `modelProvider=groq` and `model=openai/gpt-oss-120b`.
- New run metadata verification after restart recorded `openai/gpt-oss-120b`; no 20B fallback is configured.
- Planning/API regression and typecheck validation remain passing.

---

## 2026-09-03 — Multilingual PDF Ingestion Normalization (T1516)

**Status:** DONE

### Root Cause / Fix

- Extended deterministic normalizer aliases for Thai course title/name, description, learning objectives/outcomes, assessment, schedule, and week/unit headings.
- Thai week anchors remain in the original language (`สัปดาห์ที่ N`, `หน่วยที่ N`, `บทที่ N`).
- Added deterministic schedule-table parsing for pipe/tab rows with numbered weeks and flattened numbered rows; each row becomes a `schedule_or_topics` item with the extractor's page provenance.
- Added `NORMALIZATION_INCOMPLETE` for substantial machine-readable PDFs whose raw text contains content but yields no title, learning objectives, or schedule entries. Planning is not called in this state.
- No LLM is used in ingestion normalization, and `NormalizedSyllabus`/frozen contracts are unchanged.

### Tests / Validation

- Thai plain-text heading fixture: title, `CS231`, description, CLOs, schedule, assessment, and original Thai anchors pass.
- Thai 15-row schedule table fixture: 15 week items, row topics, and page provenance pass.
- Actual extracted-text-shape fixture: numbered headings, bilingual CLO suffix, single-space rows, title fallback, 5 CLOs, 15 anchors, assessment, and page provenance pass.
- Substantial unstructured PDF fixture: fails with `NORMALIZATION_INCOMPLETE` before planning.
- Existing English Markdown/PDF/DOCX behavior: syllabus suite 17/17 passed.
- API suite: 64/64 passed.
- Syllabus typecheck/build: PASS.
- API restarted from rebuilt packages and health check returned 200 on port 3000 (current PID 8396).
- Monorepo suite: 407 passed, 3 opt-in integrations skipped.

---

## 2026-09-03 — Preview/Edit Contract Shape Remediation (T1616)

**Status:** DONE

### Root Cause / Fix

- Preview section edits previously serialized an empty textarea as `summary: ""`, violating the optional-but-nonblank frozen SectionPlan field.
- Added shared AMD `contract_helpers` in both plugin copies. `setOptionalString()` trims values and omits empty optional properties.
- `saveSection()` now uses the helper for optional `section.summary`.
- `saveCourseTitle()` now uses the helper for optional `content.course.summary` while preserving the required envelope-level `summary` when the course-summary field is cleared.
- `addSection()` now computes a deterministic unused `section-XX` ref and next `position`, and emits exactly the contract fields `ref`, `position`, `title`, `source_refs`, and `activities`; it no longer emits `order`.
- Mirrored changes into both `moodle/public/local/agentpoc` and `ai-platform/moodle/local_agentpoc`, including AMD build artifacts.
- Frozen planning contract files were not modified.

### Files Changed

- `moodle/public/local/agentpoc/amd/src/course_builder.js`
- `moodle/public/local/agentpoc/amd/src/contract_helpers.js`
- `moodle/public/local/agentpoc/amd/build/course_builder.min.js`
- `moodle/public/local/agentpoc/amd/build/contract_helpers.min.js`
- `moodle/public/local/agentpoc/cli/test_preview_contract.mjs`
- mirrored files under `ai-platform/moodle/local_agentpoc`
- `packages/planning/test/plan-revision-helper.test.ts`
- `task.md`
- `soc.md`

### Validation

- Preview helper tests: 8 assertions passed in each plugin copy.
- Plan revision helper: 8/8 passed, including added Section revision validation and prior revision immutability.
- Node syntax checks passed for helper and Course Builder source.
- Source/build artifacts are byte-identical in both plugin copies.

---

## 2026-09-03 — Chunked Course Planning & Activity Generation (T1618)

**Status:** DONE

### Implementation

- Added deterministic teacher-instruction interpretation for supported weekly Quiz/Assignment rules (activity count, question type, question/choice/correct-answer counts).
- Refactored CoursePlanner into a structure-only model stage followed by bounded activity generation chunks (default two sections per request), deterministic merge, teacher-constraint validation, frozen contract validation, domain invariant validation, and provenance validation.
- Added targeted chunk repair (maximum two attempts) and a rate-limit-aware scheduler that honors provider retry metadata and never retries request-too-large failures blindly.
- Added in-memory PlanningProgress stages plus `GET /api/runs/:runId/progress`; Moodle BFF and Preview UI now proxy/poll this progress and pass optional teacher instructions through to the planner.
- Kept `PocRunStatus`, Frozen Planning Contract, pre-approval Moodle isolation, and immutable plan revisions unchanged. Legacy full-plan model responses remain accepted during migration.

### Validation

- Planning build: PASS.
- Chunked planning + existing CoursePlanner tests: 16/16 passed.
- API plans lifecycle integration: 8/8 passed.
- API build: PASS.
- Deterministic structure coverage guard verifies every normalized Week/Unit anchor is represented before activity generation.
- Runtime restarted from the current `.env` on port 3000 (PID 21128); startup log resolves `MODEL_PROVIDER=groq` and `openai/gpt-oss-120b`.
- Final full monorepo regression: 411 passed, 3 opt-in integration tests skipped.

### Scope / Limitations

- Partial planning state is intentionally in-memory for the POC; restart/resume persistence is not added.
- The live 15-week Groq E2E still requires provider availability and the real PDF fixture; deterministic unit/integration coverage is in place.

---

## 2026-09-03 — Course Planning Schema Parity and Groq 120B E2E (T1513)

**Status:** DONE

### Implementation

- Audited `buildCoursePlanningSchema()` against the frozen CourseDefinition, SectionPlan, AssignmentPlan, QuizPlan, question variants, and SourceReference constraints.
- Added frozen nonblank `minLength: 1` / `pattern: "\\S"` constraints throughout the model-facing CoursePlan schema, including Section `summary`.
- Preserved the frozen planning schemas unchanged.
- Shared grounded source-reference definitions through `$defs`/`$ref` to reduce repeated schema tokens; kept provider-incompatible `uniqueItems` checks in downstream frozen/domain validation.
- Grouped normalized syllabus entries by week/unit, omitted code-example payloads from the planning prompt, and required every distinct week/unit anchor in the model-facing schema/prompt.
- Changed current Groq defaults/configuration and the E2E fixture runner to `openai/gpt-oss-120b` with `MODEL_PROVIDER=groq`; no provider/model fallback was added.
- Updated the E2E runner to use `scratch-oop-syllabus.json` (Python OOP mock syllabus).

### E2E Validation

Runtime instance log: `modelProvider=groq`, `model=openai/gpt-oss-120b`.

- Upload: 201; recorded run model `openai/gpt-oss-120b`.
- Planning request: estimated 3,881 tokens after prompt/schema compaction; no TPM 413. One transient rate-limit retry occurred before success.
- Generated plan: 6 weeks, 4 assignments, 2 quizzes, 6 questions, no empty Section summaries.
- Frozen contract validation: `validationStatus=valid`.
- Provenance/domain validation: passed.
- Preview: 200.
- Approve: 200, exact revision approved.
- Execute: `awaiting_verification`; created 1 course, 6 sections, 4 assignments, 2 quizzes, 6 questions, 6 slots.
- Verify: 200, `passed=true`, `issues=[]`.

### Tests / Build

- Course planner regression: 10/10 passed.
- API suite: passed.
- Agent Runtime suite: 76/76 passed.
- Monorepo suite: 399 passed, 3 opt-in live integrations skipped.
- Planning/API/Agent Runtime typechecks: passed.
- Planning/API/Agent Runtime builds: passed.

### Scope / Limitations

No frozen planning contract files were modified. Historical Phase 15 20B QA result files remain unchanged as historical evidence. The current live service on port 3000 was not replaced; validation used a temporary port-3001 instance loaded from the updated `.env` and then shut it down.

---

## 2026-09-03 — Phase 10 Remediation — Provider Tool-Call Correlation (T1015)

**Status:** DONE

### Summary

Fixed the Agent runtime blocker where normalized Moodle tool results were sent back to Groq/OpenAI-compatible chat providers without the originating `tool_call_id`. The runtime now carries the provider call ID on `role: "tool"` messages, and both provider adapters serialize it into the next chat-completions request.

### Files Changed

- `packages/agent-runtime/src/llm/types.ts`
- `packages/agent-runtime/src/agent/agent-loop.ts`
- `packages/agent-runtime/src/llm/groq-client.ts`
- `packages/agent-runtime/src/llm/openai-compatible-client.ts`
- `packages/agent-runtime/test/agent-loop.test.ts`
- `packages/agent-runtime/test/groq-client.test.ts`
- `packages/agent-runtime/test/openai-compatible-client.test.ts`
- `packages/agent-runtime/dist/agent/agent-loop.js` and source map (generated)
- `packages/agent-runtime/dist/llm/{types,groq-client,openai-compatible-client}.*` (generated)
- `task.md`
- `soc.md`

### Validation

- Reproduction test failed before the fix because tool-result messages contained only `role` and `content`.
- Targeted regression suite: 28/28 passed.
- Agent Runtime suite: 76/76 passed across 10 test files.
- Agent Runtime typecheck: PASS.
- Agent Runtime build: PASS.

### Scope

Only the provider tool-call correlation blocker was fixed. Previously reported timeout, multichoice `single`, provider error mapping, and cross-language contract drift concerns remain unchanged.

---

## 2026-09-04 — T1618 Follow-up Hardening: Grounding, Scope, Chunk Progress, and Staged Runtime

**Status:** DONE

### Action Completed

- Added deterministic section-specific syllabus grounding for every activity chunk. Activity generation now receives only the matching schedule/topic slice, relevant objectives, assessment context, and authorized source references; the full raw syllabus is not duplicated per chunk.
- Added section/chunk-specific provenance allowlists and enforced them during activity repair and final domain validation. Activity and question references must identify an authorized page/section location for the target section.
- Corrected teacher-instruction scope compilation:
  - weekly/each-section instructions compile to `each_section`;
  - explicit week instructions compile to `specific_sections`;
  - every-N-week instructions compile to `every_n_sections`;
  - ambiguous activity instructions produce a warning and do not default globally.
- Added deterministic support for `activityCount > 1`, including unique activity refs/titles and normalized question/choice refs.
- Updated `ModelRequestScheduler` to honor `Retry-After`, provider reset timestamps, and a configurable five-minute retry ceiling. The scheduler carries pacing state across activity chunks.
- Preserved the actual activity chunk count through final `ready_for_preview` progress, including the expected `8/8` result for 15 sections at chunk size 2.
- Removed the active legacy single-call course-planning branch. Runtime now always follows `Structure → Activities → Merge`; any activity bodies accidentally returned by Stage 1 are ignored and recorded as a warning.
- Added deterministic validation that Stage 2 returns exactly the section refs requested by the current chunk.

### Files Changed

- `packages/planning/src/grounding/section-grounding.ts`
- `packages/planning/src/instructions/teacher-instruction-interpreter.ts`
- `packages/planning/src/planners/course-structure-planner.ts`
- `packages/planning/src/planners/activity-planner.ts`
- `packages/planning/src/planners/course-planner.ts`
- `packages/planning/src/domain/planning-domain-validator.ts`
- `packages/planning/src/validators/teacher-constraint-validator.ts`
- `packages/planning/src/scheduling/model-request-scheduler.ts`
- `packages/planning/src/types.ts`
- `packages/planning/src/index.ts`
- `packages/planning/test/chunked-planning.test.ts`
- `packages/planning/test/course-planner.test.ts`
- `packages/planning/test/model-request-scheduler.test.ts`
- generated `packages/planning/dist/` artifacts

### Validation

- Workspace typecheck: PASS.
- Workspace build: PASS.
- Full test suite: 50 test files passed, 421 tests passed, 3 opt-in integration tests skipped.
- Planning regression coverage includes original section grounding, cross-section provenance rejection, scope interpretation, ambiguous-scope safety, multiple activity counts, provider reset pacing, final chunk progress, and legacy Stage 1 payload isolation.

### Remaining Action / Limitation

- Live 15-week provider E2E still requires provider availability and the real Moodle/PDF environment; deterministic unit coverage is in place.
- Planning progress remains in-memory for the POC and does not support restart/resume persistence.

---

## 2026-09-04 — T1618 Re-review Remediation: Stage Prompt, Semantic Selectors, and Output Cardinality

**Status:** DONE

### Action Completed

- Replaced the contradictory Stage 1 use of the full CoursePlan prompt with dedicated `COURSE_STRUCTURE_SYSTEM_PROMPT` and `buildCourseStructureUserPrompt()` definitions. Stage 1 now describes only course structure, section summaries/provenance, coverage, and `activity_intents`; downstream activity materialization fields remain Stage 2 responsibilities.
- Changed specific-week teacher constraints from predicted `section_ref` matching to semantic `anchors` and `sectionPositions`. Rules now resolve against the actual Stage 1 section title/grounding, so refs such as `section-5` and `section-custom-week-5` do not break Week 5 selection.
- Removed the section-grounding objective fallback that injected every course objective when no deterministic match existed. Unmatched sections now receive an empty objective slice.
- Added duplicate and exact-cardinality checks for raw Stage 2 section refs before building the activity map. Duplicate, missing, and unknown chunk sections now produce deterministic constraint violations.
- Added deterministic title normalization for duplicate teacher-generated activity intents while preserving unique activity refs and normalized question/choice refs.
- Extended final teacher-constraint validation to resolve semantic selectors using section position/title/normalized syllabus grounding, keeping chunk-time and final validation behavior aligned.
- Updated API/planning fixtures to use the actual two-stage response shape and added regression coverage for Stage 1 prompt isolation, custom section refs, objective isolation, Stage 2 cardinality, duplicate refs, and duplicate teacher titles.

### Files Changed

- `packages/planning/src/prompts/course-planning-prompt.ts`
- `packages/planning/src/instructions/planning-constraints.ts`
- `packages/planning/src/instructions/teacher-instruction-interpreter.ts`
- `packages/planning/src/planners/course-structure-planner.ts`
- `packages/planning/src/planners/course-planner.ts`
- `packages/planning/src/planners/activity-planner.ts`
- `packages/planning/src/grounding/section-grounding.ts`
- `packages/planning/src/validators/teacher-constraint-validator.ts`
- `packages/planning/test/chunked-planning.test.ts`
- `packages/planning/test/course-planner.test.ts`
- `apps/api/test/plans.test.ts`
- generated `packages/planning/dist/` and dependent build artifacts

### Validation

- `pnpm typecheck`: PASS across all 10 workspace projects.
- `pnpm test`: PASS — 50 test files, 425 tests passed; 3 opt-in integration tests skipped.
- `pnpm build`: PASS across all workspace packages/apps.
- API plans lifecycle regression: 8/8 passed after rebuilding the latest planning artifacts.
- Planning regression suite includes 15 tests covering staged prompt isolation, semantic Week 5 selection with custom refs, objective isolation, provenance, duplicate/missing/unknown Stage 2 refs, multiple activity counts, duplicate titles, 15-section/8-chunk progress, and legacy Stage 1 payload isolation.

### Scope Preserved

Frozen Planning Contract, `PocRunStatus`, approval semantics, immutable plan revisions, Moodle core, and browser-to-AI-Platform isolation were not modified.

---

## 2026-09-04 — T1618 Follow-up: Teacher-Owned Activity Cardinality and Stage 1 Provenance Formatting

**Status:** DONE

### Action Completed

- Added an internal `TeacherActivityRefMap` derived from deterministic `activityIntents` after refs are assigned. Chunk-time and final teacher-constraint validation now count only activity refs whose internal intent origin is `teacher_instruction`; syllabus-origin activities remain preserved and are excluded from teacher cardinality.
- Kept this ownership metadata out of the frozen `CoursePlan` contract and persisted plan envelope.
- Added regressions for syllabus Quiz plus teacher Quiz, syllabus Assignment plus teacher Quiz, and syllabus Quiz plus two teacher Quizzes.
- Updated Stage 1 `buildScheduleAndCoverage()` to format explicit source locations through the canonical source-reference helper. Single-line locations now remain `lines N-N`, aligned with schema and validator canonicalization.

### Validation

- Planning focused tests: PASS — 4 test files, 44 tests.
- API plans lifecycle: PASS — 8/8 tests.
- Workspace typecheck: PASS across all 10 workspace projects.
- Workspace full test suite: PASS — process exit code 0; no failed tests reported; opt-in integration tests remain skipped.
- Workspace build: PASS across all workspace packages/apps; generated planning `dist` artifacts updated.

### Scope Preserved

Frozen Planning Contract, `PocRunStatus`, approval semantics, immutable plan revisions, Moodle core, and browser-to-AI-Platform isolation were not modified.

---

## 2026-09-04 — T1618 Re-review Remediation: Deterministic Teacher Scope and Canonical Provenance

**Status:** DONE

### Action Completed

- Restricted Stage 1 `activity_intents` to `origin: "syllabus"`; non-strict or malicious model-produced `teacher_instruction` intents are discarded by the structure parser. Teacher-origin intents are now created only by `CoursePlanner` from compiled deterministic rules.
- Bounded Stage 2 activity materialization to the application-owned intent count per section/type, so model-produced activities cannot expand a teacher rule into unrelated sections.
- Added ordered specific-section resolution: semantic title/grounding anchors are resolved across the complete structure first; numeric section positions are used only when no semantic target resolves. Semantic matching also recognizes equivalent Week-number labels across supported languages.
- Added one canonical source-reference helper used by grounded schema allowlists, syllabus grounding, prompt formatting, section provenance allowlists, and final/domain validation. Canonical locations are `lines N-M`, `page N`, and `paragraph N`; legacy aliases normalize to those values for compatibility.
- Reworded repair behavior as complete requested-chunk repair, matching the actual chunk-level regeneration implementation.
- Labeled full syllabus assessment text as course-global context rather than section-specific relevant context.

### Regression Coverage

- Malicious Stage 1 teacher intents and unrelated Stage 2 activities are removed outside a requested Week 5.
- Inserted/reordered section regression confirms semantic Week 5 resolution wins over shifted numeric position.
- Canonical provenance matrix covers single line, line range, PDF page, and DOCX paragraph, asserting prompt/schema/allowlist/validator agreement.
- Repair prompt regression confirms the full requested chunk is regenerated and no section-only claim remains.

### Validation

- Planning focused tests: PASS — 4 test files, 40 tests.
- API plans lifecycle: PASS — 8/8 tests.
- Workspace typecheck: PASS across all 10 workspace projects.
- Workspace full test run: PASS (exit code 0; prior 50-file/425-test baseline plus 8 new regression tests = 51 files/433 tests; 3 opt-in integration tests remain skipped).
- Workspace build: PASS across all workspace packages/apps; generated planning `dist` artifacts updated.

### Scope Preserved

Frozen Planning Contract, `PocRunStatus`, approval semantics, immutable plan revisions, Moodle core, and browser-to-AI-Platform isolation were not modified.

---

## 2026-09-04 — Learning Material-Grounded Activity Generation: Baseline and Structure Slice (T1701–T1703)

**Status:** DONE

### Action Completed

- Recorded the approved source-authority amendment: Syllabus owns Course Structure, sealed section Learning Material owns Activity content, Teacher Instruction owns Activity form/constraints, and deterministic policy is the final enforcement authority.
- Recorded the explicit no-fallback/no-RAG boundary and preserved the frozen external CoursePlan contract, `PocRunStatus`, approval semantics, and Moodle mutation boundary.
- Added the domain glossary in `CONTEXT.md` and the architectural decision record in `docs/adr/0001-material-grounded-activity-authority.md`.
- Added immutable `CourseStructureRevision` parsing/validation and draft conversion in `packages/planning`.
- Added `course_structure_revisions` Drizzle schema, partial unique sealed-run index, repository operations, and migration `0003_add_course_structure_revisions.sql`.
- Added independent Structure API lifecycle:
  - `POST /api/runs/:runId/course-structure`
  - `GET /api/runs/:runId/course-structure`
  - `POST /api/runs/:runId/course-structure/revisions`
  - `POST /api/runs/:runId/course-structure/seal`
- Structure review and seal keep the run in internal `planning`; no official CoursePlan Preview transition is introduced.

### Files Changed

- `POC_BASELINE.md`
- `Implementation.md`
- `CONTEXT.md`
- `docs/adr/0001-material-grounded-activity-authority.md`
- `task.md`
- `packages/planning/src/structure/course-structure-revision.ts`
- `packages/planning/src/errors/planning-errors.ts`
- `packages/planning/src/index.ts`
- `packages/planning/test/course-structure-revision.test.ts`
- `packages/agent-runtime/src/db/schema/course-structure-revisions.ts`
- `packages/agent-runtime/src/db/schema/index.ts`
- `packages/agent-runtime/src/repositories/course-structure-revision-repository.ts`
- `packages/agent-runtime/src/repositories/index.ts`
- `db/migrations/0003_add_course_structure_revisions.sql`
- `db/migrations/meta/_journal.json`
- `apps/api/src/app.ts`
- `apps/api/src/routes/course-structure.ts`
- `apps/api/test/course-structure.test.ts`

### Validation

- `@moodle-agent-poc/agent-runtime` typecheck: PASS.
- `@moodle-agent-poc/planning` typecheck: PASS.
- `@moodle-agent-poc/api` typecheck: PASS.
- Structure Revision tests: PASS — 4 tests.
- Structure API tests: PASS — 2 tests.
- Contracts, Agent Runtime, Planning, and API packages rebuilt successfully.

### Remaining Scope

- Material file ingestion, Moodle file areas/BFF, per-activity material generation, stale propagation, and finalization gates remain T1705–T1720.
- The repository has no Git metadata at `ai-platform`; diff-based `code-review` fixed-point validation will require the surrounding Git checkout or an explicitly supplied fixed point.

---

## 2026-09-04 — Learning Material-Grounded Generation Slice (T1705–T1718)

**Status:** IMPLEMENTED — pending full workspace gates, Moodle runtime E2E, and UI completion.

### Action Completed

- Added `packages/materials` with deterministic TXT/MD/DOCX/PDF/PPTX extraction, normalization, raw/content hashes, provenance metadata, configurable 30 MiB file guard, and deterministic token estimation.
- Added `BoundedMaterialContextProvider`; missing snapshots and over-budget contexts fail with typed errors without truncation, recursive summarization, or RAG.
- Added immutable `MaterialSnapshot` construction and PostgreSQL persistence, with no original binary content stored in AI Platform.
- Added `section_activity_drafts` persistence keyed by run/section/activity and material snapshot dependency. A new snapshot marks prior generated drafts `STALE` before regeneration.
- Added per-activity Assignment/Quiz generation with typed `INSUFFICIENT_MATERIAL` blocked outcomes, material-only provenance, deterministic identity normalization, and sequential section orchestration.
- Added deterministic section states: `NO_ACTIVITY_REQUIRED`, `BLOCKED_MISSING_MATERIAL`, `READY_TO_GENERATE`, `GENERATING`, `GENERATED`, and `STALE`.
- Added final CoursePlan assembly gate requiring sealed structure, current generated drafts, one current snapshot per section, and material provenance validation before `planning → preview`.
- Added API surfaces:
  - `POST /api/runs/:runId/sections/:sectionRef/material-snapshots`
  - `GET /api/runs/:runId/sections/:sectionRef/generation-status`
  - `POST /api/runs/:runId/sections/:sectionRef/generate`
  - `POST /api/runs/:runId/plans/course/finalize`
- Added Moodle plugin draft/snapshot file areas, metadata table/upgrade path, server-side BFF actions, and temporary server-side file transfer descriptors.

### Validation

- Materials typecheck: PASS.
- Materials ingestion/context tests: PASS — 9 tests.
- Planning structure/material/generation/orchestration/finalization tests: PASS — 15 focused tests.
- API Structure and Section generation tests: PASS — 6 tests.
- Agent Runtime typecheck: PASS.
- API typecheck/build: PASS.

### Remaining Scope

- T1704 still requires replacing/retiring the legacy full-plan entry point in favor of the new staged lifecycle without breaking existing compatibility coverage.
- T1719 still requires wiring the Moodle Course Builder UI to Structure Review, per-section material upload/generation, state polling, and finalization.
- T1720 still requires full `pnpm typecheck`, `pnpm test`, `pnpm build`, security audit, code review, and real Moodle E2E evidence.

---

## 2026-09-04 — Security and Two-Axis Review Follow-up

**Status:** DONE for the implemented AI Platform slice; external Moodle runtime checks remain pending.

### Security Checks and Fixes

- Confirmed Moodle AJAX requests require both `require_sesskey()` and `local/agentpoc:createcoursewithai` before dispatching actions.
- Confirmed browser JavaScript talks only to the Moodle BFF; AI Platform calls and temporary file transfer remain server-side in the Moodle client.
- Raised the shared Fastify multipart ceiling to 30 MiB while preserving the syllabus route's deterministic 10 MiB guard, so valid material files are not rejected by the parser first.
- Required one stable `moodle_material_id` metadata entry per uploaded snapshot file; removed the previous synthetic fallback ID.
- Malformed `material_metadata` now returns typed material failure details instead of an uncaught JSON parse error.
- Corrected Moodle upgrade creation to define all fields, primary key, and index before `create_table()`.
- Restored the missing `0002_add_approved_plan` migration journal entry before the new `0003`–`0005` migrations.

### Standards Axis

- TypeScript package boundaries, explicit DI seams, typed errors, deterministic validation, and repo logging conventions were retained.
- No direct Moodle DB writes were introduced in AI Platform; Moodle-side metadata writes remain inside the plugin boundary.
- Formal Git fixed-point review could not run because `C:\moodle-prac\ai-platform` contains no `.git` metadata and no fixed commit/branch was supplied. This is recorded as an environmental limitation, not a review pass.

### Spec Axis

- Implemented: immutable Structure revisions, sealed structure gate, material extraction/snapshot hashes, 30 MiB/token limits, per-activity generation, sequential section orchestration, stale dependency gate, material provenance, finalization gate, and BFF actions/source.
- Partial: the legacy `/api/runs/:runId/plans/course` endpoint remains for compatibility and still owns the older full-plan path; T1704 must decide/implement its staged-boundary migration.
- Partial: `amd/src/course_builder.js` contains the staged UI, but `amd/build/course_builder.min.js` has not been regenerated because the full Moodle Node/Grunt toolchain is unavailable in this environment.
- Not validated: real Moodle/PHP runtime E2E, file-area behavior against Moodle 5.1, and live provider generation.

### Final AI Platform Validation

- `pnpm typecheck`: PASS across 11 workspace projects.
- `pnpm test`: PASS — 59 files, 461 tests; 3 opt-in integration tests skipped.
- `pnpm build`: PASS across all workspace packages/apps.
- `node --check moodle/local_agentpoc/amd/src/course_builder.js`: PASS.
- WSL PHP and Docker checks were unavailable (`E_ACCESSDENIED`/Docker pipe permission), so PHP syntax and Moodle runtime evidence remain pending.

### Final Retest

- Final `pnpm typecheck`: PASS.
- Final `pnpm test`: PASS — 59 files, 461 tests; 3 opt-in integration tests skipped.
- Final `pnpm build`: PASS across all 11 workspace projects participating in the build.

---

## 2026-09-04 — Current Handoff State

**Status:** PARTIAL IMPLEMENTATION — AI Platform staged material-grounded flow is implemented and validated; Moodle runtime acceptance remains pending.

### Current Evidence

- T1701–T1718 are recorded as complete in `task.md`.
- Structure Review remains distinct from official CoursePlan Preview.
- Structure sealing and activity generation do not transition the run to official `preview`; finalization does.
- No syllabus, general-knowledge, unrelated-section, or unsealed-material fallback is permitted for activity content.
- Original material binaries remain Moodle-owned; AI Platform stores normalized text and hashes only.
- T1719 has BFF and AMD source changes, but the generated AMD bundle still requires the Moodle Node/Grunt toolchain.
- T1720 has full AI Platform gates, but real Moodle/PHP/E2E verification is still outstanding because WSL/Docker access was denied in this environment.

### Next Action

Run the Moodle 5.1 runtime acceptance workflow, rebuild `moodle/local_agentpoc/amd/build/course_builder.min.js`, execute the required PHP/security checks, then complete T1704/T1719/T1720 before treating this implementation batch as complete.

---

## 2026-09-04 — Phase 17 Acceptance Re-review Remediation

**Status:** FIXED — real staged Moodle E2E passed; formal fixed-point Git review remains the only open T1720 item.

### P1 Remediations

- Made `POST /api/runs/:runId/plans/course` reject initial-course bypasses with `STAGED_COURSE_CREATION_REQUIRED`; finalization now rejects an existing initial CoursePlan lineage and repeated finalize is conflict-safe.
- Resolved compiled Teacher Instructions into deterministic teacher-origin Activity Intents before material generation, persisted the compiled constraints, and preserved Activity Intent refs through Structure revisions.
- Separated per-Activity shape/question/provenance validation from aggregate Section cardinality validation. Assignment generation no longer fails because a Quiz rule is not yet complete; aggregate teacher constraints run at finalization.
- Scoped Moodle drafts and AI Platform snapshots to `(run, structureRevision, sectionRef)` and verified the currently sealed structure revision before snapshot creation/generation/finalization.
- Strengthened granular material provenance so a correct filename with the wrong section/page/paragraph cannot pass through base filename authorization.
- Added finalization checks for frozen contract schema, aggregate teacher constraints, syllabus Section allowlists, per-Section material allowlists, current structure revision, current MaterialSnapshot, and Activity Draft status.
- Added Activity-ordinal identity to generated Quiz Questions/Choices (`question-01-01-01`, `question-01-02-01`, etc.) so multiple Quizzes in one Section cannot collide.
- Added provider-compatible deterministic adapters for Groq JSON-mode Structure/Activity output: alternate course/section/source shapes, `#Lx-Ly` provenance, shorthand Quiz `prompt/options/answer`, and omitted optional question metadata are normalized before frozen validation; invalid content now fails typed before persistence.
- Fixed Moodle BFF multipart transfer to use Moodle `stored_file` parts instead of nested `CURLFile[]`.
- Corrected migration ordering/reconciliation so fresh and existing databases receive approved-plan columns and `teacher_constraints_json`; verified migration 0006 in PostgreSQL.

### Runtime Acceptance Evidence

- Synced canonical plugin into `C:\moodle-prac\moodle\public\local\agentpoc` and Docker runtime `/var/www/html/public/local/agentpoc`.
- Runtime plugin version: `2026090401`.
- Moodle `admin/cli/upgrade.php --non-interactive`: PASS.
- Moodle `admin/cli/purge_caches.php`: PASS.
- Real E2E runner: `test-e2e-material-flow.mjs`.
- E2E path passed: Thai syllabus → resolved weekly teacher Quiz intent → Structure seal → Moodle draft upload → immutable MaterialSnapshot → material-grounded Quiz generation → Finalize → Preview → Approve → Execute → Verify.
- Result: `MATERIAL_GROUNDED_E2E=PASS`; Moodle course ID `11`; verification `true`.

### Regression Evidence

- Full workspace typecheck: PASS.
- Full workspace tests after remediation: PASS — 60 test files, 469 tests; 3 opt-in integrations skipped.
- Full workspace build after remediation: PASS.
- New P1-focused planning tests cover resolved intent scope/identity, per-activity cardinality separation, strict material provenance, unique multi-Quiz refs, finalization aggregate/domain gates, and lineage behavior.

### Remaining Limitation

- T1720 remains open only for formal fixed-point Git `code-review`: `ai-platform` has no `.git` metadata and no fixed commit/branch was supplied. The actual source/runtime/E2E review was completed with `scrutinize` and direct runtime evidence.

---

## 2026-09-04 — Phase 17 Re-review Final Retest

**Status:** REAL E2E PASS — pending only formal fixed-point Git review.

### Additional Fixes Confirmed

- Preserved model-origin metadata while adapting Groq JSON-mode Structure output, so model-produced `teacher_instruction` intents cannot be reclassified as syllabus intents.
- Kept legacy planner regression coverage green while making the new staged endpoint authoritative for initial Course Creation.
- Added explicit adapters for Groq shorthand Structure and Quiz output, including course-field normalization, `#L3-L4` source locations, `prompt/question_text` fields, options/answers, and contract-only Quiz/Question persistence.
- Corrected Moodle BFF multipart transfer to use native `stored_file` streaming parts.
- Corrected migration journal ordering/reconciliation and applied migration 0006 in the live AI Platform PostgreSQL instance.
- Synced canonical plugin and rebuilt staged AMD artifact into the live Moodle container; runtime plugin is `2026090401`.

### Live E2E Evidence

Runner: `test-e2e-material-flow.mjs`

```text
Thai syllabus
→ resolved weekly teacher Quiz intent
→ Course Structure Rev1
→ Structure seal
→ Moodle Learning Material draft
→ immutable MaterialSnapshot Rev1
→ material-grounded Quiz generation
→ Frozen CoursePlan Rev1
→ Preview
→ Approve
→ Execute
→ Verify
```

Result: `MATERIAL_GROUNDED_E2E=PASS`; Moodle course ID `11`; verification `true`.

### Final Automated Gates

- `pnpm typecheck`: PASS.
- `pnpm test`: PASS — 60 test files, 469 tests; 3 opt-in integrations skipped.
- `pnpm build`: PASS.
- Moodle upgrade: PASS.
- Moodle cache purge: PASS.

### Remaining Open Item

T1720 remains unchecked only because formal fixed-point Git `code-review` cannot run without `.git` metadata/fixed point in `ai-platform`. Do not mark Phase 17 fully accepted until that review is performed in the Git checkout.

---

## 2026-09-04 — Phase 17 Fixed-point Re-review P1 Remediation

> Superseded acceptance status: see the 2026-09-06 continuation entry below. Phase 17 is not yet accepted.

**Status:** P1 remediation complete; formal fixed-point Git review remains open.

### Findings fixed

- Stage 1 Structure planning no longer treats model-provided `source_refs` as authoritative. Each returned section is grounded deterministically with `buildSectionGrounding()`, and its section/syllabus-origin intent provenance is replaced with canonical references from the normalized syllabus. Unresolvable sections fail with `PLAN_DOMAIN_INVALID`.
- Stage 1 prompts now show the complete canonical `SourceReference` JSON, including the syllabus filename and page/line/paragraph location, instead of exposing location-only text such as `(page 1)`.
- Edited Structure Revisions now re-run `resolveActivityIntentsForStructure()` against the persisted Teacher Constraints and current normalized syllabus. Previous teacher-origin intents are discarded and rebuilt, so adding, deleting, or reordering sections cannot leave stale or missing teacher activities.
- MaterialSnapshot identity now includes `structure_revision` in both the Drizzle schema and migration `0007_scope_material_snapshot_revision_by_structure.sql`. The live PostgreSQL constraint is `UNIQUE (run_id, structure_revision, section_ref, revision)`.

### Regression evidence

- Focused P1 suite: **38/38 PASS** — PDF/location-only and sparse-provider Stage 1 provenance normalization, edited Structure teacher-intent re-resolution, and Structure Revision-scoped MaterialSnapshot uniqueness.
- Full `pnpm typecheck`: **PASS**.
- Full `pnpm test`: **PASS — 60 files, 478 tests; 3 opt-in integrations skipped**.
- Full `pnpm build`: **PASS**.
- Live migration: **PASS**; PostgreSQL reports `material_snapshots_run_structure_section_revision_unique` with `(run_id, structure_revision, section_ref, revision)`.
- Real Moodle E2E after remediation: **`MATERIAL_GROUNDED_E2E=PASS`** — Thai syllabus → Structure → teacher intent → seal → material snapshot → activity generation → finalize → preview → execute → verify.
- Added `E2E_PDF=1` to the real runner. The first PDF replay reproduced a sparse provider section-field failure; the adapter fix and local compiled planner regression now pass. A second live PDF replay was not performed because it would resend syllabus-derived content to the external Groq provider and requires explicit destination authorization.

### Remaining limitation

T1720 is intentionally still open only for the formal fixed-point Git `code-review`; `ai-platform` has no `.git` metadata or supplied fixed commit/branch. The current source, compiled output, live PostgreSQL constraint, Moodle runtime, and real E2E path have been rechecked directly.

## 2026-09-06 — Phase 17 live-user review continuation

Status: implementation and acceptance verification in progress; T1720 remains open.

- Implemented Assignment provider field aliases, canonical question type aliases, shared Structure coverage validation at generation/seal, mixed Thai/English teacher rules, snapshot SHA-256 deduplication/reuse, visible planned intents, and per-section generation instructions with separate draft metadata.
- Last full gates on September 4: typecheck/build passed; 62 test files and 498 tests passed, 3 opt-in tests skipped. Migration 0008 was applied and its text column verified in PostgreSQL. Moodle 2026090402 upgrade, cache purge and PHP lint passed.
- Rendered Moodle UI using a local mock provider showed planned Assignment/Quiz intents and material controls; console warnings/errors were empty. This was not a live-provider generation acceptance run. Generation retry and full finalization through the new UI still need end-to-end proof.
- September 6: corrected blocked generation responses being labelled Generated; retries remain enabled. Structure edits now clear stale material UI and require confirmation again. Upload/generation disable finalization until sections are complete. AMD syntax and existing UI checks passed; canonical AMD artifact and host Moodle copy synchronized.
- Docker engine was initially unavailable on September 6; Docker Desktop launch requested. Container synchronization and runtime retry verification remain pending. Do not report Phase 17 accepted from the earlier passing gates alone.

---

## 2026-09-07 — Phase 17 Residual PDF P1 + Live Provider E2E Remediation

**Status:** IMPLEMENTATION FIXED / LIVE E2E PASS — formal fixed-point Git review still open

### Residual PDF P1 Root Cause

Reproduced the reported normalization loss where a multi-page schedule table dropped Week 4. The failure occurs when PDF extraction splits a row across a page boundary:

- the week number (for example `4`) is extracted at the end of page N,
- `pdf-parse` inserts a page separator such as `-- 1 of 2 --`,
- the repeated schedule-table header appears at the start of page N+1,
- the previous normalizer cleared `pendingTableWeek`/row state when it saw the repeated header, so the Week 4 title on the next page was no longer associated with Week 4.

### Fix Applied

Updated `packages/syllabus/src/normalizer/deterministic-normalizer.ts`:

- repeated schedule-table headers now preserve `pendingTableWeek` and current row state,
- `pdf-parse` page markers matching `-- N of M --` are treated as structural/layout noise and skipped,
- frozen syllabus/planning contracts and PDF extractor API semantics were not changed.

Added regression coverage in `packages/syllabus/test/syllabus-ingestion.test.ts`:

- direct normalization regression reproducing a pending Week 4 across a repeated page header,
- a real two-page generated PDF passed through `ingestSyllabus()` from PDF extraction through normalization,
- the 15-week fixture now returns Week 1–15 exactly, with Week 4 title resolved on page 2.

Focused syllabus result: **19/19 PASS**.

### User-Supplied 15-Week Learning Material Set

The user supplied `C:\moodle-prac\15-week-mat` containing 15 individual Learning Material PDFs:

- `CS231_Week_01_Mock_Learning_Material.pdf`
- ...
- `CS231_Week_15_Mock_Learning_Material.pdf`

All 15 were processed from disk through `ingestMaterial()` successfully. Each normalized document retained its corresponding Week marker, including Week 4. These files are per-week Learning Material fixtures, not a single 15-week syllabus PDF, so they are not reported as a real 15-week syllabus replay.

### Additional Live Provider Finding

The first post-fix real Moodle E2E reached Section Activity generation but the Groq provider returned a multiple-choice shape with answer truth encoded only on the choices:

```text
choices: [
  { id: "a", text: "Queue (FIFO)", is_correct: true },
  { id: "b", text: "Stack (LIFO)", is_correct: false },
  ...
]
```

No top-level `answer`/`correct_choice_refs` field was present, so the deterministic adapter correctly rejected the response as `MODEL_RESPONSE_INVALID`.

Updated `packages/planning/src/generators/material-activity-generator.ts` so provider-compatible normalization accepts this shape only when exactly one choice is explicitly flagged `is_correct: true` or `correct: true`. Ambiguous or missing answer identity continues to fail deterministic validation.

Added focused regression in `packages/planning/test/material-activity-generator.test.ts`.

Focused activity-generator result: **17/17 PASS**.

### Real Moodle E2E

After rebuilding Planning/API and restarting the API with the current `.env` (`MODEL_PROVIDER=groq`, `openai/gpt-oss-120b`), reran:

```text
node test-e2e-material-flow.mjs
```

Observed path:

```text
login
→ create run
→ generate Structure + teacher Quiz intent
→ seal Structure
→ create Moodle Learning Material snapshot
→ generate material-grounded Quiz through live provider
→ finalize CoursePlan
→ Preview
→ Approve
→ Execute
→ Verify
```

Result:

- `MATERIAL_GROUNDED_E2E=PASS`
- Moodle course ID: **13**
- verification: **true**

### Final Automated Gates

- `pnpm typecheck`: **PASS** across 11 workspace projects.
- `pnpm test`: **PASS — 62 test files, 501 tests passed; 3 opt-in integrations skipped**.
- `pnpm build`: **PASS** across 11 workspace projects.
- PostgreSQL integration runtime was restored through `docker compose up -d postgres` before the final full test run.

### Files Changed

- `packages/syllabus/src/normalizer/deterministic-normalizer.ts`
- `packages/syllabus/test/syllabus-ingestion.test.ts`
- `packages/planning/src/generators/material-activity-generator.ts`
- `packages/planning/test/material-activity-generator.test.ts`
- generated package `dist` artifacts via normal workspace builds
- `.agent-work/status.md`
- `soc.md`

### Remaining Open Item

- Formal fixed-point Git review is still unavailable because `C:\moodle-prac\ai-platform` has no `.git` metadata/fixed commit. Phase 17 must not be labeled fully accepted until that review is executed in the Git checkout.
- The supplied 15-file material set does not constitute the requested single 15-week syllabus PDF replay. The exact residual normalization defect is covered through a two-page 15-week PDF regression that exercises the real PDF extraction + normalization path.

### Next Suggested Action

Perform the formal fixed-point Git review when the repository is available in a Git checkout. If a real 15-week syllabus PDF is supplied, replay that exact file from upload/ingestion before final Phase 17 closure.

## 2026-09-07 — Retry verification and remaining AMD runtime synchronization

- Preserved the newer PDF normalization/provider fixes and the existing API process. No live provider request was made in this continuation.
- Added an API regression: first generation fails, retry succeeds using snapshot-1, no snapshot save occurs, exactly one draft is produced, and finalization returns preview. This uses in-process mock model/repositories; it is not browser or live-provider proof.
- Focused section-generation/material-snapshot suites: 5/5 passed. Existing duplicate SHA-256 and identical snapshot reuse test passed.
- Found the Moodle container still served the older AMD file that labelled blocked outcomes Generated. Synchronized canonical source/build files containing September 6 fixes, including reset of material UI after Structure edits and disabling finalization during material/generation work. Purged Moodle caches successfully.
- Last full suite remains the previously recorded 501 passed/3 skipped; it was not rerun for this test-only/API and artifact synchronization continuation. T1720 remains open; full browser retry interaction on the synchronized artifact still requires verification, along with the previously recorded acceptance limitations.


## 2026-09-07 — Topic 21 ADR-0002 Optional Activity Creation (WIP checkpoint)

Status: **BACKEND CORE THROUGH T9 WIRED; LIVE STALE-RUNTIME BUG FIXED; UI/E2E STILL OPEN**

### Runtime bug found during teacher smoke test
- Teacher reported: `Course planning failed: AI Platform error: Teacher Instruction could not be fully applied: Teacher instruction did not match a supported deterministic activity rule; no teacher activity rule was applied.`
- Disk source and `apps/api/dist/routes/course-structure.js` already used ADR-0002 `interpretStructureInstruction()` semantics, but port `3000` was still served by stale Node PID `4140` started before the refactor.
- Applied DB migrations including optional-activity/review-requirement migrations, rebuilt API, terminated stale PID 4140, and restarted API from current `dist` (new PID 2856, Groq `openai/gpt-oss-120b`).
- Live smoke replay: uploaded `packages/qa/fixtures/synthetic-basic.md`, then generated Structure with non-activity notes `เน้นพื้นฐานและให้คำอธิบายกระชับ`.
- Result: HTTP 201, Structure revision created successfully, Teacher Instruction preserved as structure-only metadata, and all generated sections persisted `activity_intents: []`.

### Current ADR-0002 implementation evidence
- T1 course-period cap implemented.
- T2 structure-only semantics wired; Structure Notes no longer authorize activities.
- T3 Activity Intent persistence/API wired.
- T4 deterministic defaults/config wired.
- T5 grounding resolver wired.
- T6 per-Activity generation/retry state wired.
- T7 explicit insufficient-evidence Empty Shell path wired.
- T8 optional-activity finalization path wired while retaining legacy Phase-17 compatibility path.
- T9 revision-scoped AI-expanded review requirement/Approval gate wired.
- `pnpm typecheck`: PASS across 11 workspace projects after T9 wiring.
- Focused ADR-0002 regression: 23/23 PASS across course-period, structure, activity-intent, activity-generation, and optional-domain suites.
- Additional finalization/run regression after runtime fix: 16/16 PASS (`optional-finalization.test.ts` + `runs.test.ts`).

### Remaining
- T10 Moodle UI still uses old mandatory-material/section-generation presentation and must be replaced with Skip/Create Activities optional branch and per-Activity controls.
- T11 full monorepo regression/build and Moodle UI regression still required.
- T12 real Moodle E2E acceptance scenarios still required.
- Formal fixed-point Git review remains unavailable because this workspace has no `.git` metadata.

## 2026-09-07 — Topic 21 ADR-0002 T10 Activity Structure UI

Status: **IMPLEMENTED / FOCUSED GATES PASS — full monorepo regression and real Moodle E2E still open**

### Trigger
Teacher manual test confirmed Course Structure generation worked, but the Activity stage no longer exposed Learning Material upload or an Activity prompt. Root cause: the Moodle UI still depended on legacy `section.activity_intents` embedded in Course Structure. ADR-0002 intentionally makes Structure activity-free, so the legacy Material card never rendered.

### Changes
- Reworked wizard progression to `1 Create Course Structure → 2 Course Structure → 3 Activity Structure → 4 Approve`.
- Added dedicated Activity Structure page.
- Added explicit Quiz/Assignment selection backed by persisted Activity Intents.
- Restored Learning Material upload as optional, shared per section/week.
- Added optional prompt per selected Activity.
- Added per-Activity generation lifecycle display (`creating`, `generated`, failure/timeout, retry exhaustion, stale, shell).
- Added generated Activity preview in Step 3; syllabus-scoped AI content carries visible Teacher Review Required warning.
- Added Step 4 AI-expanded-content acknowledgment plumbing through Moodle BFF to `/approve`.
- Added Moodle BFF PUT support plus `set_activity_intents`, `get_activity_intents`, `generate_activity`, and `confirm_activity_shell` actions.
- Added source freshness behavior: a genuinely new MaterialSnapshot marks generated/shell Activity Intents in the section `stale`; identical snapshot retries do not.
- Finalize waits until all Activity Intent states finish loading.
- Finalization is now idempotent: unchanged content reuses the current Plan Revision; changed Activity content creates immutable Revision N+1 under the same plan ID.
- Synced `amd/src/course_builder.js` to `amd/build/course_builder.min.js`; plugin version bumped to `2026090702` / `v0.1.3`.

### Evidence
- `pnpm typecheck`: PASS across 11 workspace projects.
- `pnpm --filter @moodle-agent-poc/api build`: PASS.
- Backend focused Activity/Finalization/Material suite: **18/18 PASS**.
- Approval/run + optional finalization suite: **17/17 PASS**.
- Moodle Activity Structure static UI regression: **32 assertions PASS**.
- JavaScript syntax check: PASS.

### Runtime note
Per teacher request, this change set did **not** start or restart the API/Moodle server. Runtime/browser validation is intentionally left for the teacher to launch manually.

### Remaining
- Full monorepo `pnpm test` and `pnpm build`.
- Manual browser validation of the new four-step Moodle UI.
- T12 real Moodle E2E for structure-only, syllabus fallback, Material-grounded generation, AI-expanded review acknowledgment, and Empty Shell paths.


## 2026-09-07 — Topic 21 Approved 4-Step Activity Structure UI

Status: IMPLEMENTED / FOCUSED GATES PASS — runtime Moodle E2E still open

Teacher approved the redesigned Course Builder wizard and clarified that Quiz and Assignment should be combined within the same per-Week Activity card rather than treated as separate pages/flows.

Implemented UI contract:

`1 Create Course Structure -> 2 Course Structure -> 3 Activity Structure -> 4 Approve`

### Step 1 — Create Course Structure
- Renamed Optional Notes to `Structure Instruction (Optional)`.
- CTA renamed to `Generate Course Structure`.
- Hint explicitly states that the instruction affects Course Structure only; Quiz/Assignment selection happens later in Step 3.

### Step 2 — Course Structure
- Staged Structure review is Activity-free.
- Removed `No planned activities` / planned Activity messaging from the staged Structure UI.
- Teacher reviews/edits Course title, summary and Week sections, then confirms Structure before Activity configuration.

### Step 3 — Activity Structure
- Dedicated page, one Week card per sealed Course Structure section.
- Each Week card combines both Activity types:
  - `Quiz` checkbox
  - `Assignment` checkbox
  - both may be selected together, either may be selected alone, or neither may be selected.
- One optional Learning Material uploader per Week is shared by both selected Activity types.
- No Material explicitly communicates syllabus fallback.
- Selected Quiz and Assignment each get their own Activity panel with:
  - optional Prompt;
  - independent Generate lifecycle;
  - status badges for Not generated / Creating / Generated / Insufficient evidence / Timed out / Failed / Retry exhausted / Stale / Empty Shell;
  - Generated Activity preview;
  - AI-expanded `Teacher review required` warning where applicable.
- Quiz advanced settings: question count, question type, choices.
- Assignment advanced setting: grade.
- Step-level Selected / Ready / Remaining counts added.
- Zero selected Activities => `Continue without Activities`.
- One or more selected Activities => `Finalize Activity Structure`; blocked until every selected Activity is Generated or Empty Shell.

### Step 4 — Approve
- Final summary now includes empty-section count and an Activity overview by Week.
- AI-expanded content keeps explicit Teacher Review acknowledgement and the Approve button is disabled until acknowledged.

### Files / cache boundary
- `moodle/local_agentpoc/templates/course_builder.mustache`
- `moodle/local_agentpoc/amd/src/course_builder.js`
- `moodle/local_agentpoc/amd/build/course_builder.min.js`
- `moodle/local_agentpoc/lang/en/local_agentpoc.php`
- `moodle/local_agentpoc/cli/test_preview_ui.mjs`
- `moodle/local_agentpoc/version.php`
- plugin version: `2026090703` / `v0.1.4`

### Evidence
- `node --check moodle/local_agentpoc/amd/src/course_builder.js`: PASS.
- Approved four-step combined Activity UI static regression: PASS.
- `pnpm typecheck`: PASS across 11 workspace projects.
- Focused backend regressions: PASS — 5 files, 18/18 tests.

### Runtime note
Per teacher request, this slice did not start or restart the API/Moodle server. Runtime Moodle UI + real E2E remains the next acceptance step after the teacher starts the runtime and applies plugin upgrade/cache purge.

### 2026-09-07 — Activity Generation Provider-Shape Hardening

Teacher runtime testing with `CS231_Week_01_Mock_Learning_Material` exposed two live provider-compliance failures after the new Activity Structure UI was enabled. The Material itself was sufficient for Week 1 C# basics (Main, basic types, operators, Console I/O); failures were at the LLM output boundary, not ingestion/grounding.

Observed live Groq behavior:
- Some MCQ completions returned four choices per question but omitted all correct-answer metadata, so deterministic normalization correctly rejected the question rather than guessing.
- Assignment completions could omit frozen-contract fields such as `learning_objectives`, even when the task itself was otherwise usable.
- A tagged strict `{status, activity}` schema was also unstable: one live Groq completion returned a singleton JSON array and was rejected by Groq before local singleton-array normalization could run.

Implemented correction:
- ADR-0002 Activity generation now uses a **direct Activity JSON Schema** for `generationContext` callers. This is valid because `INSUFFICIENT_EVIDENCE` is resolved deterministically before the model call in the new flow.
- The Quiz schema is specialized from persisted deterministic constraints (question type/count, choices per question, correct choices per question).
- Legacy `materialContext` callers retain JSON-object tagged generated/blocked semantics for compatibility.
- Expanded MCQ answer-shape normalization for common provider aliases/flags, while preserving the no-guess invariant if no answer evidence exists.
- Expanded Assignment alias/object-list normalization and deterministic reuse of existing Teacher Activity Prompt/provider prose when a required prose field is omitted.
- Changed Activity Prompt semantics from presentation/HOW-only to scope-bounded task/question/content guidance.
- Added `ActivityIntent.options`; the API now passes persisted `optionsJson` into generation. Deterministic options override provider values (Assignment grade default/override; Quiz default mark).

Validation evidence:
- Focused `material-activity-generator` + `activity-generation` tests: **30/30 PASS**.
- Workspace `pnpm typecheck`: **PASS** (11 projects).
- Planning build: **PASS**.
- API build: **PASS**.
- Live Groq (`openai/gpt-oss-120b`) exact-style teacher smoke after final wiring: **PASS**.
  - Quiz: generated 5 MCQs, exactly 4 choices/question, exactly 1 correct choice/question, mark 1/question.
  - Assignment: generated with description, instructions, learning objectives, deterministic grade 100.

Operational note: backend `dist` is rebuilt, but any already-running API process must be restarted/reloaded to consume this code. Moodle plugin upgrade/cache work is unrelated to this backend-only fix.

## 2026-09-07 — Finalize 500 / migration journal incident

### Symptom
Moodle Step 3 Activity Structure had generated Activities and Material uploaded, but Finalize returned:
`Final CoursePlan is not ready: AI Platform error: Internal server error`.

### Trace evidence
The affected real run was `446a8ac0-ddf5-4408-883a-91d8d0dc76fb`.
- Course Structure revision 1 is sealed and valid.
- MaterialSnapshots exist for all 10 sections.
- Active persisted Activity Intents are generated and MATERIAL_GROUNDED; their stored MaterialSnapshot IDs are current and provenance matches the corresponding uploaded file/section.
- A read-only direct `assembleFinalCoursePlan()` invocation succeeds with 10 sections and 4 active activities, proving Activity/Material content was not the source of the 500.

### Root cause
`PlanRepository.listRunPlans()` failed before Finalization because application schema includes `poc_plan.review_requirements`, but the actual DB did not. `db/migrations/0010_add_plan_review_requirements.sql` existed on disk but was missing from `db/migrations/meta/_journal.json`, so Drizzle migrator never applied it.

The migration journal was repaired to include both the missing `0010_add_plan_review_requirements` and the previously omitted `0002_add_approved_plan`, then DB migrations were applied successfully.

### Secondary bug found during verification
Calling Finalize twice without any semantic change created Plan revision 2 instead of reusing revision 1. The route compared candidate/latest plans using raw `JSON.stringify()`. PostgreSQL JSONB can return object keys in a different order, making semantically equal objects produce different strings.

The route now computes a recursively key-sorted canonical JSON signature before comparison. A regression test deliberately reverses JSON object key order to simulate JSONB behavior.

### Verification
- `PlanRepository.listRunPlans()` works after migration.
- Focused tests: 6/6 PASS (`optional-finalization.test.ts` + `migration-journal.test.ts`).
- Workspace typecheck: PASS (11 projects).
- API build: PASS.
- Real DB/Fastify route test after fix: HTTP 200, `reused=true`, existing Plan revision 2 reused, no revision 3 created.
- The run is now in `preview` state with Plan ID `614998e5-b3ad-4697-ae06-dd35c7e42a82`.

### Full-suite note
`pnpm test` currently reports 528 PASS / 7 FAIL / 3 skipped. These failures are not caused by this incident: six legacy CoursePlanner/chunked-planning tests still expect Phase-17 automatic Activity semantics removed by ADR-0002; one old provenance-validator fixture lacks the now-required granular source location. Keep as T11 regression-cleanup work rather than changing production behavior backward.

### UI audit handoff from GPT-6-Astra
The user supplied a Moodle-side audit identifying P1/P2 issues in Activity preview, Official Preview placement, Back-navigation, Activity-state loading, Structure warnings, Material snapshot display, and UI/server default ownership. Treat this list as a useful follow-on UI hardening backlog; it was not the root cause of the Finalize 500.


### 2026-09-07 — Structure coverage omission / Week 10 repair
Observed runtime failure: `Course Structure omitted syllabus coverage anchors: สัปดาห์ที่ 10` on run `bff50dea-05b5-4f5c-8283-a01bec488e71`. DB trace showed normalized syllabus anchors 1–10 were complete and no Structure revision had been persisted, proving the omission occurred in the AI Structure draft before save. The route intentionally used JSON-mode Structure output, so provider compliance with exact section count was not guaranteed.

Resolution:
- preserved strict coverage validation;
- added deterministic reconciliation in `CourseStructurePlanner` so initial Structure is canonicalized to exactly one section per distinct syllabus course period, in syllabus order, with refs `section-01...` and positions 1...N;
- if a provider omits an anchor, only that section is reconstructed from normalized syllabus title/topics and then deterministically grounded; no LLM knowledge or Activity inference is used;
- unanchored provider extras are omitted with a warning;
- Structure prompt now states exact expected section count, and structured schema constrains `minItems/maxItems` to the course-period count;
- fixed a separate semantic grounding defect where `สัปดาห์ที่ 10` could substring-match `สัปดาห์ที่ 1`; Week/Unit numeric anchors now match by semantic key before generic text matching.

Evidence:
- focused `course-structure-coverage-repair`, coverage, source-reference, and API tests: 21/21 PASS;
- `pnpm typecheck`: PASS all 11 workspace projects;
- planning build PASS; API build PASS;
- live read-only Groq smoke using the exact failed run syllabus produced 10 canonical sections with complete anchors 1–10 and Week 10 provenance no longer including Week 1.

### Topic 21 WIP — Material PDF text-layer extraction hardening (2026-09-07)
- User reported Learning Material upload 500 with extracted log containing many `\u0000` characters and Thai mojibake.
- Reproduction against the newly generated Week 1 mock PDF confirmed the PDF text layer itself was malformed for mixed Thai/Latin extraction: Thai content remained readable in some extractors while many Latin glyphs mapped to NUL. This was caused by the PDF font choice used in the mock artifact, not by Activity generation.
- Architecture gap: Material PDF ingestion delegates to the shared syllabus `extractPdfSyllabus()` and previously accepted any extracted text longer than 50 chars. Corrupt-but-long text therefore passed ingestion and could later fail PostgreSQL because PostgreSQL text values cannot contain NUL.
- Fixes:
  - `packages/syllabus/src/extractors/pdf-extractor.ts`: added `inspectPdfTextQuality()` and rejects NUL, invalid C0 control, or U+FFFD replacement characters with sanitized `EXTRACTION_FAILED` before normalization/persistence.
  - `packages/materials/src/ingest.ts`: wraps shared syllabus extraction failures into explicit `MATERIAL_EXTRACTION_FAILED` with safe extractor code/details; bumped `MATERIAL_EXTRACTOR_VERSION` to `materials-text-v2`.
  - Added `packages/syllabus/test/pdf-text-quality.test.ts`.
- Evidence:
  - PDF quality/material/error-handler focused tests: 12/12 PASS.
  - Syllabus ingestion + PDF quality + material ingestion + material-snapshot API regression: 29/29 PASS.
  - `pnpm typecheck`: PASS across 11 workspace projects.
  - `@moodle-agent-poc/syllabus`, `@moodle-agent-poc/materials`, and `@moodle-agent-poc/api` builds: PASS.
- Artifact remediation: regenerated Week 1-10 short CS231 Learning Material PDFs using a Thai+Latin-capable font mapping; verified with two extraction paths that every file has zero NUL characters and retains `C#`, week labels, and code text; rendered 10-page combined PDF visually with no clipping/overlap.

## Topic 21 checkpoint — PDFium primary / PDF.js fallback extraction

### Decision implemented
PDF extraction is no longer PDF.js-only. `packages/syllabus` now owns a two-engine extraction pipeline:
1. `clawpdf` / PDFium as the primary text extractor.
2. `pdf-parse` / PDF.js retained as deterministic fallback.

The shared quality gate rejects NUL, invalid control characters, and U+FFFD replacement characters before normalized text can reach MaterialSnapshot persistence. Fallback is attempted when the primary engine throws, produces unsafe text, or returns insufficient machine-readable text. Existing client-safe error contracts remain sanitized and unchanged.

### Files / behavior
- `packages/syllabus/package.json`: added pinned `clawpdf@0.3.1`.
- `packages/syllabus/src/extractors/pdf-extractor.ts`: added `PdfTextExtractionEngine`, `pdfiumTextEngine`, `pdfJsTextEngine`, and `extractPdfTextWithFallback()`; page provenance retained.
- `packages/syllabus/test/pdf-extractor-fallback.test.ts`: new engine/fallback regression coverage.
- `packages/materials/src/ingest.ts`: extractor version bumped to `materials-text-v3`; Material continues to reuse the Syllabus PDF extraction pipeline.
- Public error behavior remains R6-safe (`details:null`) for corrupt/scanned/unusable PDFs.

### Evidence
- Real PDF corpus `C:\moodle-prac\15-week-mat`: 15/15 extracted successfully; all selected `pdfium-clawpdf`; 0 NUL and 0 replacement characters.
- Focused Syllabus/Material/API suite: 50/50 PASS.
- Workspace typecheck: PASS (11 projects).
- `@moodle-agent-poc/syllabus`, `@moodle-agent-poc/materials`, and API builds: PASS.
- Full suite: 537 PASS / 10 FAIL / 3 skipped; remaining 10 failures are legacy planning tests unrelated to extraction (CoursePlanner/chunked-planning/provenance fixture). No PDF/Syllabus/Material/API extraction regression remains.

### Runtime note
No Moodle plugin/UI change is involved. Restart the API process to load the rebuilt packages. The best runtime verification is to retry the original PDF that previously produced corrupted extraction rather than relying on regenerated v2 PDFs.

## 2026-09-07 — UX Hardening Tickets 01–06

### Ticket 01 — Canonical Quiz Review Renderer
- Implemented one canonical Moodle Quiz preview renderer using `question.question` and all four qtype-specific answer/grading fields, with feedback and default mark.
- Reused the renderer in the finalized preview path and synced the Moodle AMD build.
- Evidence: UI static regression PASS; PlanPreview 5/5 PASS; workspace typecheck PASS.

### Tickets 02–04 — Format and File Resource flow
- Added dynamic enabled Moodle Course Format discovery through Moodle external/BFF and MCP, required teacher selection, Run pinning, execution serialization, and course-format read-back verification.
- Added deterministic `FileResourcePlan` projection from current MaterialSnapshot, Moodle File Resource MCP/executor/plugin APIs, source-file read-back, replacement draft semantics, and independent remove/re-add publication intent.
- Evidence: focused MCP/client/execution/API/planning suite 79/79 PASS; workspace typecheck/build PASS; live Moodle discovery/create/read-back showed `tiles`; live File Resource read-back showed Week 1 placement and expected filename.

### Ticket 05 — Official Preview
- Added Step 4 Official Preview from the finalized current envelope, showing plan identity, format, sections, resources, full Assignment/Quiz content, shell/review indicators, warnings, and assumptions. Revision changes reset AI-review acknowledgment.
- Evidence: static/syntax/planning/verification gates PASS; real Moodle browser inspection reached Step 4 and rendered `Course Format: tiles` and Plan ID/Revision.

### Ticket 06 — Integrated E2E status
- Partial runtime acceptance completed for format discovery and File Resource boundary behavior.
- Full integrated C# OOP multi-activity Execute/Verify was not completed because the configured Moodle service token was invalid/expired. No permanent privileged token was generated.
- Required next work: run the complete kept-resource/removed-resource Quiz+Assignment scenario with a valid authorized Moodle service token and record course/execution/verification IDs.

## 2026-09-07 — UX Hardening Re-audit Remediation

- Ticket 02: updated the successful API execution fixture to accept `format`, pinned `syllabusMetadata.course_format` to `tiles`, and asserted exact propagation to `moodle_create_course`. The affected file passes 6/6.
- Ticket 03: updated schema registry expectations from 14 to 15 and added an explicit exactly-once `FileResourcePlan` registration/validation assertion. The affected contract tests pass 64/64.
- Ticket 06: added and ran `node --env-file=.env test-e2e-ux-hardening.mjs` successfully. Evidence: run `98d0511d-a119-414f-8898-fe577fdee675`, plan `c5ff84e8-6caf-495f-b77a-c38c4694f6dc` revision 1, Moodle course 19, `tiles`, 1 kept resource, 0 removed-week resources, 3 generated activities, Execute `awaiting_verification`, Verify `true`.
- Added authenticated Moodle BFF course-structure read-back to make kept/removed resource assertions use the same privileged browser session as the Course Builder.
- Full suite after remediation: 545 PASS / 10 pre-existing legacy planning failures / 3 skipped. No UX-hardening-specific regression remains.

---

## 2026-09-08 11:57 — Tickets 02–05 — Scrutinize remediation checkpoint

**Status:** PARTIAL

### Summary

Implemented and focused-tested the remediation for scoped File Resource provenance, canonical Moodle file readback, failure-safe Learning Material replacement, and persisted Course Format ownership. Ticket 06 browser-level E2E was intentionally paused before browser launch at the teacher's request.

### Files Changed

- `packages/contracts/schemas/file-resource-plan.v0.1.schema.json`
- `packages/contracts/src/planning/contracts.ts`
- `packages/planning/src/preview/plan-preview.ts`
- `packages/planning/src/revisions/plan-revision-helper.ts`
- `packages/execution/src/course-executor.ts`
- `packages/execution/src/course-format-service.ts`
- `packages/verification/src/course-verifier.ts`
- `packages/moodle-client/src/serializers.ts`
- `packages/moodle-client/src/types.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/runs.ts`
- `apps/api/src/routes/plans.ts`
- `apps/api/src/routes/material-snapshots.ts`
- `apps/api/src/routes/section-generation.ts`
- `apps/moodle-mcp-server/src/schemas/tool-schemas.ts`
- `apps/moodle-mcp-server/src/tools/resource-tools.ts`
- `moodle/local_agentpoc/classes/external/create_resource.php`
- `moodle/local_agentpoc/classes/external/get_course_structure.php`
- `moodle/local_agentpoc/classes/helper.php`
- `moodle/local_agentpoc/amd/src/course_builder.js`
- `moodle/local_agentpoc/cli/test_preview_ui.mjs`
- focused tests under `packages/**/test`, `apps/**/test`, and `moodle/local_agentpoc/tests/agentpoc_test.php`

### Implementation Notes

- `FileResourcePlan` now binds every resource to `source_run_id`, `source_structure_revision`, `source_section_ref`, and `source_material_revision`; the binding is validated through planning, direct revisions, execution, MCP, and Moodle before a snapshot file may be published.
- Moodle `create_resource` now queries the exact approved MaterialSnapshot scope and validates the stored filename. `CourseExecutor` also rejects run/section scope mismatch before issuing the MCP call.
- Course verification no longer trusts mutation-response or mapping metadata as proof that a file exists. It requires canonical `get_course_structure` file readback; Moodle's external return schema now exposes resource filenames.
- Material replacement is transactional: the replacement row/file is persisted first, previous files are retired only afterward, and any failure rolls back to the prior current material. A narrow storage seam was added solely to exercise this failure path.
- `POST /api/runs` now requires a syntactically valid Course Format and checks it against `moodle_list_course_formats` before creating the Run. The selected format is persisted in Run metadata.
- Plan preview responses expose persisted `execution_config.course_format`; Official Preview reads this value and no longer falls back to transient UI state.
- The implementation path was traced using the refreshed Graphify code graph (planning contract → finalizer/API → executor → MCP → Moodle external API). Ask-Matt guidance was applied as focused TDD red/green slices.

### Tests / Validation

- PASS — contracts/planning/execution/MCP focused suite: 6 files, 126 tests.
- PASS — verification focused suite: 4 tests; missing Moodle file readback now fails even when mapping metadata contains a filename.
- PASS — API Run/Plan suite: 2 files, 23 tests; missing/unavailable Course Format is rejected and persisted format is returned by preview.
- PASS — Moodle static UI regression.
- PASS — Moodle PHPUnit replacement failure test: 1 test, 4 assertions; prior file/record survives injected replacement persistence failure.
- PASS — Moodle PHPUnit resource binding/readback test: 1 test, 4 assertions; wrong run, structure revision, and section are rejected and canonical filename readback succeeds.
- PASS — affected TypeScript package builds and typechecks run during the focused slices.

### Decisions Made

- Persisted Run metadata is the sole execution/preview authority for Course Format after Run creation.
- Moodle canonical readback, not execution mapping metadata, is the authority for successful File Resource verification.
- No frozen architecture decision changed.

### Known Limitations / Follow-up

- Ticket 06 still needs a real browser DOM flow with trace/screenshots; the existing HTTP/BFF harness is insufficient by itself.
- Full monorepo regression, plugin version/cache build synchronization, ticket status updates, and final re-audit remain pending.

### Next Suggested Task

`Ticket 06 — Run real browser E2E, then complete regression and re-audit`

---

## 2026-09-10 — Additional Scrutinize contract audit

Status: AUDIT COMPLETE; REMEDIATION OPEN.

- Audited current working tree with the existing Graphify JSON graph as the navigation map; verified findings against current source. No subagents used.
- Graphify MCP was unavailable and the recorded interpreter could not import Graphify, so graph traversal used the persisted JSON directly; graph was not rebuilt or modified.
- Report: `../ai-platform-coordination/contract-audit-2026-09-10.md`.
- Confirmed four P1 groups: assignment target checked after mutation; quiz question refs rebound by current slot order; canonical course verification ignores answer keys; question default-mark updates do not update quiz slot max marks. Also reproduced the missing hidden-course verification check.
- Existing assignment/quiz/verifier tests: 3 files, 10/10 passed.
- Isolated negative audit probes: 6 cases, 1 matching-state control passed and 5 expected invariants failed. These are defect reproductions, not fixes. Probe/config/log are under `.agent-work/contract-audit-2026-09-10*`; the `.probe.ts` suffix keeps them outside the default test glob.
- Reviewed the current feedback.md and recorded concrete Thai-language, automatic-upload, and 100-question-cap remediation paths. The current active UI/API has no upper question-count cap.
- Changed only audit artifacts, task tracking, and this completion record. No production source, Moodle state, frozen decisions, or earlier user edits changed.
- Limits: fake Moodle transport/persistence for probes plus PHP/core source tracing; no live Moodle/browser E2E or full monorepo regression was run.
- Verdict: fix-then-ship. No P0 established in the audited paths; implement and verify F1–F4 before relying on completed/verified results.

---

## 2026-09-10 — Risk Engine & Teacher Insight — Tickets 07–09 Progress

### Ticket 07 — Consolidated Moodle Course Risk Evidence Readback

**Status:** IMPLEMENTED AND RUNTIME-VERIFIED

#### Outcome delivered
Implemented the Course-scoped factual evidence boundary required by the deterministic Risk Engine. Moodle remains the factual System of Record and exposes one consolidated `CourseRiskEvidence v0.1` projection through the existing Moodle Plugin → Moodle Client → MCP → AI Platform path. No Risk severity or LLM reasoning is performed inside the Moodle evidence layer.

#### Shared contract
- Added `CourseRiskEvidence v0.1` TypeScript contracts under `packages/contracts/src/risk/contracts.ts`.
- Added JSON Schema `packages/contracts/schemas/course-risk-evidence.v0.1.schema.json`.
- Added shared AJV validator and public exports from `@moodle-agent-poc/contracts`.
- Contract models factual states for enrolment, activity timeline, completion, Quiz evidence, Assignment evidence, Moodle competency mapping/rating/evidence, `SourceReference`, and per-dataset status.
- Added explicit lifecycle states such as `PENDING`, `NOT_ATTEMPTED`, `UNAVAILABLE`, and nullable competency proficiency instead of prematurely deriving Risk semantics.
- Added per-dataset `OK | PARTIAL | UNAVAILABLE | ERROR` status so a later Completeness Gate can distinguish source failure from legitimate learner unevaluability.

#### Moodle factual canonicalization
Created separate Moodle domain readers under `moodle/local_agentpoc/classes/risk/`:
- `enrollment_reader.php`
- `timeline_reader.php`
- `completion_reader.php`
- `quiz_evidence_reader.php`
- `assignment_evidence_reader.php`
- `competency_reader.php`
- shared `source_reference.php`
- `course_risk_evidence_assembler.php`

The assembler consolidates these factual datasets while preserving reader separation. A failing dataset is surfaced as `dataset_status=ERROR`; it is not silently converted to empty-success and it does not force unrelated successful datasets to disappear.

#### Moodle service / MCP boundary
- Added Moodle external service `local_agentpoc_get_course_risk_evidence`.
- Incremented the local plugin version for service registration and completed Moodle CLI upgrade successfully.
- Added `MoodleClient.getCourseRiskEvidence(courseId)` with full shared-contract validation before evidence enters downstream Risk processing.
- Added MCP tool `moodle_get_course_risk_evidence` using the existing canonical Moodle MCP server.
- Added `MoodleEvidenceGateway` in the new `@moodle-agent-poc/risk-engine` package as the AI Platform consumer boundary.
- The gateway validates the consolidated contract again and converts MCP/source failures into explicit errors rather than treating them as empty evidence.

#### Runtime defects discovered and corrected
Runtime verification exposed two Moodle-specific issues that were corrected before closing the slice:
1. Enrollment SQL reused the same named Moodle DML parameter twice, producing an incorrect parameter-count error. The query now uses distinct timestamp parameters.
2. A competency may inherit its scale from its Competency Framework and therefore have a null direct `competency.scaleid`. The reader now returns the effective scale from the framework when required.

#### Live Moodle acceptance evidence
A deterministic Moodle fixture was created against existing Course `20` using Moodle/Core Competency APIs:
- Student ID `4` enrolled as an active learner.
- Competency ID `1` created and linked to Course `20`.
- Official Activity↔Competency mapping linked Competency `1` to Quiz CMID `72`.
- Moodle competency grade/evidence recorded for Student `4` with `proficiency=false`.

Live factual readback after remediation returned:
- all 6 datasets `OK`;
- 1 active learner enrolment;
- 19 Course activities;
- 5 Quiz activities;
- 3 Assignment activities;
- 1 Course competency;
- 1 official Activity↔Competency link;
- Student `4` competency rating with grade `1`, `proficiency=false`, and 1 Moodle competency evidence record.

The live payload remained factual only and did not contain `risk_level` or any LOW/MEDIUM/HIGH classification.

#### Validation evidence
- Shared contract + gateway focused tests: **6/6 PASS**.
- Risk gateway package tests at the end of the slice: included in **14/14 PASS** Risk Engine suite after Ticket 08 additions.
- Moodle MCP regression suite: **55/55 PASS**.
- Live MCP → Moodle REST → local plugin Risk-evidence integration: **1/1 PASS** against Course `20`.
- PHP syntax checks passed for every new Risk reader, assembler, external function, service definition, and version file.

#### Architecture invariants preserved
- Moodle remains System of Record.
- Moodle readers expose facts only; they do not calculate LOW/MEDIUM/HIGH.
- No LLM/model/provider participates in factual evidence acquisition.
- Competency facts come from Moodle Core Competency.
- `proficiency=false` remains a Moodle fact at this boundary; conversion to `CONFIRMED_GAP` belongs to Ticket 08 normalization.
- Dataset failures remain explicit for the future Completeness Gate in Ticket 10.

---

### Ticket 08 — Deterministic Student Risk Vertical Slice

**Status:** CORE IMPLEMENTATION COMPLETE; FOCUSED ACCEPTANCE TESTS PASS

#### Outcome delivered
Implemented the first deterministic Student Risk vertical slice from `CourseRiskEvidence` through AI Platform factual normalization to explainable `StudentRiskResult`. The evaluator covers Progress, Performance, Competency, and Submission and calculates overall Student Risk strictly as the maximum dimension severity.

#### Risk Profile v0.1
- Added versioned `risk-profile.v0.1.json` under `packages/risk-engine`.
- Frozen Ticket thresholds are represented as policy configuration rather than being scattered through unrelated modules.
- The implementation preserves the approved Progress, Performance, Competency, and Submission thresholds and escalation guards.
- The design baseline did not freeze a numeric LOW_SCORE percentage threshold. A POC implementation default `low_score_ratio_threshold = 0.60` is therefore stored explicitly in the versioned profile and treated as configurable policy, not a frozen architecture invariant.

#### AI Platform normalization
Added `RiskEvidenceNormalizer` to convert Moodle factual DTOs into canonical Risk evidence and derived factual states needed by deterministic rules.

Implemented semantics include:
- stable evidence IDs and deterministic evidence hashes;
- evidence observation timestamps and Moodle SourceReferences;
- expected/actual progression facts from applicable Course activities;
- academic `PASS`/`FAIL` only when Moodle has an explicit grade-to-pass criterion;
- `LOW_SCORE` kept separate from academic FAIL;
- `PENDING_GRADE` kept separate from PASS/FAIL;
- active `OVERDUE` / `NOT_ATTEMPTED` vs historical `SUBMITTED_LATE`;
- one-attempt missed Quiz may expose recovery-not-available without automatically producing HIGH;
- Moodle `proficiency=false` → canonical `CONFIRMED_GAP`;
- unrated competencies remain `NOT_RATED`, with supporting `COMPETENCY_CONCERN` only when related problematic activity evidence exists;
- Moodle competency workflow review state is represented separately as `REVIEW_PENDING` and does not itself raise Student Risk.

#### Deterministic Student evaluator
Added `StudentRiskEvaluator` with four independent dimensions:

**Progress**
- LOW when Progress gap <10pp.
- MEDIUM at 10–<25pp.
- HIGH at >=25pp.
- >=3 expected activities with zero completed due activities → HIGH.
- timeline compliance <50% with >=3 expected activities → at least MEDIUM.

**Performance**
- Recent evaluable assessment window = 3.
- 1 academic FAIL → MEDIUM; >=2 recent FAIL → HIGH.
- LOW_SCORE count 0–1 / 2 / 3 maps to LOW / MEDIUM / HIGH for that signal.
- Persistent >=3 FAIL with >=5 evaluable assessments → HIGH.
- Persistent LOW_SCORE >=3 with >=50% rate and >=5 evaluable assessments → at least MEDIUM.
- No overall Performance average is introduced.

**Competency**
- no confirmed gap → LOW from confirmed-gap evidence.
- >=1 confirmed gap → MEDIUM.
- HIGH only when confirmed gap count >=3, gap rate >=40%, and rated expected count >=5.
- `NOT_RATED`, `COMPETENCY_CONCERN`, and `REVIEW_PENDING` do not masquerade as confirmed gaps.

**Submission**
- Late 0–1 LOW, 2–3 MEDIUM, >=4 HIGH.
- Overdue 0 LOW, 1–3 MEDIUM, >=4 HIGH.
- MEDIUM Late + MEDIUM Overdue escalates explicitly to HIGH.
- Late and Overdue remain separate counters/signals rather than one opaque score.

Overall Student Risk is exactly `MAX(Progress, Performance, Competency, Submission)`.

#### Explainability / evaluability
`StudentRiskResult` now carries:
- per-dimension results;
- overall LOW/MEDIUM/HIGH when evaluable;
- deterministic `rule_hits[]`;
- linked normalized `evidence_refs[]`;
- `data_as_of`;
- Risk Profile/model version;
- Student `COMPLETE` / `INCOMPLETE` evaluation state.

A source-incomplete Student receives `risk_level = null` and is not silently counted as LOW. Pending academic grading by itself is not considered source/system incompleteness.

#### Determinism defect discovered and corrected
Boundary testing at an exact 10 percentage-point Progress gap exposed floating-point drift from calculating `(expectedRatio - actualRatio) * 100`. The implementation was changed to calculate Progress gap directly from count difference divided by denominator, making the 10pp and 25pp thresholds deterministic at exact boundaries.

#### Focused acceptance evidence
Ticket 08 deterministic Risk tests cover:
- repeatable all-LOW result and deterministic hashes;
- exact Progress 10pp / 25pp boundaries and minimum-activity guards;
- Moodle grade-to-pass academic FAIL semantics;
- LOW_SCORE without falsely declaring academic FAIL;
- PENDING_GRADE exclusion from PASS/FAIL counts;
- recent-3 and persistent Performance patterns;
- NOT_RATED concern and REVIEW_PENDING behavior;
- confirmed Competency gap thresholds;
- one-attempt missed Quiz recovery behavior;
- Late + Overdue combination escalation;
- source-incomplete Student → `overall_risk=null`;
- every rule hit references known normalized evidence.

Focused Risk Engine suite after remediation: **14/14 PASS**.

#### Architecture invariants preserved
- No LLM participates in evidence normalization or Risk calculation.
- PASS/FAIL authority remains Moodle grade-to-pass.
- No Performance average is synthesized.
- `NOT_RATED` is not a confirmed competency gap.
- Review workflow does not become Student Risk.
- Overall Student Risk is deterministic MAX across the four dimensions.

---

### Ticket 09 — Course Risk Aggregation & Learning Issue Detection

**Status:** IN PROGRESS — CONTRACT/TYPE LAYER STARTED; AGGREGATOR AND ACCEPTANCE TESTS NOT YET COMPLETE

#### Work completed so far
Ticket 09 has been opened as the next tracer bullet after Ticket 08 and its acceptance criteria have been reviewed against the frozen implementation plan.

A new Course intelligence contract/type layer has been started in:
- `packages/risk-engine/src/course-risk-types.ts`

The intended aggregation input boundary has been established conceptually as:
- canonical `CourseRiskEvidence` for Course/activity/competency facts;
- normalized Student evidence from Ticket 08;
- completed `StudentRiskResult` values from Ticket 08.

This avoids reinterpreting raw Moodle facts independently inside the Course aggregator and keeps Student severity authority with the deterministic Student evaluator.

#### Course aggregate design being implemented
The Ticket 09 aggregator is being structured to expose:
- enrolled/evaluated/incomplete counts;
- explicit evaluation denominator and evaluation coverage;
- LOW/MEDIUM/HIGH Student distribution only among evaluated Students;
- per-dimension Student distribution;
- Activity-level factual numerator/denominator metrics;
- Activity Problem Types rather than Activity or Course LOW/MEDIUM/HIGH levels;
- Common Competency Gap metrics with competency-specific rating coverage;
- official Activity↔Competency association and affected-student overlap;
- issue-centric deterministic Course Action candidates for later merge/deduplication.

#### Frozen issue thresholds to implement
**Activity Submission**
- active overdue/not-attempted rate >=20% with expected students >=5 → `SUBMISSION_PROBLEM`.
- late rate >=30% with expected students >=5 → `LATE_PATTERN`.

**Activity Performance**
- academic fail rate >=30%, evaluable count >=5, and performance coverage >=50% → `PERFORMANCE_PROBLEM`.
- low-score rate >=40%, evaluable count >=5, and performance coverage >=50% → `PERFORMANCE_CONCERN`.
- FAIL and LOW_SCORE remain separate numerators.

**Common Competency Gap**
- confirmed gap count >=3;
- gap rate among rated expected students >=30%;
- competency-specific rating coverage >=60%.

**Notable Activity↔Competency Association**
- Activity must already be problematic;
- Competency must already qualify as a Common Competency Gap;
- official Activity↔Competency mapping must exist;
- affected-student overlap count >=3;
- Activity-side overlap >=30% OR competency-side overlap >=30%.

The association is relational evidence only. It will not change Student Risk severity, create a Course Risk level, or claim causal diagnosis.

#### Explicit constraints retained
- **No canonical Course LOW/MEDIUM/HIGH Risk Level will be created.**
- Incomplete Students will be excluded from LOW/MEDIUM/HIGH Student distribution and shown separately.
- Every Course/Activity rate will expose its denominator and relevant coverage.
- `REVIEW_PENDING` will affect workflow/coverage reporting only and not confirmed competency gap counts.
- Activity issue detection and Course aggregation remain fully deterministic and LLM-free.

#### Remaining work before Ticket 09 can close
- Implement the actual Course aggregator.
- Implement Activity issue detection for all four Problem Types.
- Implement Common Competency Gap detection.
- Implement notable Activity↔Competency association and exact overlap metrics.
- Implement deterministic issue-centric Course Action candidate generation.
- Add >=10 Student representative fixture required by the ticket.
- Add exact threshold/coverage boundary tests.
- Serialize representative `CourseRiskAggregate`, `ActivityIssue`, `CommonCompetencyGap`, and `IssueAssociation` outputs.
- Run focused Ticket 09 test suite and record acceptance evidence.

Ticket 09 must therefore remain **IN PROGRESS** at this checkpoint and must not yet be marked complete.

---


## Risk Engine & Teacher Insight — 2026-09-10 continuation

### Ticket 09 — Course Risk Aggregation & Learning Issue Detection
Status: IMPLEMENTED / FOCUSED ACCEPTANCE PASS

Implemented `CourseRiskAggregator` and Course-level deterministic contracts in `packages/risk-engine`:
- evaluated/incomplete coverage with explicit denominators;
- Student and per-dimension LOW/MEDIUM/HIGH distributions excluding INCOMPLETE students;
- `SUBMISSION_PROBLEM`, `LATE_PATTERN`, `PERFORMANCE_PROBLEM`, `PERFORMANCE_CONCERN` with exact frozen thresholds/coverage guards;
- FAIL and LOW_SCORE kept as separate numerators;
- Common Competency Gap using only confirmed non-proficient ratings and competency-specific coverage;
- `NOTABLE_ASSOCIATION` only when Activity issue + Common Competency Gap + official Activity-to-Competency mapping + overlap threshold are all satisfied;
- issue-centric Course action candidates with target/issue/evidence/affected-student refs;
- no canonical Course risk label and no LLM dependency.

Evidence: `course-risk-aggregation.test.ts` 9/9 PASS; combined Risk focused suite 23/23 PASS at Ticket 09 completion; TypeScript typecheck PASS. The 10-student demo verifies exact denominators, one performance-problem Quiz, one submission-problem Assignment, one Common Competency Gap, one Notable Association, and one INCOMPLETE student excluded from Risk distributions.

### Ticket 10 — Atomic Risk Refresh, Snapshot & History Lifecycle
Status: IMPLEMENTED / RUNTIME + POSTGRESQL VERIFIED

Implemented:
- `RiskCompletenessGate` rejecting source/system `ERROR`/`UNAVAILABLE` while preserving PENDING_GRADE as an academic lifecycle state;
- shared `RiskRefreshService.refreshCourse(courseId, origin)` for deterministic refresh;
- `CourseRefreshCoordinator` per-course single-flight/join semantics; different Courses remain concurrent;
- manual and nightly adapters sharing the same refresh service;
- immutable `risk_snapshots`, `course_risk_state`, and compact `student_risk_history` persistence;
- atomic snapshot/history/pointer publication transaction;
- POC current + previous full snapshot retention, with older compact history preserved;
- failed source refresh records failure metadata without replacing last-known-good current snapshot;
- manual HTTP endpoint `POST /api/risk/courses/:courseId/refresh` with snapshot/freshness/model/origin/join metadata.

Evidence:
- Risk lifecycle focused suite: 7/7 PASS; combined Risk focused suite 30/30 PASS.
- Real PostgreSQL repository integration: 3/3 PASS plus migration-journal test PASS, covering current/previous retention, 3-point compact history, failure last-known-good behavior, and transactional rollback.
- Live runtime through API -> MCP -> Moodle -> Risk Engine -> PostgreSQL for Moodle Course 20 returned HTTP 200 `PUBLISHED`, snapshot `127b28e6-b406-4e06-85cb-e98905a6d145`, `risk-profile.v0.1`, manual origin, evaluation coverage 1.0.
- DB readback confirmed `course_risk_state.current_snapshot_id` equals the runtime snapshot, `last_refresh_status=SUCCESS`, payload schema `risk-snapshot.v0.1`, SHA-256 evidence hash length 64, aggregate 1 enrolled / 1 evaluated / 0 incomplete, and one compact history point for student fixture id 4.

### Risk UI design baseline update
New coordination assets discovered under `C:\moodle-prac\ai-platform-coordination\UI-design`:
- `AI-risk-entry.png` — Course-side entry to **AI Learning Insight** integrated with the existing Course navigation/context.
- `AI-risk-page.png` — target Risk/AI Learning Insight page; visible design concepts include **Course Overview** and **What Needs Attention**.

Implementation rule from this point: Tickets 12–14 must map API/view models and Moodle UI to these supplied design assets rather than inventing a parallel Risk UI. Ticket 10 backend contracts remain valid; Ticket 11 trend/change work is UI-independent but must expose fields suitable for the supplied Risk page later.


### Ticket 11 — Material Change, Source Change & Deterministic Trend

Status: IMPLEMENTED / RUNTIME + POSTGRESQL VERIFIED

Implemented:
- versioned `trend-profile.v0.1` separate from Risk Profile semantics;
- deterministic `RiskSnapshotComparator` for Student/Course material-change reasons;
- conservative `change_origin`: explicit known hints are preserved, Risk Profile boundary forces `POLICY_CHANGE`, otherwise `UNKNOWN`;
- normalized evidence hash/source-change trace without allowing raw source deltas alone to become material Risk changes;
- `risk_change_events` persistence and migration `0013_add_risk_change_events.sql`;
- change events written atomically in the same snapshot/history/current-pointer transaction;
- `RiskTrendEngine` with latest-valid-point-per-day canonicalization, COMPLETE-only trend input, recent 3 / context 7 reconciliation, severity precedence, configurable significant metric movement, and no cross-`risk_model_version` trend;
- refresh response now exposes deterministic `material_change` metadata.

Verification evidence:
- `risk-change-trend.test.ts`: 13/13 PASS, including JSONB object-key-order regression coverage;
- full Risk Engine focused suite: 42/42 PASS before JSONB regression addition; Ticket 11 focused suite remains PASS after correction;
- Agent Runtime PostgreSQL repository + migration journal: 5/5 PASS (`risk-snapshot-repository.integration.test.ts` 4/4 + migration journal 1/1);
- API risk-refresh + health regression: 4/4 PASS;
- live Course 20 refresh after canonical comparison fix: HTTP 200 PUBLISHED, evaluation coverage 1.0, `material=false`, `change_origin=UNKNOWN`, no material reasons;
- PostgreSQL current snapshot change events include both COURSE and STUDENT records for Student 4, both non-material, with source-change trace retained;
- live Student 4 history contains 3 raw refresh points on 2026-09-10; `RiskTrendEngine` canonicalizes them to exactly 1 daily point and returns `INSUFFICIENT_HISTORY`, proving repeated same-day manual refresh does not create false trend history.

Runtime defect found and corrected:
- first live comparison produced a false Course material change because JSONB deserialization returned distribution object keys in a different order and the comparator initially used `JSON.stringify()` on nested objects;
- corrected to canonical field-by-field distribution signature (`denominator`, `LOW`, `MEDIUM`, `HIGH`) independent of object key order;
- added dedicated regression test and re-ran live Moodle→MCP→Risk→PostgreSQL refresh successfully.


## 2026-09-10 — Ticket 12 Closure — Snapshot-scoped Risk Dashboard API & Moodle BFF

**Status:** CLOSED — IMPLEMENTED, BUILD-VERIFIED, MOODLE BFF RUNTIME-VERIFIED

### Build / runtime activation
- Rebuilt `packages/agent-runtime`, `packages/risk-engine`, and `apps/api` successfully with TypeScript compilation passing.
- The previous API process observed earlier on port `3000` was no longer present when restart verification began; port `3000` was then served by the refreshed Node runtime (PID `16012`).
- Runtime route probe changed from the earlier stale-build `404 Route GET:/api/risk/courses/20/dashboard not found` to the expected authenticated-route behavior: unauthenticated direct AI Platform request returned `401 RISK_SERVICE_UNAUTHORIZED`, proving the new Ticket 12 route/auth boundary was live.

### AI Platform snapshot-scoped API completed
- Added service-authenticated Course Dashboard endpoint with explicit snapshot metadata, freshness, Risk Profile version, evaluation coverage, evaluated LOW/MEDIUM/HIGH distributions, dimension distributions, Activity issues, Common Competency Gaps, Notable Associations, action candidates, and HIGH/MEDIUM Student triage.
- Added snapshot-pinned Student, Activity, and Competency drill-down endpoints. Drill-down requires `snapshot_id`; the server does not silently advance a Teacher from a requested historical snapshot to current state.
- Added `RISK_SERVICE_KEY` configuration and timing-safe shared-credential comparison plus trusted actor audit headers: `actor_ref`, `actor_type`, `course_ref`, and `request_origin`.
- Direct live Course 20 Dashboard read returned HTTP `200`, `status=OK`, current snapshot `9f94a563-7660-4762-802a-3fcb4f8aef5f` at that checkpoint, `risk-profile.v0.1`, evaluation coverage `1.0`, one Student in the snapshot, and no service credential in the response.

### Moodle server-side BFF completed
- Added `moodle/local_agentpoc/risk_ajax.php` as the browser-facing Risk boundary; browser-facing tests call Moodle, not the AI Platform directly.
- Extended `classes/api/ai_platform_client.php` with server-only Risk requests and shared credential / actor headers.
- Added `classes/risk/bff_helper.php` so Moodle, not the AI Platform snapshot, enriches Student `display_name` and Moodle profile URL. Canonical AI Platform Risk snapshots therefore remain pseudonymous (`student_id` / `student_ref`).
- Added current-Moodle navigation resolution for Activity / Student / Course fallback while historical snapshot evidence remains immutable.
- View path requires authenticated Moodle session + `local/agentpoc:view` + `moodle/course:view` in Course context.
- Manual refresh additionally requires sesskey + `local/agentpoc:manage` + `moodle/course:manageactivities`.
- Student drill-down checks active Course enrolment before proxying.
- Added server-side Moodle setting `riskservicekey`; the local POC uses a development-only derived key shared with `.env`. This is POC configuration, not a production secret-distribution pattern.
- Moodle plugin upgraded successfully to `2026091003 / v0.1.10`; PHP lint passed for the new/changed Risk BFF files.

### Real Moodle-session / BFF runtime evidence
- Authenticated Moodle session -> `risk_ajax.php?action=dashboard&course_id=20` -> AI Platform returned HTTP `200`, `success=true`, Course 20, evaluation coverage `1.0`, and Moodle-enriched Student identity `Risk Fixture Learner`; no Risk service credential appeared in the browser-visible JSON.
- Snapshot consistency flow passed through the real BFF:
  - Dashboard / Student Detail first used snapshot `9f94a563-7660-4762-802a-3fcb4f8aef5f`.
  - Manual refresh through Moodle BFF returned `PUBLISHED` with new snapshot `39347dd5-f95e-4bfe-a800-c52fed70a005`.
  - New Dashboard resolved to the new snapshot and reported the old snapshot as `previous_snapshot_id`.
  - Student Detail requested with the old explicit snapshot still returned HTTP `200` and remained pinned to the old snapshot; no silent snapshot switch occurred.
- Activity CMID `72` BFF drill-down returned HTTP `200`, the same requested snapshot, and current Moodle navigation resolved as `ACTIVITY` with a URL.
- Competency `1` BFF drill-down returned HTTP `200`, the same requested snapshot, and current navigation safely resolved to the Course fallback URL.
- Missing drill-down `snapshot_id` was rejected by Moodle BFF (`400 errorrisksnapshotrequired`).
- A nonexistent historical snapshot is now preserved correctly across the BFF boundary as HTTP `404`, `RISK_SNAPSHOT_NOT_FOUND`, `retryable=false`. A Ticket 12 defect was found and fixed here: the generic Moodle AI client previously collapsed all upstream HTTP errors into `erroraiplatform`, which would have incorrectly represented a missing historical snapshot as an outage. Added structured `risk_api_exception` propagation to preserve 400/404 Risk API semantics.

### Authorization / outage / cache evidence
- No-session Dashboard request was blocked at the Moodle boundary with `requireloginerror`.
- An authorized Course session requesting Student `999999` (not actively enrolled) was blocked before Student proxying with `errorriskstudentaccess`.
- Moodle capability evidence for learner fixture Student 4: active enrolment is true, while `local/agentpoc:view`, `local/agentpoc:manage`, and `moodle/course:manageactivities` are false; learner cannot enter the Teacher Risk BFF path.
- Simulated AI Platform outage by temporarily pointing Moodle to an unused local port: BFF returned HTTP `502`, `AI_PLATFORM_UNAVAILABLE`, `retryable=true`. `aiplatformurl` was immediately restored to `http://host.docker.internal:3000`, and post-restore BFF smoke checks passed.
- Repository scan confirms the Moodle plugin defines no `risk_snapshots` or `course_risk_state` persistence; canonical Risk state remains only in the AI Platform/PostgreSQL snapshot store.

### Verification summary
- Final focused regression after build/restart: **10 test files / 64 tests PASS**.
- Included Risk Dashboard API tests, refresh/auth tests, API config tests, all Risk Engine suites, PostgreSQL Risk snapshot/change-event integration tests, and migration journal test.
- PHP lint: PASS for Ticket 12 Risk BFF changes.
- Moodle CLI plugin upgrade: PASS (`2026091003`).
- Runtime Moodle-session Dashboard / Student / Activity / Competency / manual refresh / historical pin / authorization / outage paths: PASS.
- Temporary Ticket 12 HTTP harness files were moved to Recycle Bin after verification.

### UI contract baseline for downstream Tickets 13–14
Ticket 12 payload shape was kept compatible with the coordination design references:
- `UI-design/AI-risk-entry.png`
- `UI-design/AI-risk-page.png`
- `UI-design/students-risk-page.png`
- `UI-design/student-risk-detail.png`

Ticket 13–14 can now consume the snapshot-scoped BFF without introducing a second Risk data model or exposing AI Platform credentials to browser code.

## Ticket 13 Closure — Three-layer Course Teacher Dashboard

Status: **CLOSED / REAL-BROWSER VERIFIED**

Implementation:
- Added Course-scoped Moodle page `moodle/local_agentpoc/course/risk.php` and Course navigation entry `AI Learning Insight` for authorized Teacher/Manager users.
- Added `templates/risk_dashboard.mustache`, `amd/src/risk_dashboard.js` (+ build artifact), and scoped `styles.css`.
- Dashboard is bound to one explicit Risk `snapshot_id` until manual Refresh changes it.
- Layer 01 Course Overview shows enrolled/evaluated/incomplete counts, evaluated-only LOW/MEDIUM/HIGH distribution, coverage, freshness/data-as-of, and Risk Profile version; no canonical Course Risk Level is introduced.
- Layer 02 What Needs Attention renders dimension distributions, Activity problem types with affected numerator/denominator/rate, Common Competency Gaps separately from workflow concepts, Notable Associations with `Related` wording and overlap only, and deterministic Course Action candidates.
- Layer 03 Who Needs Attention renders HIGH/MEDIUM triage sorted by the API and links every Student to snapshot-scoped Student Detail; Students tab exposes All Students without changing snapshot.
- Manual Refresh calls Moodle `risk_ajax.php` only, uses Moodle sesskey/capability gate, then rebinds the page to the returned snapshot.
- Graceful page-level error state is operational when AI Platform is unavailable; no Moodle canonical Risk cache is introduced.

Verification:
- Moodle plugin upgraded successfully to `v0.1.11 / 2026091004`; PHP lint PASS for Course page/lib/version; JavaScript syntax check PASS.
- Real Chrome headless browser acceptance on Course 20 PASS:
  - title `AI Learning Insight | AgentPOC`;
  - three layers visible (`Course Overview`, `What Needs Attention`, `Who Needs Attention`);
  - evaluated/incomplete/coverage wording visible;
  - one attention Student (`Risk Fixture Learner`) and one row in Students view;
  - Student Detail links carry the selected snapshot id;
  - manual Refresh changed browser-visible snapshot from `39347dd5…` to `f2ade38e…`;
  - browser resource evidence shows only Moodle `/local/agentpoc/risk_ajax.php` Risk calls and no direct `:3000/api/risk` browser call;
  - no Course Risk Level label and no causal wording introduced.
- Real-browser synthetic rendering contract PASS for non-empty Risk findings:
  - Activity `PERFORMANCE_PROBLEM` rendered;
  - affected metric `3/5 (60%)` rendered;
  - Common Competency Gap `3/5 (60%)` rendered;
  - `Related Activity 72 ↔ Competency 1` plus overlap count rendered without causal claim;
  - deterministic `P1 · REVIEW_PROBLEMATIC_ACTIVITY` surface rendered;
  - incomplete Student context remains visible.
- Browser screenshots captured under `.agent-work/ticket13-dashboard.png`, `.agent-work/ticket13-students.png`, and `.agent-work/ticket13-rendering-fixture.png` as local acceptance evidence.

Design baseline:
- `ai-platform-coordination/UI-design/AI-risk-page.png`
- `ai-platform-coordination/UI-design/students-risk-page.png`


## Ticket 14 Closure — Student Risk Detail & Evidence Journey

Status: **CLOSED / REAL-BROWSER + SYNTHETIC EDGE-CASE VERIFIED**

Implementation:
- Added snapshot-scoped Moodle Course page `moodle/local_agentpoc/course/student_risk.php`, `templates/student_risk_detail.mustache`, and `amd/src/student_risk_detail.js` (+ AMD build artifact).
- Page requires authorized Course access and active Student enrolment before rendering; Student identity is resolved only in Moodle.
- Student Detail renders overall Risk/main drivers, four deterministic dimension cards, Expected vs Actual Progress/timeline compliance, Assessment Evidence, Competency Evidence, Submission History, Trend, Rule Trace, and normalized Evidence Journey.
- Assessment presentation keeps `academic_status` and `performance_signal` separate: FAIL, LOW_SCORE concern, PENDING_GRADE, PASS, and NO_PASS_CRITERION are not collapsed into one average/label.
- Competency presentation keeps `PROFICIENT`, `CONFIRMED_GAP`, `COMPETENCY_CONCERN`, `NOT_RATED`, and `REVIEW_PENDING` distinct; Review Pending is explicitly described as Teacher workflow/coverage rather than Student Risk.
- Submission presentation distinguishes active `OVERDUE`, resolved `SUBMITTED_LATE`, `NOT_ATTEMPTED`, and `recovery_not_available`.
- Rule Trace resolves `rule_hits[].evidence_refs[]` to frozen normalized evidence IDs and exposes separate `Open current Moodle` navigation links; historical snapshot values remain unchanged.
- Historical view clearly warns when a newer current snapshot exists and states that current Moodle links may show newer source state.
- LOW Student summary is a fixed deterministic template and does not invoke any AI narrative endpoint.

Verification:
- Plugin upgraded successfully to `v0.1.13 / 2026091006`; JS syntax check PASS and PHP lint PASS.
- Fixed Moodle 5.1 developer-mode fullname contract: Student/BFF user records now include all Moodle name fields required by `fullname()` (`firstnamephonetic`, `lastnamephonetic`, `middlename`, `alternatename`).
- Real Chrome browser acceptance for Course 20 / Student 4 PASS:
  - current snapshot `f2ade38e-1516-486c-930b-51a645934a9b`, previous `39347dd5-f95e-4bfe-a800-c52fed70a005`;
  - current overall Risk MEDIUM;
  - exactly 4 dimension cards;
  - 8 assessment rows, 1 competency row, 8 submission rows;
  - 4 Rule Trace rows, 17 normalized evidence rows, and 26 evidence/current-source links;
  - Expected vs Actual Progress and timeline compliance visible;
  - Risk Trend visible as deterministic `INSUFFICIENT_HISTORY` for the current one-day canonical history window;
  - current snapshot has no historical warning; previous snapshot shows historical warning while preserving 17 frozen evidence rows and current-source navigation;
  - browser uses Moodle `/local/agentpoc/risk_ajax.php` and makes no direct `:3000/api/risk` request.
- Synthetic HIGH browser contract PASS:
  - distinct FAIL, LOW_SCORE and PENDING_GRADE states rendered;
  - PROFICIENT, CONFIRMED_GAP, COMPETENCY_CONCERN, NOT_RATED and REVIEW_PENDING rendered separately;
  - OVERDUE, SUBMITTED_LATE and Recovery-not-available rendered;
  - WORSENING and MIXED trend states rendered;
  - Rule Trace evidence links and Evidence Journey source links resolve.
- Synthetic LOW browser zero-LLM contract PASS:
  - deterministic LOW summary rendered;
  - PASS / PROFICIENT / ON_TIME positive evidence rendered;
  - empty material Rule Trace rendered correctly;
  - exactly one browser Risk BFF request;
  - zero direct AI/Insight requests observed.
- Risk/API/DB regression after UI work: **64/64 PASS across 10 test files**, including 13 Trend tests preserving same-version daily canonicalization and model-version boundary reset.
- Browser screenshots captured locally under `.agent-work/ticket14-student-current.png`, `.agent-work/ticket14-student-historical.png`, `.agent-work/ticket14-high-fixture.png`, and `.agent-work/ticket14-low-fixture.png`.

Design baseline:
- `ai-platform-coordination/UI-design/student-risk-detail.png`


---

## 2026-09-10 20:04 — Risk Tickets 07–11 & 15 — Formal Closure Revalidation

**Status:** DONE / CLOSED

### Summary

Revalidated the previously implemented Risk Engine foundation against the current workspace and closed the coordination status debt for Tickets 07–11. Closed Ticket 15 after completing deterministic Teacher Action governance, evidence-grounded AI Insight validation, cache lifecycle, selective invalidation, Moodle BFF/UI integration, and real runtime state verification.

### Ticket 07–11 closure evidence

- Ticket 07 live Course 20 MCP→Moodle integration rerun with `MOODLE_INTEGRATION_TEST=1`: PASS. All factual Risk datasets returned through the intended plugin/MCP boundary and the Moodle layer remained free of Risk severity semantics.
- MCP stdio smoke debt corrected from the stale 16-tool expectation to the actual 17 tools after adding `moodle_get_course_risk_evidence`; stdio discovery PASS.
- Ticket 08 explicit shared contract gap closed with `packages/contracts/schemas/student-risk-result.v0.1.schema.json` plus Ajv validator/export. Actual LOW, MEDIUM, HIGH and INCOMPLETE evaluator outputs validate; INCOMPLETE→LOW invalid shape is rejected. Contract suite 5/5 PASS.
- Tickets 08–11 focused revalidation: 50/50 PASS across Student Risk, Course aggregation, refresh lifecycle, trend/change comparison and PostgreSQL snapshot repository/migration tests.
- Coordination tickets 07, 08, 09, 10 and 11 changed from OPEN to CLOSED only after the above current-build evidence.

### Ticket 15 implementation / runtime evidence

- Added deterministic Student/Course Action Catalogues with fixed P1 ACTIVE / P2 INVESTIGATE / P3 SUPPORT / P4 MONITOR bands. AI may not create actions or move them across deterministic bands.
- Added minimized course-scoped pseudonymous Insight context; Student names/emails/phone/student number are never sent to the model.
- Added `risk-insight-output.v0.1` structured schema and validator enforcing canonical Risk/Trend references, rule refs, evidence refs, eligible action codes/targets and priority bands.
- Recoverable formatting/schema error receives at most one repair; grounding/policy/canonical violations receive no repair and immediately fall back to deterministic output.
- Added `risk_insights` PostgreSQL persistence and migration `0014_add_risk_insights.sql` with VALID, STALE, REPAIRED, FALLBACK and BLOCKED lifecycle metadata.
- Selective invalidation is part of successful snapshot publication transaction: Course material change stales the previous Course insight; Student material change stales only that Student insight. Failed refresh leaves valid insight cache untouched.
- Full Ticket 15 focused regression: 78/78 PASS across 13 test files, including real PostgreSQL cache/invalidation integration.
- Real Groq runtime after switching the Insight request to strict JSON schema produced a Course `VALID` Insight in one model call. MEDIUM Student output containing an unauthorized canonical Risk ref was blocked by the validator and rendered as deterministic `FALLBACK`; subsequent cache reads used zero model calls.
- Real Moodle browser verified Course `VALID · cached`, Student `FALLBACK · cached`, no direct browser call to AI Platform, and deterministic Risk UI remained available on model failure.
- Browser coverage matrix: 50% Course coverage rendered LIMITED semantics with evaluated-students qualification (`REPAIRED` fixture); 49% rendered `BLOCKED` with deterministic metrics still available.
- Controlled Course 20 competency mutation produced real `MEDIUM → LOW`: previous Course/Student insight became `STALE`, current Student became LOW/PROFICIENT, historical Student remained MEDIUM/CONFIRMED_GAP, and LOW page made no `student_insight` request. Moodle fixture was restored to not-proficient baseline afterward.
- PostgreSQL readback confirmed current Course insight and targeted stale reasons (`COURSE_MATERIAL_CHANGE`, `STUDENT_MATERIAL_CHANGE`).
- Moodle plugin for Ticket 15 is `v0.1.14 / 2026091007`; PHP/JS syntax and Moodle upgrade passed.

### Decisions / deviations

- No frozen Risk architecture invariant changed.
- The numeric LOW_SCORE ratio and Trend movement thresholds remain versioned implementation policy defaults, not retroactively claimed as frozen design decisions.
- The existing Risk/Teacher Insight browser boundary remains Moodle BFF only.

### Next Suggested Task

`Ticket 16 — Moodle E2E Acceptance for Risk & Teacher Insight`

---

## 2026-09-10 20:50 +07:00 — Student Risk Scrutinize re-audit

Status: AUDIT COMPLETE / REOPEN_REQUIRED; no production Risk code changes.

- Read latest Risk tickets 07–16 and soc checkpoint, then traced with scoped Graphify AST graphs plus current source. No subagents and no LLM generation used.
- Existing Risk Engine and Risk API regression: 71/71 PASS.
- Isolated audit probes: 9 cases, 1 control PASS and 8 negative assertions FAIL, confirming 7 findings in `../ai-platform-coordination/student-risk-audit-2026-09-10.md`.
- P1: unfinished Quiz classified as submitted; hidden assessments counted as overdue; missing student facts classified COMPLETE/LOW; historical snapshot Trend includes future/current-policy points; unsupported AI prose accepted as VALID.
- P2: a parse-then-schema failure causes three model calls; action output can cross deterministic priority-band order.
- Tickets 08, 10, 12, 15 reopened with concrete remediation. Ticket 16 remains OPEN. Earlier runtime evidence was preserved.
- Audit artifacts: `.agent-work/student-risk-audit.probe.ts`, `.agent-work/student-risk-audit.config.ts`, `.agent-work/student-risk-audit-results.json`, `.agent-work/student-risk-existing-tests.json`, and scoped graphs under `.agent-work/student-risk-audit/`.
- Graph health limitation: Risk Engine graph has 31 dangling endpoints and 17 relation-collapse candidates; source verification is the authority for findings. Graph extraction used zero LLM tokens.
- No real student/course mutation, browser E2E, or production Risk implementation fix was performed in this audit.

---


---

## 2026-09-10 21:38 +07:00 — Student Risk Scrutinize Remediation & Tickets 08/10/12/15/16 Closure

**Status:** DONE — confirmed audit findings SR-01–SR-07 remediated; Risk frontier 07–16 CLOSED

### Summary

Remediated all seven findings from `ai-platform-coordination/student-risk-audit-2026-09-10.md`, promoted the negative cases into permanent regressions, re-ran Moodle/PostgreSQL/browser acceptance, and closed the Risk tickets that the Scrutinize audit had reopened. The original audit probe was not weakened or edited to obtain a pass.

### Production changes

- `packages/risk-engine/src/risk-evidence-normalizer.ts`
  - Quiz submission evidence now requires Moodle attempt `state=finished` and non-null `finished_at`; `started_at` is never treated as submission proof.
  - Hidden Quiz/Assignment activities are excluded from Assessment/Submission Risk applicability.
  - Missing active-Student facts or missing whole applicable Quiz/Assignment objects produce explicit incomplete reasons instead of empty-success semantics.
  - Progress completion-tracking applicability remains separate from assessment applicability.
- `packages/risk-engine/src/risk-trend-engine.ts`
  - Added shared `scopeRiskHistoryToSnapshot()` for selected snapshot publication/version scoping.
- `apps/api/src/routes/risk-dashboard.ts`
  - Historical Student Detail scopes compact history before deterministic Trend calculation.
- `packages/risk-engine/src/risk-insight-service.ts`
  - Student Insight uses the same historical cutoff.
  - Added governance policy version `risk-insight-governance.v0.2`; pre-policy cache prose is suppressed and replaced by deterministic fallback/actions.
- `packages/risk-engine/src/risk-insight-governance.ts`
  - Material findings require non-empty authorized rule/evidence references and evidence linked to the cited deterministic rule.
  - Model free prose is no longer rendered as authoritative Risk/causal narrative; summary/finding/action rationale are canonicalized from deterministic context.
  - Parse/schema repair share one budget: initial + at most one repair.
  - Action output is ordered deterministically P1→P4; model order is preserved only within one band.

### Permanent regression coverage

Added/expanded:
- `packages/risk-engine/test/student-risk-audit-regressions.test.ts` — 11 tests, including unfinished Quiz `inprogress`, `overdue`, `abandoned`; previous finished attempt + unfinished retake; hidden activity applicability; PARTIAL missing student/object facts; history cutoff; AI grounding; repair budget; priority order.
- `packages/risk-engine/test/risk-insight-history-scope.test.ts` — uncached Student Insight historical cutoff.
- `apps/api/test/risk-history-snapshot-scope.test.ts` — historical Student Detail excludes newer same-version and newer-policy history.
- `packages/risk-engine/test/risk-refresh-lifecycle.test.ts` — PARTIAL active-Student missing-facts publication with INCOMPLETE/null and zero evaluated denominator.
- Updated legacy cache governance regression to expect `CACHED_GOVERNANCE_POLICY_OBSOLETE`.

### Audit / automated verification

- Auditor's unchanged negative oracle `.agent-work/student-risk-audit.probe.ts`: **9/9 PASS** after remediation (original audit result was 1/9 PASS).
- Focused Risk/API/PostgreSQL closure suite: **94/94 PASS across 16 files**.
- Final targeted audit/lifecycle/governance/history slice after explicit unfinished Quiz lifecycle expansion: **32/32 PASS**.
- TypeScript typecheck PASS for contracts, agent-runtime, risk-engine, moodle-client, Moodle MCP server, and API.
- Root workspace Vitest with `.env`: **667 PASS / 10 FAIL / 4 skipped**. The ten failures are all pre-existing Planning-only regressions in `chunked-planning.test.ts`, `course-planner.test.ts`, and `planning-domain-validator.test.ts`; no Risk test failed. Repository-wide suite is therefore not claimed globally green.

### Moodle / PostgreSQL / browser verification

- SR-01 live Moodle: temporary Quiz 72 / Quiz id 25 was closed in the past and given an `abandoned` Student 4 attempt with start time but no finish time. Moodle factual reader returned `PENDING`, `state=abandoned`, `finished_at=null`; production normalizer returned `OVERDUE`, `submitted_at=null`, Submission MEDIUM. Temporary attempt/deadline were removed/restored.
- SR-02 live Moodle: Assignment 74 / Assignment id 24 was temporarily hidden with a past due date. Moodle factual reader still returned `NOT_ATTEMPTED`, but production normalizer created no Assessment/Submission negative evidence for the hidden activity; Submission remained LOW. Visibility/deadline were restored.
- Post-restore readback confirmed Quiz 72 has no close date/no attempts and Assignment 74 is visible/no due date.
- SR-04 actual PostgreSQL/API: historical snapshot `809e8fc9-f743-448d-9522-45dfcd63242f` excluded then-current `7db87ad6-4aeb-45e8-8697-6a90601fe026`; Trend version remained `risk-profile.v0.1` and leak count was 0.
- Legacy Insight cache on `7db87ad6...` rendered `FALLBACK · cached`; old model prose was not rendered and deterministic P2→P3→P4 actions were shown through Moodle BFF only.
- Post-remediation manual Refresh through the real Moodle Course page/BFF published current snapshot `4d6b9fef-4524-4f81-8366-ecb2814b7af1`; DB state records SUCCESS / MANUAL.
- Current Student 4 browser view on `4d6b9fef...`: MEDIUM, CONFIRMED_GAP, deterministic Rule Trace, governed Insight VALID with deterministic grounded text, and no direct browser call to AI Platform.
- Final browser workflow: Course Dashboard `4d6b9fef...` → Student Detail pinned to the same full UUID → current Moodle source `/mod/quiz/view.php?id=72`; browser remained Moodle-BFF-only.

### Ticket disposition

- Ticket 08: CLOSED after SR-01–03 remediation + live Moodle evidence.
- Ticket 10: CLOSED after PARTIAL active-Student refresh/denominator acceptance.
- Ticket 12: CLOSED after selected-snapshot/version Trend cutoff + actual PostgreSQL/API evidence.
- Ticket 15: CLOSED after grounding, repair-budget, priority-order and cache-policy remediation + browser evidence.
- Ticket 16: CLOSED after the above negative cases were added to the integrated acceptance and revalidated on the post-remediation runtime.

### Decisions / limitations

- No frozen Risk thresholds or architecture invariants changed.
- `activity.visible` is the factual applicability signal currently available in `CourseRiskEvidence`; this remediation does not claim unmodeled per-user availability/group-assignment semantics.
- Group submissions, deadline overrides, gradebook overrides, and refresh/insight race were explicitly not confirmed findings in the Scrutinize audit and are not claimed as separately proven runtime scenarios.
- Separate Planning frontier failures remain outside the Risk closure and continue to be visible in the root test result.

---

---

## 2026-09-10 22:15 +07:00 — Risk Empty-State UX + CS231-A0B63E 10-Student Mock Fixture

**Status:** DONE / RUNTIME VERIFIED

### Summary

Fixed the valid zero-enrolment Course path so Risk refresh no longer fails with `CourseRiskAggregator requires at least one normalized student`. A Course with no active Students now publishes an empty Risk snapshot and the Teacher Dashboard presents an informational no-student state instead of an AI Platform outage. Seeded 10 deliberately varied mock Students into dedicated mock Course `CS231-A0B63E` (Course 23) and verified the resulting deterministic Risk distribution in the real Moodle browser.

### Files Changed

- `packages/risk-engine/src/course-risk-aggregator.ts`
- `packages/risk-engine/test/course-risk-aggregation.test.ts`
- `packages/risk-engine/test/risk-refresh-lifecycle.test.ts`
- `moodle/local_agentpoc/amd/src/risk_dashboard.js`
- `moodle/local_agentpoc/amd/build/risk_dashboard.min.js`
- `moodle/local_agentpoc/version.php`
- `.agent-work/seed-risk-mock-course23.php` (fixture-only seed)
- `.agent-work/verify-empty-and-mock-risk-browser.mjs`
- `.agent-work/verify-empty-refresh-browser.mjs`

### Implementation Notes

- `CourseRiskAggregator` now accepts zero normalized Students only when explicit `course_id` and `data_as_of` are supplied; it returns enrolled/evaluated/incomplete = `0/0/0`, evaluation coverage `null`, zero-denominator distributions, and no issues/actions.
- `RiskRefreshService` already supplies Course identity explicitly, so zero-active-student evidence now publishes normally rather than recording a refresh failure.
- Moodle Dashboard shows an `alert-info`: `No active students are enrolled in this course yet...`; Course AI Insight becomes `NOT APPLICABLE` and no Course Insight/model request is made for the empty Course.
- Plugin version bumped to `2026091008 / v0.1.15`, synchronized to host/runtime Moodle, upgraded and cache-purged successfully.
- Fixture Course `CS231-A0B63E` is Course 23. Ten `nologin` mock learner accounts were enrolled with Student role. The fixture uses Moodle user/enrol APIs and narrowly seeds module-owned Quiz grade / Assignment submission evidence in this dedicated mock Course only; production Risk acquisition still reads Moodle factual state through the normal plugin boundary.
- Mock profiles intentionally cover strong/steady LOW, single-fail MEDIUM, multiple-fail HIGH, one/two-overdue MEDIUM, late-pattern MEDIUM, mixed HIGH, three-fail HIGH, and historical LOW_SCORE + pending Assignment grading LOW.

### Tests / Validation

- Zero-enrolment Course aggregate + refresh focused tests: **19/19 PASS**.
- Live `CS231-BE4F33` (Course 16) refresh after fix: HTTP 200 `PUBLISHED`; current snapshot `f10e02a7-3b6b-44f1-8206-97273596b34f`, coverage `null`, last refresh `SUCCESS`.
- Real browser manual Refresh for Course 16: snapshot changed, alert class `alert-info`, no service-error wording, Course Insight status `NOT APPLICABLE`.
- `CS231-A0B63E` (Course 23) Risk refresh: HTTP 200 `PUBLISHED`, snapshot `12eac980-c2ac-4114-9c99-08235c339c09`, coverage `1.0`.
- Course 23 browser Dashboard: Enrolled 10 / Evaluated 10 / Incomplete 0 / HIGH 3 / MEDIUM 4 / LOW 3; all ten mock names rendered through Moodle BFF and no browser-direct AI Platform Risk request observed.
- Dimension distribution: Progress LOW 10; Competency LOW 10; Performance HIGH 3 / MEDIUM 1 / LOW 6; Submission MEDIUM 4 / LOW 6.
- JavaScript syntax check PASS; Moodle plugin upgrade PASS; PHP version syntax PASS.

### Decisions Made

- Zero enrolment is a valid Course data state, not a Risk service failure and not Student incompleteness.
- No AI Course Insight/model call is appropriate when the Course has zero active Students.

### Known Limitations / Follow-up

- The current 10-student fixture intentionally exercises Performance and Submission diversity; the dedicated Course currently has no Moodle competencies, so Competency remains LOW for all ten Students.

---

## 2026-09-10 — Risk UI Thai Localization

- Localized the Teacher-facing Risk surface to Thai across Course Dashboard and Student Detail without changing deterministic contract identifiers.
- Added Thai rendering for Risk levels, dimensions, Student states, trend states, metrics, action labels, Activity/Common Gap/Association labels, Rule Trace explanations, Evidence Journey table labels, loading/empty/fallback/stale/error states, snapshot/freshness labels, and Thai date/time rendering.
- Added `moodle/local_agentpoc/lang/th/local_agentpoc.php` and changed Risk-specific strings in the English plugin pack to Thai so the Risk pages remain Thai even when the surrounding Moodle UI language is English. Non-Risk Course Builder strings were left unchanged.
- `risk_ajax.php` now maps common Risk API 400/404 codes to Teacher-facing Thai messages instead of forwarding English upstream error prose.
- Risk Insight user-facing canonical narrative is Thai. `RISK_INSIGHT_GOVERNANCE_POLICY_VERSION` advanced from `risk-insight-governance.v0.2` to `risk-insight-governance.v0.3`, so older cached English narratives are not rendered as current-policy text.
- Moodle plugin version: `2026091009`, release `v0.1.16`; CLI upgrade and cache purge succeeded.
- Browser acceptance on mock Course 23 (`CS231-A0B63E`) after a fresh refresh created snapshot `448b0671-13b7-4a61-b6be-4476e20967fc`. Dashboard retained distribution HIGH 3 / MEDIUM 4 / LOW 3 but rendered it as `สูง 3 · ปานกลาง 4 · ต่ำ 3`. Student 8 rendered HIGH as `สูง`, Thai Risk Summary, Trend, Dimension metrics, Assessment/Submission tables, Rule Trace, Evidence Journey, and a new governed Student Insight with Thai canonical narrative.
- Empty Course 16 rendered a Thai informational empty-state and `ยังไม่ใช้ AI`; no misleading platform error. Missing-snapshot BFF request returned HTTP 404 with Thai message `ไม่พบสแนปช็อตความเสี่ยงที่ร้องขอสำหรับรายวิชานี้ กรุณารีเฟรชข้อมูลความเสี่ยงอีกครั้ง`.
- Technical identifiers intentionally remain unchanged for traceability/audit compatibility: priority codes (`P1`–`P4`), `risk-profile.v0.1`, snapshot UUIDs, rule/evidence IDs, API codes and source entity references. These are identifiers rather than user-facing labels.
- Verification: Risk focused regression `98/98 PASS` across 16 files; Risk Insight/governance/audit subset `24/24 PASS`; JavaScript syntax checks PASS; PHP syntax checks PASS for Risk BFF and Thai language file; browser Thai leak checks PASS after final `Denominator` cleanup.


## Risk Dashboard UI Design Alignment — 2026-09-10

Post-Ticket-16 presentation refinement using `ai-platform-coordination/UI-design/AI-risk-page.png` plus the full design screenshots supplied in-session as the visual source of truth.

Changes are presentation-only; deterministic Risk contracts, snapshot semantics, Course aggregation, AI governance, and Moodle BFF boundaries are unchanged.

- Moodle plugin bumped to `v0.1.17` / `2026091010`.
- Replaced the flat Bootstrap-style Course Risk Overview with a dashboard hierarchy closer to the approved Design:
  - gradient AI Learning Insight hero with freshness, snapshot chip, and Refresh action;
  - compact pill view switch for Course Overview / Students;
  - three primary summary cards for enrolled/evaluated/incomplete;
  - dedicated student Risk distribution card with HIGH/MEDIUM/LOW segmented bar and legend;
  - four visual Risk-dimension cards (Progress, Performance, Competency, Submission), each with icon, denominator, segmented distribution, and counts;
  - highlighted AI Course Insight panel with narrative/action split layout and compact two-column deterministic action cards;
  - two-column attention cards for Problematic Activities, Common Competency Gaps, Associations, and Teacher Actions;
  - compact Student triage table with initials avatar, pill Risk badges, driver chips, and detail link;
  - responsive layout for tablet/mobile.
- Explicitly preserved the architecture invariant that the Course has **no canonical overall LOW/MEDIUM/HIGH Risk level**. The prominent overview visual is Student Risk distribution + evaluation coverage instead.
- Browser acceptance on Course 23 (`CS231-A0B63E`) after redesign:
  - snapshot `a58084de-d5f1-484b-b0ac-6c3078150f88`;
  - enrolled 10 / evaluated 10 / coverage 100%;
  - Student Risk distribution HIGH 3 / MEDIUM 4 / LOW 3;
  - Course Insight status VALID (`พร้อมใช้งาน`);
  - Student Detail drilldown remained operational;
  - Thai UI leak scan remained clean.
- `node --check moodle/local_agentpoc/amd/src/risk_dashboard.js`: PASS.
- `git diff --check` for redesigned template/JS/CSS/version: PASS.


## Risk AI Summary Force-Regenerate Test Control — 2026-09-10

Added an explicitly test-only control for forcing AI Insight regeneration without refreshing deterministic Risk evidence.

- Plugin release: `local_agentpoc v0.1.18` / `2026091011`.
- New Moodle setting: `local_agentpoc/riskaitesttools`, default `0` (disabled). The current local POC environment is explicitly set to `1` for testing.
- Teacher-facing button: `สร้าง AI Summary ใหม่ (ทดสอบ)`.
  - Course Risk Overview: available in the shared Risk toolbar.
  - Students view: same shared toolbar remains available.
  - Student Risk Detail: available in the page header.
- Security boundary: forced generation is browser -> Moodle BFF only. BFF requires `sesskey`, `local/agentpoc:manage`, `moodle/course:manageactivities`, active test flag, and active Student enrollment for Student regeneration. Service credentials remain server-side.
- AI Platform endpoints:
  - `POST /api/risk/courses/:courseId/insight/regenerate`
  - `POST /api/risk/courses/:courseId/students/:studentId/insight/regenerate`
- Semantics: `forceGenerate=true` bypasses only the snapshot-scoped Insight cache. It does **not** bypass deterministic Risk eligibility, evidence minimization, grounding validation, action governance, repair budget, or priority policy.
- LOW / INCOMPLETE / blocked-coverage paths remain zero-LLM even when the test button is used.

Verification:
- Focused Risk Insight/API regression: `16/16 PASS` after adding force-regenerate route/service tests.
- Broader Risk frontier regression after deployment: `32/32 PASS` across 5 executed focused files.
- TypeScript typecheck: `packages/risk-engine` PASS; `apps/api` PASS.
- Moodle PHP lint for changed BFF/settings/page/lang files: PASS.
- JS syntax checks for Course Dashboard and Student Detail: PASS.
- `git diff --check` on the changed Risk frontier: PASS (line-ending warning only for existing PHP working-copy normalization).
- Browser/runtime, Course 23 snapshot `a58084de-d5f1-484b-b0ac-6c3078150f88`:
  - Course Overview force button -> `Model calls: 1` and a fresh governed Course Insight.
  - Students tab retains the same test control in the shared toolbar.
  - HIGH Student 8 (Dan TwoFails) -> `Model calls: 1`; status changed from cached Insight to fresh `พร้อมใช้งาน`.
  - LOW Student 5 (Ari Strong) -> `Model calls: 0` with explicit message that Risk policy does not permit AI for this state; deterministic LOW summary remains authoritative.

This control is a POC testing aid and is intentionally disabled by default. It must not be treated as a production workflow for overriding Risk policy.
