# task.md

## How to Use This File

- Every executable item has a stable task ID.
- Mark `[x]` only after implementation and relevant tests are complete.
- After marking a task complete, append an entry to the current daily SOC file at `C:\moodle-prac\ai-platform-coordination\source-of-truth\soc\YYYY-MM-DD.md`.
- If blocked, keep `[ ]` and record the blocker in the current daily SOC file at `C:\moodle-prac\ai-platform-coordination\source-of-truth\soc\YYYY-MM-DD.md`.
- Do not silently change frozen architecture decisions to complete a task.

---

# Phase 0 — Repository and Development Baseline

- [x] **T0001 — Initialize pnpm workspace**
  - root `package.json`
  - pnpm workspaces
  - Node/TypeScript baseline
  - `.gitignore`
  - `.env.example`

- [x] **T0002 — Configure TypeScript**
  - `strict: true`
  - shared base `tsconfig`

- [x] **T0003 — Create repository structure**
  - `apps/api`
  - `apps/moodle-mcp-server`
  - `packages/contracts`
  - `packages/agent-runtime`
  - `packages/syllabus`
  - `packages/planning`
  - `packages/execution`
  - `packages/verification`
  - `packages/moodle-client`
  - `moodle/local_agentpoc`
  - `tests`

- [x] **T0004 — Add development commands**
  - typecheck
  - test
  - lint/format if selected
  - build

- [x] **T0005 — Create local development environment**
  - PostgreSQL
  - pgvector extension available
  - environment variables
  - documented local start commands

---

# Phase 1 — Contract Foundation

- [x] **T0101 — Freeze PlanEnvelope v0.1 JSON Schema**
  - schema version
  - plan ID
  - revision
  - plan type
  - operation
  - title/summary
  - warnings/assumptions

- [x] **T0102 — Freeze SourceReference v0.1**

- [x] **T0103 — Freeze CourseDefinition v0.1**
  - educational fields only
  - no category ID
  - no Moodle shortname

- [x] **T0104 — Freeze SectionPlan v0.1**
  - local ref
  - position
  - title/summary
  - source refs
  - activities

- [x] **T0105 — Freeze AssignmentPlan v0.1**
  - local ref
  - title
  - description
  - instructions
  - learning objectives
  - grade
  - source refs

- [x] **T0106 — Freeze QuizPlan v0.1**
  - local ref
  - title/description
  - questions
  - source refs

- [x] **T0107 — Freeze MultipleChoiceQuestionPlan v0.1**

- [x] **T0108 — Freeze TrueFalseQuestionPlan v0.1**

- [x] **T0109 — Freeze ShortAnswerQuestionPlan v0.1**

- [x] **T0110 — Freeze EssayQuestionPlan v0.1**

- [x] **T0111 — Implement Ajv JSON Schema validation**

- [x] **T0112 — Align TypeScript types with schemas**
  - contract tests

- [x] **T0113 — Freeze ExecutionRequest v0.1**
  - plan ID/revision
  - selected category ID for course create
  - target IDs for update flows

- [x] **T0114 — Freeze VerificationResult v0.1**

---

# Phase 2 — Persistence

- [x] **T0201 — Configure Drizzle + PostgreSQL**

- [x] **T0202 — Create `poc_run` migration/model**

- [x] **T0203 — Create `poc_plan` migration/model**

- [x] **T0204 — Create `poc_message` migration/model**

- [x] **T0205 — Create `poc_tool_call` migration/model**

- [x] **T0206 — Create `poc_execution_mapping` migration/model**

- [x] **T0207 — Create `poc_verification` migration/model**

- [x] **T0208 — Add data access/repository layer**

- [x] **T0209 — Add minimal operation idempotency persistence**

---

# Phase 3 — Fastify AI Platform Skeleton

- [x] **T0301 — Bootstrap Fastify API app**

- [x] **T0302 — Add health endpoint**

- [x] **T0303 — Add central error shape**

