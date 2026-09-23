# AGENTS.md

## Purpose

This repository is a **throw-away Proof of Concept (POC)** for a future Moodle Agentic AI platform.

The POC must prove that:

1. A configured model provider (Ollama, Groq, or an OpenAI-compatible Unsloth endpoint) can support the structured/tool-calling behavior required by the POC.
2. The AI Platform can act as the Agent runtime and MCP client/host.
3. The AI Platform can discover and invoke Moodle tools through an MCP server.
4. Moodle can be changed through a Moodle-side plugin/API boundary without direct DB writes.
5. The Agent can plan a course from a syllabus, show a preview, then create the course.
6. Initial course creation can include Course, Sections, Assignments, Quizzes, and all supported POC V1 quiz question types.
7. Existing Assignments and Quizzes can later be read, replanned, previewed, updated, or extended by the Agent.
8. Final Moodle state can be read back and verified against the approved plan.

This POC is intentionally disposable. Optimize for **clarity, observability, testability, and speed of learning**, not production completeness.

---

## Required Reading Before Coding

Before starting any task, read:

1. `AGENTS.md`
2. `POC_BASELINE.md`
3. `Implementation.md`
4. `PLANNING_CONTRACT.md`
5. The current Ticket under `C:\moodle-prac\ai-platform-coordination\tickets\` when the work is Ticket-scoped
6. `C:\moodle-prac\ai-platform-coordination\source-of-truth\README.md`
7. Only the latest **relevant** daily SOC sections from `C:\moodle-prac\ai-platform-coordination\source-of-truth\soc\YYYY-MM-DD.md`
8. For audit/re-audit work or remediation of an audit finding, only the latest **relevant** daily Audit sections from `C:\moodle-prac\ai-platform-coordination\source-of-truth\audit\YYYY-MM-DD.md`
9. For bootstrap/deployment work, `DEPLOYMENT.md`

Do not silently override frozen decisions. If a task would require changing one, record the proposed change in today's daily SOC file and stop before implementing the architecture change.

### SOC Retrieval Policy

Never read the historical SOC in full by default.

1. Start from the current Ticket, ADR, task, feature, or code symbol.
2. Search `ai-platform-coordination/source-of-truth/soc/` first.
3. Read only the matching daily file/section plus bounded surrounding context.
4. Expand to adjacent dates only when the matching entry references another dependency.
5. Full historical SOC reads are reserved for explicitly requested holistic historical audits.

Prefer: `Ticket → ADR → Topic/Symbol → Date`. Graphify may be used first to locate relevant code/dependency surfaces; then use those symbols/topics to scope the SOC search.

### Audit Retrieval Policy

Never read the historical Audit log in full by default.

1. Start from the current Ticket, audit finding ID, remediation, feature, or code symbol.
2. Search `ai-platform-coordination/source-of-truth/audit/` first.
3. Read only the matching daily file/section plus bounded surrounding context.
4. Expand to adjacent dates only when the audit entry references another dependency or earlier finding.
5. Full historical Audit reads are reserved for explicitly requested holistic historical audits.

Prefer: `Ticket → Finding ID → Topic/Symbol → Date`. Root `ai-platform-coordination/audit.md` is a pointer only; new audit evidence must be appended to the current daily Audit file.

---

## Core Development Rules

### 1. Plan first, execute second

Required lifecycle:

```text
Syllabus / Current Moodle State
        ↓
Normalize / Read
        ↓
Agent Planning
        ↓
Structured Plan
        ↓
JSON Schema Validation
        ↓
Preview
        ↓
User confirms
        ↓
Execution
        ↓
MCP Tool Calls
        ↓
Moodle
        ↓
