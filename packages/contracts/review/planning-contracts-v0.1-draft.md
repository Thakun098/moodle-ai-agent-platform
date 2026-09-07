# Planning Contracts v0.1 DRAFT — Combined Review for T0103–T0110

**Status:** DRAFT — one combined review package; T0103–T0110 remain unchecked.

This bundle proposes the plan-specific contracts that refine the frozen `PlanEnvelope.content` boundary. It does not add or alter any PlanEnvelope root field. T0102 SourceReference remains a reusable canonical building block. Execution target IDs remain outside planning and belong to T0113.

## Schema inventory

Numbered task schemas:

1. T0103 `course-definition.v0.1.schema.json`
2. T0104 `section-plan.v0.1.schema.json`
3. T0105 `assignment-plan.v0.1.schema.json`
4. T0106 `quiz-plan.v0.1.schema.json`
5. T0107 `multiple-choice-question-plan.v0.1.schema.json`
6. T0108 `true-false-question-plan.v0.1.schema.json`
7. T0109 `short-answer-question-plan.v0.1.schema.json`
8. T0110 `essay-question-plan.v0.1.schema.json`

Derived composition schemas included so the review can inspect the actual `content` boundary:

- `course-plan-content.v0.1.schema.json`
- `quiz-update-content.v0.1.schema.json`
- `planning-contracts.v0.1.schema.json`

All files are under `packages/contracts/schemas/draft/`. The aggregate schema composes the frozen PlanEnvelope by `$ref` and selects content by `plan_type`; it does not republish or change PlanEnvelope.

## Proposed contract decisions requiring review

### Shared rules

- All objects reject unknown properties.
- Human-readable strings must contain a non-whitespace character.
- Plan-local references use type-specific prefixes such as `section-01`, `assignment-01`, `quiz-01`, `question-01`, and `choice-a`.
- `source_refs` is always an explicit array and may be empty. Items reference frozen SourceReference v0.1.
- Positive marks/grades use numbers greater than zero; no arbitrary upper limit is proposed.
- Cross-object uniqueness and reference membership remain domain-validation rules because isolated JSON Schema documents cannot reliably enforce them.

### T0103 CourseDefinition

- `title` is required.
- `course_code` and `summary` are optional nonblank strings.
- Category ID, Moodle shortname, Moodle IDs, security settings, and adapter defaults are rejected.

### T0104 SectionPlan

- Required: `ref`, `position`, `title`, `source_refs`, `activities`.
- `summary` is optional to avoid forcing invented prose when the source supplies only a heading.
- `position` is a positive one-based integer.
- Activities are a discriminated union of AssignmentPlan and QuizPlan.

### T0105 AssignmentPlan

- The same shape is used when nested in a course or placed directly in assignment PlanEnvelope `content`.
- All eight fields are required; instructions and learning objectives require at least one nonblank item.
- `grade` is a positive number representing educational intent, not Moodle configuration.
- Update target Moodle IDs are not part of this contract; T0113 owns execution targets.

### T0106 QuizPlan

- `QuizPlan` is used for nested quizzes and `quiz/create`; its `questions` array is the complete create-time question set and may be empty for a quiz draft.
- `quiz/update` uses the derived `QuizUpdateContent` shape with explicit `questions_to_add` and `questions_to_update` arrays.
- Empty update arrays mean no question mutations. Existing questions remain unchanged unless listed in `questions_to_update`; question removal is unsupported.
- Questions use exactly the four POC v1 discriminated variants.

### T0107 MultipleChoiceQuestionPlan

- At least two choices are required; four choices are recommended but not forced.
- `correct_choice_refs` contains exactly one reference, enforcing the POC single-correct-answer rule.
- Membership of that reference in `choices`, and uniqueness of choice refs, are domain invariants for later validation.

### T0108 TrueFalseQuestionPlan

- `correct_answer` is a JSON boolean.
- Feedback, positive default mark, and source refs are explicit.