- [x] **T0304 — Add run ID/request correlation**

- [x] **T0305 — Add structured development logging**

- [x] **T0306 — Add configuration loader**
  - Ollama URL/model
  - PostgreSQL URL
  - MCP settings
  - Moodle settings
  - Agent limits

---

# Phase 4 — Syllabus Ingestion

- [x] **T0401 — Define minimal NormalizedSyllabus contract**

- [x] **T0402 — Add `.txt` ingestion**

- [x] **T0403 — Add `.md` ingestion**

- [x] **T0404 — Add `.docx` text extraction**

- [x] **T0405 — Add machine-readable `.pdf` text extraction**

- [x] **T0406 — Reject/flag scanned PDF requiring OCR**

- [x] **T0407 — Add syllabus upload endpoint**

- [x] **T0408 — Preserve minimal source-position metadata when practical**

- [x] **T0409 — Add syllabus extraction tests**

---

# Phase 5 — Ollama and Planning

- [x] **T0501 — Implement Ollama client abstraction**
- [x] **T0502 — Configure `OLLAMA_MODEL`**
- [x] **T0503 — Prove basic model request/response**
- [x] **T0504 — Prove native tool-calling response in isolation**
- [x] **T0505 — Implement Course Planner**
  - input NormalizedSyllabus
  - output CoursePlan
  - no Moodle mutation
- [x] **T0506 — Validate generated CoursePlan with Ajv**
- [x] **T0507 — Persist plan revision**
- [x] **T0508 — Implement plan revision helper**
  - direct user edit creates revision
  - Agent re-plan creates revision
- [x] **T0509 — Implement Assignment Planner for existing activities**
- [x] **T0510 — Implement Quiz Planner for existing activities**
- [x] **T0511 — Add planning prompt fixtures**
- [x] **T0512 — Add planner tests using fixed syllabus fixtures**

---

# Phase 6 — Preview

- [x] **T0601 — Add CoursePlan preview endpoint**

- [x] **T0602 — Add AssignmentPlan preview endpoint**

- [x] **T0603 — Add QuizPlan preview endpoint**

- [x] **T0604 — Show warnings, assumptions, and source refs**

- [x] **T0605 — Support direct plan edits before execution**

- [x] **T0606 — Ensure execution targets an explicit plan revision**

---

# Phase 7 — Moodle POC Plugin

- [x] **T0701 — Create `local_agentpoc` plugin skeleton**

- [x] **T0702 — Implement list course categories function**

- [x] **T0703 — Implement create course function**
  - Moodle-supported API
  - hidden course
  - existing category ID
  - deterministic shortname

- [x] **T0704 — Implement create section function**

- [x] **T0705 — Implement read course structure function**

- [x] **T0706 — Implement create assignment function**

- [x] **T0707 — Freeze Assignment Moodle defaults**
  - submission type
  - grade handling
  - dates
  - groups
  - completion

- [x] **T0708 — Implement get assignment function**

- [x] **T0709 — Implement update assignment function**

- [x] **T0710 — Implement create quiz function**

- [x] **T0711 — Implement get quiz function**

- [x] **T0712 — Implement update quiz function**

- [x] **T0713 — Implement get quiz questions function**

- [x] **T0714 — Implement multichoice question creation**

- [x] **T0715 — Implement truefalse question creation**

- [x] **T0716 — Implement shortanswer question creation**

- [x] **T0717 — Implement essay question creation**

- [x] **T0718 — Implement add question to quiz**

- [x] **T0719 — Implement update quiz question where practical**

- [x] **T0720 — Confirm no direct Moodle DB mutation is used**

- [x] **T0721 — Add Moodle-side test/debug procedure**

---

# Phase 8 — Moodle Client

- [x] **T0801 — Implement AI-platform-side Moodle client abstraction**

- [x] **T0802 — Normalize Moodle plugin responses**

- [x] **T0803 — Normalize Moodle errors**

- [x] **T0804 — Add Moodle client integration tests**

---

