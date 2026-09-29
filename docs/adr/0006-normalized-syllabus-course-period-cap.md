# Normalized syllabus Course Period Cap

Status: Accepted

## Context

Real syllabi may contain more than ten legitimate teaching periods, while an unbounded schedule makes the POC harder to reason about and render.

## Decision

A normalized syllabus may contain at most **20** course periods, regardless of whether the source calls them Weeks, Units, Topics, Chapters, or Modules. Period 21 and above fail deterministically; the system never truncates silently.

## Consequence

The same limit is enforced at ingestion and contract validation so UI/planning code can rely on a bounded course-period set.
