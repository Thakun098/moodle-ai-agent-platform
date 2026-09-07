# Phase 1 T0101 Requirements — PlanEnvelope v0.1 Draft

- **Version:** 0.1
- **Status:** approved
- **Lifecycle:** Phase 1 / T0101 only
- **Owner role:** Sol
- **Approval identity:** User
- **Approval evidence:** User message on 2026-08-31: `Approved. T0101 Requirements v0.1 are accepted. Proceed with planning and produce the PlanEnvelope v0.1 DRAFT for review. Do not freeze T0101 or proceed to T0102 until I explicitly approve the proposed contract.`
- **Source of truth:** `AGENTS.md`, `POC_BASELINE.md`, `Implementation.md`, `PLANNING_CONTRACT.md`, `TECH_STACK.md`, `task.md`, `soc.md`, current `packages/contracts` scaffold, and the user's latest T0101 instruction

## Objective

Define the requirements for producing a human-reviewable **DRAFT** of the PlanEnvelope v0.1 JSON Schema and a small set of syntactically valid JSON examples that demonstrate accepted and rejected envelope shapes. This lifecycle covers T0101 only. It must not freeze the contract, mark T0101 complete, or begin T0102 until the user reviews and explicitly accepts the proposed contract.

## Confirmed Functional Requirements

### R-T0101-01 — Draft deliverable only

The eventual T0101 implementation must produce a clearly labeled `PlanEnvelope v0.1 DRAFT`, not an approved or frozen contract. The schema, examples, review notes, task checkbox, and SOC record must not imply acceptance before explicit user review.

### R-T0101-02 — PlanEnvelope fields are limited to the baseline

The proposed envelope may define only the common fields already named by `PLANNING_CONTRACT.md` and `task.md`:

- `schema_version`
- `plan_id`
- `revision`
- `plan_type`
- `operation`
- `title`
- `summary`
- `warnings`
- `assumptions`
- `content`

No speculative envelope field may be introduced. In particular, the draft must not add timestamps, actor/user identity, approval/signature state, tenant/site identifiers, provider/model metadata, execution state, Moodle identifiers, category identifiers, shortnames, persistence metadata, security policy, audit classification, context lineage, dependency manifests, concurrency tokens, rollback data, or transport/tool fields.

### R-T0101-03 — Follow the planning-contract semantics

The proposed schema must preserve the existing conceptual semantics:

- `schema_version` identifies contract version 0.1.
- `plan_id` is the stable identity shared by revisions of the same plan.
- `revision` identifies a particular revision and must support the rule that revisions are not silently overwritten.
- `plan_type` distinguishes `course`, `assignment`, and `quiz` plans.
- `operation` distinguishes `create` and `update` intent.
- `title` is the human-readable preview title.
- `summary` is a concise explanation of intended change.
- `warnings` exposes planner-detected uncertainty or problems.
- `assumptions` exposes assumptions made by the planner.
- `content` is the plan-specific payload and must remain composable with the downstream schemas defined by T0102–T0110.

The draft must remain declarative, provider-neutral, Moodle-light, previewable, revisioned, schema-validatable, and reusable across create/update workflows. It describes desired state and intent; it does not describe how an Executor, MCP server, or Moodle adapter performs work.

### R-T0101-04 — Human-review package

After requirements approval, T0101 implementation must propose:

1. one JSON Schema document for PlanEnvelope v0.1;
2. valid example documents covering the supported envelope discriminants sufficiently for human review;
3. invalid example documents, each syntactically valid JSON but intentionally violating one clearly named schema rule;
4. concise review notes mapping each example to the rule it demonstrates and calling out every material schema decision still requiring user acceptance.

The exact repository paths and file names are planning decisions, but all artifacts must live under the `packages/contracts` boundary and be easy to inspect without executing application code.

### R-T0101-05 — Draft schema quality

The proposed schema must:

- be valid JSON;
- declare its JSON Schema dialect explicitly;
- have a stable, versioned schema identity/name suitable for later composition;
- document each field's purpose without encoding downstream business behavior;
- make required versus optional fields explicit;
- make scalar/array/object types and allowed enum/constant values explicit;
- state its policy for unknown envelope properties explicitly;
- state how plan-specific `content` is represented before T0102–T0110 exist, without attempting to define those downstream payloads;
- avoid circular or unresolved references to schemas that have not yet been created;
- remain structurally consistent with every provided valid/invalid example.

