# Terra to Sol Handoff — Phase 0 Audit Remediation

- **Audit report:** `.agent-work/reports/audit-001.md`
- **Audit disposition:** CHANGES_REQUIRED
- **Requirements version:** 0.1 (approved)
- **Implementation plan version:** 0.1
- **Audit cycle:** 1
- **Receiving role:** Sol
- **Current phase:** Phase 0 remediation planning

## Prioritized findings

1. **Blocking — AUD-001 (High):** `compose.yaml:9` publishes PostgreSQL on `0.0.0.0` and `[::]`, not loopback only. Bind the mapping to `127.0.0.1`, update local-service documentation, and prove the running container no longer publishes wildcard interfaces.
2. **Required — AUD-002 (Medium):** `pnpm-workspace.yaml:4-5` commits the esbuild `allowBuilds` entry, while `soc.md:157` and `luna-to-terra.md:109` say no allowlist was committed. Correct the records without broadening the allowlist.

## Correction order

1. Sol writes a minimal remediation plan that changes only the Compose loopback binding, affected local-development wording, and inaccurate Phase 0 records.
2. Luna implements that plan; do not alter package pins, lockfile, package scripts, workspace boundaries, or add Phase 1+ behavior.
3. Re-run Compose config/start/status/readiness/pgvector/down/volume checks and the frozen-lockfile plus root typecheck/test/build checks.
4. Terra re-audits the exact findings and regressions as audit cycle 2.

## Required regression validation

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `docker compose config`
- `docker compose up -d postgres`
- `docker compose ps` showing a loopback-only published port, never `0.0.0.0` or `[::]`
- `docker compose exec -T postgres pg_isready -U moodle_agent_poc -d moodle_agent_poc`
- `docker compose exec -T postgres psql -U moodle_agent_poc -d moodle_agent_poc -Atc "SELECT extversion FROM pg_extension WHERE extname = 'vector';"` returning `0.8.6`
- `docker compose down` plus named-volume inspection
- Compare `pnpm-workspace.yaml` with SOC and handoff wording to prove exact agreement on the sole allowed build package.

## Open questions

- None. Loopback binding and truthful artifact wording are directly required by the approved baseline; no user product decision is needed.

## Re-audit conditions

- Provide a Luna-to-Terra remediation handoff with exact files, command results, and any deviations.
- Preserve the pinned pgvector image, named volume, read-only init mount, and all Phase 0 scope boundaries.
- Terra will return `PASS` or `PASS_WITH_NOTES` only after AUD-001 and AUD-002 are resolved with the above evidence and no regression is found.
