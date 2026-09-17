# Instructional Design Prompt Contracts v0.1 — Draft

Status: Draft design contract, not implemented
Source decisions: Grill Q1–Q45, ADR-0003, Instructional Design Context v0.1

## 1. Purpose

Define two prompt domains for Course Creation using one Instructional Designer role with stage-specific responsibilities and bounded context.

The goal is to reduce token usage, preserve architecture boundaries, and make pedagogical alignment testable instead of relying on a single monolithic prompt.

## 2. Shared role policy

Shared role identity:

`Instructional Designer` specializing in Constructive Alignment, course sequencing, learning assessment, and Moodle-oriented course design.

Shared authority rules:

- Syllabus/Core Course Design Context is authority for learner context, Objectives, Outcomes, course scope, schedule/topics, assessment requirements, and constraints.
- Learning Material is factual/content authority when the grounding mode is `MATERIAL_GROUNDED`.
- Teacher Activity Intent is authority for whether an Activity exists, Activity type, Purpose, selected Outcomes, and deterministic options.
- AI must not silently invent learner level, prerequisites, Learning Outcomes, Competencies, Activity count/type, or new assessment scope.
- AI may propose improvements/candidates only where this contract explicitly permits it.
- Teacher is final academic authority.

## 3. Prompt Domain 1 — Course / Instructional Design

Prompt Domain 1 has two operations under the same System Prompt family.

### 3.1 Operation A: `DESIGN_STRUCTURE`

Purpose:

- design Course Structure only;
- map Objectives/Outcomes to Sections;
- identify weak/non-measurable source Outcomes and propose measurable alternatives;
- identify missing/ambiguous instructional-design information;
- do not create Quiz/Assignment or Activity Intents.

Input projection:

```text
CourseDesignView
├─ course facts
├─ learner context
├─ learning objectives
├─ source learning outcomes
├─ schedule/topics
├─ assessment requirements
├─ grading/policy constraints
├─ missing-information state
└─ bounded source evidence + source refs
```

Required thinking policy:

- preserve syllabus scope;
- use Constructive Alignment at Course Structure level;
- sequence Sections so prerequisites/foundations precede dependent content when supported by source evidence;
- retain explicit source wording when rewriting would alter meaning;
- classify weak source Outcomes without overwriting them;
- map every Section to authorized Objective/Outcome IDs only;
- do not propose or materialize Quiz/Assignment existence;
- do not generate a prose Alignment Matrix;
- report gaps/uncertainty instead of guessing.

Suggested output contract:

```text
CourseStructureDesign
├─ course
├─ sections[]
│  ├─ ref
│  ├─ position
│  ├─ title
│  ├─ summary
│  ├─ aligned_objective_ids[]
│  ├─ aligned_outcome_ids[]
│  └─ source_refs[]
├─ measurable_outcome_proposals[]
│  ├─ source_outcome_id
│  ├─ recommended_measurable_outcome
│  ├─ rationale
│  └─ review_required: true
├─ warnings[]
└─ missing_information[]
```

Forbidden output:

- Quiz;
- Assignment;
- Activity Intent;
- Question items;
- Competency Candidate before Outcome approval;
- new source Outcome presented as if it came from Syllabus;
- duplicate Alignment Matrix table/prose.

### 3.2 Operation B: `DERIVE_COMPETENCIES`

Precondition:

- teacher-approved Outcomes exist.

Purpose:

- derive Competency Candidates from approved Outcomes only;
- support many-to-many Outcome ↔ Competency relationships;
- propose rationale and traceability for teacher review.

Input projection:

```text
CompetencyDerivationView
├─ approved learning outcomes only
├─ relevant objective relationships
├─ course context
├─ learner context if useful
└─ source refs
```

Required output:

```text
competency_candidates[]
├─ candidate_id
├─ name
├─ description
├─ derived_from_outcome_ids[]
├─ rationale
├─ source_refs[]
└─ status: PROPOSED
```

Rules:

- never auto-approve a Competency;
- do not create Moodle competency entities;
- do not derive from unapproved measurable Outcome proposals;
- do not claim a Candidate is learner evidence;
- teacher edit is allowed after generation;
- edited unaligned Candidate must be marked/validated as `UNALIGNED` by application logic and require override before approval.

