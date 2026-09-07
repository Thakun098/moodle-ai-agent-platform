# Optional Activity Creation V1 — Implementation Plan

Status: Ready for implementation
Source decisions: Grill Q1–Q16, `CONTEXT.md`, ADR-0002
Scope: Post-Phase-17 behavior change for initial Course Creation

## 1. Goal

Change initial Course Creation so that Course Structure can be finalized and approved with zero activities, while Quiz/Assignment creation becomes an explicit optional branch after Structure review.

Target flow:

```text
Upload Syllabus
  -> Normalize / validate <= 10 course periods
  -> Generate Course Structure only
  -> Teacher Preview/Edit
  -> Seal Structure
  -> Create Activities?
       -> No: Finalize structure-only CoursePlan
       -> Yes: select Quiz/Assignment per course period
              -> optional section Material
              -> resolve grounding mode per Activity
              -> generate per Activity with bounded retries
              -> insufficient evidence: add Material / remove / confirm Empty Shell
  -> Official Preview
  -> Review acknowledgment when SYLLABUS_SCOPED_AI exists
  -> Approve
  -> Execute
  -> Verify
```

## 2. Frozen constraints

- Keep Planning Contracts v0.1 frozen.
- CoursePlan with `activities: []` remains valid.
- Quiz Empty Shell uses `questions: []` and deterministic non-factual required metadata.
- Assignment Empty Shell satisfies existing required fields with deterministic non-factual placeholders.
- Moodle remains System of Record; mutation path remains Approval -> execution gates -> MCP/Gateway -> Moodle.
- No RAG is added.

## 3. Core domain changes

### 3.1 Course Structure becomes activity-free by default

Initial structure planning must persist `activity_intents: []` for every generated section. Neither Syllabus assessment text nor Structure Instruction may create an Activity Intent.

Structure Instruction may still influence section naming, summaries, emphasis, etc. If it contains a Quiz/Assignment request, emit a warning directing the teacher to the Activity Creation Step; do not reject the whole instruction.

### 3.2 Separate Activity Intent state from immutable Course Structure

Do not re-open/seal Course Structure merely to select activities after Structure confirmation. Add an internal persisted Activity Intent entity scoped to the sealed Structure Revision.

Recommended table/entity: `poc_activity_intent`

Suggested fields:

```text
id UUID PK
run_id UUID
structure_revision INT
section_ref TEXT
activity_ref TEXT
activity_type quiz|assignment
status selected|creating|generated|insufficient_evidence|failed|timed_out|retry_exhausted|shell|removed|stale
attempt_count INT
max_attempts INT snapshot of policy at selection/generation time
grounding_mode material_grounded|syllabus_grounded|syllabus_scoped_ai|insufficient_evidence NULL until resolved
review_required BOOLEAN
shell_confirmed_at TIMESTAMP NULL
created_at / updated_at
UNIQUE(run_id, structure_revision, section_ref, activity_type) for V1
```

V1 cardinality is maximum one Quiz and one Assignment per section. Keep refs/domain shapes extensible so later multiple activities/type are possible.

### 3.3 Material remains section-scoped and optional

Reuse current Material Draft/Snapshot model. One current section Material Snapshot may ground both Quiz and Assignment. Absence of Material is not an error by itself.

## 4. Syllabus course-period cap

Add deterministic constant/config boundary:

```text
MAX_SYLLABUS_COURSE_PERIODS = 10
```

Enforce after normalization based on `schedule_or_topics.length`, regardless of source labels (Week/Unit/Topic/etc.).

Behavior when count > 10:

- fail ingestion deterministically;
- use dedicated code such as `COURSE_PERIOD_LIMIT_EXCEEDED`;
- include observed count and max in error details/message;
- never truncate silently.

Defense in depth: also add `maxItems: 10` to NormalizedSyllabus schema, while preserving the dedicated ingestion/domain error as the user-facing failure.

Primary files:
- `packages/contracts/schemas/normalized-syllabus.v0.1.schema.json`
- `packages/syllabus/src/**`
- syllabus validator/ingestion tests

## 5. Structure Instruction semantics

Replace current Activity Rule compilation during Course Structure generation.

Current conflict:
- `teacher-instruction-interpreter.ts` compiles Quiz/Assignment rules.
- `course-structure.ts` resolves those rules into Activity Intents.

