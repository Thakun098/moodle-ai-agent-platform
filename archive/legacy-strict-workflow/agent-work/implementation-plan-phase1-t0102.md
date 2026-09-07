# Phase 1 T0102 Implementation Plan — SourceReference v0.1 DRAFT

- **Version:** 0.1
- **Requirements version:** 0.1 (approved by the user on 2026-08-31, Asia/Bangkok, with exact message `อนุมัติ`)
- **Status:** ready for DRAFT implementation; contract review still required
- **Owner role:** Sol
- **Assigned implementer:** Luna
- **Next auditor:** Terra
- **Scope:** Phase 1 T0102 only
- **Contract disposition:** DRAFT proposal — not accepted, frozen, or complete

## Objective

Produce one human-reviewable SourceReference v0.1 DRAFT package under `packages/contracts`: a standalone Draft 2020-12 JSON Schema, an explicit intended-valid/intended-invalid example matrix, and concise review notes. SourceReference is only a reusable minimal provenance building block for later content schemas. It must not define or modify PlanEnvelope `content`, add a PlanEnvelope root field, integrate itself into a later schema, or start T0103.

After Luna creates and checks the package, Luna must hand it to Terra for an independent draft audit. After the audit, the lifecycle must stop for explicit user review of the proposed SourceReference contract. Requirements approval is not contract acceptance.

## Current Architecture and Frozen Boundary

`packages/contracts` currently contains the frozen T0101 PlanEnvelope contract and a behavior-free TypeScript workspace:

```text
packages/contracts/
├─ schemas/plan-envelope.v0.1.schema.json
├─ examples/plan-envelope/v0.1/     # 7 valid + 12 invalid frozen files
├─ review/
│  ├─ plan-envelope-v0.1-draft.md
│  └─ plan-envelope-v0.1-freeze.md
├─ package.json                     # no runtime dependencies
├─ tsconfig.json
└─ src/index.ts                     # exactly: export {};
```

The frozen PlanEnvelope schema SHA-256 is `2372EBF32A363F4CDDF0929B672CD440F8B4C13C916142766C225B229EDFE571`. Its root remains a closed ten-field object and its required `content` member remains an open object boundary. T0102 must not add `source_refs` to that envelope, constrain `content`, republish the schema, or change any frozen T0101 byte. T0102 is a reusable building block, not a PlanEnvelope specialization.

Ajv remains `TBD` in `TECH_STACK.md`; standards-compliant runtime validation belongs to T0111. `packages/contracts/src/index.ts` remains behavior-free until T0112.

## Exact Proposed Product Tree

Luna may add exactly these 19 product files:

```text
packages/contracts/
├─ schemas/draft/source-reference.v0.1.schema.json
├─ examples/source-reference/v0.1/
│  ├─ intended-valid/
│  │  ├─ source-only.json
│  │  ├─ source-page.json
│  │  ├─ source-section.json
│  │  ├─ source-text.json
│  │  ├─ source-page-section.json
│  │  ├─ source-page-text.json
│  │  ├─ source-section-text.json
│  │  └─ source-page-section-text.json
│  └─ intended-invalid/
│     ├─ missing-source.json
│     ├─ non-string-source.json
│     ├─ blank-source.json
│     ├─ zero-page.json
│     ├─ fractional-page.json
│     ├─ page-range.json
│     ├─ blank-section.json
│     ├─ blank-text.json
│     └─ unknown-property.json
└─ review/source-reference-v0.1-draft.md
```

The draft remains data plus documentation. Nothing imports, compiles, executes, or exports it. Do not create a canonical `packages/contracts/schemas/source-reference.v0.1.schema.json` or freeze record during this phase.

## Proposed Decisions for Every Open Question

These are minimal proposals for human contract review, not frozen decisions.

| Open question | Proposed v0.1 rule | Rationale |
| --- | --- | --- |
| Required fields | Require only `source`; keep `page`, `section`, and `text` optional. `{}` is invalid. | Every reference identifies a supplied source, while some supported inputs lack page/section metadata. |
| Source vocabulary and multiple documents | `source` is a nonblank human-readable string with no enum. Distinguish documents through the value, e.g. `syllabus-main` and `assessment-guidelines`; add no document-ID field. | An enum would not distinguish user-supplied documents and would couple provenance to ingestion/storage. |
| Page indexing | When present, `page` is an integer with minimum `1`, referring to the human-visible one-based page number. | Reviewers use one-based page labels; zero, negatives, and fractions are not useful page locators. |
| Page ranges | v0.1 supports one page per SourceReference. Multi-page support uses multiple SourceReference objects later in an owning `source_refs` array. | The approved four-field boundary has no range endpoint; strings/arrays would weaken the page type. |
| Optional combinations | `page`, `section`, and `text` are independently optional and may appear in any combination. | Supported source formats preserve different locator/evidence metadata. |
| Source-only validity | `{ "source": "syllabus-main" }` is valid; no locator/evidence `anyOf` is added. | Source-level provenance is useful when extraction cannot retain a finer locator. |
| Nonblank strings/length | Every present string has `minLength: 1` and `pattern: "\\S"`; add no maximum, normalization, uniqueness, or truncation rule. | Blank strings are useless, while no evidence supports arbitrary caps or normalization in T0102. |
| Unknown properties | Reject them with root `additionalProperties: false`. | The small versioned contract should catch misspellings and accidental production/lineage fields. |
| `text` semantics | `text` is a source-grounded supporting excerpt, not planner paraphrase, interpretation, or summary. | Hallucination review needs evidence derived from supplied material; schema documents but cannot prove this semantic. |

