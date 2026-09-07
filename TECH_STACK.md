# POC Technology Stack

This document records exact implementation, runtime, and library versions selected during the POC. Architectural decisions remain in `POC_BASELINE.md`.

## Runtime

- Node.js 24.18.0
- pnpm 11.25.0
- TypeScript 5.9.3
- @types/node 24.13.3

## Testing

- Vitest 3.2.4

## Database

- PostgreSQL 17
- pgvector 0.8.6
- Docker image: `pgvector/pgvector:0.8.6-pg17-bookworm`

## Application Dependencies

- Fastify: 5.12.1
- @fastify/multipart: 10.1.1
- mammoth: 1.12.2
- pdf-parse: 2.4.5
- Drizzle: 0.45.2 (drizzle-orm, drizzle-kit 0.31.10)
- pg: 8.23.0 (@types/pg 8.23.1)
- Ajv: 8.20.0 (Draft 2020-12 validator)
- MCP TypeScript SDK: @modelcontextprotocol/sdk 1.30.0
- Zod: 4.5.4
- ollama: 0.6.3 (official JavaScript SDK)
- tsx: 4.20.6 (TypeScript script runner / smoke testing)

## Phase 5 Model Runtime Baseline

- `OLLAMA_MODEL=gemma4:e2b`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `AGENT_MODEL_TIMEOUT_MS=360000` (P5-D5, 6-minute POC model timeout)
- Phase 5 uses `stream: false` model calls.
- With `ollama@0.6.3`, Phase 5 timeout for non-streaming chat is an application/logical timeout; true non-stream transport cancellation is deferred to T1011.
