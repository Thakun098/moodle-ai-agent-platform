# Sol to Luna Handoff — Phase 1 T0102 SourceReference v0.1 DRAFT

- **Requirements:** `.agent-work/requirements-phase1-t0102.md` / 0.1 — approved
- **Approval evidence:** User message on 2026-08-31 (Asia/Bangkok): `อนุมัติ`
- **Implementation plan:** `.agent-work/implementation-plan-phase1-t0102.md` / 0.1
- **Assigned phase/task:** Phase 1 — T0102 only
- **Assigned role:** Luna
- **Required next role:** Terra
- **Contract disposition:** DRAFT proposal only — not accepted, frozen, or complete

## Required Read Order

Before editing, read: `AGENTS.md`; `POC_BASELINE.md`; `Implementation.md`; `PLANNING_CONTRACT.md`; `TECH_STACK.md`; `task.md`; latest relevant `soc.md`; approved `.agent-work/requirements-phase1-t0102.md`; plan v0.1; current status; frozen T0101 schema, review records, final audit, and handoff/remediation evidence; then contracts package/config/source.

Follow repository governance and the lifecycle artifact contract. Preserve unrelated/user-owned work. This handoff is narrower where it names the exact T0102 file set.

## Exact Product Scope

Create only:

- `packages/contracts/schemas/draft/source-reference.v0.1.schema.json`
- eight valid fixtures under `packages/contracts/examples/source-reference/v0.1/intended-valid/`: `source-only.json`, `source-page.json`, `source-section.json`, `source-text.json`, `source-page-section.json`, `source-page-text.json`, `source-section-text.json`, `source-page-section-text.json`
- nine invalid fixtures under `packages/contracts/examples/source-reference/v0.1/intended-invalid/`: `missing-source.json`, `non-string-source.json`, `blank-source.json`, `zero-page.json`, `fractional-page.json`, `page-range.json`, `blank-section.json`, `blank-text.json`, `unknown-property.json`
- `packages/contracts/review/source-reference-v0.1-draft.md`

After implementation/checks, create `.agent-work/handoffs/luna-to-terra-phase1-t0102.md` and update only `.agent-work/status.md` to AUDIT/Terra. Use `apply_patch` for repository edits.

## Required Contract Behavior

Implement plan v0.1 exactly:

- Draft 2020-12; `$id` exactly `urn:moodle-agent-poc:schema:planning:source-reference:0.1`; title/comment unmistakably DRAFT.
- Object with only `source`, `page`, `section`, `text`; root closed by `additionalProperties: false`.
- Require only `source`. `{}` is invalid; source-only is valid.
- `source` is a non-enum human-readable identifier; different values distinguish supplied documents without a new field.
- Optional `page` is a one-based positive integer for one human-visible page. Page ranges are unsupported; later owning arrays use multiple references for multiple pages.
- `page`, `section`, and `text` are independently optional; every combination is valid.
- Every present string is nonblank using string type, `minLength: 1`, `pattern: "\\S"`; add no arbitrary maximum/normalization rule.
- `text` is a source-grounded excerpt, not planner paraphrase, interpretation, or summary. State that schema cannot prove grounding.
- No `$ref`, plan integration, fifth field, enum, format, default, composition/conditional/custom keyword, runtime behavior, or maximum.

The eight valid fixtures must exhaust all optional-field presence combinations and use at least two source values such as `syllabus-main` and `assessment-guidelines`. The nine invalid fixtures must each isolate exactly its named rule. Review notes must enumerate all 19 files, map all 17 fixtures, explain the nine decisions, state validation/semantic limits, preserve DRAFT status, and request user review after Terra.

## Preservation Requirements

Before editing, capture in-memory SHA-256 maps for:

1. all 22 frozen T0101 product files: canonical schema, 19 PlanEnvelope examples, two review records;
2. nine T0101 lifecycle files: `.agent-work/requirements-phase1-t0101.md`, `.agent-work/implementation-plan-phase1-t0101.md`, `.agent-work/remediation-plan-phase1-t0101-001.md`, four phase-specific T0101 Sol/Luna handoffs, and both phase-specific draft/final audits;
3. `task.md`, `soc.md`, `TECH_STACK.md`, `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`.

The PlanEnvelope schema must begin and end with SHA-256 `2372EBF32A363F4CDDF0929B672CD440F8B4C13C916142766C225B229EDFE571`, its exact closed ten-field root, and open object `content`. Recompute every map after implementation and require per-file byte equality. Record counts/results and the known schema hash in the Luna-to-Terra handoff.

## Required Checks

Run every check in plan v0.1 and record exact commands/results:

- parse/count all 18 T0102 JSON documents;
- assert schema metadata, exact four-field/one-required boundary, constraints, descriptions, and prohibited-keyword absence;
- assert all eight valid presence combinations, two or more source values, positive pages, and excerpt semantics;
- run an inline dependency-free evaluator: zero errors for each valid fixture and exactly one documented error for each invalid fixture;
- assert invalid isolation and complete review-note mapping;
- compare every protected pre/post hash and reassert PlanEnvelope hash/root/content;
- assert task/SOC/dependency/TypeScript/T0103/scope gates;
- run `pnpm typecheck`, `pnpm test`, `pnpm build`.

These are syntax/structure/fixture-consistency checks only. Do not claim Ajv or standards-compliant JSON Schema validation.

## Prohibited Work

Do not modify T0101 artifacts, PlanEnvelope/root/content, `task.md`, `soc.md`, `TECH_STACK.md`, baselines, manifests, lockfile, TypeScript source/output, tests, application packages, MCP/Moodle code, or persistence. Do not add Ajv/dependencies/scripts/runtime/types/exports/generated output, a canonical/frozen SourceReference schema, a freeze record, or T0103+ artifacts. Do not mark T0102 complete.

## Risks and Limitations

- Source-only is deliberately valid but less precise; disclose that tradeoff.
- Free-form source naming consistency is outside this structural schema.
- JSON Schema cannot prove excerpt grounding or page accuracy; later ingestion/domain work owns these semantics.
- Ajv/runtime validation is T0111; TypeScript alignment is T0112.
- The nested project has no Git metadata; use hashes/path assertions, not Git-diff claims.

## Stop Conditions

Stop safely and write a blocker handoff if the PlanEnvelope hash/root/content differs, any protected file changes, a fifth field/different material rule/dependency/later task is needed, regressions still fail after one evidence-based retry, or an out-of-scope path must change. Do not silently redesign.

## Completion Checklist

- [ ] Read all required governance and evidence.
- [ ] Captured/verified protected hashes and PlanEnvelope boundary.
- [ ] Created exactly 19 DRAFT product files and no canonical/frozen artifact.
- [ ] Implemented exactly the four-field schema and nine proposals.
- [ ] Completed the eight-valid/nine-invalid matrix and review mapping.
- [ ] Ran all dependency-free and workspace checks; all passed with honest limits.
- [ ] Verified protected bytes and T0102/T0103 gates.
- [ ] Wrote `.agent-work/handoffs/luna-to-terra-phase1-t0102.md` with files, decisions, commands/results, deviations, limitations, blockers, and audit focus.
- [ ] Updated status to AUDIT/Terra only after checks passed.

Ask Terra to inspect actual files, rerun proportional checks, and write `.agent-work/reports/audit-phase1-t0102-draft-001.md` with `PASS`, `PASS_WITH_NOTES`, or `CHANGES_REQUIRED` without editing product artifacts. Even after PASS, stop for explicit user contract review; do not freeze, complete T0102, or begin T0103.