# Phase 9 — MCP Server

- [x] **T0901 — Bootstrap Moodle MCP Server**

- [x] **T0902 — Freeze initial MCP transport**
  - default recommendation: stdio for local POC

- [x] **T0903 — Register `moodle_list_course_categories`**

- [x] **T0904 — Register `moodle_create_course`**

- [x] **T0905 — Register `moodle_create_section`**

- [x] **T0906 — Register `moodle_get_course_structure`**

- [x] **T0907 — Register Assignment create/get/update tools**

- [x] **T0908 — Register Quiz create/get/update/get-questions tools**

- [x] **T0909 — Register Question create/update/add-to-quiz tools**

- [x] **T0910 — Add MCP input schema validation**

- [x] **T0911 — Add normalized structured MCP results**

- [x] **T0912 — Add typed MCP errors**

- [x] **T0913 — Prove tool discovery from AI Platform**

- [x] **T0914 — Prove MCP `callTool` without LLM**

---

# Phase 10 — Agent Tool Runtime

- [x] **T1001 — Implement MCP client in AI Platform**

- [x] **T1002 — Implement dynamic tool discovery**

- [x] **T1003 — Convert MCP tool definitions to model tool definitions**

- [x] **T1004 — Implement explicit Agent loop**

- [x] **T1005 — Validate tool arguments before MCP invocation**

- [x] **T1006 — Persist every tool call/result**

- [x] **T1007 — Implement local-ref → Moodle-ID mapping**

- [x] **T1008 — Return normalized tool results to model**

- [x] **T1009 — Add max step limit**

- [x] **T1010 — Add repeated identical tool-call detection**

- [x] **T1011 — Add model/tool/run timeouts**

- [x] **T1012 — Add bounded transport retry**

- [x] **T1013 — Add minimal mutation idempotency**

- [x] **T1014 — Stop on unrecoverable Moodle mutation failure**

- [x] **T1015 — Preserve provider tool-call correlation**
  - carry the assistant tool-call ID into each tool-result message
  - serialize `tool_call_id` for Groq and OpenAI-compatible providers
  - add agent-loop and provider-payload regression tests

---

# Phase 11 — Course Execution

- [x] **T1101 — List/select existing Moodle category**

- [x] **T1102 — Create ExecutionRequest from approved CoursePlan revision**

- [x] **T1103 — Execute course creation**

- [x] **T1104 — Execute section creation in plan order**

- [x] **T1105 — Execute Assignment creation**

- [x] **T1106 — Execute Quiz creation**

- [x] **T1107 — Execute Question creation for all supported qtypes**

- [x] **T1108 — Add created questions to Quiz**

- [x] **T1109 — Return created Moodle course ID/URL**

- [x] **T1110 — Preserve partial state on failure for debugging**

---

# Phase 12 — Existing Assignment Update

- [x] **T1201 — Read existing Assignment state**

- [x] **T1202 — Generate AssignmentPlan update from state + instruction**

- [x] **T1203 — Preview Assignment update**

- [x] **T1204 — Execute Assignment update through MCP**

- [x] **T1205 — Verify updated Assignment**

- [x] **T1206 — Add new Assignment to existing Section**

---

# Phase 13 — Existing Quiz Update

- [x] **T1301 — Read existing Quiz state**

- [x] **T1302 — Read existing Quiz questions**

- [x] **T1303 — Generate QuizPlan update from state + instruction**

- [x] **T1304 — Preview Quiz update**

- [x] **T1305 — Update Quiz metadata through MCP**

- [x] **T1306 — Add new Quiz questions**

- [x] **T1307 — Update existing Quiz questions where supported**

- [x] **T1308 — Verify updated Quiz**

- [x] **T1309 — Add new Quiz to existing Section**

---

# Phase 14 — Verification Engine

- [x] **T1401 — Build expected Course structure projection from Plan**

- [x] **T1402 — Read actual Course structure from Moodle**

- [x] **T1403 — Compare Course metadata**

