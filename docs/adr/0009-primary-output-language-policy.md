# ADR-0009 — Syllabus-Derived Primary Output Language

Status: Accepted
Date: 2026-09-29

## Context

Teacher feedback identified English leakage in Course Structure and Activity generation when a Syllabus is primarily Thai but contains English technical terms. Prompt-only language hints are insufficient because different generators, deterministic fallback strings, and provider retries can drift independently.

The system already treats the Syllabus and Core Course Design Context as server-owned Instructional Design authority. Primary Output Language therefore needs one deterministic source of truth rather than a separate model guess or browser/UI-locale preference.

## Decision

1. **One run-level authority.** `CoreCourseDesignContext.primary_output_language` is derived during Syllabus semantic extraction and persisted with the Core Course Design Context. Generic Core Context revisions preserve this authority; they cannot change it independently of the immutable Syllabus source.

2. **Deterministic derivation.** Natural-language signal excludes code, URLs, identifiers, codes, and common technical/product tokens. The first tier with a decisive language signal wins:
   1. Schedule / Topics
   2. Learning Objectives / Source Learning Outcomes
   3. Course Title

   If all semantic tiers contain no decisive natural-language signal, the current compatibility default is English. Browser locale and Moodle UI language are never consulted.

3. **Scope of enforcement.** The authority governs newly authored teacher/student-facing educational prose produced for Course Structure, Quiz, Assignment, and deterministic educational fallbacks. It does not require translation of UI chrome, enum values, technical terms, product names, code, identifiers, or verbatim source quotations.

4. **Teacher visibility, no override.** The Core Context view exposes the derived Primary Output Language and derivation basis. There is no manual language override in this ticket.

5. **Generator enforcement.** Course Structure and Activity generation receive the same authority. After each model response, deterministic validation inspects newly authored educational prose only. A material mismatch receives exactly one correction/regeneration attempt with the same schema, facts, provenance, IDs, and constraints. If the corrected response still materially violates the language authority, generation fails closed with `OUTPUT_LANGUAGE_POLICY_VIOLATION`.

6. **Legacy compatibility.** Historical Core Context records that predate this field are normalized deterministically from their stored semantic fields on read/mutation paths. No UI locale or model inference is used.

## Consequences

- Thai Syllabi may freely contain terms such as Python, API, SQL, C#, Moodle, or JSON without causing the generated surrounding prose to switch to English.
- Source quotations and technical vocabulary are preserved rather than mechanically translated.
- Course Structure, Quiz, and Assignment share one policy and one validation signal.
- Provider language mistakes consume at most one corrective model call.
- Existing Core Context JSON storage is sufficient; no database migration or duplicate Run-row language field is required.
- A future manual language override would be a new authority-model decision and is intentionally out of scope.
