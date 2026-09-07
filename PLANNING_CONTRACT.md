# PLANNING_CONTRACT.md

## Status

**Planning Contract Design Baseline v0.1 — conceptual structure agreed; exact JSON Schemas are implementation tasks in `task.md`.**

Do not treat Moodle API payloads as planning contracts.

---

## 1. Design Principles

Planning contracts must be:

- declarative
- provider-neutral
- Moodle-light
- previewable
- revisioned
- schema-validatable
- executable
- reusable for create/update workflows

The Agent describes **what should exist**. The Executor/Adapter decides **how Moodle materializes it**.

---

## 2. Contract Hierarchy

```text
PlanEnvelope
│
├─ CoursePlan
│  ├─ CourseDefinition
│  └─ SectionPlan[]
│     └─ ActivityPlan[]
│        ├─ AssignmentPlan
│        └─ QuizPlan
│           └─ QuestionPlan[]
│              ├─ MultipleChoiceQuestionPlan
│              ├─ TrueFalseQuestionPlan
│              ├─ ShortAnswerQuestionPlan
│              └─ EssayQuestionPlan
│
├─ AssignmentPlan
│  └─ usable independently for existing-course create/update
│
└─ QuizPlan
   └─ usable independently for existing-course create/update
```

---

## 3. Common Plan Envelope

Conceptual example:

```json
{
  "schema_version": "0.1",
  "plan_id": "uuid",
  "revision": 1,
  "plan_type": "course",
  "operation": "create",
  "title": "Create Introduction to AI Course",
  "summary": "Create the course structure and activities from the syllabus.",
  "warnings": [],
  "assumptions": [],
  "content": {}
}
```

Expected fields:

| Field | Purpose |
|---|---|
| `schema_version` | Contract version |
| `plan_id` | Stable plan identity |
| `revision` | Revision number |
| `plan_type` | `course`, `assignment`, `quiz` |
| `operation` | `create`, `update` |
| `title` | Human-readable preview title |
| `summary` | Short explanation of intended change |
| `warnings` | Model-detected uncertainty/problem |
| `assumptions` | Explicit planner assumptions |
| `content` | Plan-specific payload |

Exact required/optional rules are frozen in task `T0101`.

---

## 4. SourceReference

Possible minimal shape:

```json
{
  "source": "syllabus",
  "page": 4,
  "section": "Week 3",
  "text": "Introduction to supervised learning"
}
```

Not every field must be present. Keep this small. It exists for QA/hallucination review, not production Context Management.

---

## 5. CoursePlan

Conceptual example:

```json
{
  "schema_version": "0.1",
  "plan_id": "4c14...",
  "revision": 1,
  "plan_type": "course",
  "operation": "create",
  "title": "Create Introduction to Artificial Intelligence",
  "summary": "Course derived from the supplied syllabus.",
  "warnings": [],
  "assumptions": [],
  "content": {
    "course": {
      "title": "Introduction to Artificial Intelligence",
      "course_code": "AI101",
      "summary": "An introductory course covering core AI concepts."
    },
    "sections": [
      {
        "ref": "section-01",
        "position": 1,
        "title": "Introduction to AI",
        "summary": "Core definitions, history, and applications.",
        "source_refs": [],
        "activities": []
      }
    ]
  }
}
```

CoursePlan must not contain:

- category creation logic
- generated Moodle shortname
- Moodle IDs before execution
- Moodle DB fields
- security configuration

---

## 6. CourseDefinition

Candidate fields:

```json
{
  "title": "Introduction to Artificial Intelligence",
  "course_code": "AI101",
  "summary": "..."
}
```

`title` should be required. `course_code` may be optional. Exact field set is frozen in `T0103`.

---

## 7. SectionPlan

Conceptual shape:

```json
{
  "ref": "section-01",
  "position": 1,
  "title": "Week 1: Introduction",
  "summary": "...",
  "source_refs": [],
  "activities": []
}
```

`ref` is plan-local. `position` determines intended ordering. `activities` use a discriminated union.

---

## 8. ActivityPlan

Supported initial types:

```text
assignment
quiz
```

Use discriminated unions rather than an untyped generic `config` object.

---

## 9. AssignmentPlan

Conceptual create shape:

```json
{
  "ref": "assignment-01",
  "type": "assignment",
  "title": "AI Concepts Assignment",
  "description": "Explain key AI concepts and their applications.",
  "instructions": [
    "Select three AI applications.",
    "Explain the problem each application addresses.",
    "Compare advantages and limitations."
  ],
  "learning_objectives": [
    "Explain fundamental applications of artificial intelligence."
  ],
  "grade": 100,
  "source_refs": []
}
```

Low-level Moodle settings such as submission plugin configuration, groups, completion, and dates belong to adapter defaults.

---

## 10. Standalone Assignment Update Plan

Existing Assignment workflows reuse the same planning content model.

```json
{
  "schema_version": "0.1",
  "plan_id": "uuid",
  "revision": 2,
  "plan_type": "assignment",
  "operation": "update",
  "title": "Make Assignment 1 more practical",
  "summary": "...",
  "warnings": [],
  "assumptions": [],
  "target": {
    "course_id": 100,
    "section_id": 14,
    "activity_id": 551
  },
  "content": {
    "title": "Practical AI Applications",
    "description": "...",
    "instructions": ["..."],
    "learning_objectives": ["..."],
    "grade": 100,
    "source_refs": []
  }
}
```

Target Moodle IDs come from current Moodle state, not Agent invention.

---

