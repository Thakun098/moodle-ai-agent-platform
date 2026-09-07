# Luna to Terra Handoff — Phase 1 T0102 SourceReference v0.1 DRAFT

- **Requirements:** `.agent-work/requirements-phase1-t0102.md` / 0.1 — approved
- **Approval evidence:** User message on 2026-08-31 (Asia/Bangkok): `อนุมัติ` (requirements/DRAFT-production authorization only)
- **Implementation plan:** `.agent-work/implementation-plan-phase1-t0102.md` / 0.1
- **Assigned phase/task:** Phase 1 — T0102 only
- **Implementer:** Luna
- **Outgoing state requested:** `AUDIT` — Terra
- **Contract disposition:** SourceReference v0.1 is a proposed DRAFT only; it is not accepted, frozen, complete, or authority for T0103
- **Implementation timestamp:** 2026-08-31 17:05 Asia/Bangkok

## Scope completed for audit

The exact planned 19 product files are present. The schema is standalone and is not imported, compiled, executed, exported, or composed into PlanEnvelope. No canonical/frozen SourceReference path or freeze record was created.

1. `packages/contracts/schemas/draft/source-reference.v0.1.schema.json`
2. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-only.json`
3. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-page.json`
4. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-section.json`
5. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-text.json`
6. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-page-section.json`
7. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-page-text.json`
8. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-section-text.json`
9. `packages/contracts/examples/source-reference/v0.1/intended-valid/source-page-section-text.json`
10. `packages/contracts/examples/source-reference/v0.1/intended-invalid/missing-source.json`
11. `packages/contracts/examples/source-reference/v0.1/intended-invalid/non-string-source.json`
12. `packages/contracts/examples/source-reference/v0.1/intended-invalid/blank-source.json`
13. `packages/contracts/examples/source-reference/v0.1/intended-invalid/zero-page.json`
14. `packages/contracts/examples/source-reference/v0.1/intended-invalid/fractional-page.json`
15. `packages/contracts/examples/source-reference/v0.1/intended-invalid/page-range.json`
16. `packages/contracts/examples/source-reference/v0.1/intended-invalid/blank-section.json`
17. `packages/contracts/examples/source-reference/v0.1/intended-invalid/blank-text.json`
18. `packages/contracts/examples/source-reference/v0.1/intended-invalid/unknown-property.json`
19. `packages/contracts/review/source-reference-v0.1-draft.md`

## Proposed schema and decisions

The DRAFT declares Draft 2020-12 with `$id` `urn:moodle-agent-poc:schema:planning:source-reference:0.1`, an unmistakable DRAFT title/comment, and an object root closed by `additionalProperties: false`. The exact four properties are `source`, `page`, `section`, and `text`; the only required property is `source`.

- `source` is a nonblank human-readable string (`minLength: 1`, `pattern: "\\S"`) whose value distinguishes supplied documents without an enum or document-ID field.
- `page` is optional, an integer with `minimum: 1`, and represents one human-visible one-based page. A page range is unsupported; later owning arrays can use multiple references.
- `section` is an optional nonblank human-readable heading/section string.
- `text` is an optional nonblank source-grounded supporting excerpt, not planner paraphrase, interpretation, or summary. The schema cannot prove grounding.
- `page`, `section`, and `text` are independently optional; every combination is valid, including source-only. `{}` is invalid because `source` is required.
- Unknown properties are rejected. No `$ref`, enum, format, default, maximum, composition/conditional keyword, custom keyword, or fifth property exists.

The nine material proposals are: source-only required-field posture; free-form source vocabulary; one-based positive page indexing; single-page references; independent optional combinations; no at-least-one-locator rule beyond required source; nonblank strings without arbitrary maximum/normalization; closed unknown-property policy; and excerpt (not paraphrase) text semantics. All remain proposals for explicit user contract review.

## Fixture matrix and observed dependency-free outcomes

All fixtures are synthetic and contain no credentials, personal/private material, URLs, paths, Moodle identifiers, or provider metadata.

### Intended-valid (8)

| Fixture | Present keys | Observed result |
| --- | --- | --- |
| `source-only.json` | `source` | PASS — minimum source-only form |
| `source-page.json` | `source`, `page` | PASS — positive one-based page |
| `source-section.json` | `source`, `section` | PASS — section locator |
| `source-text.json` | `source`, `text` | PASS — excerpt without locator |
| `source-page-section.json` | `source`, `page`, `section` | PASS — both locators |
| `source-page-text.json` | `source`, `page`, `text` | PASS — page plus excerpt |
| `source-section-text.json` | `source`, `section`, `text` | PASS — section plus excerpt |
| `source-page-section-text.json` | `source`, `page`, `section`, `text` | PASS — full form and second source value |

The eight files exhaust all optional-field combinations and use at least the two source values `syllabus-main` and `assessment-guidelines`. Text is short excerpt-style synthetic text.

### Intended-invalid (9)

| Fixture | Sole documented violation | Observed result |
| --- | --- | --- |
| `missing-source.json` | Required `source` omitted | PASS — exactly `required.source` |
| `non-string-source.json` | `source` is numeric | PASS — exactly `source.type` |
| `blank-source.json` | `source` is whitespace-only | PASS — exactly `source.nonblank` |
| `zero-page.json` | `page` is `0` | PASS — exactly `page.minimum` |
| `fractional-page.json` | `page` is `1.5` | PASS — exactly `page.integer` |
| `page-range.json` | `page` is `[4, 5]` | PASS — exactly `page.type`; ranges are unsupported |
| `blank-section.json` | `section` is whitespace-only | PASS — exactly `section.nonblank` |
| `blank-text.json` | `text` is whitespace-only | PASS — exactly `text.nonblank` |
| `unknown-property.json` | Adds `uri` | PASS — exactly `root.unknown` |

Each invalid fixture restores to a conforming baseline by changing/removing only the named mutation; all nine parse as JSON.

## Validation commands and actual results

All commands ran from `C:\moodle-prac\ai-platform`; no checker file was added. These checks are dependency-free syntax, structure, and manual fixture-consistency checks, not standards-compliant JSON Schema validation.

1. **JSON parse/count:** `node --input-type=module -e "<inline JSON.parse enumeration over draft schema and both fixture directories>"` — **PASS**, exactly 18 documents (`1 + 8 + 9`).
2. **Schema structure/metadata:** PowerShell literal here-string passed to `node --input-type=module -e $script` with assertions for dialect, `$id`, DRAFT annotations, exact four properties, `required: ["source"]`, descriptions, constraints, and forbidden keywords — **PASS**.
3. **Valid/invalid evaluator:** PowerShell literal here-string passed to `node --input-type=module -e $script` with explicit proposed-rule evaluator — **PASS**, zero errors for all eight valid fixtures and exactly the documented error for each invalid fixture.
4. **Invalid isolation:** PowerShell literal here-string passed to `node --input-type=module -e $script` restoring each fixture to a conforming baseline — **PASS**, one mutation per invalid fixture; `page-range` fails only because its page is not one integer.
5. **Review-note coverage:** PowerShell literal here-string passed to `node --input-type=module -e $script` — **PASS**, all 19 artifact paths, 17 example names, nine decisions, DRAFT gate, and limitations are present.
6. **Exact inventory/scope gates:** PowerShell/Node assertions — **PASS**, exactly 19 T0102 product files; no canonical SourceReference schema, freeze record, T0103 artifact, PlanEnvelope composition, runtime/type/test/dependency/script artifact; `packages/contracts/src/index.ts` remains exactly `export {};`; Ajv remains `TBD`; T0102/T0103 remain unchecked and no dated T0102 SOC completion heading exists.
7. **Frozen predecessor:** Node assertions — **PASS**, PlanEnvelope SHA-256 is `2372EBF32A363F4CDDF0929B672CD440F8B4C13C916142766C225B229EDFE571`; root is exactly the ten-field closed object and `content` remains an open object boundary.
8. **Workspace regression:** `pnpm typecheck` — first sandbox invocation failed before pnpm startup with known Corepack-cache `EPERM`; elevated rerun **PASS**, all nine workspaces completed. `pnpm test` — same initial Corepack-cache `EPERM`; elevated rerun **PASS**, Vitest 3.2.4 exited 0 with the existing `--passWithNoTests` baseline and no test files. `pnpm build` — same initial cache `EPERM`; elevated rerun **PASS**, all nine workspaces built.

Checker-only construction retries were corrected without repository edits: PowerShell initially expanded JavaScript `$schema`/`$id`; an evaluator regex was initially over-escaped; the review-note assertion initially expected different capitalization; the preservation script initially transcribed one frozen hash one character short; and the SOC gate initially matched the T0101 “Next Suggested Task” mention. Corrected reruns passed. These were command/assertion issues, not product or regression failures.

## T0101 preservation evidence

The pre-edit SHA-256 snapshot covered all 22 frozen T0101 product files and all 9 named T0101 lifecycle files. Post-edit hashes below match that snapshot byte-for-byte. The nested project has no Git metadata; these hashes and direct scope assertions replace diff evidence.

### T0101 product files (22)

| Path | SHA-256 (pre = post) |
| --- | --- |
| `packages/contracts/schemas/plan-envelope.v0.1.schema.json` | `2372EBF32A363F4CDDF0929B672CD440F8B4C13C916142766C225B229EDFE571` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-assumption-item.json` | `BF3790B3DDE04440A37F51D31DBAE19BD13154997630E3522753742294062D6E` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-summary.json` | `DA81BFE9977EDBB63043733DC68BE1640B5E2788650CC6FBDF555DA0C0EBD5F0` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/blank-title.json` | `C1DD887BA0EDEEC81B19799A74209F41963BA29A2A72CE15A904145887A8AFBF` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/invalid-warning-item.json` | `C64AA487E4D70EAA28097E48B4144C6CCDCF8FB48FEE8B7B4D585AA94ECB12FD` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/malformed-plan-id.json` | `9FF2BB7A9AFF74B7485E407F092AF027CB16C74CFCF752A0B8C7A7318CA95922` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/missing-required-field.json` | `7C7BE883704AC91630132C73F0DFA16C302E81BF0180D4340375669B276CFC4D` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/non-object-content.json` | `A44E9F40FC2F7B4D145B5F9DC1735CA91703099E03CDC2090E21C4BDF379A320` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/non-positive-revision.json` | `BA0C8D1C300DBE69920E97E7CDD75D06A404D6A4B6C6EFF80A46CB0E878D3183` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unknown-envelope-property.json` | `C8EC185F2A25D572C7EB2D314A302F9D971FFA6B38F0AC7F21E2D5F7CA675D12` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-operation.json` | `B758F16B563773706AED3D7E2902FBFA2384D119BF366A8AF3C5954B01E4287A` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-plan-type.json` | `26EE1A0204A891C0FA4039B3D2D3271FC74C14A96AEB08124431AA367E481FC1` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-invalid/unsupported-schema-version.json` | `CE5353795712D971050EEC1100B47BB5A5E936308CF604F925B9CFFAEE5EB2F6` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/assignment-create.json` | `53D2B6E2AD05E49EA5898B41F1961F6E0853F4F86244824A989AC4EC54AB673F` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/assignment-update.json` | `B39B011BA8372DA39CD5844E63C1826F39CE21D987B365C176BF6479DFFB7193` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-create-revision-1.json` | `72EDEB4F310BD3DCE99A64BD551272BE69AE1D577DB60EDC676051288853E92F` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-create-revision-2.json` | `C808A6B127A669DFC2D60AD5EC60E6B0EE03A43048121C0FD923DFADA114AD0A` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/course-update.json` | `5408B74EAFCE18A351EE4EAD7F4886D47CD01D68DA5AED01B3060C2769882DCF` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/quiz-create.json` | `41A8D443402E1DD4B8F17B8DFDBF6290F881EDFAD86007915F0C6DCA04A545FD` |
| `packages/contracts/examples/plan-envelope/v0.1/intended-valid/quiz-update.json` | `F864F57D681FF6C0C491B28EC44B54B6336953CC392153561C2F73C5B49854D4` |
| `packages/contracts/review/plan-envelope-v0.1-draft.md` | `976FAD49C9896D32522934A3848C40ABCBFEC3F8AA5A599F5B29D74C6053180C` |
| `packages/contracts/review/plan-envelope-v0.1-freeze.md` | `6D5C0D9E0C5066C8BB4D78B3795F16B1DED867CA8CFECA82D7BABC71642E1601` |

### T0101 lifecycle files (9)

| Path | SHA-256 (pre = post) |
| --- | --- |
| `.agent-work/requirements-phase1-t0101.md` | `42DEC9EEB78407415E1C5C6D06B756FBC49E59DDCF98B97C151C20448C4F466A` |
| `.agent-work/implementation-plan-phase1-t0101.md` | `E83639AAD3DD145CC5CCB8F96975F02413698D9119D701EA7F5598FBB24BE23E` |
| `.agent-work/remediation-plan-phase1-t0101-001.md` | `6E35C221A4D73AC1B390D2A8E2A039E79EC99B0F01680A39DFBF6AE17B5FB9B8` |
| `.agent-work/handoffs/sol-to-luna-phase1-t0101.md` | `AD5D373232D21EFAD7D29F20FE72056D6827A85CF5C3E4B64F678E4A9863F55B` |
| `.agent-work/handoffs/luna-to-terra-phase1-t0101.md` | `71DBE6DDCFE6981F362917BE4ED018D6A39EC8761E6BDAC88980655F851F0AEE` |
| `.agent-work/handoffs/sol-to-luna-phase1-t0101-remediation-001.md` | `5316811F88A0153C97473FB438CBF817CAAA0996B2B5A3EEDA4E3971E7D8A065` |
| `.agent-work/handoffs/luna-to-terra-phase1-t0101-remediation-001.md` | `B834ADFAF40825041C0C13B403D35BE8CF89CA25DB92CD80DA75304C00F0F404` |
| `.agent-work/reports/audit-phase1-t0101-draft-001.md` | `A3ACE7BD18DCEBC1DD44CB6FAD0BB633253A27CED651A511D37347B01F6D034D` |
| `.agent-work/reports/audit-phase1-t0101-final-001.md` | `C5D9BE15332AECE2AB492508EEA953DECF3D9AEF0BA6145D8414B1359C60A44C` |

The protected `task.md`, `soc.md`, `TECH_STACK.md`, `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, and `packages/contracts/src/index.ts` were read before editing and rechecked after editing. Direct checks confirm the contracts source remains exactly `export {};`, Ajv remains `TBD`, T0102/T0103 remain unchecked, and no T0102 completion heading exists in `soc.md`. No package/config/source/runtime/dependency/script/test/generated-output edit was made.

