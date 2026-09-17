# SOC moved to coordination source-of-truth

The canonical System of Context (SOC) no longer lives in this repository root.

Use:

`C:\moodle-prac\ai-platform-coordination\source-of-truth\README.md`

Historical SOC is split by date under:

`C:\moodle-prac\ai-platform-coordination\source-of-truth\soc\YYYY-MM-DD.md`

## Agent rule

Do **not** rebuild or append to a monolithic `soc.md` here.

Search the daily SOC directory by Ticket, ADR, topic/symbol, or date, then read only the matching section(s). Append new evidence to the current day's SOC file.

The original monolithic SOC was split on 2026-09-14 with byte-for-byte reconstruction verification. See:

`C:\moodle-prac\ai-platform-coordination\source-of-truth\soc\_manifest.json`

## 2026-09-14 — Ticket 18 Aligned Course Structure & Teacher Outcome Approval

Ticket 18 is CLOSED.

- Added Instructional Designer / DESIGN_STRUCTURE Core Context projection with strict activity-free boundary.
- Added deterministic authorized Section Objective/Outcome mappings, measurable Outcome proposals, Teacher approval/edit revisions, and source-preserving provenance.
- Added deterministic coverage states; uncovered/stale approved Outcomes block Structure sealing unless a persisted external Teacher override is present.
- Fixed candidate Structure publication ordering so validation occurs before any sealed-authority switch.
- Added protected Instructional Design API/BFF routes, Moodle settings, and Teacher review UI. Moodle reload hydrates the full design projection and persisted Structure revision from server state.
- Validation: 32/32 focused Ticket 18 tests; 26/26 Ticket 17 compatibility tests; 20/20 PostgreSQL persistence tests; build/typecheck, JS syntax, PHP lint, and git diff checks passed.
- Runtime: Moodle plugin 2026091401 / v0.1.21; authenticated BFF/browser upload, Outcome approval, alignment/stale rendering, and persisted reload passed with no browser errors.
- The live browser model generation exceeded the bounded timeout, so the UI acceptance used a bounded Structure response fixture; model adapter behavior is covered by the focused DESIGN_STRUCTURE prompt regression. No Moodle activity/course mutation was performed by Ticket 18.