### R-T0101-06 — Example coverage

At minimum, the proposed examples must make the following reviewable:

- schema version behavior;
- stable plan identity format;
- positive revision constraint;
- all supported `plan_type` values;
- both supported `operation` values;
- title and summary constraints;
- warnings and assumptions item shape;
- plan-specific `content` placeholder/composition behavior;
- unknown-property behavior.

Examples must not contain real user data, credentials, real Moodle IDs, or fields that imply an unapproved downstream contract. Invalid-contract examples must remain syntactically valid JSON so failure is attributable to the proposed schema rule rather than JSON parsing.

### R-T0101-07 — Validation posture before T0111

Ajv selection, dependency installation, compiled validation, runtime validators, validation APIs, and automated Ajv tests are deferred to T0111. `TECH_STACK.md` correctly leaves Ajv as TBD and must not be changed by T0101.

T0101 must nevertheless make the draft checkable now through dependency-free or already-available mechanisms:

- parse the schema and every example as JSON;
- inspect schema identity/dialect and internal references for obvious structural consistency;
- review examples against the documented draft rules;
- record which examples are intended to pass or fail and why.

No claim of standards-compliant runtime validation may be made until T0111 provides the approved validator infrastructure.

### R-T0101-08 — Approval and completion gate

After the draft schema and examples are produced, the lifecycle must stop for explicit user contract review. Until the user accepts the proposed PlanEnvelope v0.1 contract:

- T0101 remains `[ ]` in `task.md`;
- no completion entry for T0101 is appended to `soc.md`;
- the schema remains DRAFT;
- T0102 does not begin;
- no downstream task may treat the draft as frozen.

If review requests material contract changes, revise and re-present the draft with a new artifact version or clearly recorded revision before acceptance.

## Non-Functional Requirements

- **Clarity:** A reviewer must be able to understand every field, rule, and invalid-example reason without reading implementation code.
- **Minimality:** Encode only constraints supported by the existing baseline or explicitly presented for user decision; do not future-proof with speculative fields.
- **Traceability:** Review notes must map schema rules to `PLANNING_CONTRACT.md` and T0101 without claiming later tasks are implemented.
- **Composability:** The envelope must be able to wrap future Course, Assignment, and Quiz content without defining them prematurely.
- **Determinism:** Equivalent inputs must be judged consistently once T0111 supplies validation infrastructure.
- **Provider neutrality:** No Ollama-, OpenAI-, MCP-, or model-specific representation may appear in the envelope.
- **Moodle-light boundary:** No Moodle API payload, DB field, generated shortname, category selection, or pre-execution Moodle ID belongs in this common envelope.
- **Security/data minimization:** No secrets, personal data, production security metadata, or unnecessary operational metadata may appear in examples or schema fields.
- **Repository preservation:** Preserve all Phase 0 implementation and lifecycle artifacts, including its audit history and COMPLETE status evidence.

## Constraints and Out of Scope

- This lifecycle covers only T0101.
- Do not create or edit a JSON Schema, example JSON, review notes, implementation plan, TypeScript source, test, dependency, package script, or generated output during requirements approval.
- Do not proceed to T0102 SourceReference or define any SourceReference fields.
- Do not define CourseDefinition, SectionPlan, AssignmentPlan, QuizPlan, question-plan, ExecutionRequest, or VerificationResult payloads.
- Do not implement Ajv or choose its version; that belongs to T0111.
- Do not implement TypeScript schema/type alignment; that belongs to T0112.
- Do not implement planning, persistence, preview, execution, MCP, Moodle plugin/client, or verification behavior.
- Do not add production Context Management, Context Snapshot/Projection/Fingerprint, dependency manifests, approval signatures, AuthN/AuthZ, Teacher capability, Five Gates, audit classifications, retention, ChangeSets, optimistic concurrency, rollback, RAG, or vector retrieval.
- Do not change frozen Phase 0 decisions, `TECH_STACK.md`, `PLANNING_CONTRACT.md`, or other baseline documents as part of this requirements gate.
- Do not modify `task.md` or `soc.md` before the later explicit contract-acceptance gate is met.

## Assumptions

