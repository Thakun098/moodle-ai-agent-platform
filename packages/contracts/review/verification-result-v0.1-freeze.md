# VerificationResult v0.1 Freeze Record

**Status:** Frozen on 2026-09-01 as the final Phase 1 contract.

## Contract

VerificationResult references one executed plan revision with:

- `plan_id`
- `revision`
- `passed`
- `issues`

A passed result requires an empty `issues` array. A failed result requires at least one issue.

Each issue has required `kind`, `path`, and `message`, with optional `expected` and `actual` values. Supported issue kinds are `mismatch`, `missing`, `unexpected`, and `read_error`.

The contract intentionally excludes production audit metadata, timestamps, authorization data, rollback information, and persistence concerns. Phase 14 will implement expected-vs-actual comparison and persistence around this frozen result shape.
