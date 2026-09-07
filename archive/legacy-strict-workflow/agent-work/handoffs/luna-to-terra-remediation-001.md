# Luna to Terra Remediation Handoff 001 — Phase 0

- **Requirements version:** 0.1 (approved by user on 2026-08-31)
- **Implementation plan version:** 0.1
- **Remediation version:** 001
- **Source audit:** `.agent-work/reports/audit-001.md`
- **Source audit disposition:** CHANGES_REQUIRED
- **Audit cycle completed:** 1
- **Target audit cycle:** 2
- **Implemented findings:** AUD-001 and AUD-002 only
- **Outgoing state:** AUDIT
- **Implementer role:** Luna

## Remediation result

Both accepted findings are corrected within the approved remediation scope.

### AUD-001 — loopback-only PostgreSQL publication

- `compose.yaml` now maps the host port as `127.0.0.1:${POSTGRES_PORT:-5432}:5432`.
- `docker compose config` renders `host_ip: 127.0.0.1` and `published: "5432"`; no `0.0.0.0` or `[::]` appears.
- Runtime `docker compose ps` reports `127.0.0.1:5432->5432/tcp` only.
- `DEVELOPMENT.md` now states that publication is loopback-only, `POSTGRES_PORT` changes only the host port, credentials are not suitable for remote/network exposure, and wildcard bindings are invalid.

### AUD-002 — truthful esbuild allowlist records

- `pnpm-workspace.yaml` was not changed and contains exactly one lifecycle build approval: `allowBuilds.esbuild: true`.
- `soc.md` T0001 now truthfully says the reviewed package-specific esbuild approval is committed as the sole allowlist entry for reproducible frozen installs.
- `.agent-work/handoffs/luna-to-terra.md` now truthfully records that `pnpm approve-builds esbuild` resulted in the sole committed `allowBuilds.esbuild: true` entry.
- No other allowlist entry was added, removed, or broadened.

## Exact changed files

- `compose.yaml` — loopback-only port mapping.
- `DEVELOPMENT.md` — local-only binding, port override, credentials, and status-check wording.
- `soc.md` — corrected T0001 esbuild allowlist statement.
- `.agent-work/handoffs/luna-to-terra.md` — corrected esbuild allowlist deviation statement.
- `.agent-work/handoffs/luna-to-terra-remediation-001.md` — this evidence handoff.
- `.agent-work/status.md` — updated to AUDIT/Terra cycle 2 after all checks passed.

No other implementation, dependency, lockfile, workspace, TypeScript, test, database-init, task, UI, or baseline file was modified.

## Required regression validation

All commands were run from `C:\moodle-prac\ai-platform`.

| Command/check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS — lockfile up to date; pnpm 11.25.0 |
| `pnpm typecheck` | PASS — all nine child typechecks completed |
| `pnpm test` | PASS — Vitest 3.2.4, no tests, intentional `--passWithNoTests` |
| `pnpm build` | PASS — all nine child builds completed |
| `docker compose config` | PASS — pinned image and topology retained; canonical output contains `host_ip: 127.0.0.1` and no wildcard binding |
| `docker compose up -d postgres` | PASS — service started using `pgvector/pgvector:0.8.6-pg17-bookworm` |
| `docker compose ps` after bounded health wait | PASS — healthy and `127.0.0.1:5432->5432/tcp` only |
| `docker compose exec -T postgres pg_isready -U moodle_agent_poc -d moodle_agent_poc` | PASS — accepting connections |
| `docker compose exec -T postgres psql -U moodle_agent_poc -d moodle_agent_poc -Atc "SELECT extversion FROM pg_extension WHERE extname = 'vector';"` | PASS — `0.8.6` |
| `docker compose down` | PASS — normal reversible shutdown |
| `docker volume inspect ai-platform_postgres_data --format '{{.Name}}'` | PASS — `ai-platform_postgres_data` preserved |

## Deterministic remediation checks

- Compose rendered host IP assertion: PASS (`host_ip: 127.0.0.1`).
- Runtime status assertion: PASS (`127.0.0.1:5432->5432/tcp`; neither `0.0.0.0` nor `[::]` present).
- PostgreSQL readiness and pgvector version: PASS (`0.8.6`).
- Normal shutdown volume retention: PASS (`ai-platform_postgres_data`). No destructive volume cleanup was run.
- `pnpm-workspace.yaml` allowlist exactness: PASS — sole entry is `esbuild: true` under `allowBuilds`.
- SOC/original handoff consistency: PASS — both contain `allowBuilds.esbuild: true` and no stale claim that no allowlist was committed.
- Required boundaries, package pins, lockfile, and Phase 0 task checkboxes remain unchanged.

## Deviations and environment notes

- Initial sandbox attempts for pnpm and Docker hit the known permission restrictions. Required commands were rerun through the approved escalation route; no npm/yarn fallback was used.
- The first Compose assertion expected a single inline `127.0.0.1:5432:5432` string, while canonical `docker compose config` correctly renders separate `host_ip` and `published` fields. The assertion was corrected to test canonical output; the implementation was not changed in response to that assertion mistake.
- Validation ran without a local `.env`, so Compose used project name `ai-platform` and the preserved volume was `ai-platform_postgres_data`. The documented environment example remains unchanged.

## Limitations

- Vitest still intentionally passes with no test files in Phase 0.
- Docker validation depends on local Docker daemon and registry availability.
- Development credentials remain intentionally non-production and must not be used with a network-exposed database.

## Terra audit focus — cycle 2

1. Reconfirm `compose.yaml` canonical and runtime publication is loopback-only, with no wildcard IPv4/IPv6 binding.
2. Reconfirm the pinned image, persistent volume, read-only init mount, health check, readiness, and pgvector `0.8.6` remain intact.
3. Reconfirm `pnpm-workspace.yaml`, `soc.md`, and the original Luna handoff agree on exactly one reviewed `allowBuilds.esbuild: true` entry.
4. Reconfirm frozen install, recursive typecheck/build, and root Vitest baseline pass without lockfile or package-topology changes.
5. Confirm only the six allowed remediation files changed and no Phase 1+ behavior/UI/baseline content was touched.

## Recommended disposition

`AUD-001` and `AUD-002` are ready for Terra re-audit. No blocker remains.