- [x] **T1404 — Compare Sections**

- [x] **T1405 — Compare Assignments**

- [x] **T1406 — Compare Quizzes**

- [x] **T1407 — Compare Quiz question counts/types**

- [x] **T1408 — Compare important question fields**

- [x] **T1409 — Persist VerificationResult**

- [x] **T1410 — Expose verification result**

---

# Phase 15 — Test Fixtures and QA

- [x] **T1501 — Create simple synthetic syllabus fixture**

- [x] **T1502 — Add representative syllabus fixture #1**

- [x] **T1503 — Add representative syllabus fixture #2**

- [x] **T1504 — Create planning/quality rubric**

- [x] **T1505 — Create technical metrics collector**

- [x] **T1506 — Measure tool-schema validity rate**

- [x] **T1507 — Measure MCP/tool execution success**

- [x] **T1508 — Measure end-to-end verification pass rate**

- [x] **T1509 — Measure model/tool/total latency**

- [x] **T1510 — Create human AI-quality evaluation rubric**

- [x] **T1511 — Run repeated tests with frozen syllabus/model config**

- [x] **T1512 — Record technical result separately from AI quality result**

- [x] **T1513 — Align Course Planning model schema and Groq E2E model**
  - audit model-facing CoursePlan schema against frozen planning schemas
  - enforce nonblank strings and grounded source-reference constraints
  - reduce repeated schema/prompt tokens while preserving provenance validation
  - use Groq `openai/gpt-oss-120b` for the current E2E runtime
  - re-run Preview → Approve → Execute → Verify with the Python OOP mock syllabus

- [x] **T1514 — Preserve syllabus language and plan-summary semantics**
  - preserve the primary syllabus language in generated pedagogical content
  - require non-empty generated Section summaries across providers
  - keep `poc_plan.summary` as the pedagogical Plan summary during revisions
  - distinguish revision change notes from the Plan summary
  - add Thai/English and revision-summary regression tests

- [x] **T1515 — Rebuild and restart runtime after language changes**
  - rebuild planning/API artifacts
  - start API on port 3000 from current `.env`
  - verify Groq 120B startup configuration and new-run metadata

- [x] **T1516 — Harden multilingual PDF syllabus ingestion**
  - recognize Thai course/description/objective/assessment/schedule headings
  - preserve Thai week/unit anchors
  - normalize numbered schedule-table rows with page provenance
  - fail deterministically on substantial PDFs with empty normalization
  - keep English Markdown/PDF behavior covered by regression tests

---

# Phase 16 — End-to-End Demo

- [ ] **T1601 — E2E Upload → Plan → Preview**

- [ ] **T1602 — E2E Select Category → Execute**

- [ ] **T1603 — E2E Course + Sections created**

- [ ] **T1604 — E2E Assignment created**

- [ ] **T1605 — E2E Quiz created**

- [ ] **T1606 — E2E Multichoice created**

- [ ] **T1607 — E2E True/False created**

- [ ] **T1608 — E2E Short Answer created**

- [ ] **T1609 — E2E Essay created**

- [ ] **T1610 — E2E Course read-back verification passes**

- [ ] **T1611 — E2E Existing Assignment update passes**

- [ ] **T1612 — E2E Existing Quiz update/add-question passes**

- [ ] **T1613 — Produce final POC technical findings**

- [ ] **T1614 — Produce final AI quality findings**

- [ ] **T1615 — Produce Go / Change Model / Change Tool Design / Stop recommendation**

- [x] **T1616 — Keep Preview edits contract-valid**
  - omit empty optional constrained strings
  - generate valid deterministic Section refs/positions
  - preserve immutable prior revisions
  - add Preview helper and revision regression tests

- [x] **T1617 — Complete Preview editor actions and runtime model restart**
  - bind explicit modal Cancel/Close handlers
  - delete Sections and Assignments/Quizzes through immutable revisions
  - preserve Week/Unit grouping and meaningful generated summaries
  - restart/verify the Groq 120B API runtime

