# Phase 0 Implementation Plan

- **Version:** 0.1
- **Requirements version:** 0.1 (approved)
- **Status:** ready for implementation
- **Owner role:** Sol
- **Scope:** T0001–T0005 only

## Planning Decisions

1. **Node.js:** pin `24.18.0` in `.node-version`; declare `>=24.18.0 <25` in root `engines.node`. This matches the installed LTS host runtime while preventing an unreviewed major upgrade.
2. **pnpm:** pin `11.25.0` in root `packageManager` and `engines.pnpm`. pnpm 11 requires Node 22 or newer, so it is compatible with the Node 24 baseline. Use Corepack for activation; do not fall back to the currently broken npm installation.
3. **Core development dependencies:** pin `typescript` to `5.9.3` and `vitest` to `3.2.4` at the workspace root. Do not add Fastify, Drizzle, Ajv, MCP, Ollama, Moodle, or application dependencies in Phase 0.
4. **Database image:** pin `pgvector/pgvector:0.8.6-pg17-bookworm`. This provides PostgreSQL 17 with pgvector 0.8.6 and avoids a floating `pg17` tag.
5. **Lint/format:** do not add a lint or formatting tool in Phase 0. T0004 makes these conditional, and no meaningful application source exists yet. Reconsider when Phase 1 establishes actual TypeScript conventions.
6. **Documentation:** create `DEVELOPMENT.md` as the single Phase 0 setup and command guide.
7. **Compose file:** use root `compose.yaml`, one `postgres` service, one named volume, a health check, and one idempotent initialization SQL file.
8. **Workspace scaffolding:** every intended Node boundary receives a minimal private `package.json`, `tsconfig.json`, and behavior-free `src/index.ts` containing only `export {};`. The Moodle plugin and shared `tests` boundary remain tracked placeholders and are not pnpm packages.

## Current Architecture

The project root currently contains governance/baseline Markdown files and one UI design asset. There is no standalone Git repository at this nested path, no pnpm workspace, no TypeScript configuration, no application/package directories, no dependency lockfile, and no local service definition.

Available host evidence:

- Node.js 24.18.0 is installed.
- Docker 29.6.1 and Docker Compose 5.1.4 are installed.
- pnpm activation is blocked in the current sandbox by Corepack state-file access (`EPERM`).
- npm is not a usable fallback because its roaming CLI target is missing.
- Docker configuration access is also blocked in the current sandbox.

## Proposed Phase 0 Architecture

```text
ai-platform/
├─ package.json                 # private root workspace and commands
├─ pnpm-workspace.yaml          # apps/* and packages/* discovery
├─ pnpm-lock.yaml               # generated dependency lock
├─ .node-version                # exact Node 24.18.0 pin
├─ .gitignore                   # generated/local state exclusions
├─ .env.example                 # non-secret local DB settings
├─ tsconfig.base.json           # shared strict TS settings
├─ tsconfig.json                # root project references
├─ compose.yaml                 # local PostgreSQL/pgvector service
├─ DEVELOPMENT.md               # setup, lifecycle, validation, recovery
├─ docker/postgres/init/
│  └─ 001-enable-vector.sql     # idempotent CREATE EXTENSION
├─ apps/
│  ├─ api/                      # minimal Node workspace scaffold
│  └─ moodle-mcp-server/        # minimal Node workspace scaffold
├─ packages/
│  ├─ contracts/               # minimal Node workspace scaffold
│  ├─ agent-runtime/            # minimal Node workspace scaffold
│  ├─ syllabus/                 # minimal Node workspace scaffold
│  ├─ planning/                 # minimal Node workspace scaffold
│  ├─ execution/                # minimal Node workspace scaffold
│  ├─ verification/             # minimal Node workspace scaffold
│  └─ moodle-client/            # minimal Node workspace scaffold
├─ moodle/local_agentpoc/
│  └─ .gitkeep                  # boundary only; no plugin code
└─ tests/
   └─ .gitkeep                  # boundary only; no tests yet
```

The nine Node workspace scaffolds each contain:

