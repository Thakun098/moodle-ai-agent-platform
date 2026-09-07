# Sol to Luna Handoff — Phase 0 Remediation 001

- **Requirements version:** 0.1 (approved)
- **Implementation plan version:** 0.1
- **Remediation plan:** `.agent-work/remediation-plan-001.md`
- **Source audit:** `.agent-work/reports/audit-001.md` — CHANGES_REQUIRED
- **Audit cycle:** 1
- **Assigned findings:** AUD-001 and AUD-002 only
- **Incoming state:** REMEDIATION_IMPLEMENTATION
- **Implementer role:** Luna

## Required Reading

Read `AGENTS.md`, approved requirements 0.1, implementation plan 0.1, audit-001, Terra-to-Sol handoff, remediation-plan-001, and this handoff before editing.

## Finding Decisions

- **AUD-001: ACCEPTED.** Bind PostgreSQL explicitly to `127.0.0.1` and document/verify the local-only boundary.
- **AUD-002: ACCEPTED.** Retain the sole reviewed `allowBuilds.esbuild: true` entry and correct both records that inaccurately deny a committed allowlist.

No product decision or requirements change is required.

## Assigned Changes

1. Change only `compose.yaml` port publication from `${POSTGRES_PORT:-5432}:5432` to `127.0.0.1:${POSTGRES_PORT:-5432}:5432`.
2. Update only the relevant PostgreSQL lifecycle/safety wording in `DEVELOPMENT.md` to explain loopback-only publication, port override behavior, expected `docker compose ps` output, and the non-production credentials.
3. Correct `soc.md`'s T0001 implementation note so it states that the sole committed build allowlist is `allowBuilds.esbuild: true`, reviewed and required for reproducible esbuild installation.
4. Correct `.agent-work/handoffs/luna-to-terra.md`'s deviation note with the same factual configuration history.
5. Run every package and Compose check in remediation-plan-001.
6. Write `.agent-work/handoffs/luna-to-terra-remediation-001.md` with exact evidence.
7. If all checks pass, transition `.agent-work/status.md` to `AUDIT`, Terra active, audit cycle 2.

## Allowed Files

- `compose.yaml`
- `DEVELOPMENT.md`
- `soc.md`
- `.agent-work/handoffs/luna-to-terra.md`
- `.agent-work/handoffs/luna-to-terra-remediation-001.md`
- `.agent-work/status.md`

## Validation Checklist

- [ ] `pnpm install --frozen-lockfile` passes without lockfile changes.
- [ ] `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [ ] `docker compose config` renders host IP `127.0.0.1` and keeps the pinned image/volume/init mount/health check.
- [ ] `docker compose ps` shows only `127.0.0.1:<port>->5432/tcp`, not wildcard IPv4/IPv6.
- [ ] PostgreSQL readiness passes.
- [ ] pgvector query returns `0.8.6`.
- [ ] Normal `docker compose down` preserves the actual named volume.
- [ ] `pnpm-workspace.yaml` still contains exactly `allowBuilds.esbuild: true` and no other allowed package.
- [ ] `soc.md` and the original Luna-to-Terra handoff accurately describe that entry.
- [ ] No file outside the allowed list changed.
- [ ] Remediation completion handoff is written with commands/results and audit focus.

## Prohibited Changes

Do not change dependency versions, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, package scripts, TypeScript configuration, workspace scaffolds, database init SQL, task checkboxes, UI assets, governance baselines, or any Phase 1+ behavior. Do not broaden network exposure, make the bind address configurable, add new security infrastructure, or delete the database volume.

## Stop Conditions

Stop safely and report the exact blocker if any required check fails after the approved retry route, wildcard publication persists, pgvector/database persistence regresses, another file must change, or user-owned content conflicts with the exact edits. Do not advance to audit or claim a finding fixed without the required evidence.
