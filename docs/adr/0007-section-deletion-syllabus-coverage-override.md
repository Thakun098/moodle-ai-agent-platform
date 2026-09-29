# Explicit Section deletion as a narrow syllabus-coverage override

Status: Accepted

## Context

Teachers may deliberately delete a generated Course Structure Section, but normal sealing requires every syllabus schedule anchor to remain covered.

## Decision

Deleting a Section creates a coverage override only for syllabus anchors that the deleted Section demonstrably covered in the immediately preceding revision. Rename/provenance loss, broken source references, or position-only similarity never create an override.

## Consequence

Teacher deletion is respected without weakening deterministic syllabus coverage for accidental or ambiguous omissions.