- [x] **T1618 — Chunked Course Planning & Activity Generation**
  - compile supported teacher activity instructions into internal constraints
  - split structure planning from bounded two-section activity generation calls
  - validate and targeted-repair activity chunks before deterministic assembly
  - add read-only in-memory planning progress and Moodle BFF/UI polling
  - preserve existing run lifecycle, immutable revisions, and frozen contract

---

# Phase 17 — Learning Material-Grounded Activity Generation

- [x] **T1701 — Record approved architecture amendment**
  - update `POC_BASELINE.md`, `Implementation.md`, `task.md`, and the current daily SOC file
  - record source authority and explicit POC exclusions

- [x] **T1702 — Add internal Structure Revision model**
- [x] **T1703 — Add Structure APIs**
- [x] **T1704 — Refactor CoursePlanner orchestration boundary**
  - [x] legacy `/api/runs/:runId/plans/course` now rejects bypass attempts
  - [x] staged Structure → Material → Section generation → Finalization is the authoritative initial path
- [x] **T1705 — Add Moodle Material Draft file area**
- [x] **T1706 — Add immutable Moodle Material Snapshot file area**
- [x] **T1707 — Add Moodle material metadata persistence**
- [x] **T1708 — Create `packages/materials` ingestion package**
- [x] **T1709 — Add PPTX extraction if required by the POC UX**
- [x] **T1710 — Add MaterialSnapshot persistence**
- [x] **T1711 — Add configurable material limits**
- [x] **T1712 — Implement bounded MaterialContextProvider**
- [x] **T1713 — Implement material-specific provenance allowlists**
- [x] **T1714 — Implement per-Activity generator**
- [x] **T1715 — Implement sequential Section generation orchestrator**
- [x] **T1716 — Implement Activity dependency and STALE semantics**
- [x] **T1717 — Implement Section completion state**
- [x] **T1718 — Implement final CoursePlan assembler**
- [x] **T1719 — Update Moodle BFF/UI**
  - [x] add server-side BFF actions for structure/material/snapshot/section generation/finalization
  - [x] update AMD source for staged Structure Review and per-section Material workflow
  - [x] rebuild/sync `amd/build/course_builder.min.js` into the real Moodle runtime copy
- [ ] **T1720 — Regression and E2E hardening**
  - [x] full AI Platform typecheck/test/build gates
  - [x] latest recorded full regression: 62 test files, 501 passed, 3 opt-in skipped (2026-09-07)
  - [x] failure → retry on unchanged snapshot → finalization API regression; focused 5/5 passed (2026-09-07)
  - [x] September 6 blocked/retry UI corrections synchronized into Moodle container and caches purged (2026-09-07)
  - [x] real Moodle staged E2E and Moodle upgrade/purge verification
  - [x] PDF/location-only Stage 1 provenance regression, including sparse provider section fields
  - [x] edited Structure teacher-intent re-resolution regression
  - [x] MaterialSnapshot uniqueness across Structure revisions regression and live migration verification
  - [ ] formal fixed-point Git code review

---

# Phase 18 — Cleanup and Handoff

- [ ] **T1801 — Add operator cleanup script/procedure for POC courses**
- [ ] **T1802 — Document known limitations**
- [ ] **T1803 — Document reusable vs disposable code**
- [ ] **T1804 — Update `Implementation.md` with final actual behavior if needed**
- [ ] **T1805 — Ensure every completed task has a daily SOC entry**
- [ ] **T1806 — Tag/archive final POC state**

## 2026-09-10 — Additional contract audit

- [x] **Audit current execution/verification contracts using Scrutinize and the existing Graphify graph, without subagents.**
  - Report: `../ai-platform-coordination/contract-audit-2026-09-10.md`.
  - Existing targeted regression: 10/10 passed; isolated audit probes: 1 control passed, 5 negative assertions exposed defects.
  - Audit complete; F1–F4 remediation and live Moodle verification remain open. No production code changed.


