# SourceReference v0.1 DRAFT — Human Review Notes

**Status: DRAFT — not accepted, not frozen, and not complete.**

This package proposes a small, standalone provenance building block for Phase 1 task T0102. It supports QA and hallucination review for supplied source material. It is not a planner, execution, Moodle, provider, storage, or lineage contract. Explicit user review is required after Terra's independent draft audit; approval of T0102 requirements or an audit PASS does not accept this contract and does not authorize T0103.

## Scope and artifact inventory

The exact 19 product artifacts are:

1. `packages/contracts/schemas/draft/source-reference.v0.1.schema.json`
2. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-only.json`
3. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-page.json`
4. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-section.json`
5. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-text.json`
6. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-page-section.json`
7. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-page-text.json`
8. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-section-text.json`
9. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-page-section-text.json`
10. `packages/contracts/examples/source-reference/v0.1/intended-invalid/missing-source.json`
11. `packages/contracts/examples/source-reference/v0.1/intended-invalid/non-string-source.json`
12. `packages/contracts/examples/source-reference/v0.1/intended-invalid/blank-source.json`
13. `packages/contracts/examples/source-reference/v0.1/intended-invalid/zero-page.json`
14. `packages/contracts/examples/source-reference/v0.1/intended-invalid/fractional-page.json`
15. `packages/contracts/examples/source-reference/v0.1/intended-invalid/page-range.json`
16. `packages/contracts/examples/source-reference/v0.1/intended-invalid/blank-section.json`
17. `packages/contracts/examples/source-reference/v0.1/intended-invalid/blank-text.json`
18. `packages/contracts/examples/source-reference/v0.1/intended-invalid/unknown-property.json`
19. `packages/contracts/review/source-reference-v0.1-draft.md`

The schema is standalone and declares no `$ref`; later T0103–T0110 contracts may compose a future accepted canonical SourceReference. This draft does not modify, wrap, integrate into, or redefine the frozen PlanEnvelope v0.1 schema or its open `content` boundary.

## Proposed schema interface

- `$schema`: `https://json-schema.org/draft/2020-12/schema`.
- `$id`: `urn:moodle-agent-poc:schema:planning:source-reference:0.1`.
- The title, `$comment`, and description identify this as a DRAFT that is not accepted, frozen, or complete.
- The root is an object with `additionalProperties: false` and exactly four properties: `source`, `page`, `section`, and `text`.
- Only `source` is required. `{ "source": "syllabus-main" }` is valid; `{}` is invalid.
- `source`, `section`, and `text` are strings with `minLength: 1` and `pattern: "\\S"`, so every present string is nonblank. No maximum, normalization, or uniqueness rule is proposed.
- `page` is an integer with `minimum: 1`, meaning one human-visible, one-based page. A reference covers one page; ranges are unsupported. Later owning arrays can represent multi-page support with multiple references.
- `page`, `section`, and `text` are independently optional and every combination is allowed.
- Unknown properties are rejected to catch misspellings and prevent accidental production fields.
- `text` means a small source-grounded supporting excerpt for QA/hallucination review, not a planner paraphrase, interpretation, or summary. The schema cannot prove that text is grounded or that a page is accurate.

## Nine proposed decisions for explicit review

1. **Required fields:** require only `source`; permit source-only references because some inputs lack page or section metadata, while `{}` remains invalid.
2. **Source vocabulary:** use a nonblank free-form human-readable identifier rather than an enum; values such as `syllabus-main` and `assessment-guidelines` distinguish multiple supplied documents without a new field.
3. **Page indexing:** use positive integer, one-based human-visible page numbers because that matches reviewer-facing document labels.
4. **Page ranges:** support one page per reference only; represent multi-page support with multiple objects in a later owning `source_refs` array because the four-field boundary has no range endpoint.
5. **Optional combinations:** keep `page`, `section`, and `text` independently optional and allow all combinations for text/markdown and extracted-document inputs with different metadata availability.
6. **At-least-one locator:** add no `anyOf`; source-only is valid because source-level provenance can still be useful when finer metadata is unavailable.
7. **Nonblank strings/length:** reject whitespace-only strings with `minLength: 1` plus `pattern: "\\S"`; impose no arbitrary maximum or normalization rule without evidence.
8. **Unknown properties:** reject them with `additionalProperties: false` to keep this small, versioned contract disciplined and composable.
9. **Text semantics:** document `text` as a source-grounded excerpt rather than paraphrase/interpretation/summary; structural schema validation cannot prove grounding.

