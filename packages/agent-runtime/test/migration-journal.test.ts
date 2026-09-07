import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("database migration journal", () => {
  it("registers every SQL migration exactly once and keeps sequential indexes", () => {
    const migrationsDir = fileURLToPath(new URL("../../../db/migrations/", import.meta.url));
    const sqlTags = readdirSync(migrationsDir)
      .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
      .map((name) => name.replace(/\.sql$/u, ""))
      .sort();

    const journal = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../../db/migrations/meta/_journal.json", import.meta.url)), "utf8"),
    ) as { entries: Array<{ idx: number; tag: string; when: number }> };

    const journalTags = journal.entries.map((entry) => entry.tag);
    expect(journalTags).toEqual(sqlTags);
    expect(new Set(journalTags).size).toBe(journalTags.length);
    expect(journal.entries.map((entry) => entry.idx)).toEqual(journal.entries.map((_, index) => index));
    expect(journal.entries.every((entry, index, entries) => index === 0 || entry.when > entries[index - 1]!.when)).toBe(true);
  });
});
