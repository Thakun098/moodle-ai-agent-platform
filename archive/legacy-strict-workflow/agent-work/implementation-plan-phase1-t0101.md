# Phase 1 T0101 Implementation Plan — PlanEnvelope v0.1 DRAFT

- **Version:** 0.1
- **Requirements version:** 0.1 (approved by the user on 2026-08-31)
- **Status:** ready for DRAFT implementation; contract review still required
- **Owner role:** Sol
- **Scope:** Phase 1 T0101 only
- **Contract disposition:** DRAFT — not accepted, frozen, or complete

## Objective

Create a human-reviewable PlanEnvelope v0.1 DRAFT package under `packages/contracts` consisting only of one JSON Schema, syntactically valid intended-valid and intended-invalid JSON examples, and review notes. The package must expose the proposed envelope rules without defining downstream plan payloads or adding runtime validation. After Luna produces and checks the package, Terra audits it and the lifecycle stops for explicit user contract approval. T0101 remains unchecked and T0102 does not start.

## Current Architecture

`packages/contracts` is a behavior-free Phase 0 TypeScript workspace:

```text
packages/contracts/
├─ package.json
├─ tsconfig.json
└─ src/index.ts          # exactly: export {};
```

There are no planning schemas, schema examples, contract tests, Ajv dependency, exported TypeScript contract types, or runtime validators. `PLANNING_CONTRACT.md` defines a conceptual PlanEnvelope and delegates exact schema rules to T0101. `TECH_STACK.md` leaves Ajv as TBD. Phase 0 is independently audited as PASS and must remain unchanged.

## Proposed T0101 Architecture

Add only these boundaries:

```text
packages/contracts/
├─ schemas/draft/
│  └─ plan-envelope.v0.1.schema.json
├─ examples/plan-envelope/v0.1/
│  ├─ intended-valid/
│  │  ├─ course-create-revision-1.json
│  │  ├─ course-create-revision-2.json
│  │  ├─ course-update.json
│  │  ├─ assignment-create.json
│  │  ├─ assignment-update.json
│  │  ├─ quiz-create.json
│  │  └─ quiz-update.json
│  └─ intended-invalid/
│     ├─ unsupported-schema-version.json
│     ├─ malformed-plan-id.json
│     ├─ non-positive-revision.json
│     ├─ unsupported-plan-type.json
│     ├─ unsupported-operation.json
│     ├─ blank-title.json
│     ├─ blank-summary.json
│     ├─ invalid-warning-item.json
│     ├─ blank-assumption-item.json
│     ├─ non-object-content.json
│     ├─ unknown-envelope-property.json
│     └─ missing-required-field.json
└─ review/
   └─ plan-envelope-v0.1-draft.md
```

The existing `package.json`, `tsconfig.json`, `src/index.ts`, and generated `dist` files are not changed. The draft is inspectable as data and documentation; nothing imports or executes it.

## Proposed Decisions for the Seven Open Questions

These are review proposals, not frozen decisions.

| Open question | Proposed v0.1 rule | Rationale |
|---|---|---|
| JSON Schema dialect | Declare `https://json-schema.org/draft/2020-12/schema` in `$schema`. | Draft 2020-12 provides a current composition model suitable for later `$ref`-based schemas and is supported by modern Ajv releases, while T0111 retains authority over the exact Ajv version/configuration. |
| `plan_id` | Require a canonical hyphenated RFC 9562 UUID textual shape with version nibble `1`–`8` and RFC variant nibble `8`, `9`, `a`, or `b`, case-insensitive for hex. Enforce with a schema `pattern`, not `format`. | The conceptual contract already says UUID. A self-contained pattern makes review deterministic without adding `ajv-formats`; allowing standardized versions 1–8 avoids prematurely choosing v4 versus v7. Identity stability across revisions remains an application/domain rule demonstrated by examples, not something one envelope instance can prove. |
| Unknown envelope properties | Reject them with root `additionalProperties: false`. | The common envelope is small and versioned. Rejecting misspellings and accidental Moodle/provider/runtime fields is more valuable than unversioned forward extension. Future envelope fields require a schema-version change. |
| Required fields | Require all ten baseline fields: `schema_version`, `plan_id`, `revision`, `plan_type`, `operation`, `title`, `summary`, `warnings`, `assumptions`, and `content`. | A single predictable shape simplifies preview and revision persistence. Empty warning/assumption arrays and empty object content express absence explicitly without optional-shape branching. |
| Text/array constraints | Require `title`, `summary`, and every warning/assumption item to be strings containing at least one non-whitespace character. Allow empty `warnings` and `assumptions` arrays. Keep entries as plain strings; add no arbitrary maximum lengths or uniqueness rule. | This blocks structurally useless blank preview text while avoiding speculative size policy or structured warning objects. Empty arrays match the conceptual examples. |
| `content` boundary | Require `content` to be an object and explicitly allow any object members inside it for this draft. Valid envelope examples use `{}` only. | T0101 must prove the envelope boundary without defining T0102–T0110. The later plan-specific schemas can replace/refine the content subschema through composition. Scalars and arrays are rejected now; no downstream fields are implied. |
| `plan_type` × `operation` | Allow all six combinations of `course`, `assignment`, or `quiz` with `create` or `update` at the envelope layer. | The conceptual hierarchy says the envelope is reusable for create/update workflows, and no approved baseline declares a forbidden pair. Plan-specific/domain constraints belong to later schemas and validation rather than the common envelope. |

