# Phase 0 Remediation Plan 001

- **Remediation version:** 001
- **Requirements version:** 0.1 (approved)
- **Implementation plan version:** 0.1
- **Source audit:** `.agent-work/reports/audit-001.md`
- **Audit disposition:** CHANGES_REQUIRED
- **Audit cycle:** 1
- **Status:** ready for remediation implementation
- **Owner role:** Sol

## Finding Classification

### AUD-001 — Accepted

**Classification:** Accepted as reported; blocking.

**Evidence:** `compose.yaml:9` currently uses `${POSTGRES_PORT:-5432}:5432`, which does not specify a host IP. Terra observed Docker publishing it as both `0.0.0.0:5432` and `[::]:5432`. This contradicts the approved local-only POC boundary and exposes known development credentials more broadly than intended.

**Decision:** Bind PostgreSQL explicitly to IPv4 loopback. This is a correction within approved requirements and does not reopen product scope or architecture.

### AUD-002 — Accepted

**Classification:** Accepted as reported; required audit-record correction.

**Evidence:** `pnpm-workspace.yaml` contains exactly `allowBuilds.esbuild: true`, while `soc.md:157` and `.agent-work/handoffs/luna-to-terra.md:109` state that no dependency lifecycle allowlist was committed. The records are factually inconsistent with the configuration.

**Decision:** Retain the narrow reviewed esbuild allowlist and correct both records. Removing the allowlist is not requested because the initial validated installation required it and Terra found no broader allowlist.

## Exact Remediation Scope

### Fix AUD-001

1. In `compose.yaml`, replace the PostgreSQL port mapping with:

   ```yaml
   - "127.0.0.1:${POSTGRES_PORT:-5432}:5432"
   ```

2. In `DEVELOPMENT.md` under PostgreSQL lifecycle, state explicitly that:
   - the published port binds to `127.0.0.1` only;
   - `POSTGRES_PORT` changes the host port but not the loopback-only address;
   - the local development credentials are not suitable for remote/network exposure.
3. Add or update the documented status check so a developer knows `docker compose ps` should show `127.0.0.1:<port>->5432/tcp` and must not show `0.0.0.0` or `[::]`.

### Fix AUD-002

1. In `soc.md`, replace the inaccurate T0001 implementation note with truthful wording equivalent to:

   > pnpm 11 required a reviewed, package-specific build approval for esbuild; `pnpm-workspace.yaml` commits the sole allowlist entry `allowBuilds.esbuild: true` so frozen installs remain reproducible.

2. In `.agent-work/handoffs/luna-to-terra.md`, replace the inaccurate deviation note with truthful wording equivalent to:

   > pnpm 11 initially reported `ERR_PNPM_IGNORED_BUILDS` for esbuild. Only esbuild was reviewed and approved with `pnpm approve-builds esbuild`; the resulting sole committed lifecycle allowlist entry is `allowBuilds.esbuild: true`.

3. Do not add, remove, or broaden entries under `allowBuilds`.

### Remediation evidence

Create `.agent-work/handoffs/luna-to-terra-remediation-001.md` containing:

- requirements, implementation-plan, remediation, and audit versions;
- exact changed files and line-level behavior;
- confirmation that the allowlist remains exactly esbuild;
- every validation command and result;
- any deviations, limitations, blocker, and Terra audit focus.

Update `.agent-work/status.md` to `AUDIT` with Terra active only after all required remediation checks pass. If blocked, preserve `REMEDIATION_IMPLEMENTATION` or use the lifecycle's blocker state as directed and record the exact blocker.

## Files Allowed to Change

- `compose.yaml`
- `DEVELOPMENT.md`
- `soc.md`
- `.agent-work/handoffs/luna-to-terra.md`
- `.agent-work/handoffs/luna-to-terra-remediation-001.md` (new)
- `.agent-work/status.md`

Do not modify any other implementation, dependency, lockfile, workspace, TypeScript, test, database-init, task, UI, or baseline architecture file.

## Required Validation

Run from `C:\moodle-prac\ai-platform` and record actual results:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
docker compose config
docker compose up -d postgres
docker compose ps
docker compose exec -T postgres pg_isready -U moodle_agent_poc -d moodle_agent_poc
docker compose exec -T postgres psql -U moodle_agent_poc -d moodle_agent_poc -Atc "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
docker compose down
docker volume inspect ai-platform_postgres_data --format '{{.Name}}'
```

Also perform these deterministic checks:

1. Rendered Compose configuration contains host IP `127.0.0.1` for the published PostgreSQL port.
2. While running, `docker compose ps` shows `127.0.0.1:<port>->5432/tcp` and contains neither `0.0.0.0` nor `[::]` for PostgreSQL.
3. `pg_isready` succeeds and pgvector remains exactly `0.8.6`.
4. Normal `docker compose down` retains the named volume. If the effective Compose project name differs because `.env` is present, inspect the actual volume name reported by Compose rather than assuming `ai-platform_postgres_data`.
5. `pnpm-workspace.yaml` contains exactly one allowed build package: `esbuild: true`.
6. `soc.md` and `.agent-work/handoffs/luna-to-terra.md` both describe that sole committed entry accurately and no longer contain the claim that no allowlist was committed.
7. Frozen install and root typecheck/test/build remain passing, proving no baseline regression.

If sandbox access blocks pnpm or Docker, use only the previously approved escalation route. Never report a skipped or blocked check as passing.

## Constraints and Prohibited Changes

- Fix only AUD-001 and AUD-002.
- Preserve `pgvector/pgvector:0.8.6-pg17-bookworm`, the read-only init mount, health check, named volume, environment contract, package pins, lockfile, workspace topology, and all Phase 0 task completion checkboxes.
- Do not change `pnpm-workspace.yaml`; the existing sole esbuild allowlist is the intended reviewed state.
- Do not add IPv6, LAN, or wildcard bindings. Do not make the host IP configurable in this remediation because that would weaken the fixed local-only boundary.
- Do not add firewall rules, TLS, production credentials, production database hardening, or authentication work.
- Do not implement Phase 1+ code, UI/plugin work, Moodle mutation, schemas, APIs, persistence, Agent behavior, or tests outside this regression scope.
- Preserve all unrelated user-owned content and do not reformat untouched sections.
- Do not run destructive database-volume cleanup.

## Stop Conditions

Stop and write a blocker handoff if:

- loopback publication cannot be achieved without changing the approved Compose topology;
- Docker still reports wildcard publication after the explicit loopback mapping;
- the database no longer becomes healthy, pgvector differs from `0.8.6`, or the named volume is lost on normal shutdown;
- frozen install or root checks regress;
- correcting the records would require altering the allowlist or another dependency decision;
- any file outside the allowed list must change;
- user-owned content conflicts with the exact correction.

## Completion and Re-audit Criteria

Remediation is ready for Terra audit cycle 2 only when:

1. AUD-001's mapping and documentation are corrected and runtime evidence proves loopback-only publication.
2. AUD-002's two inaccurate records truthfully match the sole committed `allowBuilds.esbuild: true` entry.
3. All required package and Compose regression checks pass.
4. No prohibited or unrelated file changed.
5. `.agent-work/handoffs/luna-to-terra-remediation-001.md` contains complete evidence.
6. `.agent-work/status.md` transitions to `AUDIT`, Terra active, latest audit remains audit-001 pending re-audit, and audit cycle advances to 2.
