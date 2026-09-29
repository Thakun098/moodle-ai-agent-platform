# Optional activity generation and source fallback

Status: Accepted

Supersedes the activity-generation blocking semantics in ADR-0001.

## Context

Course creation must support a valid structure-only path. Teachers may approve and execute a Moodle course containing only the course shell and sections, with no Quiz or Assignment activities. Activity creation is an explicit optional branch after Course Structure preview rather than an implicit requirement derived from the syllabus.

The syllabus remains the authority for Course Structure. Learning Material remains the preferred factual grounding source for Activity content when supplied, but it is no longer mandatory for every section or every Activity.

## Decision

1. A normalized syllabus may contain at most 20 schedule/course periods regardless of whether the source labels them Week, Unit, Topic, Module, or another equivalent schedule anchor. More than 20 periods is rejected deterministically. The system must not silently truncate or ignore excess periods.
2. Initial Course Structure generation does not create Activity Intents from the syllabus or Structure Instruction. Activity existence requires an explicit teacher action in the Activity Creation Step.
3. Structure Instruction remains optional and may shape Course Structure presentation/emphasis, but it cannot create Quiz/Assignment intents.
4. After Course Structure preview/seal, the teacher chooses whether to create activities:
   - Skip Activity Creation -> Finalize a CoursePlan containing the course and sections with zero activities, then continue to Preview -> Approve -> Execute.
   - Enter Activity Creation -> explicitly select Quiz/Assignment activities for chosen sections/course periods.
5. Current V1 selection cardinality is at most one Quiz and one Assignment per section/course period. The implementation should not prevent later expansion to multiple activities per type.
6. Learning Material upload is optional for each selected section/course period. The teacher is never required to upload material for all sections. One section-level Material Snapshot may ground both its selected Quiz and Assignment.
7. Grounding mode is resolved deterministically per selected Activity:
   - `MATERIAL_GROUNDED`: a current sealed Material Snapshot exists; use it as preferred factual grounding.
   - `SYLLABUS_GROUNDED`: no Material exists, but the syllabus contains sufficient factual evidence for the section/course period; use that syllabus evidence directly.
   - `SYLLABUS_SCOPED_AI`: the syllabus defines a meaningful topic/learning scope but lacks detailed factual content. The model may elaborate using general knowledge only inside that syllabus-defined scope. This path must produce a visible Warning and mark the Activity `Teacher Review Required` before Approval.
   - `INSUFFICIENT_EVIDENCE`: the syllabus does not define enough meaningful scope to justify Activity generation. The model must not invent a new scope and Activity-generation tokens should not be spent.
8. `SYLLABUS_SCOPED_AI` is a bounded exception to the earlier strict no-model-knowledge rule. Model knowledge is not an independent source of scope; it may only elaborate within syllabus-defined scope, and the resulting Activity remains explicitly teacher-reviewed rather than silently treated as fully grounded.
9. If `INSUFFICIENT_EVIDENCE` applies, the teacher may:
   - add/replace Learning Material and retry;
   - remove the Activity Intent; or
   - explicitly confirm creation of an Empty Activity Shell for the already-selected Quiz/Assignment.
   If neither Quiz nor Assignment was selected in the first place, no shell is created and no Activity-generation token is spent.
10. Empty Activity Shells preserve the frozen Planning Contracts v0.1 rather than reopening them. Shell content is deterministic and non-factual:
   - Quiz may use an empty `questions: []` collection plus non-factual deterministic title/description placeholders required by the contract.
   - Assignment uses deterministic non-factual placeholders for required description/instructions/learning-objectives/grade fields because AssignmentPlan v0.1 does not allow those required fields to be absent.
   - Shell creation must be warning-backed and teacher-confirmed; it must not call the LLM merely to fabricate content.
11. Activity Material is section/course-period scoped in V1, not separately uploaded per Activity. A Week/Section with both Quiz and Assignment may use one current Material Snapshot for both.
12. Missing Learning Material must not block Finalization merely because a section exists. Only Teacher-Authorized Activity Intents participate in Activity readiness checks.
13. A Teacher-Authorized Activity Intent is a commitment for Finalization: it must end as a valid generated Activity Draft, a teacher-confirmed Empty Activity Shell produced through the `INSUFFICIENT_EVIDENCE` path, or be explicitly removed. It must never be silently dropped.
14. Activity generation is activity-scoped. If Quiz succeeds and Assignment fails in the same section, the successful Quiz remains valid and is not regenerated merely because the Assignment is retried.
15. Activity generation uses bounded attempts with an explicit `CREATING` state. Retry is teacher-triggered, not an automatic hidden retry.
16. Current POC Retry Policy allows one retry after the initial failed/timed-out attempt (two total attempts per Activity Intent). The allowed attempt count must be configuration/policy-driven so it can change later without redesigning the lifecycle.
17. Technical generation failure/timeout is distinct from insufficient evidence. When the configured technical attempts are exhausted, that Activity Intent must be removed before Finalization. Technical failure must not automatically degrade into an Empty Activity Shell.
18. Sections with no Teacher-Authorized Activity Intents finalize with `activities: []`.