## Limitations, deviations, and blockers

- **Deviations:** None from the approved T0102 DRAFT plan or four-field boundary.
- **Validation limitation:** Ajv selection/installation, executable JSON Schema validation, runtime validators, and TypeScript alignment remain deferred to T0111/T0112. `pnpm test` is the existing Phase 0 no-test baseline and does not validate the schema.
- **Semantic limitation:** JSON Schema cannot prove excerpt grounding, page accuracy, source naming consistency, or cross-revision invariants.
- **Environment limitation:** The nested project has no Git metadata; pre/post hashes and direct scope assertions are the preservation evidence.
- **Blockers:** None for Terra's independent DRAFT audit. Contract acceptance is intentionally blocked pending explicit user review after Terra.

## Terra audit request

Please inspect the actual 19 product files and this handoff, rerun proportional dependency-free checks, and write `.agent-work/reports/audit-phase1-t0102-draft-001.md` with exactly one disposition: `PASS`, `PASS_WITH_NOTES`, or `CHANGES_REQUIRED`. Verify the exact Draft 2020-12 identity, four-field closed root, required/optional policy, page and nonblank constraints, absence of speculative fields/references, all fixture combinations and isolation, review-note accuracy, frozen T0101 preservation, no Ajv/dependency/runtime/type/task/SOC/T0103 changes, and truthful limitations. Terra must not modify product artifacts. A Terra PASS means ready for user contract review only; it does not accept/freeze T0102 or authorize T0103.