### T0109 ShortAnswerQuestionPlan

- `accepted_answers` is a non-empty array of unique nonblank strings.
- `case_sensitive` is explicit; examples use `false` for the POC default rather than relying on a schema default.

### T0110 EssayQuestionPlan

- `grading_guidance` is a non-empty list of nonblank criteria.
- Essay grading remains manual; no automatic grading field is added.

## PlanEnvelope content specialization

The aggregate DRAFT keeps the frozen outer envelope and applies only these content mappings:

| `plan_type` | `content` schema |
| --- | --- |
| `course` | CoursePlan Content: `{ course, sections }` |
| `assignment` | AssignmentPlan |
| `quiz` + `create` | QuizPlan with create-time `questions` |
| `quiz` + `update` | QuizUpdateContent with `questions_to_add` and `questions_to_update` |

Both `create` and `update` continue to use these declarative desired-state shapes. Moodle target IDs and execution intent context are supplied later by ExecutionRequest (T0113), not added to PlanEnvelope or these content objects.

## Example matrix

Intended valid:

- `course-create-complete.json`: complete course content with one assignment, one quiz, and all four question variants.
- `assignment-update.json`: standalone assignment desired state with execution target kept outside planning.
- `quiz-update.json`: metadata-only quiz update with explicit empty `questions_to_add` and `questions_to_update` arrays; existing questions remain unchanged.

Intended invalid, each focused on one proposed rule:

- CourseDefinition adds forbidden `category_id`.
- Section ref uses the wrong prefix.
- Section position is zero.
- Assignment instructions are empty.
- Quiz contains unsupported `matching` question type.
- Multiple choice has two correct references.
- True/false answer is a string rather than boolean.
- Short answer has no accepted answer.
- Essay has no grading guidance.
- Assignment PlanEnvelope carries quiz-shaped content.
- Quiz update uses the ambiguous create-time `questions` field instead of the explicit update arrays.

## Domain invariants not encoded by isolated schemas

- Plan-local refs must be unique within their owning plan.
- Section positions must not collide.
- `correct_choice_refs[0]` must name one choice in the same question.
- Choice refs must be unique within one multiple-choice question.
- Learning objectives, excerpts, answers, and grading guidance must be educationally correct and grounded.
- `plan_id` stability across revisions remains a domain/persistence invariant.

## Validation boundary

For this DRAFT stage, validation consists of JSON parsing, schema inventory/reference checks, a dependency-free evaluator for the explicit rules, fixture-isolation checks, frozen T0101/T0102 hash checks, and workspace typecheck/test/build regressions. This is not standards-compliant JSON Schema/Ajv validation. T0111 owns Ajv selection and executable validation; T0112 owns TypeScript alignment.

Executed results on 2026-09-01:

- PASS — 13 total registered schemas: frozen PlanEnvelope, frozen SourceReference, and 11 Planning Contracts draft/composition schemas.
- PASS — all schema IDs are unique and all 30 `$ref` targets resolve within the registered set.
- PASS — all 3 intended-valid aggregate examples satisfy the dependency-free evaluator.
- PASS — all 11 intended-invalid examples are rejected by their mapped component or aggregate schema.
- PASS — frozen PlanEnvelope SHA-256 remains `2372EBF32A363F4CDDF0929B672CD440F8B4C13C916142766C225B229EDFE571`.
- PASS — original bundle checks included `pnpm typecheck`, `pnpm test`, and `pnpm build`. After the targeted Quiz Update correction, the focused dependency-free evaluator and `pnpm typecheck` passed; no full re-audit was required by the reviewer.

## Review request

Please review this bundle once and either:

- accept Planning Contracts v0.1 as proposed for T0103–T0110;
- request specific changes by task/schema; or
- ask questions about a proposed decision.

Until accepted, all 11 schemas in this bundle remain under the draft path, T0103–T0110 stay unchecked, and T0111 does not begin.
