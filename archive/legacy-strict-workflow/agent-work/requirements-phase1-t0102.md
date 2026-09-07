# Phase 1 T0102 Requirements — SourceReference v0.1 Draft

- **Version:** 0.1
- **Status:** approved
- **Lifecycle:** Phase 1 / T0102 only
- **Owner role:** Sol
- **Approval identity:** User
- **Approval evidence:** User message on 2026-08-31 (Asia/Bangkok): `อนุมัติ`. This explicitly approves T0102 Requirements v0.1 and authorizes Sol planning plus production of the SourceReference v0.1 DRAFT review package. It does not accept or freeze the eventual SourceReference contract.
- **Source of truth:** `AGENTS.md`, `POC_BASELINE.md`, `Implementation.md`, `PLANNING_CONTRACT.md`, `TECH_STACK.md`, `task.md`, latest relevant `soc.md`, the frozen T0101 schema/freeze record/final audit and lifecycle artifacts, current `packages/contracts` artifacts, and the user's latest T0102 authorization and boundary notes

## Objective

Define the requirements for producing a human-reviewable **SourceReference v0.1 DRAFT** JSON Schema, a small set of intended-valid and intended-invalid JSON examples, and concise review notes. SourceReference is a reusable, minimal provenance building block for syllabus-derived planning content and exists only to help QA and hallucination review.

This lifecycle covers T0102 only. It must not create the schema or examples during this requirements gate, freeze the contract, mark T0102 complete, or begin T0103 before the user explicitly accepts the presented SourceReference contract.

## Confirmed Functional Requirements

### R-T0102-01 — Draft-first, review-before-freeze lifecycle

After these requirements are explicitly approved, planning and implementation may produce only a clearly labeled `SourceReference v0.1 DRAFT` review package. Requirements approval authorizes planning and draft production; it does **not** accept or freeze the eventual contract.

The Phase 1 contract sequence T0101–T0110 follows the same draft-first rule: each proposed schema and its examples must remain a draft for explicit human review before that task is checked, recorded complete, frozen, or used as authority to begin the next contract task. Silence, implementation completion, dependency-free checks, or an audit result is not contract acceptance.

### R-T0102-02 — Exact conceptual field boundary

The draft may propose rules only for the four conceptual SourceReference fields already named in `PLANNING_CONTRACT.md`:

- `source`
- `page`
- `section`
- `text`

No speculative field may be introduced. In particular, the draft must not add URI/path/hash fields, document or chunk IDs, line/offset coordinates, extraction metadata, confidence scores, model/provider identifiers, timestamps, user/tenant/site identifiers, Moodle identifiers, security labels, context snapshot/projection/fingerprint identifiers, dependency or lineage graphs, retention/audit metadata, or execution/tool fields.

### R-T0102-03 — Minimal provenance semantics

The draft must preserve these conceptual purposes without inventing production behavior:

- `source` identifies the supplied source using a small human-readable identifier.
- `page` locates supporting material by page when page information exists.
- `section` locates supporting material by a human-readable section or heading when available.
- `text` carries a small supporting excerpt when useful for QA.

`PLANNING_CONTRACT.md` states that not every field must be present. The exact required-field combination, locator policy, and value constraints remain material draft decisions listed under Open Questions; they must be proposed with rationale and explicitly reviewed.

### R-T0102-04 — Reusable standalone building block

SourceReference v0.1 must be a standalone, versioned JSON Schema suitable for later composition by the content schemas that need `source_refs`. T0102 must not decide which later fields are required to carry SourceReference arrays, their array cardinality, or plan-type-specific provenance policy; those decisions belong to their owning T0103–T0110 contracts.

The draft must not prematurely define CourseDefinition, SectionPlan, AssignmentPlan, QuizPlan, any question-plan variant, a generic plan-content schema, or any complete `content` payload.

### R-T0102-05 — Preserve the frozen PlanEnvelope boundary

