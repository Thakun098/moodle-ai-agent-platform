# Moodle Agent POC

This context defines the canonical vocabulary for staged, teacher-authorized Moodle course creation. It is a glossary, not a specification.

## Course design

**Course Structure**:

The syllabus-grounded course skeleton: course definition, ordered sections, summaries, and source-backed alignment. It is reviewed before optional Activity creation.

_Avoid_: Final CoursePlan, implicit activity plan

**Course Structure Revision**:

An immutable version of Course Structure. Teacher edits create a new revision rather than mutating an earlier one.

_Avoid_: draft overwrite, CoursePlan Revision

**Structure Instruction**:

Optional Teacher guidance that may shape Course Structure presentation or emphasis but never authorizes Quiz or Assignment existence.

_Avoid_: Activity rule, implicit Activity Intent

**Activity Creation Step**:

The optional post-Structure stage where the Teacher explicitly selects Quiz and/or Assignment activities for individual Sections.

_Avoid_: mandatory material stage, syllabus-implied activities

**Final CoursePlan**:

The validated plan assembled from one sealed Course Structure plus current valid Teacher-authorized Activity content. It may contain zero activities.

_Avoid_: Structure Review, partial plan

**Plan Revision**:

An immutable version of the Final CoursePlan presented for approval and execution. Review acknowledgments belong to the exact revision.

_Avoid_: mutable preview

## Authority

**Teacher-Authorized Activity Intent**:

The persisted Teacher decision that a specific Quiz or Assignment should exist in a Section, together with its Purpose, selected alignment targets, and generation settings.

_Avoid_: model-selected activity, syllabus-generated Activity Intent

**Source Authority**:

The rule that identifies which source is allowed to define scope or facts: the Syllabus owns Course Structure and fallback scope, the Teacher owns Activity existence, Learning Material is preferred Activity evidence when supplied, and deterministic policy is final enforcement.

_Avoid_: model-selected scope, implicit authority

**Learner Context**:

Source-backed or Teacher-provided information about the intended learners. When the source does not provide it, its status is explicitly UNSPECIFIED rather than inferred.

_Avoid_: guessed learner profile, inferred education level

**Learner Context Acknowledgment**:

The explicit Teacher confirmation required before generating an Activity when Learner Context is UNSPECIFIED. Saving a draft Activity Intent does not imply this acknowledgment.

_Avoid_: Generate-implies-consent, auto-acknowledgment

**Learner Context**:
Source-backed or Teacher-provided information about the intended learners. When the source does not provide it, its status is explicitly UNSPECIFIED rather than inferred.
_Avoid_: guessed learner profile, inferred education level

**Primary Output Language**:
The single run-level language authority deterministically derived from semantic Syllabus content. Derivation uses natural-language signal and ignores codes, identifiers, technical/product tokens, code, and URLs. Mixed-language tie-breaking is deterministic: Schedule/Topics first, then Objectives/Outcomes, then Course Title; a degenerate no-signal source uses the compatibility default. The authority applies to newly authored teacher/student-facing educational prose in Course Structure and Activity generation. Technical terms, product names, code, identifiers, and verbatim source quotations may remain in their conventional/source form. The Teacher can see the derived authority but does not override it in this scope. A material generator mismatch receives one bounded correction attempt and then fails closed.
_Avoid_: UI-locale inference, per-generator language choice, silent English fallback in Thai prose, manual override, unbounded language retries

**Learner Context Acknowledgment**:
The explicit Teacher confirmation attached to the current Learner Context revision when its status is UNSPECIFIED. It is made once for that learner context and inherited by all Activities that use the same revision; unrelated Outcome/CLO changes do not require re-acknowledgment.
_Avoid_: per-Activity consent, Generate-implies-consent, auto-acknowledgment

**Teacher Review Required**:

A durable review condition for Activity content that used bounded AI elaboration within syllabus scope. Approval remains blocked until the current Plan Revision is explicitly reviewed.

_Avoid_: informational warning only, hidden review state

## Learning material and generation

**Learning Material**:

Optional Teacher-authorized Section content used as the preferred factual grounding source for generated Activities and questions.

_Avoid_: mandatory upload, global course content

**Material Snapshot**:

An immutable, reproducible snapshot of a Section's authorized Learning Material used by generation.

_Avoid_: mutable upload set, planned Moodle resource

**Activity Draft**:

A persisted generated Quiz or Assignment that has not yet been assembled into the Final CoursePlan.

_Avoid_: Moodle activity, Plan Revision

**Activity Purpose**:

The Teacher-selected instructional role of an Activity: PRACTICE, FORMATIVE, or SUMMATIVE.

_Avoid_: model-inferred assessment purpose

**Activity Grounding Mode**:

The deterministic generation source mode: MATERIAL_GROUNDED, SYLLABUS_GROUNDED, SYLLABUS_SCOPED_AI, or INSUFFICIENT_EVIDENCE.

_Avoid_: unrestricted model knowledge, hidden fallback

**Empty Activity Shell**:

A Teacher-confirmed deterministic placeholder created only when an authorized Activity has insufficient evidence. It is not a recovery path for model/provider failure.

_Avoid_: hallucinated content, technical-error fallback

**Activity Readiness**:

The finalization state of a Teacher-Authorized Activity Intent. It must be generated, explicitly replaced by an allowed shell, or removed before Finalization.

_Avoid_: every Section needs Material

**STALE Activity**:

An Activity Draft whose referenced authority is older than the current relevant source or intent revision. It is preserved but cannot be finalized until regenerated or removed.

_Avoid_: deleted activity, automatically regenerated activity

## Course limits and Moodle execution

**Course Period Cap**:

The deterministic maximum number of normalized schedule/course periods accepted from a syllabus: 20.

_Avoid_: Week-only cap, silent truncation

**Teacher Execution Setting**:

A Moodle execution choice owned by the Teacher rather than the model, such as Course Category or Course Format.

_Avoid_: AI-selected Moodle configuration

**Planned File Resource**:

A Moodle File Resource planned from an uploaded Learning Material file. Removing it from the CoursePlan does not remove the Material Snapshot used for grounding.

_Avoid_: Material Snapshot, duplicate upload

## Instructional alignment

**Learning Objective**:

A source-backed course-design goal used to evaluate coverage and support PRACTICE alignment.

_Avoid_: Learning Outcome

**Learning Outcome**:

An observable learner achievement from the source or an explicitly Teacher-approved measurable revision. Outcomes are the primary alignment authority for FORMATIVE and SUMMATIVE Activities.

_Avoid_: Learning Objective, silent AI rewrite

**Competency Candidate**:

An AI-proposed competency derived from approved Learning Outcomes that remains non-authoritative until explicit Teacher review.

_Avoid_: Moodle Competency, automatically approved competency

**Competency Mapping**:

A Teacher-confirmed relationship between an Activity and an approved Competency. Alignment alone does not automatically make the Activity competency evidence.

_Avoid_: inferred evidence eligibility

**Competency Evidence Eligibility**:

A separate Teacher-confirmed decision that an Activity may count as evidence for a mapped Competency.

_Avoid_: mapping-implies-evidence