## Consequences

- The staged workflow gains an explicit optional Activity Creation decision after Course Structure review.
- Syllabus-derived and Structure-Instruction-derived Activity proposals are removed from the default structure-planning path.
- Optional Notes/Structure Instruction must be separated semantically from Activity-generation instructions.
- The old mandatory `BLOCKED_MISSING_MATERIAL` lifecycle is replaced by per-Activity grounding-mode resolution.
- MaterialSnapshot-dependent provenance remains strict when Material is supplied.
- Syllabus fallback now has two modes: direct syllabus grounding and warning-backed syllabus-scoped AI elaboration.
- `SYLLABUS_SCOPED_AI` must surface a durable Warning into official Preview/Approval; it cannot be only a transient generation log.
- An explicit Empty Activity Shell path is required only for insufficient-evidence cases; it must be teacher-confirmed, deterministic, and token-free rather than automatically model-generated.
- Technical provider/model failure remains a retry/remove lifecycle and does not use Empty Shell as an error-recovery shortcut.
- Finalization gates must distinguish `NO_ACTIVITY_REQUESTED`, active/failed generation, valid generated activities, Empty Activity Shells, removed intents, and any required teacher-review warning state.
- UI state must allow teachers to skip Activity Creation entirely and proceed to Finalize.
- UI must show per-Activity generation progress while an attempt is active, then expose remove/retry choices after timeout or failure according to Retry Policy.
- A failed Assignment must not force regeneration of an already-successful Quiz in the same section.
- Frozen Planning Contracts v0.1 remain unchanged for Empty Shell support.
- Existing tests that assume every syllabus/teacher-derived Activity Intent requires Material must be revised around Teacher-Authorized Activity Intents and grounding modes.
- Retry policy should be surfaced through configuration rather than hard-coded into the domain flow even though the current accepted value is one retry.


## Final review/default decisions

19. `Teacher Review Required` is enforceable rather than informational. If any Activity in the current Final CoursePlan uses `SYLLABUS_SCOPED_AI`, the official Preview must identify those Activities and require one explicit teacher acknowledgment before Approval. Approval is rejected/disabled until that acknowledgment is supplied for the exact Plan Revision. Creating a later Plan Revision resets the acknowledgment requirement.
20. Selecting Quiz or Assignment is sufficient to create a Teacher-Authorized Activity Intent; all secondary Activity generation controls remain optional. When omitted, deterministic V1 defaults apply: Quiz = 5 multiple-choice questions, 4 choices/question, exactly 1 correct choice, default mark 1/question; Assignment = one assignment brief with grade 100. These values must be policy/configuration-driven rather than model-selected or lifecycle-hard-coded.
21. If Structure Instruction/Optional Notes contains an Activity request, Structure generation continues but the Activity request is ignored for Activity existence. The teacher receives a Warning that Quiz/Assignment requests must be selected explicitly in the Activity Creation Step. Non-activity parts of the same Structure Instruction continue to shape Course Structure.
22. A teacher-confirmed Empty Activity Shell remains visibly marked in the official Preview but does not require a second confirmation before Approval. The explicit shell confirmation performed in the insufficient-evidence path is sufficient; the official Preview warning exists for transparency, not duplicate authorization.

Additional consequences:
- Approval API/UI needs revision-scoped review acknowledgment semantics without changing the frozen CoursePlan v0.1 schema.
- Activity defaults need a dedicated deterministic policy/config boundary so future tuning does not require changing Teacher-Authorized Activity Intent semantics.
- Structure Instruction parsing must distinguish Activity-request detection (warning only) from Structure-shaping text and must never compile Activity rules during Course Structure generation.
- Official Preview must distinguish AI-expanded content warnings from Empty Shell warnings: the former requires acknowledgment; the latter is informational because shell creation was already explicitly confirmed.
