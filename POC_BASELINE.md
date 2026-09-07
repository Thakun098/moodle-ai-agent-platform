# POC_BASELINE.md

## Status

**Working Architecture Baseline for Throw-away POC**

Treat these decisions as frozen unless explicitly changed.

---

## 1. POC Goal

Evaluate two independent dimensions.

### Technical viability

Can the system perform:

```text
LLM → Tool Calling → AI Platform → MCP → Moodle Adapter → Moodle
```

and create/modify real Moodle objects reliably?

### AI quality

Can the selected model produce usable course structure, assignments, quizzes, and questions from a syllabus?

Model-quality failure must not automatically be treated as architecture failure.

---

## 2. Main Environment

```text
Ollama
- Gemma baseline model
- native tool calling

Moodle
- Moodle 5.1.x
- POC local plugin

AI Platform
- Node.js
- TypeScript
- Fastify
- PostgreSQL
- pgvector installed

Supporting
- Drizzle
- JSON Schema
- Ajv
- Vitest
- pnpm
```

---

## 3. Explicitly Out of Scope

- production authentication/authorization
- Teacher capability re-check
- Five Gates
- production Agent Gateway
- complex Context Management
- Context Snapshot / Projection / Fingerprint
- dependency manifests
- RAG / vector retrieval
- Redis / BullMQ
- S3 / MinIO
- Kubernetes / HA
- production retention/compliance audit
- production approval workflow
- production rollback/undo
- multi-site/multi-tenant concerns
- OCR in first syllabus phase

---

## 4. Boundaries That Must Remain

### No direct Moodle DB mutation

```text
AI Platform → MCP → Moodle POC Plugin / Moodle APIs → Moodle
```

### Planning separated from mutation

```text
Plan → Preview → Explicit confirmation → Execute → Verify
```

### Agent planning is declarative

Agent describes educational intent; Executor/Adapter owns Moodle materialization details.

### Final state is verified

A successful API response is not sufficient.

---

## 5. Initial Course Creation Scope

Initial creation includes:

```text
Course
├─ Sections
├─ Assignments
└─ Quizzes
   └─ Questions
```

The CoursePlan is generated from the syllabus, validated, previewed, and only then executed.

### Approved source-authority amendment

The staged course-creation workflow now separates structure authority from activity-content authority:

```text
Syllabus
= Course Structure Authority

Learning Material
= Activity Content Authority

Teacher Instruction
= Activity Instruction / Constraint Authority

Hard Policy / deterministic validation
= Final Enforcement Authority
```

The sealed Course Structure is generated from the syllabus and reviewed by the teacher before activity generation. Quiz and Assignment content must be grounded in the current section's sealed Learning Material snapshot. If no authorized Learning Material exists, generation is blocked; the system must not fall back to syllabus content, model general knowledge, or unrelated course content.

This amendment changes the internal planning source authority but does not change the frozen external CoursePlan contract, `PocRunStatus`, approval semantics, or Moodle mutation boundary.

---

## 6. Existing Course Scope

### Assignment

- read existing Assignment
- generate update plan
- preview
- update
- verify
- add new Assignment to existing Section

### Quiz

- read existing Quiz
- read existing questions
- generate update plan
- preview
- update metadata
- add questions
- update questions where practical
- verify
- add new Quiz to existing Section

Delete/remove is not required initially.

---

## 7. Planning Decision

The system uses:

```text
Plan first → Execute later
```

Planning output must be structured and schema validated.

---

## 8. Plan-local References

Use local refs before Moodle IDs exist:

```text
section-01
assignment-01
quiz-01
question-01
```

Execution maintains mappings such as:

```text
quiz-01 → moodle_quiz_id=72
```

---

## 9. Plan Revision

- user direct edit → new revision
- Agent re-plan → new revision
- previous revisions are not silently overwritten
- execution targets one explicit plan revision

---

## 10. Category Decision

Course categories are created manually in Moodle.

The system may list existing categories. The user selects one before course execution. The selected `category_id` is supplied as execution context.

The Agent must not create or autonomously choose categories.

---

## 11. Moodle Course Defaults

Recommended POC defaults:

```text
visible = false
format = topics
category = user-selected
shortname = executor-generated
```

---

## 12. Quiz Question Types

Required POC V1:

- `multichoice`
- `truefalse`
- `shortanswer`
- `essay`

Not required:

- matching
- drag-and-drop

Recommended simplifications:

- multichoice: single correct answer
- shortanswer: case-insensitive
- essay: manual grading

---

## 13. POC Exception vs Production Baseline

For this POC, initial Course Creation may generate and materialize complete Quiz questions to prove full Tool/MCP/Moodle capability.

This is a POC-specific decision and does not automatically change the production Course Creation V1 baseline.

---

## 14. MCP Decision

- AI Platform = Agent runtime and MCP client/host
- dedicated Moodle MCP Server
- first local transport: prefer stdio unless another transport is explicitly selected

The POC must prove:

1. MCP connection
2. dynamic tool discovery
3. tool invocation
4. normalized results
5. multi-step use of prior tool outputs

---

## 15. Tool Granularity

Use fine-grained tools.

Do not hide course creation behind a single `create_course_from_syllabus` tool.

---

## 16. Agent Runtime Decision

Start with explicit TypeScript orchestration. Do not make a generic Agent framework a core dependency in the first POC.

---

## 17. Syllabus Decision

Initial supported content is machine-readable:

- text
- markdown
- DOCX
- text-readable PDF

OCR is excluded initially. No RAG is required.

Learning Material uses the same deterministic extraction family where practical and additionally supports `.pptx` when the explicit POC extractor is available. A configurable file-size guard and post-extraction token budget are separate controls. Oversized material blocks generation; content is never silently truncated or recursively summarized.

---

## 18. Provenance Decision

Keep minimal `source_refs` where practical for QA and hallucination review. Section source references remain syllabus-grounded. Activity and question source references must be constrained to the current section's sealed MaterialSnapshot. Do not implement production Context lineage, RAG, embeddings, or vector retrieval.

---

## 19. Persistence Decision

Use PostgreSQL for development visibility.

Persist at least:

- runs
- plan revisions
- Agent messages
- MCP tool calls
- local-ref/Moodle-ID mappings
- verification results

pgvector need not be used initially.

---

## 20. Error / Retry Decision

- invalid schema → fail or one controlled correction
- transient transport error → bounded retry
- Moodle mutation error → stop run
- partial state → preserve for debugging
- repeated identical tool call → stop loop
- unsupported qtype → reject before Moodle mutation

No production rollback.

---

## 21. Success Principle

Technical success:

> A validated plan can be executed through real MCP tools and produce a Moodle state that deterministically matches the plan.

AI quality success:

> The generated educational content is sufficiently aligned, correct, complete, and useful.

Measure both separately.
