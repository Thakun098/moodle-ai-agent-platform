# Domain Docs

How engineering skills should consume this repository's domain documentation.

## Layout

This monorepo is treated as **one product/domain context**. The packages are implementation boundaries, not separate bounded contexts.

```text
/
├─ CONTEXT.md
├─ docs/
│  ├─ agents/
│  │  ├─ issue-tracker.md
│  │  └─ domain.md
│  └─ adr/
│     └─ NNNN-*.md
├─ apps/
├─ packages/
└─ moodle/
```

Do not create CONTEXT-MAP.md or per-package CONTEXT.md files unless the product genuinely splits into independently named domain contexts.

## Before exploring code

1. Read root CONTEXT.md.
2. Read only ADRs relevant to the feature or symbol you are changing.
3. If a current ticket references a prior SOC/Audit item, read that bounded evidence from the external coordination source of truth.

If a file does not exist, proceed without inventing one merely for completeness.

## Glossary rules

Use the exact canonical term from CONTEXT.md in tickets, tests, code comments, review findings, and plans.

If a needed concept is missing, either reuse an existing project term or resolve the terminology deliberately before adding a concise glossary entry.

CONTEXT.md contains definitions only. Implementation detail, acceptance criteria, status, and historical narrative do not belong there.

## ADR rules

An ADR is warranted only when a decision is all three:

1. hard to reverse;
2. surprising without context;
3. the result of a real trade-off.

Keep superseded ADRs and mark their status; do not rewrite old decisions as if they never happened. When current work conflicts with an accepted ADR, surface the conflict and create/accept a replacement decision before implementation.

## Executable contracts

JSON Schema, TypeScript contract types, validators, and contract tests under packages/contracts/ are the executable contract source of truth. Domain docs explain vocabulary and decisions; they do not duplicate schemas field-for-field.
