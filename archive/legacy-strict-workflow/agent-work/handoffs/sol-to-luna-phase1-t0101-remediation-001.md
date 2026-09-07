# Sol to Luna Handoff — Phase 1 T0101 Correction and Finalization 001

- **Requirements version:** 0.1 (approved)
- **Implementation plan version:** 0.1
- **Remediation plan:** `.agent-work/remediation-plan-phase1-t0101-001.md`
- **Source audit:** `.agent-work/reports/audit-phase1-t0101-draft-001.md` — PASS
- **User authorization:** 2026-08-31; exact two corrections, final independent audit, and freeze without redesign
- **Assigned phase/task:** Phase 1 — T0101 only
- **Incoming state:** REMEDIATION_IMPLEMENTATION
- **Implementer role:** Luna
- **Required next role:** Terra

## Required Reading Order

Before editing, read:

1. `AGENTS.md`
2. `POC_BASELINE.md`
3. `Implementation.md`
4. `PLANNING_CONTRACT.md`
5. `TECH_STACK.md`
6. `task.md`
7. latest relevant `soc.md` entries
8. `.agent-work/requirements-phase1-t0101.md`
9. `.agent-work/implementation-plan-phase1-t0101.md`
10. `.agent-work/handoffs/sol-to-luna-phase1-t0101.md`
11. `.agent-work/handoffs/luna-to-terra-phase1-t0101.md`
12. `.agent-work/reports/audit-phase1-t0101-draft-001.md`
13. the actual draft schema, all 19 examples, and draft review notes
14. `.agent-work/remediation-plan-phase1-t0101-001.md`
15. this handoff

## User Feedback Decisions

- **Feedback-01: ACCEPTED / EXACT.** Set `properties.plan_id.description` to exactly `Stable hyphenated RFC UUID identity shared by revisions of one plan.`
- **Feedback-02: ACCEPTED / EXACT.** Set parsed `course-update.json.assumptions` to exactly `["Existing Moodle course context is supplied to the workflow outside this common PlanEnvelope."]`.

These are wording corrections only. Do not reinterpret, expand, or redesign them.

## Assigned Work

1. Record pre-change SHA-256 hashes for the draft schema, `course-update.json`, and the draft review notes.
2. Promote `packages/contracts/schemas/draft/plan-envelope.v0.1.schema.json` to the sole canonical path `packages/contracts/schemas/plan-envelope.v0.1.schema.json`.
3. In that final schema, apply Feedback-01 and only these lifecycle annotations:
   - `title`: `PlanEnvelope v0.1`
   - `description`: `Frozen common planning envelope for Phase 1 task T0101. Standards-compliant runtime validation is deferred to T0111.`
   - `$comment`: `The frozen envelope is declarative, provider-neutral, Moodle-light, and composable. It does not define downstream plan payloads.`
4. Preserve `$schema`, `$id`, and every validation-bearing member exactly. Remove the old draft schema only after equivalence passes.
5. Apply Feedback-02 only to `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-update.json`.
6. Preserve `packages/contracts/review/plan-envelope-v0.1-draft.md` byte-for-byte as historical evidence. Add `packages/contracts/review/plan-envelope-v0.1-freeze.md` with the factual freeze/final-audit record required by the remediation plan.
7. Run every deterministic equivalence, preservation, boundary, and workspace check in the remediation plan.
8. Write `.agent-work/handoffs/luna-to-terra-phase1-t0101-remediation-001.md` with complete evidence.
9. If and only if all checks pass, set `.agent-work/status.md` to `AUDIT`, Terra active, final candidate audit pending. Leave `task.md` and `soc.md` unchanged.

## Allowed Files

- `packages/contracts/schemas/draft/plan-envelope.v0.1.schema.json` (remove after verified promotion)
- `packages/contracts/schemas/plan-envelope.v0.1.schema.json` (new)
- `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-update.json`
- `packages/contracts/review/plan-envelope-v0.1-freeze.md` (new)
- `.agent-work/handoffs/luna-to-terra-phase1-t0101-remediation-001.md` (new)
- `.agent-work/status.md`

## Validation Checklist

- [ ] All 20 schema/example JSON documents parse.
- [ ] Final schema exists at the canonical path and no live draft-path schema remains.
- [ ] Feedback-01 and the three exact lifecycle annotation values match byte-for-value after JSON parsing.
- [ ] Parsed schema deep-compares with the audited draft after excluding only those four annotation members.
- [ ] All ten fields, constraints, `$schema`, `$id`, root/content boundaries, and forbidden-key posture remain unchanged.
- [ ] Feedback-02 is the exact one-item parsed array; every other `course-update.json` member is unchanged.
- [ ] The other 18 examples and all immutable evidence files are unchanged.
- [ ] Seven valid / twelve invalid coverage and one-violation isolation still pass.
- [ ] The new freeze record is factual, complete, and does not imply T0102 work.
- [ ] T0101 and T0102 remain unchecked and no T0101 SOC completion entry exists.
- [ ] `pnpm typecheck`, `pnpm test`, and `pnpm build` pass, with limitations reported accurately.
- [ ] Luna-to-Terra handoff contains hashes, exact diffs/equivalence, commands, results, and audit focus.
- [ ] No file outside the allowed list changed.

## Terra Gate and Administrative Boundary

Luna does not self-certify final acceptance. Request Terra to audit the exact candidate and write `.agent-work/reports/audit-phase1-t0101-final-001.md`. Terra must not modify implementation files.

Do not mark T0101 complete or append `soc.md` before Terra returns `PASS`. After PASS, only the lifecycle owner may change the T0101 checkbox, append the factual SOC completion entry, and set status to `COMPLETE`. The audited schema, examples, and review records must not change after PASS. T0102 remains out of scope and must not start.

## Prohibited Changes and Stop Conditions

Do not change schema semantics, any other example, historical review/audit evidence, dependencies, lockfiles, TypeScript/runtime source, tests, scripts, baseline governance, or any T0102+ artifact. Do not add Ajv or claim standards-compliant schema validation.

Stop safely and write the exact blocker if a requested change cannot be isolated, equivalence fails, immutable evidence changes, a required regression remains failing, another file would need modification, or any ambiguity would require product judgment. Do not widen scope and do not advance to Terra without complete evidence.