Required behavior:

1. Preserve original Structure Instruction text.
2. Detect Activity-request language for warning only.
3. Pass full instruction to Course Structure prompt with an explicit constraint that Activity existence is out of scope.
4. Generated/persisted Structure sections always start with empty Activity Intents.
5. Do not call `resolveActivityIntentsForStructure()` in the initial structure path.

Recommended refactor:
- introduce `interpretStructureInstruction()` returning `{ originalInstruction, warnings }` without Activity Rules;
- retain the existing rule machinery only where it is still useful for explicit Activity-generation options, or retire it if no caller remains.

Primary files:
- `packages/planning/src/instructions/teacher-instruction-interpreter.ts`
- `packages/planning/src/planners/course-structure-planner.ts`
- `packages/planning/src/prompts/course-planning-prompt.ts`
- `apps/api/src/routes/course-structure.ts`

## 6. Activity selection API

Add explicit endpoints for the Activity Creation Step. Exact HTTP shape may follow existing Fastify conventions, but behavior should be equivalent to:

```text
PUT /api/runs/:runId/sections/:sectionRef/activity-intents
body: {
  quiz: boolean,
  assignment: boolean,
  quiz_options?: {...},
  assignment_options?: {...}
}
```

or separate create/remove endpoints per Activity Intent.

Rules:
- structure must already be sealed;
- section must belong to that sealed revision;
- selecting an Activity creates/persists a Teacher-Authorized Activity Intent;
- deselecting explicitly marks/removes the intent and invalidates/removes its pending/stale draft from finalization eligibility;
- changing selection never silently changes another Activity in the same section;
- no Material is required at selection time.

Generation/status should be per Activity rather than per whole section:

```text
POST /api/runs/:runId/sections/:sectionRef/activities/:activityRef/generate
GET  /api/runs/:runId/sections/:sectionRef/activities/:activityRef/status
POST /api/runs/:runId/sections/:sectionRef/activities/:activityRef/confirm-shell
DELETE/POST remove intent
```

Compatibility wrappers may remain temporarily for existing section-level routes, but new UI should use per-Activity semantics.

## 7. Deterministic Activity Default Policy

Selecting Quiz/Assignment is sufficient; secondary fields are optional.

Add policy/config defaults rather than embedding model choices:

```text
Quiz:
  questions = 5
  question_type = multichoice
  choices_per_question = 4
  correct_choices_per_question = 1
  default_mark = 1

Assignment:
  count = 1
  grade = 100
```

Recommended config names:

```text
ACTIVITY_GENERATION_MAX_ATTEMPTS=2
DEFAULT_QUIZ_QUESTION_COUNT=5
DEFAULT_QUIZ_CHOICE_COUNT=4
DEFAULT_ASSIGNMENT_GRADE=100
```

Question type may remain a code-level V1 policy enum if exposing an environment variable adds little value, but the defaults should be centralized in one policy module.

## 8. Grounding Mode Resolver

Introduce a deterministic resolver before any LLM generation call:

```text
resolveActivityGrounding(section, syllabus, materialSnapshot?)
  -> MATERIAL_GROUNDED
  -> SYLLABUS_GROUNDED
  -> SYLLABUS_SCOPED_AI
  -> INSUFFICIENT_EVIDENCE
```

### MATERIAL_GROUNDED
- current valid section Material Snapshot exists;
- use Material text + Material provenance;
- current strict provenance behavior remains.

### SYLLABUS_GROUNDED
- no Material;
- section has sufficiently detailed grounded syllabus text;
- generation is constrained to that evidence and uses syllabus source refs.

### SYLLABUS_SCOPED_AI
- no Material;
- syllabus provides meaningful topic/learning scope but limited factual detail;
- model general knowledge may elaborate only within that scope;
- persist `review_required=true` and grounding mode;
- Final CoursePlan carries durable warning(s) identifying affected Activity refs.

### INSUFFICIENT_EVIDENCE
- no meaningful scope exists;
- do not call the model;
- state becomes `insufficient_evidence`;
- UI offers: upload Material, remove Activity, confirm Empty Shell.

Implementation note: keep the resolver deterministic and testable. Use centralized configurable evidence heuristics rather than asking the LLM whether evidence is sufficient. At minimum distinguish generic anchors (`Week 4`, `Unit 3`) from meaningful titles/topics/objectives and use a bounded detail threshold for direct syllabus grounding vs scoped-AI elaboration.

