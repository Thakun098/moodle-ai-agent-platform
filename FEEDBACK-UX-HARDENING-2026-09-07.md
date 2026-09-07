# Feedback & Locked Decisions — UX Hardening

Date: 2026-09-07
Status: **Approved / Locked for next implementation cycle**
Scope: Moodle Agentic AI Platform — Course Creation 4-Step Wizard

Core principle remains unchanged:

> **AI proposes / Teacher authorizes / Moodle remains System of Record**

This document captures user feedback after successful end-to-end testing of the current 4-step Course Creation flow, including Learning Material upload, Activity generation, preview, finalization, and Moodle execution.

---

## 1. Learning Material should also become a planned Moodle File Resource

### Problem
The teacher currently uploads a Learning Material file for grounding, but must later upload/add the same learning material again if it should appear in the Moodle course for students.

### Locked Decision
**Decision: Option B — Upload once, use twice.**

When a teacher uploads Learning Material for a Week/Section:

1. The file continues to be stored and sealed as the Week-level grounding MaterialSnapshot.
2. The same uploaded file automatically creates a **planned File Resource Intent** for that Week.
3. The File Resource is **not created in Moodle immediately**.
4. It remains part of the proposed CoursePlan and is only mutated into Moodle after Teacher Approval + Execute.

This preserves the architecture rule that Moodle mutation only occurs after teacher authorization.

### File Resource naming
Use the original filename **without the file extension**.

Example:

```text
Uploaded file:
CS231_Week_01_Mock_Learning_Material.pdf

Planned Moodle File Resource title:
CS231_Week_01_Mock_Learning_Material
```

Do not spend an LLM call to generate the title.

### Teacher control
The automatically planned File Resource must be removable from the course plan without deleting the underlying grounding material.

Therefore the UI should distinguish:

```text
Material used for AI grounding: YES
Add file to Moodle course: YES / REMOVE
```

Removing the File Resource from the proposed course must **not** remove the MaterialSnapshot used by Quiz/Assignment generation.

### Replace behavior
If the teacher replaces the existing Week Material:

- the current MaterialSnapshot is replaced/currented according to existing snapshot rules;
- the planned File Resource is replaced by the new uploaded file;
- the planned resource title is recalculated from the new filename;
- do **not** create a duplicate File Resource for the same Week.

This applies specifically to editing/replacing an existing Week Material.

### Readiness model
File Resource should not enter the AI generation state machine.

It is deterministic and becomes **Ready immediately after upload/seal**.

Recommended Step 3 footer presentation:

```text
Resources: 3 Ready
Generated Activities: 4 / 4
Remaining AI Activities: 0
```

Do not count deterministic File Resources as pending Quiz/Assignment generation attempts.

### Required implementation impact
This will require adding support for a Moodle `resource` activity end to end, including:

- File Resource planning representation / intent
- final CoursePlan representation
- execution serializer
- Moodle Gateway/plugin external function for File Resource creation
- file transfer / Moodle file API handling
- verification support
- Step 3 preview
- Step 4 Official Preview

The original uploaded file should be reused; the teacher must not upload the same file twice.

---

## 2. Quiz Preview must render the canonical Question contract

### Problem
Generated Quiz content is valid, but Step 3 Preview currently shows labels such as:

```text
Question 1
Question 2
Question 3
```

instead of the actual question text.

This affects all supported types:

- Multiple Choice
- True / False
- Short Answer
- Essay

### Confirmed root cause
The canonical contract stores the prompt in:

```ts
question.question
```

but the Moodle UI currently attempts to read:

```text
question_text
text
name
```

before falling back to `Question N`.

Therefore this is primarily a UI contract-mapping bug rather than an AI generation problem.

### Locked Decision
Quiz Preview must render the **canonical QuestionPlan contract directly**.

#### Multiple Choice
Display:

- question text
- every choice
- visually identifiable correct choice
- feedback
- default mark

Example:

```text
1. Which keyword is used to create an object in C#?

○ A. class
● B. new        Correct
○ C. object
○ D. this

Feedback: `new` creates an instance of a class.
Mark: 1
```

#### True / False
Display:

- question
- correct answer: True or False
- feedback
- mark

#### Short Answer
Display:

- question
- accepted answer(s)
- case-sensitive flag
- mark

#### Essay
Display:

- question
- grading guidance / expected criteria
- mark

### UX principle
Step 3 is a real Teacher Review screen. The teacher must be able to understand what the generated Quiz actually contains before Finalization.

---

## 3. Step 4 must become the complete Official Preview

### Problem
The current approval step shows mainly counts and activity labels. That is insufficient to verify the exact immutable CoursePlan revision being approved.

### Locked Decision
**Option B — Step 4 must display the complete current CoursePlan revision.**

The Official Preview should include at minimum:

- Course title / summary
- selected Course Format
- all Sections / Weeks
- File Resources and filenames
- Assignment title, description, instructions, objectives, grade
- Quiz title / description
- full Quiz questions using the canonical renderer described above
- correct answers / accepted answers / grading guidance where applicable
- Empty Activity Shell indicators
- AI Expanded / Teacher Review Required indicators
- relevant warnings and assumptions

The content displayed in Step 4 must be the exact revision that will be approved and executed.

### Revision behavior
If a new Plan Revision is generated after the teacher previously acknowledged AI-expanded content:

- reset the acknowledgment;
- re-render Official Preview from the new revision;
- require review acknowledgment again when applicable.

This remains aligned with the existing ADR-0002 review requirement.

---

