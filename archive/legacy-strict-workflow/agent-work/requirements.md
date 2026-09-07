# Phase 0 Requirements

- **Version:** 0.1
- **Status:** approved
- **Phase:** 0 — Repository and Development Baseline
- **Owner role:** Sol
- **Approval identity:** User
- **Approval evidence:** User message `Approved` on 2026-08-31
- **Source of truth:** `AGENTS.md`, `POC_BASELINE.md`, `Implementation.md`, `PLANNING_CONTRACT.md`, `task.md`, `soc.md`, and the user's Phase 0/UI sequencing direction

## Objective

Establish the smallest reproducible Node.js/TypeScript monorepo and local PostgreSQL-with-pgvector development baseline needed for later POC phases. Phase 0 must make the repository structurally ready for contract, API, MCP, Moodle-plugin, and test work without implementing those later capabilities.

## Confirmed Functional Requirements

### T0001 — Initialize pnpm workspace

1. Create a root `package.json` for a private POC workspace.
2. Configure a pnpm workspace that can include both `apps/*` and `packages/*` packages.
3. Declare an explicit Node.js and package-manager baseline so supported local tooling is discoverable and reproducible.
4. Establish the minimum TypeScript development dependencies needed by the Phase 0 workspace and commands.
5. Create a repository-appropriate `.gitignore` covering dependency output, build/test output, local environment files, logs, and other generated local state without hiding source or required examples.
6. Create `.env.example` with non-secret placeholders for variables required by the Phase 0 local environment. No real credentials or secrets may be committed.
7. Generate and retain the pnpm lockfile when dependencies can be resolved in the implementation environment.

### T0002 — Configure TypeScript

1. Create one shared base TypeScript configuration at the workspace root.
2. Enable `strict: true` and safe, current Node.js-oriented compiler settings.
3. Make the shared configuration reusable by future application and package-level configurations without adding application code in Phase 0.
4. Ensure the Phase 0 typecheck command succeeds against the initialized workspace.

### T0003 — Create repository structure

Create and retain the following boundaries:

```text
apps/api
apps/moodle-mcp-server
packages/contracts
packages/agent-runtime
packages/syllabus
packages/planning
packages/execution
packages/verification
packages/moodle-client
moodle/local_agentpoc
tests
```

Each Node workspace location that is activated in Phase 0 must be recognized consistently by pnpm. Empty structural boundaries may use minimal tracked placeholders; they must not contain speculative implementations.

### T0004 — Add development commands

1. Provide root commands for `typecheck`, `test`, and `build`.
2. Select and configure linting and formatting only if they can be kept minimal and deterministic for this disposable POC; if selected, expose root commands for them.
3. Commands must be safe to run repeatedly from the repository root and must return non-zero on failure.
4. Commands must cover all activated workspace packages rather than silently checking only the root.
5. Initial test/build/typecheck commands may legitimately report no application tests or source yet, but they must execute successfully and provide a usable baseline for later phases.

### T0005 — Create local development environment

1. Provide a documented local workflow for starting and stopping PostgreSQL for development.
2. Make the pgvector extension available in that PostgreSQL instance and include a deterministic way to verify its availability.
3. Configure local services through environment variables represented in `.env.example`.
4. Document prerequisite, install, start, stop, status/health, and validation commands needed by a new developer.
5. Keep the Phase 0 environment local and POC-sized. Docker Compose may be used for PostgreSQL/pgvector; Ollama may remain host-managed and is not required to be integrated in Phase 0.
6. Do not add database application models or migrations from Phase 2, and do not activate vector retrieval.

## Non-Functional Requirements

- **Clarity:** Configuration and commands must be explicit, small, and understandable without reverse engineering.
- **Reproducibility:** Tool/runtime versions or compatible version ranges must be declared; dependency resolution must be captured by a lockfile when installation is possible.
- **Observability:** Development commands and local-service instructions must expose actionable failures. Where Phase 0 offers a logging control, development defaults should permit verbose diagnostics without leaking secrets.
- **Testability:** The baseline must support later Vitest tests and provide runnable validation commands from the root.
- **Security:** No secrets, real tokens, passwords, or environment-specific private data may be committed. Local example credentials must be clearly non-production.
- **Portability:** The documented workflow must account for the repository's current Windows/PowerShell host and use cross-platform package scripts where practical.
- **POC proportionality:** Prefer direct configuration over frameworks or abstractions that are not needed by Phase 0.
- **Preservation:** Existing baseline documents, UI design assets, and unrelated user files must not be overwritten or reformatted.

## Constraints and Out of Scope

