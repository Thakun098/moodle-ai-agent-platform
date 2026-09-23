# Deployment Guide — Local POC

คู่มือนี้เป็น source of truth สำหรับการ **bootstrap** และ **deploy/update** Moodle Agent POC ใน local development environment บน Windows

> ขอบเขตนี้เป็น local POC deployment เท่านั้น ไม่ใช่ production deployment และไม่มี HA, production AuthN/AuthZ, rollback automation หรือ zero-downtime deployment

## Runtime topology

| Component | Runtime | Source / command |
| --- | --- | --- |
| PostgreSQL + pgvector | Docker | root `compose.yaml` |
| Moodle MariaDB + Moodle web | Docker | `docker/moodle-poc/compose.yaml` |
| Moodle plugin `local_agentpoc` | copied into running Moodle container | `moodle/local_agentpoc/` |
| AI Platform API | host Node.js process, port 3000 | `apps/api/dist/server.js` |
| Moodle MCP Server | spawned by API over stdio | `apps/moodle-mcp-server/dist/index.js` |
| Ollama / Groq / Unsloth | external/local provider | configured in `.env` |

The two Compose files intentionally serve different concerns. Use the explicit Moodle Compose file for Moodle operations.

## Prerequisites

- Windows PowerShell
- Node.js `24.18.x`
- pnpm `11.25.0`
- Docker Desktop + Docker Compose v2
- Moodle 5.1.x checkout at `C:\moodle-prac\moodle`
- this repository at `C:\moodle-prac\ai-platform`
- Ollama only when `MODEL_PROVIDER=ollama`

Expected layout:

```text
C:\moodle-prac\
├─ ai-platform\
└─ moodle\
```

The Moodle core image is built from the sibling `moodle` checkout. The POC plugin is **not** sourced from that checkout; deploy it from this repository after the Moodle container starts.

---

## Fresh bootstrap

Run commands from:

```powershell
cd C:\moodle-prac\ai-platform
```

### 1. Install dependencies and create environment

```powershell
corepack install --global pnpm@11.25.0
Copy-Item .env.example .env
pnpm install --frozen-lockfile
```

Review `.env` before continuing. At minimum the local DB default should resolve to:

```dotenv
DATABASE_URL=postgresql://moodle_agent_poc:moodle_agent_poc_dev@localhost:5432/moodle_agent_poc
```

Configure the selected model provider and, after Moodle is ready, `MOODLE_TOKEN`. For the current Instructional Design surface, set a non-empty `INSTRUCTIONAL_DESIGN_SERVICE_KEY`; set `RISK_SERVICE_KEY` as well when using Risk surfaces.

### 2. Start PostgreSQL and apply migrations

```powershell
docker compose up -d postgres
docker compose ps
node --env-file=.env --import tsx packages/agent-runtime/src/db/migrate.ts
```

The migration command above is deliberate: `migrate.ts` reads `process.env.DATABASE_URL`; it does not load `.env` by itself.

Expected PostgreSQL endpoint:

```text
127.0.0.1:5432
```

### 3. Build/start Moodle core

```powershell
docker compose -f docker/moodle-poc/compose.yaml up -d --build
docker compose -f docker/moodle-poc/compose.yaml ps
```

Expected Moodle URL:

```text
http://localhost:8000
```

Local POC administrator:

```text
Username: admin
Password: MoodleAgentPOC2026
```

### 4. Deploy the current Moodle plugin

The Moodle Docker image copies Moodle core from `C:\moodle-prac\moodle`. The authoritative plugin source is in this repository, so deploy it explicitly:

```powershell
docker cp moodle/local_agentpoc/. moodle-agent-poc-web:/var/www/html/public/local/agentpoc/
```

For a plugin code change, bump `moodle/local_agentpoc/version.php` before deployment. Ensure tracked AMD build artifacts under `amd/build/` match the source being deployed.

Run PHP lint on the primary deployed entry points:

```powershell
docker exec moodle-agent-poc-web php -l /var/www/html/public/local/agentpoc/ajax.php
docker exec moodle-agent-poc-web php -l /var/www/html/public/local/agentpoc/classes/api/ai_platform_client.php
docker exec moodle-agent-poc-web php -l /var/www/html/public/local/agentpoc/version.php
```

Then run Moodle upgrade and purge caches:

```powershell
docker exec moodle-agent-poc-web php /var/www/html/admin/cli/upgrade.php --non-interactive
docker exec moodle-agent-poc-web php /var/www/html/admin/cli/purge_caches.php
```

### 5. Create/read the Moodle Web Service token

After the plugin exists in the running Moodle container:

```powershell
$token = (docker compose -f docker/moodle-poc/compose.yaml exec -T web php /var/www/html/public/local/agentpoc/cli/create_token.php).Trim()
$token
```

Set the result as `MOODLE_TOKEN` in `.env`.

Then configure the Moodle plugin shared credentials at:

```text
Site administration → Plugins → Local plugins → Agent POC
```

- `Instructional Design service key` must equal `.env` `INSTRUCTIONAL_DESIGN_SERVICE_KEY`.
- `Risk service key` must equal `.env` `RISK_SERVICE_KEY` when Risk surfaces are used.
- AI Platform URL should remain `http://host.docker.internal:3000` for this Compose setup.

### 6. Validate and build the Node workspace