## Instructional Design Alignment — Coordination Tickets

- [x] **Ticket 17 — Core Course Design Context & Syllabus Semantic Extraction** (2026-09-14)
  - Additive source semantics, stable provenance, PostgreSQL revision 1, Moodle BFF summary/reload.
  - 70 focused/compatibility tests passed; real Moodle browser reload for rich/incomplete fixtures passed.
- [x] **Ticket 18 — Aligned Course Structure & Teacher Outcome Approval**
  - DESIGN_STRUCTURE Core Context projection with activity-free prompt.
  - Authorized Section Objective/Outcome mappings and measurable Outcome proposals.
  - Teacher Outcome approval/edit revisions, deterministic coverage, external override, and STALE_ALIGNMENT.
  - Safe candidate Structure publication and Moodle BFF/browser reload evidence.

- [x] **Ticket 19 — Teacher-reviewed Competency Candidate Derivation** (2026-09-15)
  - Approved-Outcome-only Candidate derivation, Teacher lifecycle decisions, many-to-many lineage, UNALIGNED override, and no Moodle Competency materialization before Execute.
  - Focused/API/PostgreSQL/live Moodle browser evidence recorded in `../ai-platform-coordination/tickets/evidence/19-teacher-reviewed-competency-candidate-derivation.md`.
- [x] **Ticket 20 — Versioned Activity Intent & Alignment Controls** (2026-09-15)
  - Purpose/alignment/learner acknowledgment validation, versioned semantic Intent persistence, generation-instruction attribution, and sibling-safe stale transitions.
  - Recursive canonical JSON equality fixed PostgreSQL `jsonb` key-order churn; PostgreSQL regression and Moodle BFF browser reload evidence passed.
  - Closure evidence recorded in `../ai-platform-coordination/tickets/evidence/20-versioned-activity-intent-alignment-controls.md` and `../ai-platform-coordination/source-of-truth/soc/2026-09-15.md`.

- [x] **Ticket 21 — Constructively Aligned Quiz/Assignment Generation** (2026-09-16)
  - Bounded Groq provider-format recovery, Activity Design Context, structured self-review, deterministic hidden-scope validation, CAS publication safety, and human-readable LO/CLO Teacher target UI.
  - Real Moodle/BFF/Groq acceptance completed; closure evidence recorded in `../ai-platform-coordination/tickets/evidence/21-constructively-aligned-activity-generation.md` and `../ai-platform-coordination/source-of-truth/audit/2026-09-16.md`.
- [x] **Ticket 22 — Teacher-edited Activity Provenance & Revalidation** (2026-09-16)
  - Immutable generated→Teacher-edited Activity content revisions with `TEACHER_EDITED` lineage and source generation revision.
  - Deterministic edit revalidation, zero-LLM edit path, invalid-edit preservation, reloadable server-authoritative state, and Moodle edit/provenance UI.
  - Finalizer hardened so malformed persisted generated content returns typed `PLAN_DOMAIN_INVALID` instead of HTTP 500.
  - Final Official Preview verified current Teacher-edited Quiz/Assignment bodies and provenance; closure evidence recorded in `../ai-platform-coordination/tickets/evidence/22-teacher-edited-activity-provenance-revalidation.md`.


## 2026-09-16 — Ticket 22 post-closure code-review remediation

- [x] **T22-CR-01 — Preserve immutable AI revision lineage across regeneration**
- [x] **T22-CR-02 — Preserve CAS for legacy first Teacher edit seed transition**
- [x] **T22-CR-03 — Centralize Activity Intent response serialization**
- [x] **T22-CR-04 — Attribute Approval self-review to source AI revision after Teacher edit**
- [x] **T22-CR-05 — Move Teacher-edit domain orchestration out of Fastify handler**
  - Final focused regression: 73/73 PASS.
  - Moodle static UI regressions PASS.
  - Workspace typecheck/build PASS.
  - Runtime Moodle v0.1.29 Official Preview acceptance PASS.