- The repository is a throw-away POC; production completeness is not a Phase 0 goal.
- Frozen architectural decisions in the baseline documents remain unchanged.
- Use Node.js, TypeScript, pnpm, PostgreSQL, pgvector, and Vitest as specified. Fastify, Drizzle, Ajv, Ollama integration, and the MCP SDK belong to later tasks unless a minimal dependency is strictly required for baseline wiring.
- Do not implement application behavior, JSON Schemas, persistence models/migrations, Fastify endpoints, syllabus ingestion, planners, previews, Agent loops, MCP tools, Moodle APIs, execution, or verification.
- Do not write directly to Moodle's database.
- Do not add RAG/vector retrieval, Redis/BullMQ, object storage, Kubernetes/HA, production AuthN/AuthZ, production approvals, rollback, multi-tenancy, or other explicitly excluded production capabilities.
- Do not mark T0001–T0005 complete or append completion records to `soc.md` during requirements approval. Those updates occur only after implementation and validation.
- Do not create an implementation plan or begin implementation until the user explicitly approves this requirements version.

## Assumptions

1. `C:\moodle-prac\ai-platform` is the intended project root even though it is not currently a standalone Git repository.
2. Node.js 24.18.0 is available on the current host and is a viable starting point; the exact supported Node range and pnpm version will be frozen during planning after requirements approval.
3. Docker Engine 29.6.1 and Docker Compose 5.1.4 are installed. The current sandbox's inability to read the user's Docker configuration does not establish that Docker is unusable outside the sandbox.
4. Phase 0 may choose a maintained PostgreSQL/pgvector container image and pin a compatible version during planning; no production database topology is implied.
5. Phase 0 documentation may be added as a small root README or dedicated development guide; the exact filename is a planning decision.
6. Minimal per-package manifests/configuration or tracked placeholders are acceptable when needed to make workspace discovery and root validation truthful.

## Dependencies and Environment Risks

- Node.js 24.18.0 is available.
- `pnpm --version` is currently blocked in the sandbox because Corepack cannot read `C:\Users\sanak\AppData\Local\node\corepack\lastKnownGood.json` (`EPERM`). Dependency installation, lockfile generation, and pnpm-based validation may require an approved execution context or Corepack repair during implementation.
- `npm --version` currently resolves to a missing roaming `npm-cli.js`; npm must not be assumed to be a working fallback.
- Docker 29.6.1 and Compose 5.1.4 are installed, but sandbox access to `C:\Users\sanak\.docker\config.json` is denied. Container validation may require an approved execution context during implementation.
- Network/package-registry access is required to resolve dependencies unless they are already cached.
- Later phases depend on a reachable Moodle 5.1.x environment and Ollama, but Phase 0 does not require their integration.

## Acceptance Criteria

### T0001

- A root private `package.json`, pnpm workspace definition, `.gitignore`, and secret-free `.env.example` exist and agree on the workspace layout.
- The Node/package-manager baseline is documented or declared in machine-readable metadata.
- Dependency installation produces a pnpm lockfile when the environment permits registry/Corepack access.

### T0002

- A shared base TypeScript configuration exists with `strict: true`.
- All activated Node workspace packages can extend or consume it.
- Root typechecking completes successfully.

### T0003

- Every directory listed in T0003 exists and is retained by the repository.
- pnpm discovers the intended `apps/*` and `packages/*` workspace packages.
- No later-phase application behavior has been introduced merely to populate the structure.

### T0004

- Root `typecheck`, `test`, and `build` commands execute all applicable workspace checks and succeed from a correctly provisioned environment.
- Any selected lint/format commands also succeed and are documented.
- A deliberately failing child check would propagate a non-zero root command result; the workspace runner must not mask failures.

### T0005

- Following the documentation from a clean local setup starts PostgreSQL and reaches a healthy state.
- A documented command confirms PostgreSQL connectivity and that the `vector` extension is available or installed.
- Stopping and restarting the service preserves the expected development data unless an explicit cleanup command is used.
- Configuration is supplied via environment variables with safe example values and no committed secrets.

### Phase 0 completion gate

- Relevant validation commands have been run and their actual results recorded.
- Any sandbox-only validation limitation is documented rather than represented as a pass.
- Only after implementation and validation are T0001–T0005 marked `[x]` in `task.md` and corresponding factual completion entries appended to `soc.md`.

## UI Design Deferral

`UI-design/UI-create-course-to-approve-to-create.png` is a later-phase product reference, not a Phase 0 deliverable. It depicts a Moodle-integrated flow with an entry point, syllabus/category input, generated-plan review/edit/regenerate, warnings/assumptions, and an approval step that creates a hidden draft course. Phase 0 must preserve this asset and avoid decisions that preclude the flow, but it must not implement or scaffold that UI, the Moodle entry point, course planning, preview, approval, or course creation. Those plugin/UI phases begin before Agent-driven course creation, as directed by the user, and require separate approved planning.

## Material Open Questions

No product-scope question blocks approval of Phase 0. Exact Node/pnpm pins, PostgreSQL/pgvector image versions, and whether to enable a minimal lint/format toolchain are bounded implementation-planning decisions under the requirements above. If planning discovers that any choice changes architecture, security, data handling, or the approved scope, requirements approval must be reopened.
