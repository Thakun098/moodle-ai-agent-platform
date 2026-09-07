# Moodle UI supervisor acceptance — 2026-09-07

Worker: gpt-5.6-luna, reasoning effort high, native Codex sub-agent.
Supervisor: parent task. This review covers the seven Moodle UI findings, not whole-project acceptance.

Required gates:

1. Canonical question text and all four qtype answer structures are visible in both Activity and Official Preview; assignment brief/objectives/grade visible; user text escaped.
2. Step 4 shows the exact final revision, full activities, affected AI review refs and shell warnings. New revision requires fresh acknowledgment. Preview fetch failure is recoverable without silently approving unseen content.
3. Structure → Activities → Back → Activities works unchanged; edits invalidate old activity view and require reseal. Regenerate creates clean per-run state.
4. Unknown/failed activity or material loads block finalization and offer retry. Selection/upload/generation in flight block readiness. Old async responses cannot alter a newer run/revision/stage. Successful siblings and unsaved prompt/options survive unrelated updates.
5. Structure instruction warnings survive initial rendering and revision navigation.
6. Current material filenames and snapshot identity are hydrated from server, including after returning to the step. Missing, loading, and failed are distinguishable.
7. Non-default server policy is honored on blank activity controls; explicit teacher options survive sibling selection and navigation.

Evidence:
- Review actual code paths, not only worker summary.
- Behavioral tests must execute UI events/state with realistic canonical data, delayed/rejected responses, and recovery. Regex source assertions alone are insufficient.
- Run appropriate JS/PHP/API checks and browser rendering where available; record limitations without calling untested scenarios passed.
- Inspect and feedback each worker delivery; acceptance remains pending until supervisor verification.
- Do not use orchestrate-code-lifecycle. Do not restart user services, expose secrets, or call live providers for this UI validation.
