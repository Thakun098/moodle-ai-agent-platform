# Terra Audit Report 002 — Phase 0 Remediation

- **Requirements version:** 0.1 (approved by user on 2026-08-31; evidence: `Approved`)
- **Implementation plan version:** 0.1
- **Remediation plan version:** 001
- **Source audit:** `.agent-work/reports/audit-001.md` (CHANGES_REQUIRED)
- **Auditor:** Terra
- **Audit cycle:** 2
- **Disposition:** PASS
- **Audited phase:** Phase 0 — Repository and Development Baseline remediation (AUD-001 and AUD-002)
- **Audited implementation handoff:** `.agent-work/handoffs/luna-to-terra-remediation-001.md`

## Executive summary

Both cycle-1 findings are resolved within the approved remediation scope. PostgreSQL now binds only to IPv4 loopback in canonical Compose output and at runtime, while health, pgvector `0.8.6`, and normal volume preservation remain intact. The exact sole pnpm build approval (`allowBuilds.esbuild: true`) now agrees with the SOC and Luna handoff. Frozen installation, strict TypeScript checks, Vitest baseline, and builds pass with no Phase 1+ behavior found.

## Scope

- Reviewed remediation plan 001, remediation handoff 001, audit-001, current workflow status, and actual remediated files.
- Traced AUD-001 through `compose.yaml`, rendered Compose configuration, running container status, database readiness/extension state, normal shutdown, and development instructions.
- Traced AUD-002 through `pnpm-workspace.yaml`, `soc.md`, and the original Luna-to-Terra handoff.
- Checked package-workspace regressions and Phase 0 source boundaries; no application behavior exists in the approved scope.

## Checks performed

- Inspected the allowed remediation files and confirmed the exact loopback mapping `127.0.0.1:${POSTGRES_PORT:-5432}:5432` in `compose.yaml`.
- Ran `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, and `pnpm build` using the approved execution route after sandbox Corepack access was denied.
- Ran `docker compose config`, `docker compose up -d postgres`, bounded health wait, `docker compose ps`, `pg_isready`, the pgvector version query, `docker compose down`, and named-volume inspection using the approved execution route.
- Asserted canonical Compose has `host_ip: 127.0.0.1` and no wildcard host IP; asserted runtime status has `127.0.0.1:5432->5432/tcp` and neither `0.0.0.0` nor `[::]`.
- Asserted `pnpm-workspace.yaml` has exactly one allowed build package, `esbuild: true`, and both historical records contain `allowBuilds.esbuild: true` without their stale no-allowlist claim.
- Reconfirmed the nine child source entrypoints remain exactly `export {};`, no `.env` exists, and no Phase 1+ source behavior was introduced.

## Passed checks

- **AUD-001 resolved:** `compose.yaml:9` binds PostgreSQL to `127.0.0.1`; canonical configuration reports `host_ip: 127.0.0.1`; the running service reports only `127.0.0.1:5432->5432/tcp`.
- **AUD-001 regression checks:** PostgreSQL became healthy; `pg_isready` succeeded; `SELECT extversion FROM pg_extension WHERE extname = 'vector';` returned `0.8.6`; `docker compose down` retained `ai-platform_postgres_data`.
- **AUD-001 documentation:** `DEVELOPMENT.md:56-76` accurately explains loopback-only publication, fixed host address, non-network-suitable credentials, and the expected/forbidden `docker compose ps` values.
- **AUD-002 resolved:** `pnpm-workspace.yaml:4-5` contains exactly `allowBuilds.esbuild: true`; `soc.md:157` and `.agent-work/handoffs/luna-to-terra.md:109` accurately state that the reviewed esbuild approval is the sole committed lifecycle allowlist entry.
- **Workspace regressions:** frozen pnpm installation passed with pnpm `11.25.0`; all nine child typechecks and builds passed; Vitest `3.2.4` passed through the intentional Phase 0 `--passWithNoTests` baseline.
- **Scope/instruction compliance:** only Phase 0 configuration/documentation/audit artifacts are present; all nine source entrypoints are behavior-free; no schemas, APIs, persistence, Moodle/plugin work, Agent/MCP code, UI scaffold, or vector retrieval was introduced.

## Findings

No remaining or new validated findings.

### AUD-001 closure

- **Severity at discovery:** High
- **Confidence:** High
- **Location:** `compose.yaml:8-9`; `DEVELOPMENT.md:56-76`
- **Affected requirement:** Requirements 0.1 T0005 and non-functional Security; implementation plan 0.1 local-host-only publication boundary.
- **Evidence:** Rendered Compose configuration reports `host_ip: 127.0.0.1`; live `docker compose ps` reports `127.0.0.1:5432->5432/tcp` only. PostgreSQL readiness and pgvector checks pass afterwards.
- **Impact:** Resolved. The documented local database no longer publishes on wildcard IPv4/IPv6 interfaces.
- **Reproduction:** Start with `docker compose up -d postgres`, inspect `docker compose ps`, then run readiness and extension checks.
- **Short-term fix:** Implemented and verified.
- **Long-term prevention:** The documentation now provides an explicit runtime assertion; retain a wildcard-binding check in future Compose validation.
- **Verification criteria:** Met.

### AUD-002 closure

- **Severity at discovery:** Medium
- **Confidence:** High
- **Location:** `pnpm-workspace.yaml:4-5`, `soc.md:157`, `.agent-work/handoffs/luna-to-terra.md:109`
- **Affected requirement:** Requirements 0.1 observability/security and implementation-plan truthfulness for reviewed lifecycle allowlists.
- **Evidence:** A deterministic check found one allowlist entry only (`esbuild: true`); both records name `allowBuilds.esbuild: true`; neither retains its inaccurate “no allowlist was committed” language.
- **Impact:** Resolved. The persisted supply-chain control is now traceable and accurately documented.
- **Reproduction:** Compare the three cited files and run `pnpm install --frozen-lockfile`.
- **Short-term fix:** Implemented and verified.
- **Long-term prevention:** Inspect package-manager-generated workspace configuration before recording approval outcomes.
- **Verification criteria:** Met.

## Residual risks

- Phase 0 intentionally has no behavior tests; `pnpm test` succeeds via the approved `--passWithNoTests` allowance. Revisit this once packages acquire tests.
- The local PostgreSQL credentials are intentionally disposable and remain unsuitable for any remote/network deployment; loopback-only binding now enforces the documented scope.
- Docker and Corepack validation require the local daemon/user state and were run through the approved route after sandbox access limits; this is an environment constraint, not an implementation failure.

## Verdict

Ship the Phase 0 baseline. No Critical or High finding remains, both remediation items meet their verification criteria, and the remaining limitations are intentional Phase 0 constraints.
