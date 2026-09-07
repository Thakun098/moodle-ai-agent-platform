# AGENTS.md

## Purpose

This repository is a **throw-away Proof of Concept (POC)** for a future Moodle Agentic AI platform.

The POC must prove that:

1. An LLM running in Ollama can perform native tool calling.
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
5. `task.md`
6. Latest relevant entries in `soc.md`

Do not silently override frozen decisions. If a task would require changing one, record the proposed change in `soc.md` and stop before implementing the architecture change.

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

- Ollama
- Initial Gemma 4 e2b-class baseline discussed for the POC
- model name configurable through `OLLAMA_MODEL`
- native tool calling where available

### MCP

- Official MCP TypeScript SDK where practical
- AI Platform = MCP client/host
- dedicated Moodle MCP Server
- initial local transport: prefer stdio unless another transport is explicitly frozen

### Moodle

- Moodle 5.1.x
- POC local plugin, suggested frankenstyle name: `local_agentpoc`
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
├─ task.md
├─ soc.md
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
└─ docker-compose.yml
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

## Task Completion Protocol

Every task must:

1. Read its entry in `task.md`.
2. Implement only the task scope.
3. Run relevant tests.
4. Mark `[x]` in `task.md` only when done.
5. Append a completion record to `soc.md`.
6. Record files changed, tests, decisions, limitations, and next work.

A task is not complete until both `task.md` and `soc.md` are updated.

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