1. The conceptual PlanEnvelope in `PLANNING_CONTRACT.md` is authoritative for scope, but its exact required/optional and constraint rules are intentionally not yet frozen.
2. `content` must exist at the envelope boundary because it is part of the conceptual hierarchy, while its plan-specific shape remains owned by later tasks.
3. `course`, `assignment`, and `quiz` are the only supported `plan_type` values in v0.1; `create` and `update` are the only supported operations.
4. Examples are contract-review fixtures, not application test data or proof of Ajv behavior.
5. The existing `packages/contracts/src/index.ts` remains `export {};` during a schema-only T0101 draft unless a later approved implementation plan provides a necessary, non-speculative reason to change it.
6. The Phase 0 toolchain is available, but T0101 should not need new runtime dependencies for JSON syntax checks.
7. User acceptance of these requirements authorizes planning and production of a draft; it does not itself accept or freeze the eventual PlanEnvelope contract.

## Dependencies

- Approved/frozen conceptual guidance in `PLANNING_CONTRACT.md`.
- T0101 task definition in `task.md`.
- Existing `packages/contracts` workspace scaffold from Phase 0.
- JSON Schema specification/dialect choice to be proposed and justified during planning.
- T0102–T0110 will later define content-related schemas that compose with the envelope.
- T0111 will select/install Ajv and provide executable schema validation.
- T0112 will align TypeScript types with accepted schemas.

## Acceptance Criteria for the T0101 Draft Stage

The later draft implementation is ready for user contract review only when all of the following are true:

1. A versioned PlanEnvelope v0.1 JSON Schema exists under `packages/contracts` and is labeled DRAFT.
2. The schema contains only the ten approved baseline fields and defines no speculative production, provider, execution, MCP, or Moodle field.
3. The schema explicitly defines version, ID, revision, discriminants, preview text, warnings/assumptions, and content-boundary behavior.
4. The schema follows the declarative/provider-neutral/Moodle-light principles and contains no downstream implementation behavior.
5. Valid examples collectively cover every supported `plan_type` and both operations without requiring downstream payload schemas.
6. Invalid examples each target one named rule, remain valid JSON syntax, and cover the critical constraints listed in R-T0101-06.
7. Review notes enumerate every file, every example's expected result/reason, and the draft decisions for the open questions below.
8. The schema and every example parse as JSON using an already-available tool; results are recorded factually.
9. Structural review confirms no missing local file/reference and consistency between draft rules and examples; no Ajv validation is claimed.
10. No dependency, package script, TypeScript behavior, T0102+ contract, or unrelated file is added or changed.
11. T0101 remains unchecked, no completion SOC entry is written, and workflow status requests explicit user acceptance of the contract.
12. Work stops after presenting the draft. T0102 does not begin.

## Final Acceptance / Freeze Criteria

T0101 may be marked complete and the PlanEnvelope v0.1 contract may be labeled accepted/frozen only after:

1. the user explicitly accepts the presented draft contract (not merely these requirements);
2. approval identity, message evidence, date, and accepted artifact version are recorded;
3. any requested changes are incorporated and the final files still satisfy the draft-stage criteria;
4. `task.md` is then updated to `[x]` for T0101 and a factual T0101 completion entry is appended to `soc.md`;
5. lifecycle artifacts identify the accepted contract version and any validation limitation pending T0111.

Acceptance of T0101 must not automatically authorize or start T0102.

## Material Open Questions for the Draft Proposal

These questions do not block approval of this requirements artifact. The proposed schema must answer them explicitly with a concise rationale so the user can accept or revise the contract:

1. **JSON Schema dialect:** Which published dialect should v0.1 declare for later Ajv compatibility?
2. **Plan identity constraint:** Must `plan_id` use strict UUID syntax, and if so which accepted UUID versions, or is a non-empty stable string sufficient for the POC?
3. **Unknown envelope properties:** Should the envelope reject unknown properties by default for contract discipline, or allow them for forward compatibility?
4. **Required fields:** Are all ten baseline fields required, or may `summary`, `warnings`, `assumptions`, or `content` be omitted under defined circumstances?
5. **Text/array constraints:** What minimum-length/blank-string rules apply to `title`, `summary`, warnings, and assumptions, and are warning/assumption entries plain strings in v0.1?
6. **Content boundary:** Should T0101 constrain `content` only as an object placeholder, use a deliberately permissive schema hook for future composition, or use another non-speculative composition pattern?
7. **Cross-field combinations:** Should v0.1 allow every `plan_type` × `operation` combination at the envelope layer, leaving domain restrictions to later plan schemas, or reject any combinations now?

If resolving any question would add a new field, change a frozen architecture decision, or encode downstream behavior, stop and reopen requirements instead of assuming permission.