Primary files/new modules:
- `packages/planning/src/grounding/activity-grounding-resolver.ts`
- reuse `buildSectionGrounding()`
- generator tests for all four modes

## 9. Activity generator refactor

Current generator requires `MaterialContext` and explicitly forbids syllabus/model fallback. Refactor its input into a source-neutral ActivityGenerationContext, e.g.:

```text
{
  mode,
  text,
  sourceRefs,
  reviewRequired,
  allowScopedModelKnowledge
}
```

Prompt rules by mode:
- MATERIAL_GROUNDED: Material is factual authority; no outside facts.
- SYLLABUS_GROUNDED: syllabus evidence is factual authority; no outside facts.
- SYLLABUS_SCOPED_AI: syllabus defines scope; model may elaborate within scope; output marked review-required.
- INSUFFICIENT_EVIDENCE: generator is never called.

Keep deterministic shape validation after generation.

## 10. Empty Activity Shells

Shell creation is a separate deterministic command, not a generation fallback hidden inside the model call.

Quiz shell:

```text
ref = selected intent ref
type = quiz
title = deterministic from section/intent
description = "Content pending teacher input."
source_refs = []
questions = []
```

Assignment shell:

```text
ref = selected intent ref
type = assignment
title = deterministic from section/intent
description = "Content pending teacher input."
instructions = ["To be provided by teacher."]
learning_objectives = ["To be provided by teacher."]
grade = DEFAULT_ASSIGNMENT_GRADE
source_refs = []
```

Persist shell state/confirmation as internal metadata. Finalizer/domain provenance validation must recognize teacher-confirmed shell refs and not require factual source provenance for their placeholder content.

Technical timeout/provider failure must never route here automatically.

## 11. Retry and timeout state machine

Per Activity state machine:

```text
SELECTED / READY_TO_GENERATE
   -> CREATING
      -> GENERATED
      -> INSUFFICIENT_EVIDENCE
      -> FAILED
      -> TIMED_OUT

FAILED/TIMED_OUT with attempts remaining
   -> RETRY available (teacher-triggered)
   -> CREATING

FAILED/TIMED_OUT with attempts exhausted
   -> RETRY_EXHAUSTED
   -> Remove required before Finalize

INSUFFICIENT_EVIDENCE
   -> add Material and retry
   -> Remove
   -> Confirm Empty Shell -> SHELL
```

Current policy: max attempts = 2 total (initial + one retry). Read from config/policy.

Do not regenerate a successful sibling Activity in the same section.

## 12. Finalization rules

Refactor `assembleFinalCoursePlan()` away from the assumption that every `section.activity_intents` came from sealed Structure and requires a Material Snapshot.

For each sealed Structure section:

1. Load active Teacher-Authorized Activity Intents for that exact Structure Revision.
2. If none: finalize section with `activities: []`.
3. For each selected intent, require exactly one terminal valid state:
   - generated draft, or
   - teacher-confirmed shell.
4. `creating`, `failed`, `timed_out`, `retry_exhausted`, `stale`, or selected-without-result blocks Finalization.
5. Removed intents do not participate.
6. Material Snapshot is required only for Activities whose actual grounding mode is `MATERIAL_GROUNDED`.
7. Apply syllabus provenance rules for `SYLLABUS_GROUNDED`.
8. Apply bounded syllabus provenance + durable warning for `SYLLABUS_SCOPED_AI`.
9. Skip factual provenance requirement only for confirmed Empty Shell placeholder content.

Primary files:
- `packages/planning/src/finalization/course-plan-finalizer.ts`
- `packages/planning/src/domain/planning-domain-validator.ts`
- `apps/api/src/routes/section-generation.ts` (likely split/rename)

## 13. Teacher Review Required / Approval gate

Do not change the frozen CoursePlan schema. Carry review requirements as internal persisted metadata and/or deterministic warning codes attached to the Plan Revision.

Recommended behavior:

- Finalization emits human-readable warnings for affected Activities and an internal revision-scoped review requirement list.
- Official Preview shows badge/warning on each `SYLLABUS_SCOPED_AI` Activity.
- One checkbox: `I have reviewed the AI-expanded activity content.`
- Approval request includes explicit acknowledgment, e.g. `acknowledge_ai_expanded_content=true` or a requirement token/list.
- API checks the current Plan Revision review requirements; if required acknowledgment is absent, reject with dedicated error such as `TEACHER_REVIEW_REQUIRED`.
- A new Plan Revision inherently requires a new acknowledgment; do not reuse prior-revision review state.

Empty Shell warnings remain visible but do not require another acknowledgment.

Primary files:
- `apps/api/src/routes/runs.ts`
- Plan persistence/repository sidecar metadata as needed
- Moodle BFF approval action
- `moodle/local_agentpoc/amd/src/course_builder.js`

## 14. Moodle UI flow

Replace current mandatory `Learning Materials and Section Activities` stage with explicit decision + Activity Step.

After Structure confirmation:

```text
Would you like to create Quiz or Assignment activities?
[Skip activities and continue] [Create activities]
```

If Skip:
- call Finalize immediately;
- proceed to Official Preview.

If Create activities:
- show up to 10 section/course-period rows;
- each row has Quiz checkbox, Assignment checkbox, one optional Material uploader, optional Activity controls/instruction;
- no checkbox selected means no generation and no token use;
- Generate actions/status are per Activity;
- Material upload is optional and section-scoped;
- status badges: READY, CREATING, GENERATED, INSUFFICIENT EVIDENCE, FAILED/TIMED OUT, RETRY EXHAUSTED, EMPTY SHELL, STALE;
- Finalize enabled only when all selected active intents are in GENERATED or SHELL terminal state.

On `SYLLABUS_SCOPED_AI` generation:
- show warning badge immediately;
- preserve warning into Official Preview.

On insufficient evidence:
- do not show generic generation failure;
- offer Add Material / Remove / Create Empty Shell.

On technical failure:
- offer Retry while attempts remain;
- after exhaustion, only Remove allows Finalize.

## 15. Preview changes

Official Preview must show:
- generated activities/questions as today;
- grounding warning/badge for `SYLLABUS_SCOPED_AI`;
- Empty Shell warning/badge;
- aggregate `Teacher Review Required` checkbox only when at least one AI-expanded Activity exists.

Structure Preview remains separate and does not count as official Approval Preview.

## 16. Persistence/repository work

Add repository support for Activity Intents and attempt/review metadata. Recommended minimum operations:

```text
upsertSelection
removeIntent
getIntent
listForSection
listForRunRevision
markCreating
recordAttemptFailure
markGenerated
markInsufficientEvidence
markShell
markStale
```

Generation drafts should reference Activity Intent ref and Structure Revision. MaterialSnapshot ID becomes nullable for non-material grounding; if current schema forbids null, migrate the draft record to support source-neutral grounding and persist grounding metadata separately.

Important: do not fake syllabus grounding by inventing a MaterialSnapshot.

## 17. Test plan

### Syllabus cap
- 1, 8, 10 course periods -> PASS
- 11 course periods -> dedicated deterministic failure
- Units/Topics without `Week` labels still count toward 10
- no silent truncation

### Structure planning
- syllabus assessment text mentioning quiz -> zero intents
- Structure Notes `เน้น recursion และให้มี quiz ทุกสัปดาห์` -> structure emphasis retained, Activity warning emitted, zero intents
- every generated section has empty Activity Intents initially

### Activity selection/defaults
- selecting only Quiz creates one intent
- selecting both creates exactly two intents
- repeated selection is idempotent
- deselection removes only target intent
- blank options use deterministic default Quiz/Assignment policy

### Grounding modes
- Material -> MATERIAL_GROUNDED
- detailed syllabus -> SYLLABUS_GROUNDED
- topic-only meaningful syllabus -> SYLLABUS_SCOPED_AI + review required
- generic/empty syllabus section -> INSUFFICIENT_EVIDENCE and zero model calls

### Generation/retry
- Quiz success + Assignment timeout -> Quiz remains generated
- first failure -> retry available
- second failure with maxAttempts=2 -> retry exhausted, remove required
- changing configured max attempts changes allowed retry count without state-machine code changes

### Empty Shell
- only available from insufficient-evidence state
- deterministic Quiz shell contract valid with zero questions
- deterministic Assignment shell contract valid
- technical error cannot create shell
- shell preview warning visible