Read-back Verification
```

The Agent must never mutate Moodle during planning.

### 2. No direct Moodle database mutation

The AI Platform and MCP Server must never write directly to the Moodle database.

All Moodle mutations must go through the Moodle POC plugin / Moodle-supported APIs.

### 3. Agent expresses intent, not Moodle internals

The Agent decides educational intent and structure. It should not own:

- Moodle DB fields
- Moodle internal IDs before creation
- question bank implementation details
- plugin-specific defaults
- category creation
- generated course shortname
- security configuration

Those belong to the Executor / Moodle Adapter.

### 4. Structured contracts only

Use JSON Schema + Ajv for important Agent and tool outputs. Do not parse critical Agent output with regex.

Structured output is required for:

- `CoursePlan`
- `AssignmentPlan`
- `QuizPlan`
- question plans
- MCP tool inputs
- MCP tool results
- verification results

### 5. Preserve plan-local references

Before Moodle objects exist, use refs such as:

```text
section-01
assignment-01
quiz-01
question-01
```

The Executor maps those refs to Moodle IDs during execution.

### 6. Preview before mutation

All create/update flows use:

```text
Plan → Preview → Execute → Verify
```

Direct user edits create a new plan revision. Agent re-plan also creates a new revision instead of silently overwriting the previous revision.

### 7. Category is manually managed

Course categories are created manually in Moodle for this POC.

The system may list existing categories. The user selects the target `category_id` before execution. The Agent must not create or autonomously select categories.

### 8. Keep the POC small

Do not add production capabilities unless a task explicitly requires them.

Out of scope for the first POC:

- production AuthN/AuthZ
- Teacher capability re-check
- Five Gates
- complex Context Management
- Context Snapshot / Projection / Fingerprint
- RAG
- active pgvector retrieval
- Redis / BullMQ
- S3 / MinIO
- Kubernetes
- HA
- production retention/compliance
- production approval workflow
- production rollback/undo
- multi-site/multi-tenant architecture
- OCR in Phase 1

### 9. pgvector is installed but unused initially

PostgreSQL + pgvector is part of the selected stack, but do not add embeddings/vector retrieval unless explicitly requested.

### 10. Prefer explicit orchestration

Do not add LangChain, LangGraph, CrewAI, AutoGen, or another Agent framework merely for convenience.

The first POC should use an explicit TypeScript Agent loop so tool selection, tool results, retries, failures, and state mappings remain visible.

---

## Technology Stack

### AI Platform

- Node.js
- TypeScript with `strict: true`
- Fastify
- PostgreSQL
- pgvector extension installed but not actively used
- Drizzle ORM
- JSON Schema
- Ajv
- pnpm
- Vitest

### LLM Runtime

- Provider selected through `MODEL_PROVIDER=ollama|groq|unsloth`
- Ollama remains the local baseline; Groq and an OpenAI-compatible Unsloth endpoint are also supported
- provider/model settings are configured through the corresponding environment variables
- structured/native tool calling where available

### MCP

- Official MCP TypeScript SDK where practical
- AI Platform = MCP client/host
- dedicated Moodle MCP Server
- current local transport: stdio

### Moodle

- Moodle 5.1.x
- POC local plugin: `local_agentpoc`
- manually created dedicated POC category
- created POC courses default to hidden
- no direct DB writes

### Development

- Docker Compose may be used for local dependencies
- Ollama may run directly on the development machine
- no Kubernetes

---

## Suggested Repository Structure

```text
/
├─ AGENTS.md
├─ POC_BASELINE.md
├─ Implementation.md
├─ PLANNING_CONTRACT.md
├─ DEPLOYMENT.md
├─ task.md  # deprecated historical tracker; do not update for new work
├─ soc.md  # pointer only; canonical daily SOC lives in ai-platform-coordination/source-of-truth/soc/
├─ apps/
│  ├─ api/
│  └─ moodle-mcp-server/
├─ packages/
│  ├─ contracts/
│  ├─ agent-runtime/
│  ├─ syllabus/
│  ├─ planning/
│  ├─ execution/
│  ├─ verification/
│  └─ moodle-client/
├─ moodle/
│  └─ local_agentpoc/
├─ db/
│  └─ migrations/
├─ tests/
│  ├─ contract/
│  ├─ integration/
│  └─ e2e/
└─ compose.yaml
```

Keep package boundaries clear even though the POC is a modular monolith.

---

## Agent Runtime Principles

The runtime stages are:

```text
PLAN → VALIDATE → PREVIEW → EXECUTE → VERIFY
```

During execution:

1. Load one explicit approved plan revision.
2. Discover available MCP tools.
3. Provide relevant tool definitions to the model/runtime.
4. Validate tool arguments.
5. Execute the MCP call.
6. Persist/record the normalized result.
7. Return the result to the Agent.
8. Track local-ref → Moodle-ID mappings.
9. Stop on unrecoverable mutation failure in the first POC.
10. Run deterministic read-back verification.

Use explicit limits:

- max Agent steps
- repeated-call detection
- model timeout
- tool timeout
- run timeout

---

## MCP Tool Design Principles

Prefer fine-grained tools that prove multi-step orchestration.

Expected capabilities:

```text
moodle_list_course_categories
moodle_create_course
moodle_create_section
moodle_get_course_structure

