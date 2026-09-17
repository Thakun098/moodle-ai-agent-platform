# Instructional design alignment and competency derivation

Status: Accepted

Extends ADR-0002. This ADR does not change the ADR-0002 rule that Quiz/Assignment existence is teacher-authorized only after Course Structure review.

## Context

Course Creation currently has strong grounding and lifecycle boundaries, but new review feedback identified a pedagogical-quality gap:

- Quiz/Assignment quality must not depend on Learning Material alone. Activity design must also align to Learning Objectives and Learning Outcomes from the Course Syllabus.
- Activity difficulty and presentation should use the learner/education context from the Syllabus when available.
- Competency candidates should be derived from approved Learning Outcomes and reviewed by the teacher before they become authoritative Moodle competencies.
- The AI role for Course Creation should be an Instructional Designer using Constructive Alignment rather than a generic course-planning assistant.

The current `NormalizedSyllabus v0.1` is not sufficient as the only instructional-design context. It stores `learning_objectives` as one collection and the deterministic normalizer currently recognizes both Learning Objective and Learning Outcome headings into that same collection. It also has no dedicated structured fields for learner level, prerequisites, prior knowledge, delivery mode, learning hours, or approved competency candidates.

The current Activity generator correctly treats Learning Material as factual/content authority when Material exists, but the Activity-generation context does not yet carry section-specific approved Learning Objectives/Outcomes and learner context as first-class alignment inputs.

## Decision

### 1. Keep two AI prompt domains with a strict boundary

The AI role in both domains is `Instructional Designer`.

Prompt Domain 1 — Course / Instructional Design:

- owns Course Structure design;
- analyzes `WHY`, `WHO`, `WHAT`, and learning sequence;
- maps Course Objectives and Learning Outcomes to Sections;
- may propose measurable reformulations of weak source Outcomes without overwriting the source Outcome;
- derives Competency Candidates only from teacher-approved Outcomes;
- must not create Quiz/Assignment or Activity Intents.

Prompt Domain 2 — Activity Design:

- runs only after a teacher explicitly selects a Quiz or Assignment;
- owns `HOW TO PRACTICE` / `HOW TO ASSESS` within the authorized Activity Intent;
- receives only the selected Section's approved Objectives/Outcomes, learner context, Activity Purpose, Learning Material/grounding context, teacher instruction, and deterministic constraints;
- must not create a new Activity type/count, new Learning Outcome, new prerequisite, or new content scope outside the authorized context.

This split is also a token-efficiency decision: each model call receives only the policy and context needed for its stage.

### 2. Introduce one Core Course Design Context with two projections

Do not persist two independent semantic contexts that can drift. Maintain one revisioned Core Course Design Context and project only the necessary fields into Prompt Domain 1 and Prompt Domain 2.

The Core Context must preserve source provenance and distinguish at minimum:

- course identity/description;
- target learner and education-level context;
- prerequisites and prior knowledge when present;
- delivery mode / duration / learning hours when present;
- source Learning Objectives;
- source Learning Outcomes;
- approved/measurable Learning Outcomes;
- schedule/topics;
- assessment/grading requirements when present;
- constraints/policies;
- missing/ambiguous information with stage-specific severity;
- source references.

### 3. Learning Objectives and Learning Outcomes are distinct concepts

They must no longer be treated as one semantic field in the instructional-design layer.

- Learning Objectives are used to evaluate whether the Course design supports the intended course goals.
- Learning Outcomes describe observable learner achievement and are the primary basis for Activity alignment and later Competency derivation.

Source wording must remain traceable. AI must not silently replace a source Outcome.

If a source Outcome is weak or not measurable, AI may return a `recommended_measurable_outcome`, but the source text remains immutable. The recommendation becomes an approved Outcome only after teacher approval/edit.

### 4. Section alignment is produced during Course Structure design

Prompt Domain 1 maps every generated Section to authorized Objective IDs and Outcome IDs.

The system must be able to validate separately:

- Objective coverage by the Course Structure;
- Outcome coverage by Sections;
- later Activity coverage of Outcomes.

The AI must not generate a duplicate prose Alignment Matrix. The application derives matrices/views deterministically from structured mappings.

