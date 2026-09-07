# SourceReference v0.1 Freeze Record

**Status:** Frozen and accepted on 2026-09-01.

The user reviewed `.agent-work/handoffs/luna-to-terra-phase1-t0102.md` and reported that it passed. Following the requested lightweight POC workflow, that review is the acceptance gate for the exact SourceReference v0.1 draft described in the handoff.

## Canonical artifact

- Schema: `packages/contracts/schemas/source-reference.v0.1.schema.json`
- Schema ID: `urn:moodle-agent-poc:schema:planning:source-reference:0.1`
- Historical draft review: `packages/contracts/review/source-reference-v0.1-draft.md`

The draft schema was promoted from `schemas/draft/` to the canonical schema path. Only lifecycle annotations changed; the four-field validation contract is unchanged.

## Frozen decisions

- Only `source` is required.
- `source` is a nonblank human-readable identifier, not an enum.
- `page` is an optional one-based positive integer representing one page.
- `section` and `text` are optional nonblank strings.
- `page`, `section`, and `text` are independently optional; source-only references are valid.
- `text` represents a source-grounded excerpt, not a planner paraphrase.
- Unknown properties are rejected.
- Multi-page evidence uses multiple SourceReference objects in a later owning array.

## Validation boundary

The accepted review package contains eight intended-valid and nine intended-invalid examples. Dependency-free syntax, structure, fixture-isolation, predecessor-preservation, typecheck, test, and build checks passed as recorded in the Luna handoff. Standards-compliant Ajv/runtime validation remains deferred to T0111, and TypeScript alignment remains deferred to T0112.

SourceReference remains a reusable building block only. It does not modify PlanEnvelope or define any plan-specific `content` shape.