moodle_create_assignment
moodle_get_assignment
moodle_update_assignment

moodle_create_quiz
moodle_get_quiz
moodle_update_quiz
moodle_get_quiz_questions
moodle_create_quiz_question
moodle_update_quiz_question
moodle_add_question_to_quiz
```

Do not expose destructive delete tools to the Agent in the first POC. Cleanup can be operator/admin-only.

Tool inputs/results must be structured and normalized.

---

## Quiz V1 POC Question Types

Required:

- `multichoice`
- `truefalse`
- `shortanswer`
- `essay`

Initial simplifications:

- multichoice: single correct answer
- true/false: standard boolean answer
- short answer: case-insensitive by default
- essay: manual grading

Out of scope:

- matching
- drag-and-drop

The POC intentionally allows full quiz question generation during initial course creation to prove end-to-end capability. This does not automatically change the production baseline.

---

## Syllabus Handling

Initial supported inputs:

- `.txt`
- `.md`
- `.docx`
- machine-readable `.pdf`

OCR is out of scope for Phase 1.

Recommended flow:

```text
File → Deterministic Text Extraction → Minimal Normalization → Agent Planning
```

Do not use RAG initially.

Keep minimal provenance/source references when practical for QA.

---

## Verification Rules

A successful tool response is not enough.

Read Moodle state back and compare it to the approved plan.

Verify at least:

- course exists
- selected category applied
- course hidden
- expected sections exist
- expected assignments exist in correct sections
- expected quizzes exist in correct sections
- expected quiz question count exists
- expected V1 qtypes exist
- important names/marks/structural fields match

Technical verification and AI quality evaluation are separate.

---

## Ticket Completion Protocol

`task.md` is deprecated and retained only as historical context. Do not update it for new work.

Every Ticket/task must:

1. For Ticket-scoped work, read the current Ticket under `C:\moodle-prac\ai-platform-coordination\tickets\`.
2. Implement only the Ticket scope.
3. Run relevant tests and validation.
4. Update the Ticket status/evidence when implementation, review, or closure state changes.
5. Append a completion/checkpoint record to `C:\moodle-prac\ai-platform-coordination\source-of-truth\soc\YYYY-MM-DD.md` for the current date.
6. For audit/re-audit work, append findings/evidence to the current daily Audit file.
7. Record files changed, tests, decisions, limitations, deployment state, and next work.

A Ticket is not complete until its Ticket record and current daily SOC evidence are synchronized. Audit findings must remain visible until explicitly resolved, bypassed/accepted, or otherwise dispositioned.

---

## Coding Style

- Prefer small explicit modules.
- Avoid hidden global state.
- Keep domain logic out of Fastify handlers.
- Keep MCP protocol logic separate from Moodle business logic.
- Keep Moodle-specific mapping in the Moodle adapter/client layer.
- Validate at boundaries.
- Return typed errors.
- Log enough information to debug every run.
- Do not add abstractions without a current POC use case.

---

## Error Philosophy

For the first POC:

- schema validation failure → fail or one controlled correction where appropriate
- transient transport failure → small bounded retry
- Moodle mutation failure → stop run and preserve state for debugging
- partial Moodle state → preserve for inspection; cleanup manually
- repeated identical tool loop → terminate run
- unsupported qtype → reject before Moodle mutation

Do not implement production rollback/compensation yet.

---

## Final Rule

The POC exists to answer:

> Can an Agent plan from a syllabus, preview the intended result, use MCP tools to materialize a real Moodle course with Assignments and Quizzes, later modify those activities, and produce a final Moodle state that matches the plan?

Work that does not help answer that question is optional.