## 11. QuizPlan

Conceptual shape:

```json
{
  "ref": "quiz-01",
  "type": "quiz",
  "title": "AI Fundamentals Quiz",
  "description": "Assessment covering the main concepts in this section.",
  "source_refs": [],
  "questions": []
}
```

Initial CoursePlan may contain complete questions.

---

## 12. QuestionPlan Union

Supported initial types:

```text
multichoice
truefalse
shortanswer
essay
```

Use a discriminated union keyed by `type`.

---

## 13. MultipleChoiceQuestionPlan

Initial baseline: one correct answer, typically 4 choices, default mark commonly 1.

```json
{
  "ref": "question-01",
  "type": "multichoice",
  "question": "Which statement best describes supervised learning?",
  "choices": [
    {"ref": "choice-a", "text": "Learning from labeled examples"},
    {"ref": "choice-b", "text": "Learning without data"},
    {"ref": "choice-c", "text": "Random output generation"},
    {"ref": "choice-d", "text": "Programming every response manually"}
  ],
  "correct_choice_refs": ["choice-a"],
  "feedback": "Supervised learning uses labeled examples.",
  "default_mark": 1,
  "source_refs": []
}
```

The exact schema should enforce the single-correct-answer decision for the initial POC.

---

## 14. TrueFalseQuestionPlan

```json
{
  "ref": "question-02",
  "type": "truefalse",
  "question": "Machine learning is a subset of artificial intelligence.",
  "correct_answer": true,
  "feedback": "Machine learning is generally treated as a subfield of AI.",
  "default_mark": 1,
  "source_refs": []
}
```

---

## 15. ShortAnswerQuestionPlan

```json
{
  "ref": "question-03",
  "type": "shortanswer",
  "question": "What does NLP stand for?",
  "accepted_answers": ["Natural Language Processing"],
  "case_sensitive": false,
  "default_mark": 1,
  "source_refs": []
}
```

`accepted_answers` should be an array from the beginning.

---

## 16. EssayQuestionPlan

```json
{
  "ref": "question-04",
  "type": "essay",
  "question": "Discuss two benefits and two risks of using AI in education.",
  "grading_guidance": [
    "Identifies at least two meaningful benefits.",
    "Identifies at least two relevant risks.",
    "Provides supporting explanation."
  ],
  "default_mark": 5,
  "source_refs": []
}
```

Essay grading is manual initially.

---

## 17. Existing Quiz Update

Conceptually:

```json
{
  "plan_type": "quiz",
  "operation": "update",
  "target": {
    "course_id": 100,
    "section_id": 14,
    "quiz_id": 772
  },
  "content": {
    "title": "Updated AI Fundamentals Quiz",
    "questions_to_add": [],
    "questions_to_update": []
  }
}
```

Removing questions is not required initially.

---

## 18. Category Is Not Part of Agent Planning

CoursePlan does not choose a Category.

Execution combines:

```text
Approved CoursePlan Revision + User-selected Existing category_id
```

Example:

```json
{
  "plan_id": "uuid",
  "revision": 3,
  "target": {
    "category_id": 7
  }
}
```

---

## 19. Moodle Shortname Is Not Part of Agent Planning

Planner may output `course_code`; Executor generates unique Moodle shortname deterministically.

---

## 20. Preview Editing

### Direct edit

Examples:

- title
- grade
- question text
- choices
- section placement

Create a new plan revision.

### Semantic Agent re-plan

Example:

> Make this quiz harder and focus on application rather than recall.

Generate a new plan revision. Do not overwrite the prior revision.

---

## 21. Planning vs Execution Contract

### Planning Contract

Describes desired educational state.

### Execution Contract

Identifies:

- plan ID
- plan revision
- target Moodle context supplied by user/application
- execution intent

Executor turns the Plan into MCP operations.

---

## 22. Example Execution Mapping

Before execution:

```text
section-01
assignment-01
quiz-01
question-01
```

During execution:

```text
section-01    → Moodle section id 14
assignment-01 → Moodle activity id 551
quiz-01       → Moodle quiz id 772
question-01   → Moodle question id 9001
```

Persist this mapping for debugging and verification.

---

## 23. Validation Order

```text
Agent JSON
   ↓
JSON syntax valid?
   ↓
JSON Schema valid?
   ↓
Domain validation valid?
   ↓
Persist revision
   ↓
Preview eligible
```

Examples of domain validation:

- duplicate local refs
- section position collision
- unsupported qtype
- missing referenced choice
- invalid grade
- empty title
- invalid quiz/question structure

---

## 24. Explicit Non-goals of Planning Contract

Do not include production-specific concepts in v0.1 unless explicitly requested:

- AuthN/AuthZ
- Teacher capability
- approval signature
- Five Gates
- context snapshot/projection IDs
- fingerprint
- dependency manifest
- retention policy
- audit classification
- production ChangeSet
- production optimistic concurrency token

---

## 25. Required Contract Implementation Order

Before coding the Executor, complete:

```text
T0101 PlanEnvelope
T0102 SourceReference
T0103 CourseDefinition
T0104 SectionPlan
T0105 AssignmentPlan
T0106 QuizPlan
T0107-T0110 QuestionPlan variants
T0111 Ajv validation
T0112 TypeScript alignment
T0113 ExecutionRequest
T0114 VerificationResult
```

Then derive:

```text
Planning Contract
      ↓
Preview Model
      ↓
Execution Contract
      ↓
MCP Tool Schemas
      ↓
Moodle Adapter Contract
```
