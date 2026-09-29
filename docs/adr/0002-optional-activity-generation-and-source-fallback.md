# Optional Activity generation and source fallback

Status: Accepted
Supersedes: ADR-0001 where it required Learning Material for every generated Activity.

## Context

Course creation must support a valid structure-only course and must not infer Activity existence from the syllabus or Structure Instruction. Learning Material is preferred evidence when present, but making it mandatory prevents useful Teacher-authorized syllabus fallback.

## Decision

Activity creation is an optional post-Structure branch and every Quiz/Assignment exists only because the Teacher explicitly selected it. Generation resolves one deterministic grounding mode per Activity: MATERIAL_GROUNDED, SYLLABUS_GROUNDED, SYLLABUS_SCOPED_AI, or INSUFFICIENT_EVIDENCE.

SYLLABUS_SCOPED_AI may elaborate only inside syllabus-defined scope and always creates a durable Teacher Review Required condition for the exact Plan Revision. INSUFFICIENT_EVIDENCE spends no model call and may become an Empty Activity Shell only after explicit Teacher confirmation; technical model/provider failure never becomes a shell automatically.

## Consequences

- A CoursePlan with zero Activities is valid.
- Learning Material remains preferred factual authority but is optional.
- Activity selection, Purpose, alignment targets, and learner-context acknowledgment are explicit Teacher authority.
- Generated siblings are independent: retrying one Activity does not regenerate another successful Activity.
- Retry is bounded and Teacher-triggered; exhausted technical failure blocks Finalization until the Activity is removed.
- Finalization includes every active Teacher-Authorized Activity Intent or fails closed; it never silently drops one.
- Official Preview exposes scoped-AI warnings and approval remains blocked until the required review acknowledgment is recorded for that Plan Revision.
- Structure Instruction may shape Structure but cannot create Activity Intents.

## Related decisions

- ADR-0006 fixes the normalized Course Period Cap at 20.
- ADR-0007 defines the narrow Teacher Structure Coverage Override created by explicit Section deletion.
