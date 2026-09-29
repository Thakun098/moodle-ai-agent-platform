# Moodle Agent POC Domain

This context defines the vocabulary for staged course creation where a teacher authorizes structure and optional activities before the system creates an official CoursePlan.

## Course creation

**Course Structure**:
The syllabus-grounded course skeleton containing the course definition, sections, and summaries. It is reviewed and sealed before the optional Activity Creation branch.
_Avoid_: Final CoursePlan, Preview, implicit activity plan

**Course Structure Revision**:
An immutable version of the Course Structure. Teacher edits create a new revision; they never mutate an earlier revision.
_Avoid_: CoursePlan Revision, draft overwrite

**Teacher Structure Coverage Override**:
An explicit exception created only when the teacher deletes a Course Structure section that previously covered one or more syllabus schedule anchors. The override is limited to those anchors that the deleted section demonstrably covered and is stored with the new Structure Revision. Coverage loss caused only by renamed sections, missing provenance, broken source references, or legacy mapping errors is never auto-authorized and remains a validation failure.
_Avoid_: global coverage bypass, position-only fallback, silent missing syllabus content

**Structure Instruction**:
Optional teacher notes supplied during Course Structure generation. They may shape Course Structure presentation or emphasis, but they never create Quiz or Assignment intents. Activity existence is authorized only in the Activity Creation Step.
_Avoid_: activity rule, implicit Activity Intent

**Activity Creation Step**:
The explicit optional branch after Course Structure review where the teacher decides whether to add Quiz or Assignment activities to selected sections/course periods. Skipping this step is valid and leads directly to Finalization of a structure-only CoursePlan.
_Avoid_: mandatory material stage, syllabus-implied activities

**Teacher-Authorized Activity Intent**:
An explicit teacher selection that one Quiz or one Assignment should exist in a selected section/course period. In the current V1, each section/course period may contain at most one selected Quiz and one selected Assignment. Activity existence is never inferred automatically from the syllabus or Structure Instruction.
_Avoid_: syllabus-generated Activity Intent, model-selected activity

**Final CoursePlan**:
The complete validated plan that combines one sealed Course Structure with any current valid teacher-authorized activity drafts. A Final CoursePlan may validly contain zero activities and is eligible for the official Preview → Approve → Execute flow.
_Avoid_: Structure Review, partial plan

## Syllabus limits

**Course Period Cap**:
A valid normalized syllabus may contain at most 20 schedule/course periods, regardless of whether the source labels them Week, Unit, Topic, Module, or another equivalent schedule anchor. If normalization detects more than 20 course periods, ingestion/validation fails deterministically. The system must not silently truncate or ignore excess periods.
_Avoid_: Week-label-only cap, planning-only cap, silent truncation

## Learning material

**Learning Material**:
Optional teacher-authorized content attached to one section/course period and used as the preferred factual grounding source for that section's generated activities and questions. One section-level material source may support both its selected Quiz and Assignment.
_Avoid_: mandatory upload, global course content

**Material Draft**:
The mutable set of teacher-managed files for a section before generation is requested.
_Avoid_: MaterialSnapshot, published resource

**Material Snapshot**:
The immutable, reproducible representation of a section's authorized Learning Material at generation time, including file evidence and normalized extracted content fingerprints. It exists only when Learning Material is supplied and sealed.
_Avoid_: live files, mutable draft

**Activity Draft**:
An internally persisted generated Assignment or Quiz that exists before it is assembled into the Final CoursePlan.
_Avoid_: Plan Revision, Moodle activity

**Empty Activity Shell**:
A teacher-confirmed fallback artifact created only through the insufficient-evidence path when an explicit Quiz or Assignment Intent exists but available evidence cannot support useful content. The system warns before shell creation. A shell uses deterministic non-factual placeholder content and does not call the LLM merely to fabricate empty educational content. Technical provider/model failure does not qualify for this fallback.
_Avoid_: hallucinated activity content, technical-error recovery, silent fallback

## Authority and grounding

**Activity Grounding Mode**:
The source mode selected deterministically for a teacher-authorized Activity:
1. `MATERIAL_GROUNDED` — current sealed Learning Material Snapshot exists; it is the preferred factual grounding source.
2. `SYLLABUS_GROUNDED` — no Learning Material is supplied; sufficiently detailed syllabus evidence for the section/course period is used directly.
3. `SYLLABUS_SCOPED_AI` — the syllabus provides a meaningful topic/learning scope but not enough factual detail. The model may elaborate using its general knowledge around that syllabus-defined learning scope. Detected content expansion beyond explicit syllabus evidence is a review warning rather than an automatic generation failure in this mode. The generated Activity must carry a visible Warning and be marked Teacher Review Required before Approval. Activity identity/type, teacher-selected Objective/Outcome alignment, schema/shape constraints, and section/intent identity remain hard constraints.
4. `INSUFFICIENT_EVIDENCE` — the syllabus does not define a meaningful Activity scope. The system must not spend Activity-generation tokens. The teacher may add Material, remove the Activity Intent, or explicitly confirm an Empty Activity Shell.
_Avoid_: unrestricted model knowledge, silent AI elaboration