## Proposed Schema Contract

The schema document must contain only JSON Schema metadata/annotations and the ten baseline envelope properties.

### Schema identity and draft labeling

- `$schema`: `https://json-schema.org/draft/2020-12/schema`
- `$id`: `urn:moodle-agent-poc:schema:planning:plan-envelope:0.1`
- `title`: clearly includes `PlanEnvelope v0.1 DRAFT`
- `description` and/or `$comment`: clearly says the schema is proposed for human review, not frozen, and that T0111 runtime validation is not implemented
- root `type`: `object`
- root `additionalProperties`: `false`
- no external or unresolved `$ref`; no placeholder reference to future files

The `$id` is stable and versioned for later composition. Draft status is carried by the repository path, title, and review notes rather than changing the logical schema identity before acceptance.

### Property rules

| Property | Proposed schema rule |
|---|---|
| `schema_version` | `type: "string"`, `const: "0.1"` |
| `plan_id` | `type: "string"`, canonical UUID pattern `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$` |
| `revision` | `type: "integer"`, `minimum: 1` |
| `plan_type` | `type: "string"`, `enum: ["course", "assignment", "quiz"]` |
| `operation` | `type: "string"`, `enum: ["create", "update"]` |
| `title` | `type: "string"`, `minLength: 1`, `pattern: "\\S"` |
| `summary` | `type: "string"`, `minLength: 1`, `pattern: "\\S"` |
| `warnings` | `type: "array"`; items are strings with `minLength: 1` and `pattern: "\\S"`; empty array allowed |
| `assumptions` | same rule as `warnings`; empty array allowed |
| `content` | `type: "object"`, `additionalProperties: true`; empty object allowed |

The root `required` list contains all ten names exactly once. No conditionals, defaults, transforms, coercion hints, custom keywords, Moodle identifiers, provider metadata, or execution fields are added.

## Example Matrix

Every example is valid JSON syntax and contains artificial, non-sensitive values. Intended-invalid files start from a conforming envelope and change only the named rule so the reason is isolated.

### Intended-valid examples

| File | Purpose |
|---|---|
| `course-create-revision-1.json` | Course/create pair; first revision; empty arrays/content allowed. |
| `course-create-revision-2.json` | Same `plan_id` and operation as revision 1 with `revision: 2`, demonstrating stable identity across revisions. |
| `course-update.json` | Course/update pair and non-empty warnings/assumptions. |
| `assignment-create.json` | Assignment/create pair. |
| `assignment-update.json` | Assignment/update pair. |
| `quiz-create.json` | Quiz/create pair. |
| `quiz-update.json` | Quiz/update pair. |

Collectively these examples cover all six discriminant combinations, both empty and non-empty diagnostic arrays, the object content placeholder, and the revision-identity convention. They must use `{}` for `content` so they do not invent later task payloads.

### Intended-invalid examples

| File | Sole intended violation |
|---|---|
| `unsupported-schema-version.json` | `schema_version` is not the constant `0.1`. |
| `malformed-plan-id.json` | `plan_id` does not match the proposed canonical RFC UUID pattern. |
| `non-positive-revision.json` | `revision` is `0`, below the minimum. |
| `unsupported-plan-type.json` | `plan_type` is outside the three-value enum. |
| `unsupported-operation.json` | `operation` is outside the two-value enum. |
| `blank-title.json` | `title` contains whitespace only. |
| `blank-summary.json` | `summary` contains whitespace only. |
| `invalid-warning-item.json` | One warning item is not a string. |
| `blank-assumption-item.json` | One assumption item contains whitespace only. |
| `non-object-content.json` | `content` is an array rather than an object. |
| `unknown-envelope-property.json` | Adds one unrecognized root property. |
| `missing-required-field.json` | Omits exactly one required field, preferably `summary`; it must not also violate another rule. |

