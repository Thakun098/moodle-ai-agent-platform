# Implementation.md

## 1. Project Overview

This project is a **throw-away POC** for a future Moodle Agentic Instructional Design platform.

The POC must demonstrate that a local LLM can:

1. understand a syllabus well enough to create a structured course plan,
2. show that plan before mutation,
3. use native tool calling,
4. call Moodle tools through MCP,
5. create a real Moodle course,
6. create sections,
7. create assignments,
8. create quizzes and supported question types,
9. read existing Moodle state,
10. update or extend existing assignments and quizzes,
11. verify that final Moodle state matches the approved plan.

The project is intentionally not production-ready.

---

## 2. Target Architecture

```text
┌──────────────────────┐
│      Syllabus        │
│ txt/md/docx/pdf-text │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────────────┐
│ AI Platform                  │
│ Node.js + TypeScript         │
│ Fastify                      │
│ PostgreSQL                   │
│                              │
│ - Syllabus extraction        │
│ - Minimal normalization      │
│ - Planning                   │
│ - Plan validation            │
│ - Preview                    │
│ - Agent runtime              │
│ - MCP client                 │
│ - Execution                  │
│ - Verification               │
└──────────┬───────────────────┘
           │ Ollama API
           ▼
┌──────────────────────┐
│ Ollama               │
│ Gemma baseline model │
│ Native tool calling  │
└──────────────────────┘

AI Platform
    │
    │ MCP
    ▼
┌──────────────────────┐
│ Moodle MCP Server    │
│ Node.js + TypeScript │
└──────────┬───────────┘
           │ HTTP / Moodle API
           ▼
┌──────────────────────┐
│ Moodle POC Plugin    │
│ local_agentpoc       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Moodle 5.1.x         │
└──────────────────────┘
```

---

## 3. Primary Workflows

### 3.1 Initialize Course

```text
Upload Syllabus
   ↓
Extract Text
   ↓
Normalize
   ↓
Generate Course Structure Revision
   ↓
Teacher Review/Edit
   ↓
Seal Structure Revision
   ↓
Upload Learning Material per Section
   ↓
Seal Material Snapshot when generating a Section
   ↓
Generate each Assignment/Quiz independently from that snapshot
   ↓
Validate and persist Section Activity Drafts
   ↓
Assemble Frozen CoursePlan Rev1
   ↓
Preview
   ↓
Select Existing Moodle Category
   ↓
Confirm Execute
   ↓
Agent/MCP Execution
   ↓
Create Course
   ↓
Create Sections
   ↓
Create Assignments
   ↓
Create Quizzes
   ↓
Create Quiz Questions
   ↓
Read Moodle State
   ↓
Verify Against Plan
   ↓
Return Result + Moodle Course Link
```

The official CoursePlan is created only after every section is `GENERATED` or `NO_ACTIVITY_REQUIRED`. Structure review is not the official CoursePlan preview.

### 3.2 Modify Existing Assignment

```text
Select Existing Course
   ↓
Select Assignment
   ↓
Read Current Assignment State
   ↓
User Instruction
   ↓
Generate AssignmentPlan Revision
   ↓
Preview
   ↓
Confirm
   ↓
Update through MCP
   ↓
Read Back
   ↓
Verify
```

Also support adding a new Assignment to an existing Section.

### 3.3 Modify Existing Quiz

```text
Select Existing Course
   ↓
Select Quiz or Section
   ↓
Read Current Quiz State
   ↓
User Instruction
   ↓
Generate QuizPlan Revision
   ↓
Preview
   ↓
Confirm
   ↓
Update Quiz and/or Add Questions
   ↓
Read Back
   ↓
Verify
```

Removing questions is not required initially.

---

## 4. Course Planning Output

The planner must produce structured JSON, not free text. Internally, structure planning and activity generation are separate stages. The syllabus is authoritative for course structure; sealed section Learning Material is authoritative for activity and question content; teacher instructions control activity form and constraints.

```text
CoursePlan
├─ CourseDefinition
└─ SectionPlan[]
   └─ ActivityPlan[]
      ├─ AssignmentPlan
      └─ QuizPlan
         └─ QuestionPlan[]
            ├─ MultipleChoice
            ├─ TrueFalse
            ├─ ShortAnswer
            └─ Essay
```

The exact planning contract is described in `PLANNING_CONTRACT.md` and must be implemented as JSON Schema before the Executor is built.

---

## 5. Preview

Preview is mandatory before Moodle mutation.

The first POC does not need a sophisticated UI. Acceptable first implementations:

1. Fastify endpoint returning preview JSON.
2. Minimal HTML page rendered from the plan.
3. Small development UI.

Preview should expose:

- course title/summary
- sections
- assignments
- quizzes
- questions
- warnings
- assumptions
- source refs when available
- plan revision

The selected Moodle Category belongs to the ExecutionRequest, not the Agent-generated CoursePlan.

---

## 6. Moodle Category Handling

Category creation is manual.

The system should:

1. call `moodle_list_course_categories`,
2. show existing categories,
3. let the user choose one,
4. pass `category_id` into execution.

The Agent must not create, rename, or autonomously select categories.

---

## 7. Moodle Course Defaults

Suggested deterministic defaults:

```text
category  = selected by user
visible   = false
format    = topics
shortname = generated by executor
```

Suggested shortname pattern:

```text
POC-{course_code-or-generic}-{timestamp-or-sequence}
```

---

## 8. Assignment Scope

Agent-controlled educational fields:

- title
- description
- instructions
- learning objectives
- grade
- minimal source references

Moodle Adapter defaults may handle:

- submission type
- completion settings
- group settings
- dates
- notifications
- advanced grading configuration

Suggested initial defaults:

```text
grade = syllabus value when explicit, otherwise 100
group mode = none
completion = disabled/default
due date = not required
```

Exact submission type must be frozen before the Assignment adapter is implemented.

---

## 9. Quiz Scope

Initial Course Creation may contain complete Quiz questions.

Supported POC V1 qtypes:

```text
multichoice
truefalse
shortanswer
essay
```

Simplifications:

### Multiple Choice
- single correct answer
- suggested 4 choices
- default mark 1

### True/False
- one boolean correct answer
- default mark 1

### Short Answer
- one or more accepted answers
- case-insensitive by default
- default mark 1

### Essay
- manual grading
- may include grading guidance

Out of scope:

- matching
- drag-and-drop
- advanced adaptive behavior
- complex question bank workflows
- automatic essay grading

---

## 10. MCP Tool Capabilities

Minimum target tool set:

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

Delete tools are not exposed to the Agent initially.

---

## 11. Multi-step Orchestration Requirement

The POC must prove chained tool outputs, e.g.:

```text
moodle_create_course
→ course_id

moodle_create_section(course_id)
→ section_id

moodle_create_quiz(course_id, section_id)
→ quiz_id

moodle_create_quiz_question(...)
→ question_id

moodle_add_question_to_quiz(quiz_id, question_id)
```

Do not replace this with one coarse tool such as `create_course_from_syllabus`.

---

## 12. Minimal Persistence

Use PostgreSQL to make runs inspectable.

Suggested entities:

```text
poc_run
poc_plan
poc_message
poc_tool_call
poc_execution_mapping
poc_verification
```

### `poc_run`
- run ID
- status
- syllabus metadata
- model
- timestamps
- final result

### `poc_plan`
- plan ID
- run ID
- plan type
- revision
- JSON plan
- validation status

### `poc_message`
Persist enough Agent messages for debugging.

### `poc_tool_call`
- tool call ID
- run ID
- step number
- tool name
- arguments
- normalized result
- status
- duration
- error

### `poc_execution_mapping`
Example:

```text
section-01 → Moodle section ID
assignment-01 → Moodle activity ID
quiz-01 → Moodle quiz ID
question-01 → Moodle question ID
```

### `poc_verification`
- expected structure
- observed Moodle structure
- pass/fail
- mismatches

---

## 13. Minimal Idempotency

Implement enough idempotency to prevent duplicate creation during retries.

At minimum:

- stable `tool_call_id` or operation key
- persist completed mutation calls
- same completed operation key should return previous result when possible

Do not build full production idempotency architecture.

---

## 14. Syllabus Processing

### Phase 1 inputs

- `.txt`
- `.md`
- `.docx`
- text-readable `.pdf`

### Out of scope initially

- scanned PDF OCR
- image understanding
- RAG
- external document knowledge

Suggested pipeline:

```text
Upload → File Type Detection → Deterministic Text Extraction → Minimal NormalizedSyllabus → Planner
```

Possible first NormalizedSyllabus shape:

```json
{
  "course_title": "...",
  "course_code": "...",
  "course_description": "...",
  "learning_objectives": [],
  "schedule_or_topics": [],
  "assessment_text": "...",
  "raw_text": "..."
}
```

---

## 15. Agent Runtime

Use an explicit loop.

```text
1. Load approved plan/execution goal.
2. Discover Moodle tools from MCP.
3. Send relevant context + tool definitions to Ollama.
4. Receive final response or tool call(s).
5. Validate tool arguments.
6. Invoke MCP tool.
7. Persist tool call/result.
8. Send normalized result back to model.
9. Continue until complete or limit reached.
10. Run deterministic verification.
```

Required controls:

- max steps
- repeated-call detection
- tool timeout
- model timeout
- run timeout

---

## 16. Verification

Verification is deterministic application logic, not an LLM judgment.

### Course
- category
- hidden state
- title
- section count/titles

### Assignment
- exists
- correct section
- title
- main content
- grade

### Quiz
- exists
- correct section
- title
- number of questions
- qtypes
- marks where practical

### Questions
- qtype
- question text
- answer structure
- default mark

Machine-readable example:

```json
{
  "passed": false,
  "mismatches": [
    {
      "path": "sections[2].activities[1].questions",
      "expected": 5,
      "actual": 4
    }
  ]
}
```

---

## 17. POC Evaluation

### Technical metrics

- MCP connection success
- tool discovery success
- valid tool argument rate
- tool execution success rate
- Agent step count
- repeated tool calls
- end-to-end completion rate
- verification pass rate
- model latency
- tool latency
- total run latency

### AI Quality rubric

- syllabus alignment
- completeness
- hallucination
- course structure quality
- assignment usefulness
- quiz relevance
- question correctness
- difficulty appropriateness

Report technical and AI-quality results separately.

---

## 18. Test Dataset

Prepare at least:

1. one simple synthetic syllabus,
2. one representative real syllabus,
3. one more complex/messy syllabus.

Where relevant, include enough material for Assignments, Quizzes, and all four qtypes.

Use repeated runs with frozen parameters for quality comparison.

---

## 19. Whole-POC Definition of Done

- [ ] AI Platform connects to Ollama.
- [ ] Model returns native tool calls.
- [ ] AI Platform connects to MCP Server.
- [ ] MCP tool discovery works.
- [ ] MCP tool invocation works.
- [ ] Moodle POC plugin creates Moodle objects through supported APIs.
- [ ] No direct Moodle DB writes are used.
- [ ] CoursePlan is generated from a syllabus.
- [ ] CoursePlan passes schema validation.
- [ ] CoursePlan can be previewed.
- [ ] Existing Moodle Category can be selected.
- [ ] Approved CoursePlan creates a hidden Moodle course.
- [ ] Expected Sections are created.
- [ ] Expected Assignments are created.
- [ ] Expected Quizzes are created.
- [ ] `multichoice` works.
- [ ] `truefalse` works.
- [ ] `shortanswer` works.
- [ ] `essay` works.
- [ ] Existing Assignment can be read and updated via Plan → Preview → Execute.
- [ ] Existing Quiz can be read and updated/extended via Plan → Preview → Execute.
- [ ] Final Moodle state is read back.
- [ ] Deterministic verification compares expected vs actual.
- [ ] Technical metrics are captured.
- [ ] AI quality is evaluated separately.
- [ ] Current Ticket status/evidence reflects completed work.
- [ ] daily SOC files in `ai-platform-coordination/source-of-truth/soc/` contain completion records.
- [ ] relevant daily Audit findings are resolved or explicitly dispositioned before closure.

---

## 20. Expected Final Demo

A successful demonstration should show:

1. Upload syllabus.
2. Generate CoursePlan.
3. Inspect Preview.
4. Choose existing Moodle Category.
5. Execute plan.
6. Observe/log Agent → MCP → Moodle tool calls.
7. Open generated Moodle course.
8. Show Sections, Assignment(s), Quiz(es), all required qtypes.
9. Run read-back verification and show PASS.
10. Select an existing Assignment and request a change.
11. Preview, apply, verify.
12. Select an existing Quiz and request added/updated questions.
13. Preview, apply, verify.
14. Show technical run/tool metrics.
15. Review AI quality separately.


---

## 21. Current Initial-Course-Creation Amendment

The earlier mandatory Learning-Material stage in Sections 3.1 and 4 is superseded for **initial Course Creation** by `docs/adr/0002-optional-activity-generation-and-source-fallback.md` and the implementation plan at `docs/plans/optional-activity-creation-v1.md`.

The accepted target behavior is now:

```text
Syllabus (maximum 20 course periods)
  -> Course Structure only
  -> Teacher Review/Edit + Seal
  -> Optional Activity Creation branch
       -> Skip: structure-only CoursePlan is valid
       -> Create: teacher explicitly selects Quiz/Assignment per section
          -> Learning Material optional
          -> deterministic grounding mode resolution
          -> per-Activity generation/retry
  -> Finalize
  -> Official Preview
  -> Teacher review acknowledgment when syllabus-scoped AI knowledge was used
  -> Approve
  -> Execute
  -> Verify
```

Initial Structure planning must not infer Activity existence from Syllabus or Structure Instruction. Learning Material remains preferred grounding when supplied, but is no longer mandatory. Frozen Planning Contracts v0.1 remain unchanged.
