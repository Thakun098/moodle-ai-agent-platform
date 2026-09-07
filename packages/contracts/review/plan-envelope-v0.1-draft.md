# PlanEnvelope v0.1 DRAFT — Human Review Notes

**Status: DRAFT — not accepted, not frozen, and not complete.**

This package proposes the common PlanEnvelope boundary for Phase 1 task T0101. It is intentionally presented for explicit user contract review. T0101 remains unchecked in `task.md`; no T0101 completion record has been added to `soc.md`; and T0102 must not begin until the user accepts this contract in a later gate. Acceptance of this contract will not automatically start T0102.

## Scope

This draft contains one JSON Schema and review fixtures for the ten common envelope fields named by the planning baseline:

`schema_version`, `plan_id`, `revision`, `plan_type`, `operation`, `title`, `summary`, `warnings`, `assumptions`, and `content`.

The envelope is declarative, provider-neutral, Moodle-light, previewable, revisioned, and reusable for create/update intent. It describes desired intent, not how an Executor, MCP server, or Moodle adapter performs work.

The draft does not define downstream plan payloads. `content` is only an object boundary until later contract tasks define Course, Assignment, Quiz, and question-plan payloads. No category, shortname, Moodle ID, provider/model, execution, approval, security, persistence, context-lineage, dependency, concurrency, rollback, or transport field is proposed here.

## Schema

The proposed schema is:

`packages/contracts/schemas/draft/plan-envelope.v0.1.schema.json`

Identity and boundary:

- `$schema`: `https://json-schema.org/draft/2020-12/schema`
- `$id`: `urn:moodle-agent-poc:schema:planning:plan-envelope:0.1`
- `title`: `PlanEnvelope v0.1 DRAFT`
- root `type`: `object`
- root `additionalProperties`: `false`
- exactly ten root properties, all required
- no `$ref`, conditional, default, transform, custom keyword, or unresolved reference
- `content` is an object with `additionalProperties: true` and may be empty; T0101 does not define its members

## Proposed field rules

| Field | Proposed rule and purpose |
| --- | --- |
| `schema_version` | String constant `"0.1"`; identifies the envelope contract version. |
| `plan_id` | String matching `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`; a canonical hyphenated RFC UUID textual identity shared by revisions of one plan. The pattern is used instead of `format` so this draft needs no format plugin. |
| `revision` | Integer with minimum `1`; identifies a particular revision and supports the rule that revisions are not silently overwritten. |
| `plan_type` | String enum `course`, `assignment`, or `quiz`. |
| `operation` | String enum `create` or `update`. |
| `title` | String, `minLength: 1`, and `pattern: "\\S"`; human-readable preview title containing at least one non-whitespace character. |
| `summary` | String, `minLength: 1`, and `pattern: "\\S"`; concise explanation containing at least one non-whitespace character. |
| `warnings` | Array whose items are nonblank strings (`minLength: 1`, `pattern: "\\S"`); an empty array is allowed and means no planner warning was reported. |
| `assumptions` | Array whose items are nonblank strings (`minLength: 1`, `pattern: "\\S"`); an empty array is allowed and means no planner assumption was reported. |
| `content` | Object with `additionalProperties: true`; an intentionally open, possibly empty plan-specific boundary that does not define downstream fields in T0101. |

All six `plan_type` × `operation` combinations are allowed at this common-envelope layer. Restrictions that depend on a specific plan payload belong to later schemas and domain validation.

## Seven proposed decisions for explicit review

These are proposals, not frozen decisions:

1. **Dialect — Draft 2020-12.** Declare `https://json-schema.org/draft/2020-12/schema` because it is a current composition model suitable for later schemas and modern Ajv releases. T0111 still owns the exact Ajv version and configuration.
2. **Plan identity — canonical UUID pattern.** Require a hyphenated RFC UUID shape with version nibble `1`–`8` and variant nibble `8`, `9`, `a`, or `b`, case-insensitive for hexadecimal characters. This keeps the proposed identity constraint self-contained without selecting a UUID version or requiring a format plugin. Stability across revisions remains an application/domain rule.
3. **Unknown root properties — reject.** Set root `additionalProperties: false` so misspellings and accidental provider, runtime, or Moodle fields fail the small versioned boundary. Future common fields require a contract-version decision.
4. **Required fields — all ten.** Require every baseline field. Empty diagnostic arrays and empty object content express absence explicitly and avoid optional-shape branching in preview/revision handling.
5. **Text and diagnostic items — nonblank plain strings.** Require `title`, `summary`, and each warning/assumption item to contain a non-whitespace character. Keep warning/assumption entries as plain strings and do not invent maximum lengths or uniqueness behavior.
6. **Content boundary — open object placeholder.** Require `content` to be an object, allow any object members, and allow `{}`. This demonstrates composability without defining T0102–T0110 payloads; later schemas must provide the real payload validation.
7. **Cross-field combinations — allow all six.** Permit each of the three plan types with either operation. No approved baseline declares a forbidden pair, so domain-specific restrictions remain downstream rather than being prematurely encoded in the common envelope.

## Intended-valid example matrix

The seven files below are syntactically valid JSON and are expected to satisfy this proposed draft. Their `{}` content values intentionally do not define any downstream payload.

