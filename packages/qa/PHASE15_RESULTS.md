# Phase 15 QA Results

## Scope
Phase 15 freezes three syllabus fixtures, defines automated technical metrics and a separate human AI-quality rubric, and runs repeated planning trials under frozen provider/model settings.

## Frozen fixtures
1. `synthetic-basic.md`
2. `representative-software-engineering.md`
3. `representative-project-management.md`

Each official live planning batch uses 3 repetitions per fixture at temperature 0 (9 trials total).

## Automated QA infrastructure
`@moodle-agent-poc/qa` measures:
- tool-schema validity rate;
- MCP/tool execution success rate;
- deterministic end-to-end verification pass rate;
- model/tool/total latency summaries (min/max/mean/p50/p95).

The deterministic QA test harness validates the collector with 9 fixed observations. These harness values prove calculation/reporting behavior; they are not presented as live production rates.

AI quality is intentionally separate. Without a human evaluator, the result remains `not_evaluated`.

## Live planning repeated-run results

| Provider | Model | Valid plans | Validity | Successful-plan mean latency | Notes |
|---|---|---:|---:|---:|---|
| Groq | `openai/gpt-oss-20b` | 2/9 | 22.2% | 3.04 s | Very fast; most failures were provider/model structured-generation `json_validate_failed` errors. Free-tier TPM required paced execution. |
| Unsloth LAN | `llmfan46/gemma-4-E4B-it-ultra-uncensored-heretic-GGUF:Q5_K_M` | 5/9 | 55.6% | 24.79 s | OpenAI-compatible `json_object` plus exact schema prompt injection. Synthetic and software-engineering were substantially more reliable; project-management failed 3/3 on activity-union/required-field mistakes. |
| Ollama local (exploratory partial) | `gemma4:e2b` | 5/5 observed | not an official 9-trial rate | approximately 122–266 s | Batch was intentionally stopped before 9 trials after confirming local latency was the bottleneck. Do not compare 5/5 directly with official 9-trial batches. |

### Official Groq batch
- trials: 9
- valid: 2
- planning contract validity: 22.22%
- successful latency: min 2.866 s, max 3.217 s, mean 3.0415 s, p95 3.217 s

### Official Unsloth batch after provider integration fix
- trials: 9
- valid: 5
- planning contract validity: 55.56%
- successful latency: min 17.370 s, max 31.257 s, mean 24.7898 s, p95 31.257 s

An earlier Unsloth 0/9 diagnostic batch is excluded from the official comparison because the OpenAI-compatible server was receiving only `json_object` mode and not the planner JSON Schema. Raw diagnostic output showed the model wrapping its own format under `course_plan`. The provider adapter was then corrected to inject the exact planner schema into the system context while preserving the frozen Plan contract and keeping Ajv/domain validation authoritative.

## Key technical findings
1. Provider abstraction is valuable: Planner/Agent code stays on `ModelClient`; Ollama, Groq, and Unsloth can be swapped by configuration.
2. Serving backend changes structured-output semantics. Ollama can consume schema via its native format, Groq can enforce `json_schema`, while the tested Unsloth OpenAI-compatible server reliably supports `json_object` but needed explicit schema prompt injection.
3. Latency and contract reliability trade off materially. Groq is an order of magnitude faster than LAN Unsloth, but this Groq/model combination had lower first-attempt CoursePlan validity.
4. The hardest current planning failure is the activity/question union schema, especially assignment-vs-quiz required fields in the representative project-management fixture.
5. Technical validity is not AI quality. No human pedagogical quality score is claimed in Phase 15.

## AI quality result
`not_evaluated` — the human rubric is defined, but no human scoring batch has been performed yet.

## Phase 15 interpretation
Phase 15 does not select a final model. It establishes a reproducible QA framework and provides initial provider/model evidence. Model/prompt/schema-design recommendations are deferred to the Phase 16 final POC findings after real Moodle E2E execution and deterministic verification are included.
