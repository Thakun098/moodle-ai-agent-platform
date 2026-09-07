# Terra Audit Report 001 — Phase 0

- **Requirements version:** 0.1 (approved by user on 2026-08-31; evidence: `Approved`)
- **Implementation plan version:** 0.1
- **Auditor:** Terra
- **Audit cycle:** 1
- **Disposition:** CHANGES_REQUIRED
- **Audited phase:** Phase 0 — Repository and Development Baseline (T0001–T0005)
- **Audited implementation handoff:** `.agent-work/handoffs/luna-to-terra.md`

## Executive summary

The Phase 0 baseline is otherwise small, reproducible, and within scope: the lockfile is usable, nine workspace scaffolds are behavior-free, strict TypeScript checks and builds pass, and PostgreSQL starts healthy with pgvector `0.8.6`. However, the Compose port mapping publishes PostgreSQL on every host interface rather than loopback only, violating the approved local-service security boundary. In addition, the implementation records inaccurately say no dependency lifecycle allowlist was committed while `pnpm-workspace.yaml` commits `allowBuilds.esbuild: true`.

## Scope

- Governance: `AGENTS.md`, `POC_BASELINE.md`, `Implementation.md`, `PLANNING_CONTRACT.md`, `task.md`, and current `soc.md` records.
- Approved artifacts: requirements 0.1, implementation plan 0.1, Sol-to-Luna and Luna-to-Terra handoffs.
- Implementation: root workspace metadata, lockfile, all nine workspace manifests/configs/entrypoints, Compose, pgvector initialization, development documentation, and task/status records.
- Exclusions: no application behavior exists in the approved Phase 0 scope, so no runtime API/Moodle/Agent behavior was audited.

## Checks performed

- Re-read governing documents and approved artifact contracts; traced the claimed baseline from root scripts and workspace discovery to each child scaffold, then through Compose startup, pgvector initialization, and normal shutdown.
- Ran `pnpm --version`, `pnpm install --frozen-lockfile`, `pnpm list --depth -1 --recursive`, `pnpm typecheck`, `pnpm test`, and `pnpm build` outside the sandbox after Corepack state access was denied in the sandbox.
- Ran `docker compose config`, `docker compose up -d postgres`, bounded health wait, `docker compose ps`, `pg_isready`, the pgvector version query, `docker compose down`, and volume inspection outside the sandbox.
- Parsed all root/child JSON files, confirmed the 11 required boundaries and nine exact `export {};` source files, checked that no `.env` exists, and searched Phase 0 source/boundaries for later-phase behavior or credential material.

## Passed checks

- Node `v24.18.0`, Corepack `0.35.0`, and pnpm `11.25.0` are available; frozen install completed without lockfile changes.
- pnpm discovers exactly the root plus nine intended private child workspaces.
- All nine child TypeScript checks and builds pass. `strict`, NodeNext, composite/declaration/source-map, and additional safety flags are inherited from `tsconfig.base.json`.
- The root Vitest baseline passes with no test files through the intentional Phase 0 `--passWithNoTests` allowance.
- `pgvector/pgvector:0.8.6-pg17-bookworm` resolves; PostgreSQL becomes healthy; `pg_isready` succeeds; `SELECT extversion FROM pg_extension WHERE extname = 'vector';` returns `0.8.6`; normal `docker compose down` retains `ai-platform_postgres_data`.
- Only the approved PostgreSQL service, persistent volume, and read-only idempotent `CREATE EXTENSION IF NOT EXISTS vector;` init script exist. No Phase 1+ app, schema, migration, plugin, MCP, UI, Agent, or vector-retrieval behavior was found.
- `.env` is ignored and absent; `.env.example` contains the documented local-only sample values. The UI reference asset remains outside the implementation surface.

## Findings

### AUD-001 — PostgreSQL is exposed on all interfaces instead of localhost only

- **Severity:** High
- **Confidence:** High
- **Location:** `compose.yaml:8-9`; affected documentation: `DEVELOPMENT.md:54-87`
- **Affected requirement:** Requirements 0.1 T0005 local POC environment and non-functional Security; implementation plan 0.1 “do not ... expose PostgreSQL beyond the configured local host port.”
- **Evidence:** The mapping is `"${POSTGRES_PORT:-5432}:5432"`. On the audit run, `docker compose ps` reported `0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp`, proving Docker published the service on IPv4 and IPv6 host interfaces.
- **Impact:** Any network path permitted by the host firewall can reach the disposable database using the documented development credentials. This is broader than the approved local-only environment.
- **Reproduction:** Run `docker compose up -d postgres`, then `docker compose ps`; inspect the `PORTS` column for `0.0.0.0` and `[::]`.
- **Short-term fix:** Bind explicitly to loopback, for example `"127.0.0.1:${POSTGRES_PORT:-5432}:5432"`, and update the development guide to state that PostgreSQL is local-only.
- **Long-term prevention:** Keep an automated Compose-config or container-status assertion that rejects wildcard host bindings for local-only services.
- **Verification criteria:** `docker compose config` retains the pinned image and port variable; after startup, `docker compose ps` shows `127.0.0.1:<port>->5432/tcp` only; readiness, pgvector `0.8.6`, and normal volume preservation still pass.

### AUD-002 — Handoff and SOC incorrectly state that no build allowlist was committed

- **Severity:** Medium
- **Confidence:** High
- **Location:** `pnpm-workspace.yaml:4-5`; inaccurate records at `soc.md:157` and `.agent-work/handoffs/luna-to-terra.md:109`
- **Affected requirement:** Requirements 0.1 observability/security and implementation plan 0.1 security requirement to document reviewed dependency lifecycle-script allowlists truthfully.
- **Evidence:** `pnpm-workspace.yaml` commits `allowBuilds: { esbuild: true }`, which is the pnpm persistent build/lifecycle-script allowlist created by the stated `pnpm approve-builds esbuild` action. The two records instead state “no allowlist was committed.”
- **Impact:** The audit trail misstates a committed supply-chain control, obscuring why esbuild lifecycle code is permitted and weakening future dependency review.
- **Reproduction:** Compare `pnpm-workspace.yaml:4-5` with `soc.md:157` and `.agent-work/handoffs/luna-to-terra.md:109`.
- **Short-term fix:** Retain the narrow, reviewed esbuild allowlist if required, but amend both records to name it precisely and explain that it was required for the validated esbuild installation.
- **Long-term prevention:** After using package-manager approval commands, inspect generated workspace configuration before writing handoff/SOC claims.
- **Verification criteria:** The records and configuration agree on the exact allowed package, no other package appears under `allowBuilds`, and `pnpm install --frozen-lockfile` plus the root checks continue to pass.

## Residual risks

- Phase 0 intentionally has no behavior tests and accepts empty Vitest discovery; later phases must revisit that allowance once tests are added.
- The PostgreSQL credentials are intentionally non-production and local-only, but they remain unsuitable for any network-exposed deployment; AUD-001 must be fixed before this baseline is accepted.
- The root `test` command currently discovers tests from the repository rather than invoking per-workspace test scripts. This is adequate for the behavior-free Phase 0 scaffold but should be reassessed when packages gain independent test configuration.

## Verdict

Fix then re-audit. The baseline functionality validates, but wildcard PostgreSQL publication violates the approved local-only security boundary and the build-approval audit trail is inaccurate.
