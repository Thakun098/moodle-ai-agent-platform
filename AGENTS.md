# AGENTS.md

## Purpose

This repository is a disposable Moodle Agentic AI proof of concept. Optimize for clear authority boundaries, observability, reproducible tests, and fast learning rather than production completeness.

## Agent skills

### Issue tracker

Work is tracked in the workspace-level coordination tickets at C:\moodle-prac\ai-platform-coordination\tickets, not GitHub Issues. See docs/agents/issue-tracker.md.

### Domain docs

This repo uses a **single-context** domain model: the root CONTEXT.md is the glossary and docs/adr/ holds durable architectural decisions. See docs/agents/domain.md.

## Read before changing code

1. AGENTS.md.
2. CONTEXT.md.
3. The ADRs in docs/adr/ that touch the area being changed.
4. The current ticket from C:\moodle-prac\ai-platform-coordination\tickets.
5. Only the relevant daily SOC/Audit sections referenced by that ticket or finding.
6. DEPLOYMENT.md when the task changes runtime or Moodle deployment.

Do not read the entire historical SOC/Audit by default. Retrieve by ticket, finding, ADR, symbol, or date.

## Core product guardrails

- Course creation follows Plan -> Preview -> explicit Teacher authorization -> Execute -> Verify.
- The AI Platform and MCP Server never mutate Moodle through direct database writes. Moodle mutations go through the Moodle plugin/API boundary.
- The model expresses educational intent; Moodle IDs, plugin defaults, category materialization, and Moodle-specific mechanics belong to the adapter/executor.
- Important model/tool outputs use structured contracts and deterministic validation.
- Plan-local refs remain stable until the executor maps them to Moodle IDs.
- Course categories are teacher-selected from existing Moodle categories; the agent does not create or autonomously choose them.
- Syllabus and Activity grounding authority must follow the accepted ADRs. Never weaken deterministic grounding or teacher-review gates just to make a test pass.
- Do not infer learner facts that the source or Teacher did not provide.
- A frozen or accepted architectural decision may only be changed explicitly. Record the replacement decision in an ADR instead of silently editing history.

## Documentation rules

- CONTEXT.md is a glossary only: short domain definitions plus _Avoid_ synonyms. Do not turn it into a spec, changelog, or scratchpad.
- docs/adr/ holds hard-to-reverse decisions that are surprising without context and came from a real trade-off. Keep ADRs decision-focused; superseded ADRs remain for history.
- Executable contracts live with code under packages/contracts/ and their tests. Do not maintain a second conceptual contract document that can drift.
- Current work state and acceptance evidence live in the coordination ticket/SOC/Audit, not in repo-local status diaries.
- Operational usage belongs in README.md and DEPLOYMENT.md.

## Engineering workflow

- Work ticket-by-ticket in an isolated branch/worktree when practical.
- Use RED/GREEN tests at the behavior seam before broad implementation.
- Validate the narrow change first, then affected regressions, typecheck/build, and runtime/Moodle behavior when the ticket crosses that boundary.
- A focused green suite does not erase known baseline failures; state baseline failures separately and prove whether the current change adds a new failure.
- Review both axes before closure: repository standards and originating ticket/spec behavior.
- For tickets that require independent scrutiny, trace the real path end-to-end rather than reviewing only the diff.
- Never mark a Moodle-bound ticket closed on source assertions alone when its acceptance criteria require rendered/runtime evidence.

## Source-of-truth locations

- Ticket frontier: C:\moodle-prac\ai-platform-coordination\tickets\README.md
- Ticket files: C:\moodle-prac\ai-platform-coordination\tickets\NN-*.md
- Daily SOC: C:\moodle-prac\ai-platform-coordination\source-of-truth\soc\YYYY-MM-DD.md
- Daily Audit: C:\moodle-prac\ai-platform-coordination\source-of-truth\audit\YYYY-MM-DD.md
- Domain glossary: CONTEXT.md
- Architecture decisions: docs/adr/
- Deployment/runbook: DEPLOYMENT.md

## Final rule

The POC exists to prove that an agent can turn source-backed instructional intent into a previewed, explicitly authorized Moodle change and then verify the resulting Moodle state. Prefer the smallest change that strengthens that proof.