## 4. Prompt Domain 2 — Activity Design

Runs only for one explicit Teacher-Authorized Activity Intent at a time.

### 4.1 Preconditions

The application must resolve before the model call:

- selected Activity type (`quiz` or `assignment`);
- Activity Purpose (`PRACTICE`, `FORMATIVE`, `SUMMATIVE`);
- selected authorized Objective/Outcome IDs;
- Section identity;
- learner-context state/acknowledgment;
- grounding mode and bounded factual context;
- deterministic question/grade/options constraints;
- teacher generation instruction revision.

If deterministic evidence is insufficient, preserve ADR-0002 behavior and do not call the model.

### 4.2 Input projection

```text
ActivityDesignView
├─ section
├─ selected_objectives[]
├─ selected_outcomes[]
├─ learner_context
├─ activity_intent
│  ├─ type
│  ├─ purpose
│  ├─ deterministic options
│  └─ teacher generation instruction
├─ grounding
│  ├─ mode
│  ├─ authorized factual text
│  └─ allowed source_refs
└─ policy warnings/overrides
```

Do not send unrelated Sections or all Course Outcomes by default.

### 4.3 Activity Purpose behavior

`PRACTICE`

- optimize for rehearsal, feedback, reinforcement, and safe learning attempts;
- requires at least one Objective or Outcome;
- must not be treated as competency evidence automatically.

`FORMATIVE`

- optimize for evidence that helps teacher/learner identify progress or misconceptions;
- requires at least one Outcome.

`SUMMATIVE`

- optimize for defensible measurement of selected Outcome(s);
- requires at least one Outcome;
- stronger emphasis on coverage, cognitive demand, grading clarity, and validity;
- still does not automatically become Competency Evidence.

### 4.4 Grounding behavior

`MATERIAL_GROUNDED`

- Material is factual authority;
- new pedagogical scenarios/variants are allowed when they do not add new knowledge requirements outside Material + selected Outcomes.

`SYLLABUS_GROUNDED`

- supplied syllabus evidence is factual authority.

`SYLLABUS_SCOPED_AI`

- model may elaborate only inside syllabus-defined scope;
- output remains Teacher Review Required under ADR-0002.

`INSUFFICIENT_EVIDENCE`

- model is not called.

### 4.5 Pedagogical elaboration policy

Allowed:

- new names/personas;
- new scenario framing;
- alternative examples;
- variant question wording;
- new practice contexts that require only already-authorized concepts.

Not allowed:

- a new concept not present in authorized scope;
- a new prerequisite skill;
- a new Learning Outcome;
- an untaught framework/tool/pattern;
- a technical requirement introduced solely to make the question harder.

### 4.6 Quiz output expectations

Quiz output must satisfy deterministic options exactly after normalization/validation.

Each question should be attributable to at least one selected Outcome/Objectives mapping as supported by the eventual output contract. For the first implementation, if question-level Outcome IDs are introduced, they must come only from the Activity's selected authorized IDs.

The model must not select the Activity Purpose; Purpose is teacher-provided input.

### 4.7 Assignment output expectations

Assignment must provide contract-required fields and must use authorized Outcomes/Objectives rather than inventing `learning_objectives` from description/teacher prompt fallback.

The current legacy fallback where missing Assignment `learning_objectives` can be filled from generation instruction/description should be retired when this contract is implemented.

### 4.8 Learner context behavior

When learner context is provided:

- adapt wording, cognitive demand, scaffolding, and complexity to the provided context without changing required Outcome scope.

When learner context is unspecified but teacher-acknowledged:

- do not infer a degree/year/age;
- use only Syllabus, approved Outcomes, and Material as difficulty signals;
- emit `LEARNER_CONTEXT_UNSPECIFIED` warning metadata.

## 5. Prompt Domain 2 self-review

The model performs one internal quality review within the same call before returning final output.

Do not output chain-of-thought. Return only structured checks/warnings.

Suggested shape:

```text
quality_review:
  outcome_alignment: PASS | WARN
  learner_level_fit: PASS | WARN
  scope_compliance: PASS | WARN
  purpose_fit: PASS | WARN
  warnings: string[]
```

