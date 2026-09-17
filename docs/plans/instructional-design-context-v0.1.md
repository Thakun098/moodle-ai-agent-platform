# Instructional Design Context v0.1 — Draft Contract

Status: Draft design contract, not implemented
Source decisions: Grill Q1–Q45 and ADR-0003

## 1. Purpose

Define the revisioned Core Course Design Context that sits between syllabus ingestion and the two Instructional Designer prompt domains.

The Core Context is the semantic source of truth for instructional-design decisions. Prompt-specific views are projections of this context, not independent copies.

## 2. Design goals

The context must:

- preserve source provenance;
- distinguish Learning Objectives from Learning Outcomes;
- distinguish source Outcomes from teacher-approved measurable Outcomes;
- represent learner context without inventing facts;
- represent missing/ambiguous information explicitly;
- support Section/Objectives/Outcomes alignment;
- support Competency derivation only from approved Outcomes;
- support revision references for reproducible Activity generation;
- remain separate from the frozen CoursePlan v0.1 contract.

## 3. Suggested logical shape

```text
InstructionalDesignProfile v0.1
├─ schema_version
├─ revision
├─ source_syllabus
├─ course
├─ learner_context
├─ learning_objectives[]
├─ source_learning_outcomes[]
├─ approved_learning_outcomes[]
├─ schedule_or_topics[]
├─ assessment_requirements[]
├─ grading_policy
├─ constraints[]
├─ missing_information[]
└─ provenance
```

## 4. Suggested fields

### 4.1 Identity

```text
schema_version: "0.1"
revision: positive integer
run_id: UUID/reference
```

### 4.2 Source syllabus

```text
source_syllabus:
  normalized_syllabus_version: "0.1"
  filename
  sha256
```

Do not duplicate the complete raw syllabus when the immutable source can be referenced. Prompt views may include bounded source excerpts when needed for grounding/provenance.

### 4.3 Course

```text
course:
  title?
  code?
  description?
  duration?
  learning_hours?
  delivery_mode?
```

Every extracted fact should carry provenance when practical.

### 4.4 Learner context

```text
learner_context:
  status: PROVIDED_BY_SYLLABUS | PROVIDED_BY_TEACHER | UNSPECIFIED
  target_learners?: string
  education_level?: string
  year_level?: string
  prerequisites: string[]
  prior_knowledge: string[]
  teacher_acknowledged_unspecified: boolean
  source_refs: SourceReference[]
```

Rules:

- never infer a specific learner level as fact;
- teacher-provided context is explicitly marked as teacher-provided;
- if `UNSPECIFIED`, Activity generation requires teacher acknowledgment before proceeding;
- prompts must not convert `UNSPECIFIED` into an inferred age/degree/year.

### 4.5 Learning Objectives

```text
learning_objectives[]:
  objective_id
  source_text
  source_refs[]
  status: SOURCE
```

Learning Objectives are source-derived course-design goals. They are used mainly for Course-level coverage/alignment.

### 4.6 Source Learning Outcomes

```text
source_learning_outcomes[]:
  source_outcome_id
  source_text
  source_refs[]
  measurable_status: MEASURABLE | WEAK_OR_AMBIGUOUS
  recommended_measurable_outcome?: string
  recommendation_rationale?: string
  review_required: boolean
```

Rules:

- preserve source text exactly enough to retain meaning;
- AI recommendations never overwrite the source text;
- no recommended Outcome becomes authoritative until teacher approval/edit.

### 4.7 Approved Learning Outcomes

```text
approved_learning_outcomes[]:
  outcome_id
  text
  source_outcome_ids[]
  approval_origin: SOURCE_AS_IS | TEACHER_APPROVED_AI_PROPOSAL | TEACHER_EDITED
  source_refs[]
  approved_at?
  approved_by_teacher: boolean
  revision
```

This is the authoritative Outcome set used downstream for:

- Section alignment;
- Activity Outcome selection;
- Competency derivation;
- later Competency mapping/evidence proposals.

### 4.8 Schedule / topics

Reuse the syllabus schedule semantics but preserve stable Section-scoping identifiers/reference links so Prompt Domain 1 can align each generated Section to Objective/Outcome IDs.

### 4.9 Assessment requirements

Suggested shape:

```text
assessment_requirements[]:
  requirement_id
  text
  importance: REQUIRED | RECOMMENDED | UNCLEAR
  source_refs[]
```

This represents syllabus assessment policy/context. It does not itself authorize creation of a Quiz/Assignment; ADR-0002 teacher authorization still applies.

### 4.10 Grading policy

Optional structured representation of source grading/threshold requirements when extractable. If unknown, preserve the source text/reference without inventing numeric policy.

### 4.11 Constraints / policies

```text
constraints[]:
  constraint_id
  type
  text
  source_refs[]
  importance
```

Examples: required hours, mandatory tools, attendance/policy constraints, delivery-mode limits.

### 4.12 Missing information

```text
missing_information[]:
  code
  field
  message
  severity: INFO | WARNING | REQUIRES_CONFIRMATION | BLOCKING
  applies_to_stage[]
  resolution?: TEACHER_PROVIDED | TEACHER_OVERRIDE | SOURCE_UPDATE
```

Severity is stage-specific.

Example defaults:

```text
education_level missing
→ Structure: WARNING
→ Activity generation: REQUIRES_CONFIRMATION

prerequisites missing
→ usually WARNING

Learning Outcomes missing
→ Course Structure: may continue with warning
→ Outcome-based Activity generation: BLOCKING unless teacher supplies/approves Outcomes
→ Competency derivation: BLOCKING
```

## 5. Course Structure alignment data