These are proposals, not frozen decisions. They remain subject to explicit user acceptance of the presented artifact version.

## Intended-valid matrix (8)

Every file below is expected to pass the proposed rules. The eight files exhaust all presence combinations of the three optional properties while always including `source`; all values are synthetic and nonblank.

| File | Present keys | Intended rule demonstrated |
| --- | --- | --- |
| `source-only.json` | `source` | Minimum object; source-only is valid. |
| `source-page.json` | `source`, `page` | One-based positive single-page locator. |
| `source-section.json` | `source`, `section` | Section locator without a page. |
| `source-text.json` | `source`, `text` | Supporting excerpt without a positional locator. |
| `source-page-section.json` | `source`, `page`, `section` | Both locator forms without an excerpt. |
| `source-page-text.json` | `source`, `page`, `text` | Page plus supporting excerpt. |
| `source-section-text.json` | `source`, `section`, `text` | Section plus supporting excerpt. |
| `source-page-section-text.json` | `source`, `page`, `section`, `text` | Full form and second source identifier (`assessment-guidelines`). |

The matrix uses both `syllabus-main` and `assessment-guidelines` to demonstrate document distinction through `source`. Text values are short excerpt-style statements; they are not claims that the schema has verified their grounding.

## Intended-invalid matrix (9)

Every file is valid JSON and is expected to fail exactly one documented proposed rule. “Intended-invalid” is a review label, not an Ajv result.

| File | Sole intended violation |
| --- | --- |
| `missing-source.json` | Omits required `source` while retaining valid optional fields. |
| `non-string-source.json` | `source` is a number, not a string. |
| `blank-source.json` | `source` is whitespace-only and fails the nonblank rule. |
| `zero-page.json` | `page` is `0`, below minimum `1`. |
| `fractional-page.json` | `page` is `1.5`, not an integer. |
| `page-range.json` | `page` is `[4, 5]`, not one integer; ranges are unsupported. |
| `blank-section.json` | `section` is whitespace-only and fails the nonblank rule. |
| `blank-text.json` | `text` is whitespace-only and fails the nonblank rule. |
| `unknown-property.json` | Adds `uri`, rejected by the closed root. |

The invalid fixtures use no credentials, personal data, private content, paths, URLs, Moodle identifiers, or provider metadata.

## Validation posture and limits

The implementation check package uses dependency-free parsing and deterministic structural/fixture-consistency assertions only. The following outcomes are intended for this draft and are recorded in the Luna-to-Terra handoff:

1. One schema plus 17 examples parse as exactly 18 JSON documents.
2. Schema metadata, four-property boundary, one-required set, string/page constraints, and prohibited-keyword posture match this document.
3. The eight valid key combinations and two source values are covered.
4. The nine invalid fixtures isolate their documented sole mutation under the inline evaluator.
5. Frozen T0101 product/lifecycle hashes and protected scope gates remain unchanged.
6. Existing `pnpm typecheck`, `pnpm test`, and `pnpm build` regressions pass; those commands exercise the Phase 0 scaffold and do not validate this schema.

Ajv selection/installation, executable JSON Schema validation, TypeScript alignment, runtime consumers, and contract tests remain deferred to T0111/T0112. JSON Schema cannot prove excerpt grounding, page accuracy, source naming consistency, or cross-revision invariants.

## Review gate

Please review this exact `SourceReference v0.1 DRAFT` and choose one outcome:

- **Accept as proposed:** authorize the later freeze/completion gate for this artifact version.
- **Request changes:** identify rules or examples to revise; the result remains DRAFT until re-presented and accepted.
- **Ask questions:** request clarification without implying acceptance.

Until explicit user acceptance is recorded, the schema remains at the draft path, T0102 remains unchecked, no canonical/freeze artifact exists, and T0103 must not begin. Terra should inspect the actual 19 files and write `.agent-work/reports/audit-phase1-t0102-draft-001.md` with `PASS`, `PASS_WITH_NOTES`, or `CHANGES_REQUIRED` without modifying product artifacts.