T0103–T0110 specialize or refine the frozen PlanEnvelope `content` according to `plan_type`. T0102 only defines the reusable SourceReference building block for later composition. These tasks do not add root PlanEnvelope fields. Any future root-field change requires a new, explicitly approved PlanEnvelope contract revision.

T0102 only provides the reusable SourceReference building block. It must not modify, republish, wrap, compose into, or otherwise change `packages/contracts/schemas/plan-envelope.v0.1.schema.json`, its seven intended-valid examples, twelve intended-invalid examples, draft review record, freeze record, audit evidence, or other frozen T0101 history. It must not redefine PlanEnvelope `content` or add `source_refs` to the outer envelope.

### R-T0102-06 — Stable plan identity requires no T0102 schema change

Keeping one `plan_id` stable across revisions is a domain/persistence invariant already represented by the frozen PlanEnvelope description and revision examples. JSON Schema validation of an isolated document cannot enforce equality across stored revisions. T0102 requires no PlanEnvelope or SourceReference field to address this invariant, and no schema modification is authorized for it.

### R-T0102-07 — Human-review package

After requirements approval, the T0102 implementation must propose under `packages/contracts`:

1. one versioned SourceReference v0.1 DRAFT JSON Schema;
2. a small intended-valid example set covering the proposed optional/required and locator combinations;
3. a small intended-invalid example set in which each file is syntactically valid JSON and intentionally violates one clearly named proposed rule; and
4. concise review notes that enumerate all files, map every example to its intended result and rule, explain each material contract choice, and call out any unresolved decision.

Exact paths and filenames are planning decisions. The package must remain easy to inspect without executing application code and must not alter frozen T0101 artifacts.

### R-T0102-08 — Draft schema quality

The proposed schema must:

- be valid JSON and explicitly declare the same JSON Schema Draft 2020-12 dialect used by the frozen T0101 contract unless planning identifies a material incompatibility and stops for a user decision;
- have a stable, versioned schema identity suitable for later `$ref` composition;
- remain an object schema with only the four approved conceptual properties;
- document each property's small QA provenance purpose;
- explicitly state required versus optional properties;
- explicitly state allowed types and constraints for every property;
- explicitly state whether an empty object is allowed and whether at least one locator/evidence field is required;
- explicitly state page numbering and page-range behavior;
- explicitly state the policy for unknown properties;
- avoid unresolved references, runtime behavior, and premature references to schemas not yet accepted; and
- remain consistent with every intended-valid and intended-invalid example.

### R-T0102-09 — Dependency-free validation posture before T0111

Ajv selection, installation, compiled validation, runtime validators, validation APIs, and standards-compliant executable schema tests remain deferred to T0111. `TECH_STACK.md` must continue to list Ajv as TBD during T0102.

The T0102 draft must still be checked with dependency-free or already-available mechanisms:

- parse the schema and every example as JSON;
- inspect the schema dialect, identity, property boundary, required set, constraints, and references for structural consistency;
- check each example against the documented proposed rule it is meant to demonstrate; and
- record intended pass/fail outcomes and the limits of these checks accurately.

No T0102 artifact may claim standards-compliant runtime JSON Schema validation.

### R-T0102-10 — Review and completion gates

After the draft package is produced and independently reviewed, work must stop for explicit user contract review. Until the user accepts the proposed SourceReference v0.1 contract:

- the schema remains DRAFT;
- T0102 remains `[ ]` in `task.md`;
- no T0102 completion entry is appended to `soc.md`;
- no canonical/frozen SourceReference schema is declared;
- T0103 does not begin; and
- no downstream task may treat the draft as accepted.

If review requests material changes, revise and re-present the draft with clear version/evidence tracking. A later accepted/frozen artifact must preserve the reviewed validation semantics except for changes explicitly authorized by the user and recorded for final audit.

## Non-Functional Requirements