Prompt Domain 1 returns structured alignment fields on each generated Section:

```text
section:
  ref
  position
  title
  summary
  aligned_objective_ids[]
  aligned_outcome_ids[]
  source_refs[]
```

The application derives coverage matrices deterministically from these mappings. Do not ask the model to generate a duplicate Alignment Matrix table.

## 6. Outcome coverage state

Recommended derived states:

```text
COVERED_BY_SECTION
EXTERNAL_TEACHER_CONFIRMED
UNCOVERED
STALE_ALIGNMENT
```

An approved Outcome that has no aligned Section blocks normal Structure approval unless a teacher records an explicit external-coverage override.

The UI/report must distinguish `EXTERNAL_TEACHER_CONFIRMED` from system-proven coverage.

## 7. Competency Candidate contract

Competency candidates are derived only after Outcomes are approved.

Suggested shape:

```text
competency_candidate:
  candidate_id
  name
  description
  derived_from_outcome_ids[]
  rationale
  source_refs[]
  status: PROPOSED | APPROVED | REJECTED | DEFERRED | UNALIGNED
  teacher_override?:
    acknowledged: boolean
    reason?: string
```

Rules:

- mapping is many-to-many;
- Candidate cannot be automatically authoritative;
- teacher can edit Candidate content;
- edited Candidate with no aligned approved Outcome becomes `UNALIGNED`;
- `UNALIGNED` requires explicit override before approval;
- Course Structure approval is independent of Competency approval;
- approved Competencies remain planning state until Course Execute.

## 8. Activity Intent alignment fields

The Activity Intent needs to evolve beyond current selection/options.

Suggested logical fields:

```text
activity_intent:
  activity_ref
  activity_type: quiz | assignment
  purpose: PRACTICE | FORMATIVE | SUMMATIVE
  selected_objective_ids[]
  selected_outcome_ids[]
  learner_context_revision
  generation_instruction
  revision
  outcome_override?:
    acknowledged: boolean
    reason?: string
```

Alignment rules:

```text
PRACTICE
→ >= 1 Objective or Outcome

FORMATIVE
→ >= 1 Outcome

SUMMATIVE
→ >= 1 Outcome
```

Selecting an Outcome not aligned to the Section requires teacher override.

## 9. Activity generation references

Each generation result should reference the immutable inputs used:

```text
generation_context_refs:
  course_design_context_revision
  section_revision
  approved_outcome_revision(s)
  learner_context_revision
  activity_intent_revision
  material_snapshot_id?  # only when applicable
```

Also persist:

```text
instructional_design_policy_version
structure_prompt_version
activity_prompt_version
provider
model
generated_at
```

Prefer references/revision IDs over copying complete context JSON when immutable state can be reconstructed.

## 10. Staleness rules

Dependency-oriented invalidation:

```text
Approved Outcome changes
→ Section alignment mapping STALE
→ Course Structure prose/content not automatically stale

Competency changes
→ Activity remains valid
→ Competency mapping/evidence mapping STALE

Material Snapshot changes
→ MATERIAL_GROUNDED dependent Activities STALE only

Activity Purpose changes
→ Activity STALE

Selected Outcome set changes
→ Activity STALE

Generation Instruction changes
→ Activity STALE

Learner Context changes materially
→ dependent Activities STALE
```

The last learner-context dependency should be implemented using revision references rather than heuristic text comparison.

## 11. Teacher-edited Activity provenance

Recommended metadata:

```text
origin: AI_GENERATED | DETERMINISTIC_SHELL | TEACHER_AUTHORED
current_state: GENERATED | TEACHER_EDITED
source_generation_revision?
teacher_edit_revision?
```

Teacher edits do not automatically trigger another model review call. They must rerun deterministic validation before Approval.

## 12. Competency mapping and evidence

Two separate teacher-confirmed concepts:

```text
Activity Outcome alignment
→ deterministic Competency Mapping Candidate
→ Teacher confirms Activity ↔ Competency Mapping

Confirmed Activity ↔ Competency
→ Potential Competency Evidence
→ Teacher confirms evidence eligibility
```

Do not infer:

`Aligned Activity == Competency Evidence`.

Only teacher-confirmed evidence may later enter Moodle-native Competency evaluation/Risk pipelines.

## 13. Prompt projections

### Course Design View

Contains only data needed by Prompt Domain 1, including:

- course facts;
- learner context;
- Objectives;
- source/approved Outcomes as appropriate to the operation;
- schedule/topics;
- source assessment requirements/constraints;
- bounded source evidence.

### Activity Design View

Contains only data needed by Prompt Domain 2 for one selected Activity:

- selected Section;
- authorized Objective/Outcome IDs for that Activity;
- learner context;
- Activity Purpose;
- deterministic Activity options/constraints;
- teacher generation instruction;
- resolved grounding context/Material;
- allowed source references;
- relevant warnings/overrides.

Do not send all Course Outcomes or unrelated Sections by default.

## 14. Compatibility notes

- Keep `NormalizedSyllabus v0.1` intact initially. Build this richer semantic layer above it.
- A future ingestion/normalization revision is required to distinguish source Objective vs Outcome evidence instead of merging both headings into `learning_objectives`.
- Do not reopen frozen CoursePlan v0.1 merely to store instructional-design metadata. Use internal persisted state/sidecar metadata until a deliberate contract revision is approved.

## 15. Open implementation details

This draft intentionally does not freeze:

- exact SQL table boundaries;
- exact REST endpoint names;
- exact source-reference representation beyond compatibility with current contracts;
- exact Bloom taxonomy enum/version;
- exact UI component layout.