## 4. Course Format selection before Course Structure generation

### Problem
Course creation currently defaults to Moodle `topics` format even though Moodle supports multiple installed Course Format plugins.

The teacher wants to choose the Course Format before generating Course Structure.

### Locked Decision
**Course Format is a Teacher Execution Setting, not AI-generated content.**

It should be added to Step 1 before Course Structure generation.

Recommended Step 1 layout:

```text
Course Category *
[ Moodle-Agent-POC ▼ ]

Course Format *
[ Topics ▼ ]

Syllabus File *
[ Choose File ]

Structure Instruction (Optional)
[ ... ]

[ Generate Course Structure ]
```

### Source of dropdown options
Do **not** hard-code formats such as Topics / Weekly / Tiles.

The dropdown must be populated dynamically from the **installed and available Moodle Course Format plugins**.

Example potential values:

```text
Topics
Weekly
Single Activity
Tiles
...
```

Only formats currently available/enabled in that Moodle environment should be presented.

### Run semantics
The selected Course Format should:

- be selected by the teacher before `Generate Course Structure`;
- be pinned to the Run as teacher-authorized configuration;
- not be modified by the model;
- not consume model tokens;
- be carried through Finalization and Official Preview;
- be passed directly to Moodle course creation during Execute.

### Contract direction for V1
For V1, treat Course Format primarily as a **Teacher Execution Setting** rather than asking AI to infer it from the syllabus.

The current Moodle external `create_course` function already accepts a `format` parameter, so the missing work is mainly propagation from UI/Run → execution target/settings → Moodle creation.

---

## 5. Updated Step 3 mental model

After these decisions, each Week should conceptually look like:

```text
Week N
│
├── Learning Material
│   ├── Uploaded file
│   ├── Used as AI grounding
│   └── File Resource: Ready / Remove from course
│
├── Quiz (optional)
│   ├── Prompt
│   ├── Settings
│   ├── Generate
│   └── Full canonical Quiz Preview
│
└── Assignment (optional)
    ├── Prompt
    ├── Settings
    ├── Generate
    └── Assignment Preview
```

The Learning Material remains shared by Quiz + Assignment in the same Week.

---

## 6. Updated 4-Step UX target

### Step 1 — Create Course Structure

Teacher selects:

- Course Category
- **Course Format**
- Syllabus
- Structure Instruction (Optional)

Then:

```text
Generate Course Structure
```

### Step 2 — Course Structure

Review/edit:

- Course information
- Weeks / Sections
- Structure warnings

No Activity generation here.

### Step 3 — Activity Structure

Per Week:

- Learning Material upload
- automatic planned File Resource
- remove File Resource from course if desired while retaining grounding
- Quiz selection/configuration/generation/full preview
- Assignment selection/configuration/generation/preview
- deterministic Resource readiness separate from AI generation readiness

### Step 4 — Official Preview & Approve

Display the complete immutable CoursePlan revision:

- Course + Format
- Sections
- File Resources
- Assignments
- full Quizzes/questions/answers
- Shells
- warnings
- AI review requirements

Then:

```text
Approve & Create Course
```

Execution and Verify remain after the numbered wizard.

---

## 7. Locked decision matrix

| # | Decision | Locked Choice |
|---|---|---|
| 1 | Upload Material also plans Moodle File Resource | **B — Yes, automatically** |
| 2 | Teacher may remove auto-added File Resource while keeping grounding | **B — Yes** |
| 3 | File Resource title | **B — filename without extension** |
| 4 | Replacing existing Week Material | **B — replace existing planned resource; do not duplicate** |
| 5 | File Resource readiness | **Agreed — deterministic Ready; separate from AI generation count** |
| 6 | Quiz Preview | **Agreed — full canonical rendering for all 4 question types** |
| 7 | Step 4 Approval Preview | **B — full Official Preview of current CoursePlan revision** |
| 8 | Course Format dropdown source | **B — dynamic installed/available Moodle formats** |
| 9 | Course Format semantics | **A — Teacher Execution Setting, not AI-selected** |

---

## 8. Implementation sequencing recommendation

Recommended order for the next implementation cycle:

1. **Fix canonical Quiz Preview renderer** — isolated P1 UX bug and low architectural risk.
2. **Add dynamic Course Format discovery + Run propagation** — relatively contained vertical slice.
3. **Add File Resource planning/execution support** — largest architectural addition because Moodle file upload/execution/verification are required.
4. **Replace Step 4 summary with full Official Preview renderer** — reuse canonical Activity renderers from Step 3.
5. Run Moodle E2E with a Week containing:
   - uploaded PDF Resource
   - Quiz
   - Assignment
   - selected non-default Course Format
6. Verify the approved revision matches the created Moodle course exactly.

---

## 9. Explicit non-goals / unchanged decisions

The following existing decisions remain unchanged:

- Learning Material remains optional for Quiz/Assignment generation.
- No Material continues to use the existing syllabus fallback policy.
- Quiz and Assignment remain explicitly teacher-selected per Week.
- AI does not automatically infer Activities from Structure Notes.
- Empty Activity Shell behavior remains unchanged.
- Technical model failure must not silently become an Empty Shell.
- Moodle remains the System of Record.
- No Moodle mutation occurs before Teacher Approval.

---

## Final status

**Feedback grilled and approved.**

This document is the implementation baseline for the next UX hardening cycle covering:

1. Learning Material → automatic planned Moodle File Resource
2. canonical Quiz Preview rendering
3. full Official Approval Preview
4. dynamic teacher-selected Moodle Course Format