## Proposed Schema Interface

The DRAFT schema must express this exact structure without referencing another schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:moodle-agent-poc:schema:planning:source-reference:0.1",
  "title": "SourceReference v0.1 DRAFT",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "source": { "type": "string", "minLength": 1, "pattern": "\\S" },
    "page": { "type": "integer", "minimum": 1 },
    "section": { "type": "string", "minLength": 1, "pattern": "\\S" },
    "text": { "type": "string", "minLength": 1, "pattern": "\\S" }
  },
  "required": ["source"]
}
```

Add concise schema/property `description` values and a DRAFT `$comment`. Descriptions must state: `source` is a human-readable supplied-source identifier whose value distinguishes documents; `page` is one human-visible one-based page; `section` is a human-readable heading locator; `text` is a source-grounded excerpt rather than paraphrase/summary. Do not introduce paths, URIs, hashes, IDs, normalization guarantees, extraction metadata, or runtime behavior.

The schema must contain no `$ref`, composition/conditional keyword, `format`, `default`, custom keyword, enum, maximum constraint, or fifth property.

## Exact Intended-Valid Matrix

All fixtures are synthetic. The eight fixtures exhaust every presence combination of the three optional fields while always including `source`.

| File | Exact present keys | Purpose |
| --- | --- | --- |
| `source-only.json` | `source` | Minimum valid object; source-only is valid. |
| `source-page.json` | `source`, `page` | One-based single-page locator. |
| `source-section.json` | `source`, `section` | Section locator without page. |
| `source-text.json` | `source`, `text` | Grounded excerpt without positional locator. |
| `source-page-section.json` | `source`, `page`, `section` | Both locator forms without excerpt. |
| `source-page-text.json` | `source`, `page`, `text` | Page plus excerpt. |
| `source-section-text.json` | `source`, `section`, `text` | Section plus excerpt. |
| `source-page-section-text.json` | all four fields | Full form; use a different source value such as `assessment-guidelines` to demonstrate multi-document distinction through `source`. |

Use at least two distinct nonblank `source` values across the matrix. Every page is a positive integer; every string is nonblank; `text` reads as a short supporting excerpt, not a conclusion.

## Exact Intended-Invalid Matrix

Each fixture is valid JSON and differs from a conforming nearby baseline only by the named violation.

| File | Sole intended violation |
| --- | --- |
| `missing-source.json` | Omits required `source` while retaining one valid optional locator. |
| `non-string-source.json` | `source` is a number. |
| `blank-source.json` | `source` is whitespace-only. |
| `zero-page.json` | `page` is `0`, below minimum `1`. |
| `fractional-page.json` | `page` is `1.5`, not an integer. |
| `page-range.json` | `page` is `[4, 5]`, not one integer; ranges are unsupported. |
| `blank-section.json` | `section` is whitespace-only. |
| `blank-text.json` | `text` is whitespace-only. |
| `unknown-property.json` | Adds one field such as `uri`, rejected by the closed root. |

Review notes must say these are intended outcomes, not Ajv results.

## Ordered Implementation Phases

### A — Preflight and preservation snapshot

Read governance, approved requirements, this plan, and the handoff. Confirm no planned SourceReference path exists. Capture in-memory SHA-256 maps for all 22 frozen T0101 product files (canonical schema, 19 examples, two review records), all nine T0101 lifecycle files named in the handoff, and `task.md`, `soc.md`, `TECH_STACK.md`, contracts package/config/source. Assert the known PlanEnvelope hash, exact ten-field closed root, and open object `content`. Stop if any assertion fails.

### B — Create the DRAFT package

Create only the 19 product files above. Preserve the exact field boundary and proposal. Make DRAFT status conspicuous; keep fixtures synthetic; enumerate and explain every file/rule in review notes.

### C — Dependency-free verification and regressions

Run every check below. Fix only defects inside the 19 new files. Stop if a fix needs a different material rule, fifth field, predecessor change, dependency, or later-task work.

### D — Luna-to-Terra handoff

Write `.agent-work/handoffs/luna-to-terra-phase1-t0102.md`. Only after all checks pass, update `.agent-work/status.md` to AUDIT/Terra. Do not edit `task.md` or `soc.md`.

## Required Validation

Run from `C:\moodle-prac\ai-platform` with already-available Node.js/PowerShell only; add no checker file. Record exact commands and actual results.

1. Parse the schema and all 17 examples; assert exactly 18 T0102 JSON documents (`1 + 8 + 9`).
2. Assert exact dialect, `$id`, DRAFT annotations, root object/closed policy, exact four properties, and `required` exactly `source`.
3. Assert string/nonblank constraints for `source`, `section`, `text`; integer/minimum `1` for `page`; no enum or maximum constraint.
4. Recursively assert absence of `$ref`, composition/conditional keywords, `format`, `default`, custom/extension keywords, and any fifth property.
5. Assert valid fixtures have exactly their documented key sets, cover all eight optional-field combinations, use positive pages/nonblank strings, include at least two `source` values, and use excerpt-style `text`.
6. Run a small inline deterministic evaluator for the explicit proposed rules: zero errors per valid fixture and exactly the documented sole error per invalid fixture. Label this a structural consistency check, not standards-compliant validation.
7. Assert all invalid fixtures parse and isolate only the documented mutation; the range fixture fails only because `page` is not one integer.
8. Assert review notes enumerate all 19 artifacts, map 17 examples, explain all nine decisions, define `text` semantics, and state Ajv/semantic limitations.
9. Recompute/compare all 22-product and nine-lifecycle T0101 hashes; require per-file byte equality.
10. Reassert PlanEnvelope SHA-256 `2372EBF32A363F4CDDF0929B672CD440F8B4C13C916142766C225B229EDFE571`, ten-field closed root, and open object `content`.
11. Compare protected governance/package hashes; assert `src/index.ts` remains exactly `export {};`, Ajv remains TBD, T0102 remains `[ ]`, and no T0102 SOC completion exists.
12. Assert no canonical/frozen SourceReference, freeze record, T0103 artifact, TypeScript type/export, runtime validator, test, dependency, script, generated output, application/MCP/Moodle/persistence change, or PlanEnvelope composition exists.
13. Record that the nested project has no Git metadata; hashes/path enumeration replace diff evidence.
14. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`. These regress the existing scaffold only and do not validate the schema.

