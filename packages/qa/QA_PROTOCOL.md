# QA Protocol

## Purpose

The QA package separates deterministic technical validity from human evaluation of instructional quality. Do not treat a technically valid plan as proof of pedagogical quality.

## Representative fixtures

- `fixtures/synthetic-basic.md` — minimal deterministic syllabus fixture.
- `fixtures/representative-software-engineering.md` — representative technical course.
- `fixtures/representative-project-management.md` — representative non-code professional course.

## Human instructional-quality rubric

Human reviewers score each dimension from 1–5 using the anchors exposed by the QA package:

1. Grounding and source fidelity — 25%
2. Requirement coverage — 25%
3. Instructional design quality — 20%
4. Specificity and actionability — 15%
5. Assessment appropriateness — 15%

If no human review was performed, report AI quality as `not_evaluated` rather than inferring a score from automated metrics.

## Technical metrics

For repeated technical trials record:

- tool-schema calls and valid calls;
- MCP/tool calls and successful calls;
- deterministic verification attempts and passes;
- model, tool, and total latency when observable.

Aggregate validity/success rates from their explicit denominators. Report latency with enough detail to distinguish typical and tail behavior.

## Repeated-run discipline

Freeze provider, model, fixtures, prompt/code revision, temperature, and structured-output adapter for a batch. A provider/model/prompt/adapter change starts a new batch; never silently mix observations from different configurations.

The executable QA tests validate the collector/reporting behavior. Provider/model experiment results are historical evidence and belong in the workspace ticket/SOC/Audit evidence store rather than as permanent repo-local result files.

## Provider independence

The planning contract remains provider-independent. Provider adapters may use provider-specific structured-output mechanisms, but local contract/domain validation remains authoritative and adapters must not mutate the domain contract to fit one serving backend.

## Result separation

Every QA report keeps two independent sections:

- `technical` — objective execution/validation/latency metrics.
- `aiQuality` — human rubric result or explicitly `not_evaluated`.