An approved Outcome with no supporting Section is a Structure-level alignment failure. Normal behavior is to block Structure approval. A teacher may explicitly override when the Outcome is intentionally covered outside the generated Moodle course; the override must remain visible as external/teacher-confirmed coverage rather than being reported as system-proven coverage.

### 5. Learner context is source-backed and optional with explicit acknowledgment

The system must not infer a specific education level, age, academic year, or learner profile as fact when the Syllabus does not provide it.

Teacher-provided learner context is optional. Activity generation may proceed without it only after explicit teacher acknowledgment.

When learner context is unspecified but acknowledged:

- Prompt Domain 2 must be told explicitly not to infer a specific education level;
- difficulty may use only the Syllabus, approved Outcomes, and authorized Material as signals;
- the generated Activity carries a visible `LEARNER_CONTEXT_UNSPECIFIED` warning for teacher review.

### 6. Teacher owns Activity Purpose

Every selected Quiz/Assignment must have exactly one primary Activity Purpose selected by the teacher before generation:

- `PRACTICE`
- `FORMATIVE`
- `SUMMATIVE`

This is a deterministic Activity Intent field, not a separate AI recommendation call.

The same taxonomy applies to both Quiz and Assignment.

Alignment minimums:

- `PRACTICE`: at least one authorized Objective or Outcome;
- `FORMATIVE`: at least one authorized Outcome;
- `SUMMATIVE`: at least one authorized Outcome.

Changing Activity Purpose after generation makes the generated Activity `STALE` and requires regeneration.

### 7. Teacher selects Activity Outcomes

Prompt Domain 1 provides the Section's aligned Outcomes. During Activity creation, the teacher may select which of those Outcomes the Activity should target.

Selecting an Outcome outside the Section alignment requires an explicit teacher override. The override is persisted and visible.

Prompt Domain 2 receives only the selected Section-specific Outcomes rather than every Course Outcome.

### 8. Material remains factual authority; pedagogical elaboration is allowed

ADR-0002 grounding modes remain in force.

For `MATERIAL_GROUNDED` Activities, Learning Material remains factual/content authority. However, Prompt Domain 2 may create pedagogically useful variants such as new names, scenarios, problem framing, and practice contexts when they do not add a new concept, prerequisite, learning outcome, or technical requirement outside the authorized Material + Outcome scope.

Allowed examples include a new business/domain scenario used to test a taught programming concept. Disallowed examples include introducing an untaught framework, pattern, concept, or prerequisite merely to make a question more complex.

Teacher remains the final academic reviewer of whether the generated Quiz/Assignment genuinely measures the intended Outcome.

### 9. Competency derivation uses approved Outcomes only

Competency derivation is part of Prompt Domain 1 but is a separate operation from initial Structure generation:

1. `DESIGN_STRUCTURE` produces Course Structure, Objective/Outcome mappings, and measurable Outcome proposals.
2. Teacher approves/edits Outcomes.
3. `DERIVE_COMPETENCIES` receives approved Outcomes only and proposes Competency Candidates.

Competency mapping is many-to-many:

- one Outcome may support multiple Competencies;
- one Competency may derive from multiple Outcomes.

A Competency Candidate is not authoritative until teacher approval.

Teacher may edit a candidate. If the edited Competency no longer aligns to an approved Outcome, mark it `UNALIGNED` and require explicit teacher override before approval.

Course Structure approval and Competency approval are separate. Course Creation must not be blocked merely because Competency review is deferred.

Approved Competencies remain planning state until Course Execute. They are not created in Moodle during Design/Preview.

### 10. Activity-to-Competency mapping is proposed deterministically but teacher-confirmed

The application may derive a mapping candidate from shared Outcome IDs:

`Activity -> aligned Outcome(s) -> approved Competency derived from those Outcome(s)`.

The mapping must not become authoritative automatically. Teacher confirmation is required.

`Activity Alignment != Competency Evidence`.

Even a Summative Activity aligned to a Competency does not automatically become evidence used for Competency evaluation/Risk. Teacher must separately confirm which aligned Activities are valid Competency Evidence.

Only approved mappings/evidence may feed the Moodle-native Competency path and later deterministic Risk processing.

