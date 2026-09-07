# Sol to Luna Handoff — Phase 0

- **Requirements version:** 0.1 (approved by user on 2026-08-31; evidence: `Approved`)
- **Implementation plan version:** 0.1
- **Assigned phase:** Phase 0 — Repository and Development Baseline
- **Assigned tasks:** T0001, T0002, T0003, T0004, T0005
- **Incoming state:** IMPLEMENTATION
- **Implementer role:** Luna

## Required Reading Order

Before editing, read:

1. `AGENTS.md`
2. `POC_BASELINE.md`
3. `Implementation.md`
4. `PLANNING_CONTRACT.md`
5. `task.md`
6. latest entries in `soc.md`
7. `.agent-work/requirements.md`
8. `.agent-work/implementation-plan.md`
9. this handoff

## Exact Scope

Implement all and only Phase 0 tasks T0001–T0005 according to implementation plan 0.1:

- initialize the pinned pnpm workspace and lockfile
- add the shared strict TypeScript baseline
- create the exact app/package/Moodle/test directory scaffolds
- add working root typecheck/test/build commands
- add the local PostgreSQL 17 + pgvector 0.8.6 Compose environment and `DEVELOPMENT.md`
- validate the scaffold and service
- after successful validation, update T0001–T0005 in `task.md` and append factual entries to `soc.md`
- write `.agent-work/handoffs/luna-to-terra.md`

Follow the implementation plan's exact paths, package names, versions, environment variables, scripts, and image tag. Minimal child `src/index.ts` files must contain no behavior beyond `export {};`.

## Required Behavior and Interfaces

- Node 24.18.0 exact local pin and supported range `>=24.18.0 <25`.
- pnpm 11.25.0 exact package-manager pin.
- TypeScript 5.9.3 and Vitest 3.2.4 as the only root development dependencies.
- pnpm discovers exactly the intended `apps/*` and `packages/*` packages.
- every child extends the strict shared TS configuration.
- root `typecheck`, `test`, and `build` execute successfully and do not mask child failures.
- `compose.yaml` starts one PostgreSQL service from `pgvector/pgvector:0.8.6-pg17-bookworm` with persistent named storage and a health check.
- init SQL uses `CREATE EXTENSION IF NOT EXISTS vector;`.
- `.env.example` is safe and `.env` is ignored.
- `DEVELOPMENT.md` documents prerequisites, Corepack/pnpm activation, install, validation, service start/status/pgvector verification/stop, troubleshooting, and explicit destructive cleanup.
- development logging preference is represented as `LOG_LEVEL=debug` only; do not add application logging code.

## Required Validation

Run the exact validation sequence in `.agent-work/implementation-plan.md`. Capture command, result, and relevant output. In particular, prove:

- pinned Node and pnpm versions
- frozen-lockfile install
- recursive discovery of all nine Node workspaces
- root typecheck/test/build success
- Compose config validity
- PostgreSQL healthy/readiness state
- SQL-reported pgvector version equals `0.8.6`
- normal `docker compose down` preserves the volume

Retry sandbox-blocked Corepack/pnpm or Docker commands only through the approved escalation mechanism. Never claim a blocked or skipped check passed.

## Prohibited Changes

- No Phase 1+ contracts, schemas, APIs, persistence models/migrations, Fastify app, syllabus logic, planner, preview, execution, verification, MCP server behavior, Moodle plugin behavior, UI scaffold, or tests for those behaviors.
- No direct Moodle database access or mutation.
- No Fastify, Drizzle, Ajv, MCP SDK, Ollama client, UI framework, lint tool, formatter, Agent framework, RAG/vector retrieval, Redis/BullMQ, object storage, Kubernetes, or production infrastructure dependency.
- No UI implementation from `UI-design/UI-create-course-to-approve-to-create.png`; preserve that file unchanged.
- No npm/yarn fallback, floating pgvector image tag, hand-written lockfile, real secret, destructive volume cleanup, or unrelated file formatting.
- Do not change frozen architecture documents unless a genuine conflict is discovered; stop and return to Sol instead.
- Preserve all user-owned/unrelated files and any pre-existing changes.

## Known Risks

- Corepack currently receives `EPERM` reading its user state in the sandbox.
- npm resolves to a missing roaming CLI and is not a fallback.
- Docker config access is currently denied in the sandbox.
- Registry/image pulls need network access.
- Host port 5432 may already be occupied.
- This nested project root is not currently a standalone Git repository, so validation cannot rely on a local project diff.

## Stop Conditions

Stop safely and write a blocker handoff if:

- pnpm 11.25.0 or the lockfile cannot be produced after the approved retry route;
- Docker/Compose cannot be validated after the approved retry route;
- the pinned image does not resolve or does not report pgvector 0.8.6;
- implementation would overwrite user content or require a frozen-decision change;
- a requested action needs new user authority;
- any Phase 0 acceptance criterion cannot be truthfully met.

On a blocker, leave affected task checkboxes unchecked and record completed/incomplete work, files changed, exact sanitized errors, attempts, required decision, and safest next action.

## Completion Checklist

- [ ] Read all required instructions and artifacts.
- [ ] Implement T0001 root workspace files and generated lockfile.
- [ ] Implement T0002 strict shared/child TypeScript configs.
- [ ] Implement T0003 exact repository boundaries and behavior-free scaffolds.
- [ ] Implement T0004 root commands; lint/format remain explicitly deferred.
- [ ] Implement T0005 Compose, pgvector init, environment example, and development guide.
- [ ] Run and record every applicable validation command.
- [ ] Confirm no secrets or later-phase behavior were added.
- [ ] Mark T0001–T0005 `[x]` only after their validation succeeds.
- [ ] Append factual completion records to `soc.md`.
- [ ] Write `.agent-work/handoffs/luna-to-terra.md` with requirements/plan versions, changed files, behavior, deviations, commands/results, limitations, blockers, and audit focus.
- [ ] Update `.agent-work/status.md` for the Luna-to-Terra transition only when implementation and handoff are complete.
