# Planning Contracts v0.1 Freeze Record

**Status:** Frozen on 2026-09-01 after `PASS_WITH_ONE_TARGETED_CHANGE`.

The user accepted the combined T0103–T0110 bundle subject to one targeted clarification of Quiz Update semantics. The bundle was not split apart and no full re-audit was performed, as requested.

## Targeted correction

- `quiz/create` and nested course quizzes use `QuizPlan.questions` as the create-time question set.
- `quiz/update` uses `QuizUpdateContent` with explicit `questions_to_add` and `questions_to_update` arrays.
- Empty update arrays mean no question mutations.
- Existing questions remain unchanged unless represented in `questions_to_update`.
- Question removal is unsupported in v0.1.
- Execution target IDs and plan-ref to Moodle-ID mapping remain outside planning and belong to later execution contracts.

## Frozen schemas

The canonical schema set contains the eight numbered T0103–T0110 contracts plus three derived composition schemas:

- `course-definition.v0.1.schema.json`
- `section-plan.v0.1.schema.json`
- `assignment-plan.v0.1.schema.json`
- `quiz-plan.v0.1.schema.json`
- `multiple-choice-question-plan.v0.1.schema.json`
- `true-false-question-plan.v0.1.schema.json`
- `short-answer-question-plan.v0.1.schema.json`
- `essay-question-plan.v0.1.schema.json`
- `course-plan-content.v0.1.schema.json`
- `quiz-update-content.v0.1.schema.json`
- `planning-contracts.v0.1.schema.json`

All canonical schemas are stored under `packages/contracts/schemas/`. The historical combined review remains at `packages/contracts/review/planning-contracts-v0.1-draft.md`.

## Validation boundary

Focused dependency-free parse, schema-ID, `$ref`, aggregate valid/invalid evaluator, Quiz Update ambiguity, and frozen PlanEnvelope hash checks passed after the correction. `pnpm typecheck` also passed. The original bundle had already passed `pnpm typecheck`, `pnpm test`, and `pnpm build`.

Standards-compliant Ajv/runtime validation remains T0111. TypeScript alignment remains T0112. Domain invariants—including ref uniqueness, position collisions, choice-reference membership, educational correctness, and stable `plan_id` across revisions—remain outside isolated schema enforcement.
