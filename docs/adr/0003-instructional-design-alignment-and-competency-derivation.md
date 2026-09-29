# Instructional design alignment and competency derivation

Status: Accepted
Extends: ADR-0002.

## Context

Grounding Activity content is not enough to guarantee instructional alignment. Course design needs source-backed Objectives, Outcomes, learner context, and a clear boundary between AI proposals and Teacher authority.

## Decision

The system maintains one revisioned Core Course Design Context and projects only the required fields into two AI domains: Course/Instructional Design and Activity Design. Learning Objectives and Learning Outcomes are distinct concepts; source wording remains traceable, measurable Outcome revisions become authoritative only after Teacher approval, and learner facts are never inferred when the source is silent.

Course Structure maps Sections to authorized Objectives/Outcomes. For each selected Activity, the Teacher owns Activity Purpose and target Outcomes; Activity generation receives only the selected Section/alignment/learner/grounding context. Competency Candidates are derived only from approved Outcomes and remain non-authoritative until Teacher review; Activity-to-Competency Mapping and Competency Evidence Eligibility are separate Teacher decisions.

## Consequences

- Prompt domains are stage-specific and context-bounded rather than one monolithic planning prompt.
- Missing learner context may proceed only through explicit Learner Context Acknowledgment and remains visible for review.
- Changes to authoritative Outcome, learner, Material, Purpose, or selected-alignment revisions stale only their dependent artifacts.
- AI cannot silently replace source Outcomes, invent Competencies, or treat alignment as evidence eligibility.
- Moodle-native Competency materialization remains downstream of approved Teacher decisions.
- Executable shapes and validators live with the implementation/contracts; this ADR records authority and semantic boundaries only.