**Source Authority**:
The approved owner of scope and facts for planning artifacts:
- Syllabus owns Course Structure and the allowed scope of syllabus-fallback Activity generation.
- Teacher explicitly owns whether an Activity exists.
- Current sealed Learning Material Snapshot is preferred factual grounding when supplied.
- Without Material, detailed syllabus evidence may ground Activity content directly.
- When the syllabus defines a meaningful topic scope but lacks factual detail, model knowledge may elaborate around that syllabus-defined learning scope with Warning + Teacher Review Required. Deterministically detected content expansion becomes a review warning rather than a generation blocker in `SYLLABUS_SCOPED_AI`; strict grounding modes remain fail-closed.
- If the syllabus does not define a meaningful scope, the model must not invent one; use the insufficient-evidence path instead.
- Structure Instruction may shape structure but cannot create activities.
- Activity-generation instruction may shape a teacher-selected activity but cannot create a new Activity Intent by itself.
- Deterministic policy owns final enforcement.
_Avoid_: model-selected scope, implicit activity existence

**Learner Context**:
Source-backed or Teacher-provided information about the intended learners. When the source does not provide it, its status is explicitly UNSPECIFIED rather than inferred.
_Avoid_: guessed learner profile, inferred education level

**Learner Context Acknowledgment**:
The explicit Teacher confirmation attached to the current Learner Context revision when its status is UNSPECIFIED. It is made once for that learner context and inherited by all Activities that use the same revision; unrelated Outcome/CLO changes do not require re-acknowledgment.
_Avoid_: per-Activity consent, Generate-implies-consent, auto-acknowledgment

**Teacher Review Required**:
A visible review condition attached whenever Activity content uses `SYLLABUS_SCOPED_AI`. It must survive into the official Preview/Approval experience so the teacher can see that some content was elaborated from model knowledge within syllabus scope. Approval must never silently hide this condition.
_Avoid_: informational log only, hidden warning

## Activity lifecycle

**No Activity Requested**:
A section/course period where the teacher selected neither Quiz nor Assignment. No Activity generation is attempted, no token budget is spent for Activity generation, and the section is immediately eligible for Finalization with `activities: []`.
_Avoid_: incomplete activity, missing material

**Activity Readiness**:
Finalization checks apply only to Teacher-Authorized Activity Intents. A section with no teacher-authorized activities is ready with `activities: []`. A requested activity must either be successfully generated, be replaced by a teacher-confirmed Empty Activity Shell through the insufficient-evidence path, or be explicitly removed before Finalization.
_Avoid_: material required for every section

**Activity Generation Attempt**:
One bounded generation execution for one Teacher-Authorized Activity Intent. Generation is activity-scoped rather than whole-section-scoped so a successful Quiz is preserved when an Assignment fails, and vice versa. While an attempt is active, UI state is `CREATING`. On technical timeout/failure, the teacher may remove the intent or retry according to Retry Policy.
_Avoid_: regenerate whole week, silent retry

**Retry Policy**:
The current POC policy allows one teacher-triggered retry after the initial technical failed/timed-out attempt (two total attempts per Activity Intent). The retry count must be configuration/policy-driven so it can change later without redesigning the lifecycle. When the configured technical attempts are exhausted, the failed Activity Intent must be removed before Finalization. Technical failure must not silently degrade into an Empty Activity Shell.
_Avoid_: infinite retry, hard-coded lifecycle count, shell-on-provider-error

**STALE**:
The state of an Activity Draft whose dependency is older than the current grounding source used for that activity, such as an older Material Snapshot. A stale draft is preserved but blocks Finalization until explicitly regenerated or the corresponding Activity Intent is removed.
_Avoid_: deleted, automatically regenerated


## Review and default policies

**Teacher Review Acknowledgment**:
A revision-scoped explicit acknowledgment required before Approval when any Activity in the current Final CoursePlan used `SYLLABUS_SCOPED_AI`. The official Preview identifies affected Activities and shows a single review checkbox. Approval is blocked until the teacher acknowledges review. Any later Plan Revision resets the acknowledgment because review belongs to the exact revision being approved.
_Avoid_: approval-implies-review, cross-revision acknowledgment

**Activity Default Policy**:
Deterministic defaults applied when the teacher explicitly selects Quiz or Assignment but leaves optional generation controls blank. Current V1 defaults are: Quiz = 5 multiple-choice questions, 4 choices per question, exactly 1 correct choice, default mark 1 per question; Assignment = one assignment brief with grade 100. Default values are policy/configuration, not hidden model choices, and may be changed later without altering Activity Intent semantics.
_Avoid_: required optional fields, model-selected defaults

**Structure Activity Request Warning**:
If Structure Instruction/Optional Notes contains a Quiz or Assignment request, the request is not converted into an Activity Intent. Structure generation continues, the non-activity parts of the instruction remain usable for structure shaping, and the teacher receives a Warning directing them to the Activity Creation Step.
_Avoid_: rejecting the entire Structure Instruction, implicit Activity selection

**Empty Shell Preview Warning**:
A teacher-confirmed Empty Activity Shell remains visibly marked in the official Preview, but it does not require a second confirmation before Approval. The earlier explicit shell confirmation is sufficient because there is no AI-generated educational content to review.
_Avoid_: hidden shell, duplicate shell confirmation
