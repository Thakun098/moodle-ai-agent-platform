import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL environment variable is required.");
}

export default defineConfig({
  schema: path
    .resolve(__dirname, "packages/agent-runtime/src/db/schema/index.ts")
    .replace(/\\/g, "/"),
  out: path.resolve(__dirname, "db/migrations").replace(/\\/g, "/"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