Avoid numerical scores because they imply false precision.

The model should revise the Activity internally before final output if it detects a correctable problem.

A model `WARN` is teacher-visible and does not bypass deterministic validation.

## 6. Deterministic post-generation validation

The application, not the model, validates:

- Activity type matches Intent;
- Purpose exists and matches Intent revision;
- aligned Objective/Outcome IDs exist;
- selected IDs are authorized for the Section or carry explicit teacher override;
- minimum alignment requirements by Purpose are satisfied;
- source references/provenance are valid for grounding mode;
- question count/type/choices/marks obey deterministic options;
- no unauthorized Learning Outcome/Competency is introduced;
- generated result references the exact Activity Intent/context revision used.

A deterministic failure rejects the attempt and uses the existing bounded retry policy.

## 7. Teacher review/authority

Teacher can:

- approve generated Activity;
- edit Activity;
- regenerate from a revised Intent;
- change selected Outcomes (making current Activity stale);
- change Purpose (making current Activity stale);
- change generation instruction (making current Activity stale);
- approve explicit out-of-Section Outcome override;
- confirm Activity ↔ Competency mapping separately;
- confirm Competency Evidence separately.

Teacher edits change provenance to `TEACHER_EDITED` and rerun deterministic validation. Do not force another model self-review call merely because a teacher edited content.

## 8. Activity Intent versioning requirement

The Activity generation instruction must be persisted as part of the Activity Intent revision before generation.

Current behavior that stores `generation_instruction` only when generation completes successfully is insufficient for the new lifecycle because:

- failed/timed-out attempt instructions are not reliably preserved;
- a textarea edit after successful generation does not itself persist;
- changed instruction currently does not automatically mark Activity stale.

Target lifecycle:

```text
Teacher edits intent/prompt
→ persist Activity Intent Revision N
→ compare dependencies
→ mark old generated Activity STALE if relevant
→ Generate
→ result references Activity Intent Revision N
```

## 9. Prompt/version audit metadata

Persist at minimum:

```text
instructional_design_policy_version
structure_prompt_version
activity_prompt_version
operation
provider
model
generated_at
```

Generation references should also include immutable/revision IDs for:

- Core Course Design Context;
- selected approved Outcomes;
- Section;
- learner context;
- Material Snapshot when applicable;
- Activity Intent.

## 10. Suggested stable system-prompt policy wording

The exact wording may evolve without changing this contract, but it should encode these invariants:

```text
You are an Instructional Designer specializing in Constructive Alignment.
Use the authorized Course Design Context as the source of truth for learner context, Objectives, Outcomes, course scope, schedule, assessment requirements, and constraints.
Do not invent missing learner facts, prerequisites, Learning Outcomes, Competencies, Activity existence, or new content scope.
Preserve explicit source requirements and report missing/ambiguous information instead of silently guessing.
Teacher intent and deterministic policy are authoritative where provided.
```

Prompt Domain 1 adds Structure/Competency operation-specific constraints.

Prompt Domain 2 adds Activity Purpose, selected Outcome, grounding, and deterministic Activity constraints.

## 11. Explicit non-goals

- no third independent prompt domain;
- no AI call just to recommend Activity Purpose;
- no AI-generated Alignment Matrix duplication;
- no automatic Competency approval;
- no automatic Activity ↔ Competency approval;
- no automatic Competency Evidence approval;
- no chain-of-thought persistence/display;
- no pedagogical-quality percentage score;
- no Career Path behavior.

## 12. Implementation-impact checklist

When implementation begins, review at minimum:

- syllabus semantic extraction/Objective-vs-Outcome distinction;
- Core Course Design Context persistence/revisions;
- Structure prompt/schema and Section alignment fields;
- Outcome proposal/review UI;
- Competency Candidate operation/review lifecycle;
- Activity Intent schema/options/UI for Purpose and selected Outcomes;
- Activity generation context construction;
- removal of Assignment learning-objective fallback from arbitrary prompt/description;
- generation instruction persistence-before-call;
- stale dependency rules;
- quality-review structured output;
- deterministic validators;
- teacher edit provenance;
- final Preview/review presentation;
- daily SOC evidence under `ai-platform-coordination/source-of-truth/soc/` and ADR references.