The review notes must map every file to this matrix, state that “intended-valid/invalid” is an expected contract outcome rather than evidence from Ajv, and enumerate the seven proposed decisions for explicit user acceptance or revision.

## Ordered Implementation

### 1. Establish the draft schema file

Create `packages/contracts/schemas/draft/plan-envelope.v0.1.schema.json` with the exact identity, draft labeling, properties, required list, and closed-root/open-content boundaries above.

**Dependency:** Approved requirements 0.1 and this plan.

**Completion criterion:** The schema parses as JSON, contains only the proposed envelope rules, contains no unresolved/external reference, and is visibly DRAFT.

### 2. Add intended-valid examples

Create the seven intended-valid files at the exact paths above. Use artificial UUIDs conforming to the proposed pattern, nonblank preview text, and `{}` content. The two course-create revision examples share `plan_id` and use revisions 1 and 2; unrelated examples use distinct IDs.

**Dependency:** Step 1 rules.

**Completion criterion:** Every file parses, the matrix covers all six plan type/operation pairs, and no example invents a downstream content field.

### 3. Add intended-invalid examples

Create the twelve intended-invalid files at the exact paths above. Each must remain syntactically valid JSON and differ from a conforming envelope only in its named violation.

**Dependency:** Step 1 rules and a conforming example baseline.

**Completion criterion:** Every file parses and manual/structural inspection confirms each file isolates exactly its documented violation.

### 4. Add review notes

Create `packages/contracts/review/plan-envelope-v0.1-draft.md` containing:

- DRAFT/not-frozen status and the explicit approval gate;
- scope and non-goals;
- the schema path and identity;
- field/rule summary;
- all seven open-question proposals with rationale;
- the complete intended-valid/intended-invalid matrix;
- dependency-free checks actually run and factual results;
- the limitation that no standards-compliant JSON Schema/Ajv validation has been implemented;
- explicit reviewer choices: accept as proposed, request changes, or ask questions;
- explicit statement that acceptance of this contract will not start T0102 automatically.

**Completion criterion:** A human can review the proposed contract and every example without reading source code or mistaking the draft for a frozen schema.

### 5. Validate, preserve gates, and hand off to Terra

Run the dependency-free checks below, confirm existing package/runtime files are untouched, and write `.agent-work/handoffs/luna-to-terra-phase1-t0101.md`. Do not edit `task.md` or `soc.md`. Update `.agent-work/status.md` to AUDIT only after the Luna handoff is complete.

**Completion criterion:** Checks are recorded truthfully, the handoff is complete, and T0101 remains pending user contract acceptance.

## Dependency-Free Validation and Structural Checks

Run from `C:\moodle-prac\ai-platform` and record commands, counts, and outcomes in the Luna-to-Terra handoff and review notes.