- [x] **Ticket 23 - Teacher-confirmed Competency Mapping & Evidence Eligibility** (2026-09-16)
  - deterministic shared-Outcome Activity↔Competency proposals
  - explicit Teacher mapping confirmation separate from evidence eligibility
  - PostgreSQL persisted review revision/CAS and stale transitions
  - Competency/Activity authority changes stale mapping/evidence without staling generated Activity
  - Moodle BFF/UI mapping/evidence controls and Final Preview readback
  - real browser acceptance: Quiz evidence declined, Assignment evidence confirmed, reload + stale + re-confirm lifecycle
  - plugin `2026091604 / v0.1.30`; Ticket 19–23 compatibility 60/60 PASS; workspace typecheck/build PASS


## 2026-09-16 - Ticket 24 closure

- [x] **Ticket 24 - Moodle-native Competency Materialization & Readback** (2026-09-16)
  - Explicit framework guard proved at runtime (`COMPETENCY_FRAMEWORK_REQUIRED` before Moodle mutation).
  - Selected Moodle framework ID 2 after MCP visibility/manageability readback.
  - Approval-time Competency execution snapshot persisted for exact Plan revision.
  - Fixed approved-scope parity + canonical JSONB comparison in snapshot-current guard.
  - Deployed Moodle competency external APIs in plugin `2026091605 / v0.1.31`.
  - Real partial Execute failure preserved Course 25 / Competency 6 / execution mappings; no rollback/reset.
  - Fixed bounded Activity↔Competency idempotency refs and reconciled successfully from preserved partial state.
  - Moodle readback: Quiz 120 `rule_outcome=0`; Assignment 121 `rule_outcome=1`; only approved Competency materialized.
  - Same approved revision rerun produced no duplicate native Competency/mappings.
  - Final Verify PASS and Risk native competency readback PASS.
  - Focused compatibility 69/69 PASS; workspace typecheck/build PASS.

Next Instructional Design frontier: Ticket 25 — Moodle E2E Acceptance for Instructional Design Alignment.


## 2026-09-16 — Tickets 17–24 High audit remediation

- [x] **T17-24-CR-01 — Freeze Instructional Design authority across Approval / Execute / Verify**
  - centralized Run-row lifecycle guard for authority-changing mutations
  - mutation invalidates approval and returns mutable preview/failed state to planning
  - approval publishes only from preview
  - exact approved Plan/revision is atomically claimed immediately before Moodle mutation
  - changed MaterialSnapshot path is included in the same lifecycle policy
- [x] **SCR-01 — Make one Plan revision one immutable execution authority**
  - Competency execution snapshot is insert-once/idempotent-same-authority
  - different authority for the same Plan revision is rejected
  - finalization creates revision N+1 after authority invalidation instead of reusing a snapshotted revision
- [x] **SCR-02 — Invalidate dependent Competency approval when approved Outcome changes**
  - dependent APPROVED Candidates return to PROPOSED with revision increment
  - invalidation happens before new Core Context revision publication; failure prevents publication
- [x] **SCR-03 — Fail closed on Verify authority and completion**
  - exact execution snapshot required
  - exact current approved Plan/revision + awaiting_verification required before readback
  - completion/failure uses atomic verification-authority CAS
  - stale old revision and concurrent completion races covered by regression tests
- [x] **Final High-remediation verification**
  - final broad regression: **33 test files / 136 tests PASS**
  - workspace `pnpm typecheck` PASS
  - workspace `pnpm build` PASS
  - `git diff --check` PASS (line-ending warnings only)
  - final code-review + 9arm Scrutinize found no remaining High bypass

Medium/Low findings `T17-24-CR-02` through `CR-07` where applicable, plus the recorded Standards finding, remain open and were intentionally not remediated in this pass.

Next Instructional Design frontier remains Ticket 25 — Moodle E2E Acceptance for Instructional Design Alignment; Ticket 25 has not been started by this remediation.
