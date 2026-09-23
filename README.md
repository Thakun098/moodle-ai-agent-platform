# Teacher AI Assistance 2

ระบบ Proof of Concept สำหรับให้ AI วางแผนและสร้าง/แก้ไข Moodle Course ผ่านลำดับ:

```text
Syllabus → AI Platform API → Ollama/Groq/Unsloth
                         → Moodle MCP Server (stdio)
                         → Moodle Web Service / local_agentpoc
```

เอกสารนี้เน้น quick start สำหรับ local development เท่านั้น

สำหรับขั้นตอน bootstrap/deploy/update ที่เป็น source of truth ให้ใช้ [`DEPLOYMENT.md`](DEPLOYMENT.md)

## สิ่งที่ต้องมี

- Windows PowerShell
- Node.js `24.18.0`
- pnpm `11.25.0`
- Docker Desktop พร้อม Docker Compose v2
- Ollama (ถ้าใช้ `MODEL_PROVIDER=ollama`)
- Moodle 5.1.x checkout ที่ `C:\moodle-prac\moodle`
- plugin `local_agentpoc` ใช้ source จาก `ai-platform\moodle\local_agentpoc` และ deploy เข้า Moodle container แยกจาก Moodle core image

ใน workspace นี้มี Moodle Compose สำหรับรัน Moodle แบบ local อยู่แล้ว โดย Compose จะใช้ Moodle checkout ที่อยู่ข้างโฟลเดอร์ `ai-platform`:

```text
C:\moodle-prac\
├─ ai-platform\
└─ moodle\
```

## Quick start

ให้เปิดอย่างน้อย 3 terminal และรันคำสั่งจาก `C:\moodle-prac\ai-platform` เว้นแต่ระบุไว้เป็นอย่างอื่น

### 1. ติดตั้ง dependencies และเตรียม environment

```powershell
cd C:\moodle-prac\ai-platform

corepack install --global pnpm@11.25.0
pnpm --version
Copy-Item .env.example .env
pnpm install --frozen-lockfile
```

ตรวจสอบหรือเพิ่มค่าต่อไปนี้ใน `.env`:

```dotenv
DATABASE_URL=postgresql://moodle_agent_poc:moodle_agent_poc_dev@localhost:5432/moodle_agent_poc
MODEL_PROVIDER=ollama
OLLAMA_MODEL=gemma4:e2b
OLLAMA_BASE_URL=http://127.0.0.1:11434
MOODLE_BASE_URL=http://localhost:8000
MOODLE_TOKEN=<ใส่ Moodle Web Service token>
MCP_SERVER_COMMAND=node
MCP_SERVER_ARGS=["C:/moodle-prac/ai-platform/apps/moodle-mcp-server/dist/index.js"]
INSTRUCTIONAL_DESIGN_SERVICE_KEY=<shared key used by Moodle plugin>
RISK_SERVICE_KEY=<shared key used by Moodle plugin when Risk surfaces are used>
```

ถ้าย้ายโปรเจกต์ไป path อื่น ให้แก้ path ใน `MCP_SERVER_ARGS` ให้ตรงกับตำแหน่งจริง โดยค่าต้องเป็น JSON array ของ string และห้าม commit `.env`

### 2. รัน PostgreSQL และ apply migrations

```powershell
docker compose up -d postgres
docker compose ps
node --env-file=.env --import tsx packages/agent-runtime/src/db/migrate.ts
```

PostgreSQL จะเปิดที่ `127.0.0.1:5432` และเปิดใช้งาน extension `pgvector` ให้โดยอัตโนมัติ

### 3. รัน Moodle local instance และ deploy plugin

```powershell
docker compose -f docker/moodle-poc/compose.yaml up -d --build
docker compose -f docker/moodle-poc/compose.yaml ps
```

Moodle image ใช้ core จาก `C:\moodle-prac\moodle` แต่ **ไม่ได้ดึง plugin จาก `ai-platform\moodle\local_agentpoc` อัตโนมัติ** จึงต้อง deploy plugin เข้า running container:

```powershell
docker cp moodle/local_agentpoc/. moodle-agent-poc-web:/var/www/html/public/local/agentpoc/
docker exec moodle-agent-poc-web php /var/www/html/admin/cli/upgrade.php --non-interactive
docker exec moodle-agent-poc-web php /var/www/html/admin/cli/purge_caches.php
```

