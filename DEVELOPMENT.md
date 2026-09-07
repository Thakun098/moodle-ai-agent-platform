# Local Development

This document describes the disposable Phase 0 development baseline. The
repository uses Node.js 24.18.0, pnpm 11.25.0, and one local PostgreSQL 17
service with pgvector 0.8.6. Ollama and Moodle are not started by this
baseline.

## Prerequisites

- Windows PowerShell
- Node.js 24.18.0 (the repository pin is in `.node-version`)
- Docker Engine with Docker Compose v2
- Network access to the npm registry and the Docker image registry

Verify the runtime:

```powershell
node --version
corepack --version
```

## Install dependencies

Activate the pinned package manager through Corepack, then install from the
workspace root:

```powershell
corepack install --global pnpm@11.25.0
pnpm --version
pnpm install
pnpm install --frozen-lockfile
```

The second install is a reproducibility check and should not change
`pnpm-lock.yaml`. Do not commit `.env`; copy `.env.example` to `.env` only if
you need to override local defaults.

## Workspace checks

Run these commands from `C:\moodle-prac\ai-platform`:

```powershell
pnpm list --depth -1 --recursive
pnpm typecheck
pnpm test
pnpm build
```

The Phase 0 test command uses Vitest's `--passWithNoTests` because no behavior
tests exist yet. Build and typecheck recurse over all nine Node workspaces.
Linting and formatting are intentionally deferred until a later task selects
a minimal deterministic tool.

## PostgreSQL lifecycle

The Compose file starts only the local `postgres` service. Configuration is
read from `.env` when present, with the safe values in `.env.example` as
fallbacks. The published PostgreSQL port is bound to `127.0.0.1` only.
`POSTGRES_PORT` changes the host port but not the loopback-only address. The
documented development credentials are not suitable for remote or other
network exposure.

Start the service and wait for its health check:

```powershell
docker compose up -d postgres
docker compose ps
```

The `PORTS` column should show `127.0.0.1:<port>->5432/tcp` (for example,
`127.0.0.1:5432->5432/tcp`). It must not show `0.0.0.0` or `[::]` for the
PostgreSQL service.

Check readiness explicitly:

```powershell
docker compose exec -T postgres pg_isready -U moodle_agent_poc -d moodle_agent_poc
```

Verify that pgvector was initialized and report its installed version:

```powershell
docker compose exec -T postgres psql -U moodle_agent_poc -d moodle_agent_poc -Atc "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
```

The expected result is `0.8.6`. The initialization SQL is idempotent and is
run only when a new named volume is initialized.

Stop the service normally, preserving the named `postgres_data` volume:

```powershell
docker compose down
docker volume ls --filter name=postgres_data
```

The volume remains so the next `docker compose up -d postgres` can reuse the
local database. `docker compose down --volumes` is a destructive clean reset:
it deletes the local database volume and must only be used when intentionally
discarding Phase 0 data.

## Troubleshooting

- If Corepack reports a permissions error, retry the command in an approved
  local execution context and confirm `pnpm --version` is exactly 11.25.0.
- If the image cannot be pulled, confirm Docker is running and that the
  registry is reachable; do not replace the pinned image with a floating tag.
- If port 5432 is occupied, set another local `POSTGRES_PORT` in `.env` and
  use that same value in `DATABASE_URL`.
- If initialization must be rerun, stop the service and intentionally perform
  the destructive `docker compose down --volumes` reset, then start it again.

No application database models, migrations, vector retrieval, Moodle plugin
behavior, or Ollama integration are part of this baseline.