### 11. Quality assurance has three layers

Deterministic validation checks structural/authority invariants, including:

- aligned IDs exist;
- selected Outcomes are authorized for the Section or have an explicit override;
- required Purpose is present;
- source provenance is valid;
- question count/type/choice constraints are valid;
- no unauthorized Objective/Outcome IDs are introduced.

Prompt Domain 2 performs one internal self-review within the same generation call before returning final output. It reports structured `PASS` / `WARN` checks rather than numerical quality scores. Checks include at minimum:

- Outcome alignment;
- learner-level fit;
- scope compliance;
- Activity Purpose fit.

The AI must revise internally before returning output when possible. Do not expose chain-of-thought.

Teacher provides final academic judgment and approval.

A model self-review warning remains teacher-visible. A deterministic validation failure rejects the generation result and follows the existing bounded retry policy; no unlimited hidden retries are introduced.

### 12. Versioning, staleness, and provenance are first-class

Changing inputs invalidates only dependent artifacts:

- approved Outcome changes -> Alignment Mapping becomes `STALE`; Course Structure content need not be regenerated automatically;
- Competency changes -> Activity remains valid, but Competency mapping/evidence mapping becomes `STALE`;
- Material Snapshot changes -> only Activities grounded on that Material become `STALE`;
- Activity Purpose changes -> Activity becomes `STALE`;
- Activity generation instruction changes -> Activity becomes `STALE`;
- teacher edits generated Activity -> provenance becomes `TEACHER_EDITED`; rerun deterministic validation, but do not force another AI review call.

Activity generation instruction is part of versioned Activity Intent state. It must be persisted before generation, not only after successful model completion. The generation snapshot references the exact Activity Intent revision used.

Persist prompt/policy versions and generation metadata sufficient for audit, including at minimum:

- instructional-design policy version;
- Structure prompt version;
- Activity prompt version;
- provider/model identity;
- generation timestamp;
- immutable/revision references for the Course Design Context, approved Outcomes, Section, Material Snapshot, and Activity Intent.

Prefer immutable references/revision IDs over duplicating full context JSON when the referenced state is reconstructable.

### 13. Missing information uses stage-specific severity

Missing information is not globally blocking. Classify it as:

- `INFO`
- `WARNING`
- `REQUIRES_CONFIRMATION`
- `BLOCKING`

Severity depends on the stage. Example defaults:

- learner level missing -> `REQUIRES_CONFIRMATION` before Activity generation;
- prerequisites missing -> usually `WARNING` unless a policy requires them;
- source Learning Outcomes missing -> blocks Competency derivation and may block Outcome-based assessment generation, but does not necessarily block Structure creation.

This preserves a flexible POC workflow while keeping every override/unknown explicit.

## Consequences

- `NormalizedSyllabus v0.1` remains a source-ingestion contract for now; the richer instructional-design semantic layer is introduced separately rather than silently changing the meaning of existing fields.
- The current syllabus normalizer will eventually need a way to distinguish Objective and Outcome evidence for the new Core Context.
- Course Structure and Activity generation prompts become smaller and stage-specific.
- Existing ADR-0002 teacher authorization, source fallback, review acknowledgment, and bounded retry rules remain valid.
- Activity-generation persistence must be extended so Purpose, selected Outcome IDs, learner-context acknowledgment, generation instruction revision, quality review, and generation references survive reloads/retries.
- Existing Material replacement staleness remains scoped to dependent Activities.
- Competency authority stays with the teacher/Moodle path rather than the LLM.
- Risk remains deterministic and must not treat unapproved AI-derived Competency candidates or unconfirmed Activity evidence as learner-risk evidence.

## Explicitly not decided/implemented by this ADR

- exact database schema/migration layout;
- exact UI visual design;
- exact Bloom taxonomy representation/version;
- production queue/background orchestration;
- automatic scoring of pedagogical quality;
- automatic competency approval;
- automatic competency-evidence approval;
- Career Path design.

Detailed draft contracts are maintained separately in:

- `docs/plans/instructional-design-context-v0.1.md`
- `docs/plans/instructional-design-prompt-contracts-v0.1.md`