Moodle จะเปิดที่ [http://localhost:8000](http://localhost:8000)

ค่าบัญชี admin สำหรับ local POC ที่กำหนดใน Compose คือ:

```text
Username: admin
Password: MoodleAgentPOC2026
```

หลัง deploy plugin แล้ว สร้างหรืออ่าน Web Service token สำหรับ `local_agentpoc`:

```powershell
$token = (docker compose -f docker/moodle-poc/compose.yaml exec -T web php /var/www/html/public/local/agentpoc/cli/create_token.php).Trim()
$token
```

นำค่าที่ได้ไปใส่ใน `.env` ที่ `MOODLE_TOKEN`

สำหรับ Instructional Design flow ให้ตั้ง `INSTRUCTIONAL_DESIGN_SERVICE_KEY` ใน `.env` และตั้งค่าเดียวกันที่ Moodle:

`Site administration → Plugins → Local plugins → Teacher AI Assistance 2 → Instructional Design service key`

ถ้าใช้ Risk surfaces ให้ตั้ง `RISK_SERVICE_KEY` และ Moodle `Risk service key` ให้ตรงกันด้วย จากนั้น restart API หาก API รันอยู่แล้ว

> Moodle Compose เปิด `host.docker.internal:3000` ให้ container เรียก AI Platform ได้ ค่าเริ่มต้นของ plugin จึงใช้งานได้เมื่อ API รันที่ port `3000`

### 4. เตรียม model runtime

ถ้าใช้ Ollama ให้เปิด Ollama Desktop หรือรัน server:

```powershell
ollama serve
ollama pull gemma4:e2b
ollama list
```

ถ้าใช้ provider อื่น ให้ตั้งค่าแทนใน `.env`:

| Provider | ค่าที่ต้องมี |
| --- | --- |
| `ollama` | `OLLAMA_MODEL`, `OLLAMA_BASE_URL` |
| `groq` | `GROQ_API_KEY` และ `GROQ_MODEL` ตามต้องการ |
| `unsloth` | `UNSLOTH_BASE_URL`, `UNSLOTH_MODEL` และ `UNSLOTH_API_KEY` ถ้าจำเป็น |

### 5. Build และรัน AI Platform API

```powershell
pnpm build
pnpm --filter @moodle-agent-poc/api start
```

API จะเปิดที่ [http://127.0.0.1:3000](http://127.0.0.1:3000)

สำหรับการใช้งานปกติไม่ต้องเปิด Moodle MCP Server แยก เพราะ API จะ spawn MCP Server แบบ stdio เมื่อเรียก endpoint ที่ต้องติดต่อ Moodle

ถ้าต้องการรัน MCP Server เพื่อทดสอบ protocol โดยตรง:

```powershell
pnpm --filter @moodle-agent-poc/moodle-mcp-server start
```

process นี้ใช้ stdout สำหรับ JSON-RPC และใช้ stderr สำหรับ log จึงอาจดูเหมือนไม่มี output เมื่อเปิดค้างไว้ใน terminal

## Update environment ที่รันอยู่แล้ว

สำหรับ incremental deployment ไม่ต้อง rebuild Moodle image ทุกครั้ง ถ้าเปลี่ยนเฉพาะ plugin/API:

1. validate + `pnpm build`
2. apply DB migrations ด้วย `node --env-file=.env --import tsx packages/agent-runtime/src/db/migrate.ts`
3. ถ้า plugin เปลี่ยน ให้ `docker cp` จาก `moodle/local_agentpoc` แล้ว run Moodle upgrade + purge caches
4. restart AI Platform API จาก build ใหม่
5. ตรวจ `/health` ทั้งจาก host และจาก Moodle container

คำสั่งเต็มและ deployment matrix อยู่ใน [`DEPLOYMENT.md`](DEPLOYMENT.md)

## ตรวจสอบว่า system พร้อมใช้งาน

จาก terminal ใหม่:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health | ConvertTo-Json
```

ผลลัพธ์ควรมี `status` เป็น `ok`

ทดสอบการเชื่อมต่อ API → MCP → Moodle และการอ่าน category:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/categories | ConvertTo-Json -Depth 10
```

จากนั้นเปิด Moodle ที่ [http://localhost:8000](http://localhost:8000) และเข้าเมนูของ `local_agentpoc` เพื่อทดสอบ flow หลัก:

```text
Upload syllabus → Generate plan → Preview → Select category
→ Approve → Execute → Verify
```

ไฟล์ syllabus ที่รองรับคือ `.txt`, `.md`, `.docx` และ PDF ที่มี text layer; scanned PDF ที่ต้องใช้ OCR ยังไม่รองรับ

## คำสั่งตรวจสอบโค้ด

```powershell
pnpm typecheck
node --env-file=.env node_modules/vitest/vitest.mjs run
pnpm build
```

ทดสอบ Ollama แบบ live หลัง build แล้ว:

```powershell
pnpm smoke:ollama
```

คำสั่งนี้ต้องเห็น `OLLAMA_BASE_URL` และ `OLLAMA_MODEL` ใน environment ของ shell ที่ใช้รันคำสั่ง

## หยุดระบบ

หยุด API ด้วย `Ctrl+C` ใน terminal ของ API แล้วหยุด containers:

```powershell
docker compose down
docker compose -f docker/moodle-poc/compose.yaml down
```

คำสั่งข้างต้นจะหยุด service แต่เก็บ named volumes ไว้สำหรับการรันครั้งถัดไป

ถ้าต้องการล้างฐานข้อมูล local ของ PostgreSQL โดยตั้งใจเท่านั้น:

```powershell
docker compose down --volumes
```

## Troubleshooting

### `DATABASE_URL environment variable is required`

ตรวจสอบว่าไฟล์ `.env` อยู่ที่ `C:\moodle-prac\ai-platform\.env` และมี `DATABASE_URL`

สำหรับ migration ให้ใช้คำสั่งที่โหลด `.env` ชัดเจน:

```powershell
node --env-file=.env --import tsx packages/agent-runtime/src/db/migrate.ts
```

จากนั้น restart API หากค่าของ runtime environment เปลี่ยน

### `MODEL_NOT_FOUND` หรือ `OLLAMA_UNAVAILABLE`

ตรวจสอบว่า Ollama ทำงานอยู่และ model ตรงกับค่าใน `.env`:

```powershell
ollama list
ollama pull gemma4:e2b
```

### เรียก `/api/categories` แล้ว MCP หาไฟล์ไม่เจอ

ตรวจสอบว่า build แล้ว และ `MCP_SERVER_ARGS` ชี้ไปที่ไฟล์นี้จริง:

```text
apps/moodle-mcp-server/dist/index.js
```

บน Windows แนะนำให้ใช้ absolute path ในรูป JSON array ตามตัวอย่างในหัวข้อ environment

### Moodle ติดต่อ API ไม่ได้

ตรวจสอบว่า API เปิดที่ port `3000` และ plugin ตั้งค่า AI Platform URL เป็น `http://host.docker.internal:3000` ที่ Moodle:

```text
Site administration → Plugins → Local plugins → Teacher AI Assistance 2
```

### `invalidtoken`

สร้าง token ใหม่ด้วยคำสั่งในขั้นตอนรัน Moodle แล้วอัปเดต `MOODLE_TOKEN` ใน `.env` จากนั้น restart API

## โครงสร้างสำคัญ

```text
apps/api/                    Fastify API
apps/moodle-mcp-server/      Moodle MCP Server แบบ stdio
packages/agent-runtime/      Agent loop, MCP client, persistence
packages/planning/           Course/Assignment/Quiz planners
packages/execution/          Plan execution ผ่าน MCP
packages/verification/       Read-back verification
packages/moodle-client/      Moodle REST client
moodle/local_agentpoc/       Moodle plugin source ในโปรเจกต์นี้
db/migrations/               Drizzle migrations
DEPLOYMENT.md                Fresh/incremental local deployment guide
compose.yaml                 PostgreSQL + pgvector
docker/moodle-poc/           Moodle local Compose
```

โปรเจกต์นี้เป็น POC สำหรับ development ไม่ใช่ production deployment และยังไม่มี production authentication/authorization, rollback, HA หรือ OCR
