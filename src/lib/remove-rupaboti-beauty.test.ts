/**
 * Rupaboti Beauty removal migration — TDD: deletes exactly the demo merchant
 * row by slug (FK cascades clean up children), touches nothing else, and is
 * re-runnable (no-op when already gone).
 */
import { describe, expect, it } from "vitest";
import { globSync } from "node:fs";
import { readFileSync } from "node:fs";

const files = globSync("supabase/migrations/*remove_rupaboti_beauty.sql");

describe("remove_rupaboti_beauty migration", () => {
  it("exists and deletes exactly the rupaboti-beauty merchant row", () => {
    expect(files.length).toBe(1);
    const sql = readFileSync(files[0], "utf8");
    expect(sql).toMatch(/delete\s+from\s+public\.merchants/i);
    expect(sql).toMatch(/slug\s*=\s*'rupaboti-beauty'/i);
  });

  it("touches no other merchant and drops no schema", () => {
    const sql = readFileSync(files[0], "utf8");
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.merchants\s*;/i);
    expect(sql).not.toMatch(/truncate/i);
  });
});
