import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
const { Pool } = pg;

export type AppDatabase = NodePgDatabase<typeof schema>;

let defaultPool: pg.Pool | null = null;
let defaultDb: AppDatabase | null = null;

export function getRequiredDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") {
    throw new Error(
      "DATABASE_URL environment variable is required and must not be empty."
    );
  }
  return url.trim();
}

export function createDbClient(connectionString?: string): {
  db: AppDatabase;
  pool: pg.Pool;
} {
  const url = connectionString ?? getRequiredDatabaseUrl();
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export function getDatabase(): AppDatabase {
  if (!defaultDb) {
    const url = getRequiredDatabaseUrl();
    defaultPool = new Pool({ connectionString: url });
    defaultDb = drizzle(defaultPool, { schema });
  }
  return defaultDb;
}

export async function closeDatabase(): Promise<void> {
  if (defaultPool) {
    await defaultPool.end();
    defaultPool = null;
    defaultDb = null;
  }
}