- **Minimality:** Keep only provenance useful for QA and hallucination review in this POC.
- **Clarity:** Reviewers must understand every field, rule, and example outcome without implementation code.
- **Traceability:** Review notes must link decisions to `PLANNING_CONTRACT.md`, T0102, and the accepted T0101 composition boundary.
- **Composability:** Later accepted content schemas must be able to reference SourceReference without copying or subtly changing it.
- **Provider neutrality:** No LLM, Ollama, OpenAI, MCP, extraction-library, storage, or transport representation may appear.
- **Moodle-light design:** No Moodle database, API, plugin, activity, course, or execution identifier belongs in SourceReference.
- **Previewability:** Values must remain human-readable and useful during plan review.
- **Preservation:** Frozen T0101 product artifacts and historical lifecycle evidence must remain byte-for-byte unchanged.
- **No sensitive fixtures:** Examples must use synthetic content and contain no credentials, personal data, private documents, or real Moodle identifiers.

## Constraints and Exclusions

- This requirements artifact covers only T0102.
- During REQUIREMENTS_APPROVAL, do not create or edit a SourceReference schema, example JSON, review notes, implementation plan, handoff, TypeScript source, test, dependency, package script, generated output, `task.md`, or `soc.md`.
- Do not modify any frozen T0101 schema, example, review, freeze, handoff, audit, requirements, or plan artifact.
- Do not add or alter PlanEnvelope root fields or validation semantics.
- Do not define plan-type `content` schemas or integrate SourceReference into later schemas.
- Do not define T0103 CourseDefinition or any T0104–T0110 contract.
- Do not install or implement Ajv; that belongs to T0111.
- Do not implement TypeScript schema/type alignment or exports; that belongs to T0112.
- Do not implement persistence, cross-revision invariant enforcement, planning, preview, execution, MCP, Moodle plugin/client, or verification behavior.
- Do not add production Context Management, lineage, Context Snapshot/Projection/Fingerprint, RAG/vector retrieval, AuthN/AuthZ, Teacher capability, Five Gates, security classification, retention/compliance, approval signatures, ChangeSets, optimistic concurrency, rollback, or multi-site/tenant concerns.
- Do not edit baseline documents to make a draft choice appear pre-approved. A material conflict must stop for a user decision.

## Assumptions

1. `PLANNING_CONTRACT.md` is authoritative for the conceptual four-field SourceReference scope, but intentionally does not freeze exact required/optional or constraint rules.
2. The user's latest boundary note clarifies composition: T0102–T0110 refine PlanEnvelope `content` by `plan_type`, while SourceReference is only a reusable nested building block.
3. Draft 2020-12 is the compatibility baseline because the accepted T0101 schema uses it; selecting another dialect would be a material contract decision.
4. Examples are human contract-review fixtures, not application fixtures and not proof of Ajv behavior.
5. A page locator may be unavailable for `.txt`, `.md`, and some extracted document inputs, while a section name or excerpt may still provide useful provenance.
6. Stable `plan_id` behavior across revisions will be enforced later by domain/persistence logic; T0102 does not alter either schema for it.
7. User approval of these requirements authorizes planning and production of the T0102 draft only. It does not accept the eventual SourceReference contract.

## Dependencies

- Approved and frozen `packages/contracts/schemas/plan-envelope.v0.1.schema.json` and its recorded open-object `content` composition boundary.
- `PLANNING_CONTRACT.md` section 4 for SourceReference's conceptual shape and small QA purpose.
- T0102's accepted schema will be available for later T0104–T0110 contracts where `source_refs` are conceptually used; each later task owns its own integration rules.
- T0111 will select/install Ajv and provide executable JSON Schema validation.
- T0112 will align accepted schemas with TypeScript.
- Cross-revision `plan_id` enforcement depends on later persistence/domain work, not T0102.

## Acceptance Criteria for the T0102 Draft Stage

The later draft implementation is ready for user contract review only when all of the following are true:

1. One versioned SourceReference v0.1 JSON Schema exists under a draft path in `packages/contracts` and is unmistakably labeled DRAFT.
2. It defines only `source`, `page`, `section`, and `text`, with no speculative provenance, production, provider, Moodle, execution, or persistence fields.
3. It is standalone and reusable for later composition but does not modify or compose into PlanEnvelope or define any plan-specific `content` schema.
4. It explicitly proposes and documents all material choices listed under Open Questions.
5. Intended-valid examples cover the proposed minimum object, supported locator forms/combinations, and any optional fields.
6. Intended-invalid examples each remain valid JSON syntax, isolate one named proposed rule, and cover the critical chosen constraints without claiming Ajv execution.
7. Review notes enumerate every artifact, map every example to its expected result/reason, explain every material choice, and state all validation limitations.
8. Dependency-free checks confirm JSON parsing, expected schema metadata/property boundaries, no unresolved references, and consistency between documented rules and fixtures.
9. Frozen T0101 schema hash remains `2372EBF32A363F4CDDF0929B672CD440F8B4C13C916142766C225B229EDFE571`; all frozen T0101 product artifacts and history remain untouched.
10. No Ajv dependency/runtime validation, TypeScript alignment, later contract, application behavior, `task.md` change, or `soc.md` entry is added.
11. Workflow status requests explicit acceptance of the presented SourceReference contract, and work stops before freeze or T0103.

## Final Acceptance / Freeze Criteria

T0102 may be marked complete and SourceReference v0.1 may be labeled accepted/frozen only after:

1. the user explicitly accepts the presented SourceReference draft contract, not merely these requirements;
2. approval identity, exact message evidence, date, and accepted artifact version are recorded;
3. every requested correction is incorporated exactly and the final candidate still satisfies the draft-stage requirements;
4. an independent final audit confirms the accepted validation semantics, fixture coverage, scope boundaries, and preservation of frozen T0101 artifacts;
5. the reviewed draft is promoted through the approved plan to one canonical frozen schema without leaving a competing live draft;
6. only after those gates, T0102 is changed to `[x]` in `task.md` and one factual completion record is appended to `soc.md`; and
7. lifecycle status records the accepted version, final audit disposition, T0111/T0112 limitations, and next authorization boundary.

Contract acceptance is a prerequisite for T0103. Whether the same user message also authorizes T0103 depends on its explicit wording; acceptance must never be inferred from silence or from completion of T0102 checks.

## Material Open Questions for the Draft Proposal

These questions do not block approval of this requirements artifact. Planning and the proposed draft must answer each one explicitly with concise rationale so the user can accept or revise the contract:

1. **Required fields:** Which of `source`, `page`, `section`, and `text`, if any, are always required while honoring “not every field must be present”?
2. **Source vocabulary:** Is `source` a nonblank free-form identifier, a small frozen vocabulary such as `syllabus`, or another deliberately bounded representation? How should multiple supplied documents be distinguished without adding a new field?
3. **Page indexing:** If `page` is present, is it a one-based positive integer matching human-visible document pages, a zero-based index, or another representation?
4. **Page ranges:** Does v0.1 support only one page per reference, or must it represent a range without introducing speculative root properties? If ranges are excluded, should multiple SourceReference objects represent multi-page support?
5. **Optional locator and excerpt fields:** Are `page`, `section`, and `text` independently optional, and are any combinations invalid or redundant?
6. **At-least-one locator policy:** Beyond any required `source`, must at least one of `page`, `section`, or `text` be present so an object provides actionable evidence? Is `{}` ever valid?
7. **Nonblank strings:** Must every present string contain at least one non-whitespace character? Should v0.1 avoid ungrounded length limits and normalization rules?
8. **Unknown properties:** Should SourceReference reject unknown properties for a small disciplined contract, or allow them for forward compatibility?
9. **Text semantics:** Is `text` strictly a verbatim supporting excerpt, or may it be a normalized/paraphrased evidence note? The answer must remain QA-focused and must not introduce lineage machinery.

## Approval Outcome

T0102 Requirements v0.1 were explicitly approved by the user on 2026-08-31 (Asia/Bangkok) with the exact message `อนุมัติ`.

This approval opens PLANNING and authorizes the later production of the SourceReference v0.1 DRAFT review package only. The eventual contract remains unaccepted and unfrozen until the user explicitly reviews and accepts that draft after implementation and independent audit.