## Compatibility, Migration, Security, and Recovery

- **Compatibility:** Draft 2020-12 and the stable URN match T0101 style. Later accepted content schemas may reference an eventual canonical SourceReference; the DRAFT is not integrated now.
- **Migration:** none; there is no runtime consumer or accepted predecessor.
- **Security/data:** use synthetic excerpts only; no credentials, personal/private content, real Moodle IDs, paths, URLs, or site metadata.
- **Recovery:** before acceptance, recovery is limited to removing the exact new T0102 paths through a reviewed patch and restoring status. Never rewrite frozen T0101 files.

## Risks and Mitigations

| Risk | Mitigation / limitation |
| --- | --- |
| Source-only is imprecise. | Deliberately allow it for inputs without finer metadata; disclose the QA tradeoff. |
| Free-form sources vary. | Require human-readable nonblank values; naming conventions belong to ingestion, not this schema. |
| Schema cannot prove grounding/page accuracy. | Document semantics and defer evidence verification/conversion to later domain/ingestion work. |
| No Ajv execution exists. | Use dependency-free checks and state limits; T0111 remains owner. |
| T0101 could be mutated accidentally. | Compare complete pre/post hash maps and known schema/root/content boundary. |
| Draft identity could be treated as accepted. | Keep only draft path/annotations/review notes; no canonical path, export, integration, or freeze record. |

## Required Luna-to-Terra Handoff

The handoff must record approved versions/evidence, exact 19 product files, schema rules and nine decisions, complete example matrix with observed outcomes, exact commands/results, pre/post preservation evidence for 22 T0101 product and nine lifecycle files, known PlanEnvelope hash/root/content boundary, untouched task/SOC/dependency/TypeScript/T0103+ scope, deviations, limitations, blockers, and Terra audit focus. It must state that JSON Schema cannot prove excerpt grounding or naming consistency.

Ask Terra to inspect actual files and write `.agent-work/reports/audit-phase1-t0102-draft-001.md` with `PASS`, `PASS_WITH_NOTES`, or `CHANGES_REQUIRED` without modifying product artifacts.

## Gates and Completion Criteria

Terra PASS means ready for user review, not contract acceptance. After audit, stop for explicit user acceptance. Until then: keep DRAFT path/status; leave T0102 unchecked and `soc.md` unchanged; create no canonical/freeze artifact; do not begin T0103.

Luna completes its assigned phase only when exactly 19 product files exist, all checks pass, preservation/scope gates pass, the Luna-to-Terra handoff is complete, and status moves to AUDIT/Terra. Luna cannot self-certify T0102 completion.

## Prohibited Changes and Stop Conditions

Do not modify any T0101 product/history byte, PlanEnvelope/root/content, `task.md`, `soc.md`, `TECH_STACK.md`, baselines, package/lock/source/output/tests, application code, MCP/Moodle/persistence, or T0103+. Do not add Ajv, dependencies, scripts, runtime/types/exports, a canonical/frozen schema, or a freeze record.

Stop and write a blocker handoff if the PlanEnvelope hash/root/content differs, a protected file changes, regressions fail after one evidence-based retry, a fifth field/different material rule is needed, or any out-of-scope file would need modification.