1. **JSON syntax:** enumerate every `*.json` below the new schema/example directories and parse each with Node.js `JSON.parse`. Assert the expected count is 20: one schema, seven intended-valid examples, and twelve intended-invalid examples.
2. **Schema metadata:** with an inline `node -e` assertion, verify `$schema`, `$id`, root `type`, root `additionalProperties`, the exact ten-item `required` set, constants/enums, revision minimum, UUID pattern, nonblank text/item patterns, and `content.type`/`content.additionalProperties` match this plan.
3. **Reference scan:** recursively inspect the parsed schema and assert it contains no `$ref` value. T0101 needs no reference, so any `$ref` is unexpected rather than merely unresolved.
4. **Valid-example structure:** with dependency-free inline Node assertions, confirm each intended-valid example has exactly the ten root keys; the seven-file matrix covers all six `plan_type|operation` pairs; every `content` is a non-array object; and the two course-create revisions share one `plan_id` with revisions 1 and 2.
5. **Invalid-example isolation:** parse every intended-invalid file, compare it with the matrix in the review notes, and perform explicit structural assertions for its named mutation. This is a consistency check, not JSON Schema validation.
6. **Preservation:** confirm `packages/contracts/src/index.ts` is still exactly `export {};`; `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `TECH_STACK.md`, `task.md`, `soc.md`, and `pnpm-lock.yaml` were not edited by this implementation.
7. **Workspace regression:** run `pnpm typecheck`, `pnpm test`, and `pnpm build`. Report that these commands exercise the existing Phase 0 scaffold only; they do not validate the JSON Schema.

Do not install a validator, use an online schema service, add a temporary committed checker, or claim that intended outcomes were certified by Ajv. T0111 owns validator selection and executable schema validation.

## Compatibility, Security, and Recovery

### Compatibility

- JSON Schema Draft 2020-12 is the proposed contract dialect; exact Ajv dependency/version/configuration remains T0111.
- The UUID pattern avoids relying on optional format plugins.
- The common envelope remains independent of future Course/Assignment/Quiz content schemas and can be composed later without a dangling reference now.
- No TypeScript API/export is introduced before T0112.

### Security and data boundaries

- Examples use synthetic UUIDs and generic educational text only.
- The envelope admits no credentials, user identity, approval signatures, provider/model metadata, Moodle identifiers, category IDs, shortnames, API payloads, execution state, or security policy.
- Closing the root object helps prevent accidental operational/provider data from crossing the planning boundary.
- The intentionally open `content` object is only a temporary composition boundary; it must not be represented as adequate downstream payload validation.

### Recovery

- All product artifacts in this implementation are new files under the four planned directories. If blocked, preserve partial work for inspection and report it; do not delete or overwrite unrelated files.
- Schema changes requested during review must be versioned or clearly recorded before the draft is re-presented.
- No database, Moodle, dependency, generated runtime, or service state is changed, so no operational rollback is needed.

## Risks and Stop Conditions

- **Premature freeze:** Labels, task state, SOC, or handoffs could imply acceptance. Keep DRAFT wording explicit and stop for user review after audit.
- **Downstream leakage:** Non-empty `content` examples or fields such as targets/source refs would define later tasks. Use `{}` and stop if meaningful payload fields appear necessary.
- **False validation claim:** Syntax/structural checks are not standards-compliant schema evaluation. Record this limitation prominently.
- **Overconstraint:** UUID, closed-root, required fields, and nonblank text rules are proposals. Do not silently change them during implementation; return to Sol if implementation evidence shows a conflict.
- **Workspace contamination:** Stop if implementation would require changing `src/index.ts`, a package manifest, pnpm lockfile, TypeScript config, TECH_STACK, baseline documents, generated output, or a dependency.
- **Scope expansion:** Stop before T0102, Ajv/T0111, TypeScript/T0112, ExecutionRequest, VerificationResult, planning runtime, preview, persistence, MCP, or Moodle work.
- **Approval boundary:** Do not check T0101 or append a completion SOC record. Only explicit user acceptance of the proposed contract can authorize the later freeze/completion step.

## Luna-to-Terra Handoff Requirement

Luna must write `.agent-work/handoffs/luna-to-terra-phase1-t0101.md` containing:

- requirements and plan versions;
- implemented scope and exact changed files;
- the seven proposals implemented in the draft;
- example counts and complete matrix;
- dependency-free commands and actual results;
- confirmation that no Ajv/dependency/runtime TypeScript change occurred;
- confirmation that `task.md` and `soc.md` were not changed;
- deviations, limitations, blockers, and residual risks;
- audit focus on schema/rule consistency, example isolation, downstream-boundary discipline, and approval-state correctness.

Luna must not self-certify contract acceptance. Terra audits the DRAFT implementation; neither role freezes T0101.

## DRAFT Implementation Completion Criteria

The implementation phase is ready for independent audit only when:

1. The exact 21 planned product files exist: one schema, seven intended-valid examples, twelve intended-invalid examples, and one review-notes file.
2. All 20 JSON files parse successfully.
3. Schema identity, dialect, ten required fields, field constraints, closed root, open object content boundary, and all-combinations posture match this plan.
4. Examples cover all six discriminant pairs and the revision identity convention; every invalid example isolates one named violation.
5. Review notes disclose all seven proposals and the absence of Ajv/runtime validation.
6. Existing contracts source/config/package/lockfile, `TECH_STACK.md`, `task.md`, `soc.md`, and all T0102+ work remain unchanged.
7. Root typecheck/test/build pass without being misrepresented as schema validation.
8. Luna writes the required handoff and moves workflow state to AUDIT only after it is complete.
9. T0101 remains `[ ]`, no completion record exists, the schema remains DRAFT, and the next product decision is explicit user contract review after Terra's audit.