```powershell
pnpm typecheck
node --env-file=.env node_modules/vitest/vitest.mjs run
pnpm build
```

For focused work it is acceptable to run the relevant regression suites instead of the full test suite, but deployment evidence should record exactly what was run.

### 7. Start the AI Platform API

```powershell
pnpm --filter @moodle-agent-poc/api start
```

The API package starts:

```text
node --env-file=../../.env dist/server.js
```

Expected API URL:

```text
http://127.0.0.1:3000
```

The API spawns the Moodle MCP Server over stdio when required. Do not start a second MCP Server for normal use.

### 8. Smoke checks

Host API health:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health | ConvertTo-Json
```

Moodle container → host API connectivity:

```powershell
docker exec moodle-agent-poc-web curl -fsS http://host.docker.internal:3000/health
```

API → MCP → Moodle read path:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/categories | ConvertTo-Json -Depth 10
```

---

## Incremental deployment

Use this flow after pulling/merging new code into an existing local environment.

### 1. Update source

```powershell
git fetch origin
git switch main
git pull --ff-only
```

If `pnpm-lock.yaml` changed:

```powershell
pnpm install --frozen-lockfile
```

### 2. Validate before deployment

At minimum:

```powershell
pnpm typecheck
pnpm build
```

Run the relevant Vitest/static regression suites for the changed area. Do not treat a build-only pass as sufficient evidence for behavior changes.

### 3. Apply database migrations

```powershell
docker compose up -d postgres
node --env-file=.env --import tsx packages/agent-runtime/src/db/migrate.ts
```

Migrations are forward migrations. Do not assume database rollback is automatic.

### 4. Deploy Moodle plugin changes

If `moodle/local_agentpoc/` changed:

```powershell
docker cp moodle/local_agentpoc/. moodle-agent-poc-web:/var/www/html/public/local/agentpoc/
docker exec moodle-agent-poc-web php -l /var/www/html/public/local/agentpoc/ajax.php
docker exec moodle-agent-poc-web php -l /var/www/html/public/local/agentpoc/classes/api/ai_platform_client.php
docker exec moodle-agent-poc-web php -l /var/www/html/public/local/agentpoc/version.php
docker exec moodle-agent-poc-web php /var/www/html/admin/cli/upgrade.php --non-interactive
docker exec moodle-agent-poc-web php /var/www/html/admin/cli/purge_caches.php
```

Do not rebuild the whole Moodle image merely to deploy a plugin-only change unless Moodle core/image dependencies also changed.

### 5. Restart the API from the new build

Stop the previous API process and start the current build:

```powershell
pnpm --filter @moodle-agent-poc/api start
```

A changed TypeScript source file is not deployed until the API is rebuilt and the running process is restarted from the new `dist/`.

### 6. Post-deploy verification

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health | ConvertTo-Json
docker exec moodle-agent-poc-web curl -fsS http://host.docker.internal:3000/health
Invoke-RestMethod http://127.0.0.1:3000/api/categories | ConvertTo-Json -Depth 10
```

When a Moodle plugin deployment is audit-sensitive, compare workspace and deployed hashes for the changed files. Example:

```powershell
Get-FileHash moodle/local_agentpoc/amd/src/course_builder.js -Algorithm SHA256
docker exec moodle-agent-poc-web sha256sum /var/www/html/public/local/agentpoc/amd/src/course_builder.js
```

Record the plugin version, migration checkpoint, tests, health checks, and any hash evidence in the current Ticket/SOC as appropriate.

---

## What requires which deployment step?

| Change | Required action |
| --- | --- |
| `apps/api/**`, `packages/**` runtime code | build + restart API |
| `db/migrations/**` | apply migrations before using new code |
| `moodle/local_agentpoc/**` | copy plugin + Moodle upgrade + cache purge |
| AMD/template/UI change | deploy plugin; ensure build artifact is synchronized; purge cache |
| `.env` API/model change | restart API |
| Moodle core / PHP image dependency | rebuild Moodle Compose image |

---

## Stop the local environment

Stop the host API with `Ctrl+C`.

PostgreSQL:

```powershell
docker compose down
```

Moodle:

```powershell
docker compose -f docker/moodle-poc/compose.yaml down
```

Do not add `--volumes` unless data destruction is intentional.

---

## Troubleshooting

### Migration reports `DATABASE_URL environment variable is required`

Use the documented env-file command:

```powershell
node --env-file=.env --import tsx packages/agent-runtime/src/db/migrate.ts
```

### Moodle starts but `local_agentpoc` is missing

Deploy the plugin explicitly from this repository, then run upgrade/cache purge:

```powershell
docker cp moodle/local_agentpoc/. moodle-agent-poc-web:/var/www/html/public/local/agentpoc/
docker exec moodle-agent-poc-web php /var/www/html/admin/cli/upgrade.php --non-interactive
docker exec moodle-agent-poc-web php /var/www/html/admin/cli/purge_caches.php
```

### Moodle cannot reach AI Platform

The Moodle container expects:

```text
http://host.docker.internal:3000
```

Check both sides:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
docker exec moodle-agent-poc-web curl -fsS http://host.docker.internal:3000/health
```

### Code changed but runtime behavior did not

Check all three deployment boundaries:

1. Was the Node workspace rebuilt and API process restarted?
2. Was the Moodle plugin copied into the running container and cache purged?
3. Were new DB migrations applied?