### Finalization
- zero selected activities -> structure-only CoursePlan PASS
- one generated activity + all others unselected -> PASS
- selected but not generated -> BLOCK
- retry exhausted intent -> BLOCK until removed
- shell -> PASS
- stale -> BLOCK
- no Material does not block syllabus-grounded Activity

### Review acknowledgment
- SYLLABUS_SCOPED_AI plan without acknowledgment -> Approval rejected
- acknowledgment -> Approval PASS
- no AI-expanded Activity -> no checkbox/ack required
- Empty Shell only -> no review acknowledgment required
- new Plan Revision -> prior acknowledgment not reusable

### Full E2E
At minimum run:
1. 8-week syllabus -> no activities -> Approve/Execute -> Moodle course has sections and zero Quiz/Assignment.
2. Mixed Activity run with Material only on some weeks -> Material + syllabus fallback paths -> Execute/Verify.
3. Topic-only syllabus fallback -> AI warning -> review acknowledgment -> Execute/Verify.
4. Insufficient evidence -> Empty Shell -> Execute/Verify empty Moodle activity container.
5. Forced generation timeout -> retry once -> second failure -> removal -> Finalize/Execute remaining plan.

## 18. Recommended implementation order

### T1 — Course Period Cap
Implement <=10 validation + tests first. Small, isolated, deterministic.

### T2 — Structure-only planning semantics
Remove automatic Activity Intent creation from Syllabus/Structure Instruction; add Structure Instruction warning behavior and prompt shaping.

### T3 — Activity Intent persistence + API
Introduce post-seal Teacher-Authorized Activity Intent entity and V1 one-Quiz/one-Assignment selection endpoints.

### T4 — Default policy + configuration
Centralize Activity defaults and retry max-attempt config.

### T5 — Grounding resolver
Implement four deterministic grounding modes and source-neutral ActivityGenerationContext.

### T6 — Per-Activity generator/orchestrator
Refactor section-wide Material-mandatory generation to independent Activity generation with persistent attempts/status.

### T7 — Empty Shell factory
Add deterministic contract-valid shell creation and insufficient-evidence confirmation path.

### T8 — Finalizer/provenance refactor
Overlay selected Activity Intents onto sealed Structure; permit zero activities, syllabus fallback, review warnings, shells; enforce stale/incomplete blockers.

### T9 — Approval review requirement
Add revision-scoped AI-expanded-content acknowledgment gate without changing frozen CoursePlan schema.

### T10 — Moodle UI staged branch
Add Skip/Create Activities decision, optional Material controls, per-Activity statuses/retry/remove/shell flows, and official Preview review checkbox.

### T11 — Regression + full gates
Focused suites, monorepo typecheck/test/build, Moodle UI regression.

### T12 — Real Moodle E2E acceptance
Run all five acceptance scenarios and update `status.md` + `soc.md` with evidence.

## 19. Acceptance criteria

Implementation is acceptable when all are true:

- >10 normalized course periods is deterministically rejected; <=10 works.
- Course Structure generation creates no Quiz/Assignment automatically.
- A teacher can skip Activity Creation and create a real Moodle course containing only sections.
- A teacher can select Quiz/Assignment explicitly per section, with all Activity fields and Material optional.
- Missing Material falls back through deterministic syllabus grounding modes.
- Syllabus-scoped AI knowledge never expands scope and always produces visible review-required warning.
- Approval cannot pass review-required content without explicit revision-scoped acknowledgment.
- Insufficient evidence spends no generation token and offers Material / Remove / Empty Shell.
- Empty Shells are deterministic, contract-valid, and never used for provider/timeout recovery.
- Generation retry is per Activity, teacher-triggered, current max attempts = 2, configurable.
- A successful sibling Activity is never regenerated because another Activity failed.
- Exhausted technical failure forces removal before Finalize.
- Frozen Planning Contracts v0.1 remain unchanged.
- Full `typecheck`, tests, build, and real Moodle E2E pass with evidence recorded.

## 20. Explicitly deferred

- More than one Quiz or more than one Assignment per course period.
- RAG/external knowledge retrieval.
- Automatic hidden retry.
- LLM deciding whether an Activity should exist.
- LLM deciding Course Format.
- Reopening frozen Planning Contracts v0.1 for shell metadata.
- Production-grade workflow queues/background jobs.
