import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeDatabase,
  createDbClient,
  getDatabase,
  getRequiredDatabaseUrl,
} from "../src/db/connection.js";

describe("Database Connection", () => {
  const originalEnv = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = originalEnv;
  });

  afterEach(async () => {
    process.env.DATABASE_URL = originalEnv;
    await closeDatabase();
  });

  it("fails fast when DATABASE_URL is missing or empty", () => {
    delete process.env.DATABASE_URL;
    expect(() => getRequiredDatabaseUrl()).toThrow(
      "DATABASE_URL environment variable is required and must not be empty."
    );

    process.env.DATABASE_URL = "   ";
    expect(() => getRequiredDatabaseUrl()).toThrow(
      "DATABASE_URL environment variable is required and must not be empty."
    );
  });

  it("returns trimmed DATABASE_URL when set", () => {
    process.env.DATABASE_URL =
      " postgresql://user:pass@localhost:5432/moodle_agent_poc ";
    expect(getRequiredDatabaseUrl()).toBe(
      "postgresql://user:pass@localhost:5432/moodle_agent_poc"
    );
  });

  it("initializes and closes db client pool cleanly", async () => {
    process.env.DATABASE_URL =
      "postgresql://moodle_agent_poc:moodle_agent_poc_dev@localhost:5432/moodle_agent_poc";
    const db = getDatabase();
    expect(db).toBeDefined();

    await closeDatabase();
  });
});