```text
<workspace>/
├─ package.json
├─ tsconfig.json
└─ src/index.ts
```

This is a modular-monolith directory baseline only. It creates no runtime connections among packages and no Moodle/Agent behavior.

## Interfaces and Configuration

### Root `package.json`

- `name`: `moodle-agent-poc`
- `private`: `true`
- `type`: `module`
- `packageManager`: `pnpm@11.25.0`
- `engines.node`: `>=24.18.0 <25`
- `engines.pnpm`: `11.25.0`
- scripts:
  - `build`: `pnpm --recursive --stream run build`
  - `typecheck`: `pnpm --recursive --stream run typecheck`
  - `test`: `vitest run --passWithNoTests`
- exact dev dependencies: TypeScript 5.9.3 and Vitest 3.2.4

### `pnpm-workspace.yaml`

Only these workspace globs are enabled:

```yaml
packages:
  - apps/*
  - packages/*
```

No Moodle PHP directory or test directory is treated as a Node package in Phase 0.

### Shared TypeScript contract

`tsconfig.base.json` must include at least:

- `strict: true`
- `target: ES2022`
- `module: NodeNext`
- `moduleResolution: NodeNext`
- `composite: true`
- `declaration: true`
- `sourceMap: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `forceConsistentCasingInFileNames: true`
- `skipLibCheck: true`

Each child `tsconfig.json` extends the base, sets `rootDir` to `src`, `outDir` to `dist`, and includes `src/**/*.ts`. The root `tsconfig.json` has no files and references all nine Node workspaces for editor/build topology.

### Child package contract

Use scoped private names:

- `@moodle-agent-poc/api`
- `@moodle-agent-poc/moodle-mcp-server`
- `@moodle-agent-poc/contracts`
- `@moodle-agent-poc/agent-runtime`
- `@moodle-agent-poc/syllabus`
- `@moodle-agent-poc/planning`
- `@moodle-agent-poc/execution`
- `@moodle-agent-poc/verification`
- `@moodle-agent-poc/moodle-client`

Every child is `private`, uses ESM, and exposes only:

- `build`: `tsc -p tsconfig.json`
- `typecheck`: `tsc -p tsconfig.json --noEmit`

No dependency relationships, exports map, runtime entry point, or product behavior are frozen in Phase 0.

### Environment contract

`.env.example` contains safe local-only defaults/placeholders for:

```text
COMPOSE_PROJECT_NAME=moodle-agent-poc
POSTGRES_DB=moodle_agent_poc
POSTGRES_USER=moodle_agent_poc
POSTGRES_PASSWORD=moodle_agent_poc_dev
POSTGRES_PORT=5432
DATABASE_URL=postgresql://moodle_agent_poc:moodle_agent_poc_dev@localhost:5432/moodle_agent_poc
LOG_LEVEL=debug
```

`LOG_LEVEL=debug` records the local verbose-development preference but is not consumed by application code in Phase 0. `.env` is ignored and `.env.example` remains tracked.

### Compose contract

`compose.yaml` defines only `postgres`:

- image `pgvector/pgvector:0.8.6-pg17-bookworm`
- environment values interpolated from the variables above with the same safe development defaults
- host port `${POSTGRES_PORT:-5432}` to container port 5432
- named volume `postgres_data` at `/var/lib/postgresql/data`
- read-only initialization mount for `docker/postgres/init/001-enable-vector.sql`
- `pg_isready` health check using container environment variables
- no exposed production settings, custom networks, or privileged mode

Initialization SQL is exactly the idempotent database-level operation:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Ordered Implementation

### 1. T0001 — Initialize pnpm workspace

**Files:**

- create `package.json`
- create `pnpm-workspace.yaml`
- create `.node-version`
- create `.gitignore`
- create `.env.example`
- generate `pnpm-lock.yaml` using the pinned pnpm version

**Responsibilities:** Freeze runtime/package-manager metadata, root scripts, dependency versions, workspace discovery, generated-file exclusions, and safe configuration examples.

**Risks:** Corepack permission failure or package-registry failure may block lockfile generation. Do not hand-author a lockfile or switch package managers.

**Completion criteria:** Root metadata parses, pnpm identifies the root/workspace definition, dependencies install, and a real lockfile is generated.

### 2. T0002 — Configure TypeScript

**Files:**

- create `tsconfig.base.json`
- create root `tsconfig.json`
- create the nine child `tsconfig.json` files listed in the architecture

**Responsibilities:** Establish strict shared compilation settings and explicit project references.

**Dependency:** T0001 and T0003 workspace locations.

**Risks:** Root references and child compiler settings can diverge. Validate every referenced path and run all child typechecks.

**Completion criteria:** All nine child configs extend the base, root references are complete, `strict: true` is effective, and the root typecheck passes.

### 3. T0003 — Create repository structure

**Files/directories:**

- create every `apps/*`, `packages/*`, `moodle/local_agentpoc`, and `tests` directory listed in approved requirements
- create nine child `package.json` files
- create nine behavior-free `src/index.ts` files
- create `moodle/local_agentpoc/.gitkeep`
- create `tests/.gitkeep`

**Responsibilities:** Materialize clear boundaries and make all intended Node packages discoverable without implementing later phases.

**Dependency:** Coordinate with T0001/T0002 because manifests and TS configs make directories functional.

**Risks:** Accidental speculative APIs or dependencies. Keep every TypeScript entry point to `export {};` only.

**Completion criteria:** All required boundaries exist, all nine Node packages appear in recursive pnpm listing, and Moodle/tests are retained but not treated as workspaces.

### 4. T0004 — Add development commands

**Files:** Root and child `package.json` files from earlier steps; `DEVELOPMENT.md` for command documentation.

**Responsibilities:** Provide root `typecheck`, `test`, and `build`; ensure recursive child failure propagation; explicitly document that lint/format are deferred.

**Dependency:** T0001–T0003.

**Risks:** Vitest normally fails with no tests. The Phase 0 root command must use `--passWithNoTests`, and later phases must remove that allowance when tests exist and empty test runs should fail.

**Completion criteria:** Root commands run from the project root, cover all applicable child packages, fail on child errors, and pass for the valid scaffold.

### 5. T0005 — Create local development environment

**Files:**

- create `compose.yaml`
- create `docker/postgres/init/001-enable-vector.sql`
- create `DEVELOPMENT.md`
- use `.env.example` created in T0001

**Responsibilities:** Provide a healthy persistent PostgreSQL 17 development service, automatically enable pgvector, document lifecycle/validation/recovery, and keep secrets out of source.

**Dependency:** T0001 environment contract.

**Risks:** Docker config sandbox denial, occupied port 5432, image pull/network failure, or stale volume initialized with incompatible settings. Report actual errors and do not represent unrun checks as passing.

**Completion criteria:** Compose config resolves; PostgreSQL becomes healthy; SQL confirms `vector` version 0.8.6; ordinary `down` preserves the volume; documentation covers explicit destructive cleanup separately.

## Concise Workflow / Pseudocode

```text
assert node == 24.18.0
activate pnpm == 11.25.0 through Corepack

create root workspace/config/example files
create exact app/package/plugin/test boundaries
create behavior-free child manifests, TS configs, and entrypoints

pnpm install
assert pnpm-lock.yaml was generated
pnpm install --frozen-lockfile
assert recursive workspace list contains 9 intended packages

run pnpm typecheck
run pnpm test
run pnpm build

validate docker compose config
start postgres
wait for healthy status
query pg_extension where extname = 'vector'
assert version == 0.8.6
stop compose without deleting the volume

only if all applicable checks pass:
  mark T0001..T0005 complete in task.md
  append factual T0001..T0005 records to soc.md
write Luna-to-Terra handoff
```

## Validation Commands

Run from `C:\moodle-prac\ai-platform` and record actual outputs/exit codes in the Luna handoff and `soc.md`:

```powershell
node --version
corepack --version
corepack install --global pnpm@11.25.0
pnpm --version
pnpm install
pnpm install --frozen-lockfile
pnpm list --depth -1 --recursive
pnpm typecheck
pnpm test
pnpm build
docker compose config
docker compose up -d postgres
docker compose ps
docker compose exec -T postgres pg_isready -U moodle_agent_poc -d moodle_agent_poc
docker compose exec -T postgres psql -U moodle_agent_poc -d moodle_agent_poc -Atc "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
docker compose down
```

Also verify read-only facts:

- every approved directory exists
- `.env.example` contains no real secret
- `.env` is ignored while `.env.example` is not
- all root/child JSON and YAML files parse through their owning tools
- `docker compose down` leaves the named volume intact
- no later-phase source, schema, endpoint, migration, Moodle plugin code, UI scaffold, or Agent behavior was added

If a command is blocked solely by sandbox access, retry using the approved execution mechanism. If it remains blocked, record the exact sanitized error, do not mark the affected task complete, and stop with a blocker handoff.

## Compatibility, Security, and Recovery

### Compatibility

- Node is fixed to the installed LTS patch and pnpm is fixed to a Node-24-compatible release.
- TypeScript targets ES2022 and uses NodeNext modules to avoid freezing a newer runtime-only output target prematurely.
- Child packages remain private and publish nothing.
- PostgreSQL 17 and pgvector 0.8.6 are pinned together; later upgrades require an explicit reviewed change.
- PowerShell is the documented host shell, while package scripts remain shell-neutral.

### Security

- Commit `.env.example`, never `.env`.
- Use clearly local, non-production example credentials only.
- Do not mount Docker daemon sockets, use privileged containers, or expose PostgreSQL beyond the configured local host port.
- Do not add dependency lifecycle-script allowlists unless an installed dependency demonstrably requires one and the package is reviewed.
- Do not place tokens, Moodle credentials, Docker credentials, or host paths in logs/artifacts.

### Recovery

- `docker compose down` is the normal reversible stop; it preserves `postgres_data`.
- `docker compose down --volumes` is destructive and may appear only as an explicitly labeled cleanup command in `DEVELOPMENT.md`; do not run it during normal validation.
- Generated `dist`, coverage, and TypeScript build-info outputs can be regenerated by the documented commands.
- If dependency installation fails, preserve manifests and the last valid lockfile; do not hand-edit lockfile internals.
- If database initialization fails, preserve container logs and volume state for diagnosis. Do not delete the volume unless the user explicitly authorizes cleanup or the documented clean-reset operation is intentionally chosen.

## Plan Risks and Stop Conditions

- Stop if a frozen baseline decision must change.
- Stop if installing a dependency requires an unreviewed install script or secret.
- Stop if Corepack/pnpm cannot be made available after the approved retry route; do not substitute npm/yarn.
- Stop if Docker validation cannot access the daemon after the approved retry route; report T0005 as blocked.
- Stop if the pinned pgvector image/tag cannot be resolved; return to Sol rather than using a floating or unrelated image.
- Stop if existing files appear during implementation and overlap planned files with user content; preserve them and request direction.
- Stop before any Phase 1+ behavior, Moodle mutation, UI/plugin implementation, or direct database application mutation.

## Phase 0 Completion Criteria

Phase 0 is complete only when:

1. Every approved T0001–T0005 artifact exists with the responsibilities above.
2. A real pnpm lockfile is generated by pnpm 11.25.0.
3. All nine workspaces are discovered.
4. Typecheck, test, and build pass from the root.
5. Compose configuration passes, PostgreSQL is healthy, and SQL confirms pgvector 0.8.6.
6. Normal service shutdown preserves the database volume.
7. `DEVELOPMENT.md` is sufficient for a new developer and distinguishes normal shutdown from destructive cleanup.
8. No later-phase behavior or secret was added.
9. `task.md` marks T0001–T0005 complete only after checks pass.
10. `soc.md` contains factual completion records for all five tasks.
11. Luna writes `.agent-work/handoffs/luna-to-terra.md` with changed files, commands/results, deviations, limitations, and audit focus.