| File | `plan_type` | `operation` | `revision` | Review purpose |
| --- | --- | --- | ---: | --- |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-create-revision-1.json` | `course` | `create` | 1 | First course/create revision; empty warnings, assumptions, and content are allowed. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-create-revision-2.json` | `course` | `create` | 2 | Same `plan_id` as revision 1, demonstrating stable identity across revisions. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-update.json` | `course` | `update` | 1 | Course/update pair with non-empty warning and assumption arrays. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/assignment-create.json` | `assignment` | `create` | 1 | Assignment/create pair. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/assignment-update.json` | `assignment` | `update` | 2 | Assignment/update pair with a non-empty warning. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/quiz-create.json` | `quiz` | `create` | 1 | Quiz/create pair with an explicit assumption. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/quiz-update.json` | `quiz` | `update` | 1 | Quiz/update pair with warning and assumption text. |

Collectively, the examples cover all six supported discriminant pairs, both empty and non-empty diagnostic arrays, the positive revision rule, the object content placeholder, and the shared course-create identity/revision convention.

## Intended-invalid example matrix

Every invalid fixture is still syntactically valid JSON. Each starts from an otherwise conforming envelope and intentionally changes only the named rule, so the expected failure reason is isolated. “Intended-invalid” describes the expected result under this proposed schema; it is not evidence from Ajv or another standards-compliant validator.

| File | Sole intended violation |
| --- | --- |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-schema-version.json` | `schema_version` is `"0.2"`, not the constant `"0.1"`. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/malformed-plan-id.json` | `plan_id` is `"not-a-uuid"`, which does not match the proposed UUID pattern. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/non-positive-revision.json` | `revision` is `0`, below minimum `1`. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-plan-type.json` | `plan_type` is `"lesson"`, outside the three-value enum. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-operation.json` | `operation` is `"delete"`, outside the two-value enum. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-title.json` | `title` contains only whitespace and fails the non-whitespace pattern. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-summary.json` | `summary` contains only whitespace and fails the non-whitespace pattern. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/invalid-warning-item.json` | One `warnings` item is the number `5`, not a string. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-assumption-item.json` | One `assumptions` item contains only whitespace and fails the non-whitespace pattern. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/non-object-content.json` | `content` is an array rather than an object. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unknown-envelope-property.json` | Root adds unrecognized property `unexpected`, rejected by root `additionalProperties: false`. |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/missing-required-field.json` | Omits only the required `summary` field; all present values remain conforming. |

## Dependency-free checks and factual limits

The following checks are required for this draft stage and do not claim runtime JSON Schema validation. The results below were recorded after creating the package. The inline suites were run as dependency-free `node -e` assertions from `C:\\moodle-prac\\ai-platform` (no checker file was added):

1. **JSON syntax/count — command:** inline Node `JSON.parse`/enumeration suite. **Result:** PASS; the one schema plus 19 example files parsed successfully (`20` JSON files total: `1 + 7 + 12`).
2. **Schema metadata/structure — command:** inline Node assertions. **Result:** PASS; confirmed the declared Draft 2020-12 URI, stable `$id`, DRAFT title, root object/closed-root policy, exact ten required fields, constant/enum rules, positive revision minimum, UUID pattern, nonblank text/item patterns, and object/open-content policy.
3. **Reference scan — command:** recursive inline Node inspection. **Result:** PASS; no `$ref` (or conditional/default/format keyword) was found in the schema.
4. **Valid-example structure/matrix — command:** inline Node assertions. **Result:** PASS; all seven valid files have exactly ten root keys, object (non-array) content, all six plan-type/operation pairs are covered, and the two course-create examples share one `plan_id` with revisions `1` and `2`.
5. **Invalid isolation — command:** inline Node assertions with one-mutation restoration against a conforming baseline. **Result:** PASS; all twelve invalid files parse and each has only its documented mutation while the other baseline fields remain conforming.
6. **Preservation — command:** inline PowerShell content/status assertions. **Result:** PASS; `packages/contracts/src/index.ts` remains exactly `export {};`; package/config/lockfile, `TECH_STACK.md`, `task.md`, and `soc.md` remain outside the scoped product edits. The project has no Git metadata for a diff-based check.
7. **Workspace regression — commands:** `pnpm typecheck`, `pnpm test`, and `pnpm build`. **Result:** PASS after rerunning with approved access to the installed pnpm runtime (the initial sandbox-only `pnpm typecheck` invocation failed before pnpm startup with `EPERM` opening the external Corepack cache). These exercise the existing Phase 0 TypeScript/Vitest scaffold only; they do not validate this JSON Schema.

An additional final lifecycle gate initially reported a false property-count failure because PowerShell's `PSObject.Properties.Count` accessor did not count the deserialized child properties as intended. The assertion was corrected to count the explicit property collection and then passed; no artifact was changed by either check.

No Ajv, `ajv-formats`, online validator, dependency, package script, runtime validator, TypeScript contract type, or contract test was added. T0111 owns validator selection and executable schema validation; T0112 owns TypeScript alignment.

## Reviewer decision gate

Please choose one outcome after Terra's independent audit:

- **Accept as proposed:** authorize a later freeze/completion step for this exact reviewed artifact version.
- **Request changes:** identify the rule(s) or examples to revise; the result remains DRAFT until re-presented and accepted.
- **Ask questions:** request clarification without implying acceptance.

Explicit user acceptance must identify the accepted artifact version and approval evidence before T0101 can be checked or recorded complete. Acceptance here will not automatically begin T0102.
