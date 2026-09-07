import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeDatabase,
  createDbClient,
  getRequiredDatabaseUrl,
} from "./connection.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(connectionString?: string): Promise<void> {
  const url = connectionString ?? getRequiredDatabaseUrl();
  const { db, pool } = createDbClient(url);
  const migrationsFolder = path
    .resolve(__dirname, "../../../../db/migrations")
    .replace(/\\/g, "/");

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  runMigrations()
    .then(() => {
      console.log("Database migrations applied successfully.");
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error("Migration error:", error);
      process.exit(1);
    });
}
