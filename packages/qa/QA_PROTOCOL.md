# Phase 15 QA Protocol

## Frozen fixtures
- `synthetic-basic.md` — minimal deterministic syllabus fixture.
- `representative-software-engineering.md` — representative technical course.
- `representative-project-management.md` — representative non-code professional course.

## Planning / AI quality rubric
Human reviewers score each dimension from 1–5 using the anchors in `HUMAN_AI_QUALITY_RUBRIC`:
1. Grounding and source fidelity — 25%
2. Requirement coverage — 25%
3. Instructional design quality — 20%
4. Specificity and actionability — 15%
5. Assessment appropriateness — 15%

Automated technical success must not be used as a substitute for these human scores.

## Technical metrics
For every repeated technical trial record:
- tool-schema calls and valid calls;
- MCP/tool calls and successful calls;
- whether deterministic end-to-end verification was attempted and passed;
- model, tool, and total latency when observable.

Aggregate metrics:
- tool-schema validity rate = valid schema calls / schema calls;
- MCP/tool execution success = successful tool calls / tool calls;
- verification pass rate = passed verifications / attempted verifications;
- latency = min/max/mean/p50/p95.

## Repeated planning protocol
Freeze provider, model, fixtures, prompt code, temperature, and output-contract adapter at batch start. Run each fixture three times. A provider/model/prompt/adapter change requires a new batch identifier or result file; never silently mix observations.

Current provider labels supported by the QA runner:
- `ollama`
- `groq`
- `unsloth` (OpenAI-compatible LAN endpoint)

The automated test suite exercises the technical collector with nine fixed observations (3 fixtures × 3 repetitions). This proves the QA calculation/reporting pipeline deterministically; the fixed values are not presented as live-model quality results.

Live repeated planning results are stored separately under `packages/qa/results/` and summarized in `PHASE15_RESULTS.md`.

## Provider-specific structured-output rule
The frozen Plan contract is provider-independent.
- Ollama may use native schema format support.
- Groq may use provider `json_schema` support plus local Ajv/domain validation.
- OpenAI-compatible Unsloth endpoints using `json_object` receive the exact planner schema as an adapter-level system instruction; Ajv/domain validation remains authoritative.

Provider adapters must not mutate the frozen planning contracts merely to satisfy a serving backend.

## Result separation
A QA report always contains two independent sections:
- `technical`: objective execution/validation/latency metrics.
- `aiQuality`: human rubric result, or explicitly `not_evaluated` when no human evaluation exists.
