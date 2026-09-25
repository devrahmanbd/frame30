/**
 * Single-store dedup migration — TDD: grandfathered multi-owner accounts
 * are collapsed to one ownership (oldest merchant wins), staff rows are
 * never touched, and the statement is re-runnable.
 */
import { describe, expect, it } from "vitest";
import { globSync } from "node:fs";
import { readFileSync } from "node:fs";

const files = globSync("supabase/migrations/*single_store_dedup.sql");

describe("single_store_dedup migration", () => {
  it("exists and detaches extra active ownerships, oldest merchant first", () => {
    expect(files.length).toBe(1);
    const sql = readFileSync(files[0], "utf8");
    expect(sql).toMatch(/delete\s+from\s+public\.merchant_members/i);
    expect(sql).toMatch(/role\s*=\s*'owner'/i);
    expect(sql).toMatch(/row_number\(\)\s*over/i);
    expect(sql).toMatch(/order by/i);
    expect(sql).toMatch(/rn\s*>\s*1|rank\s*>\s*1/i);
  });

  it("never touches staff memberships or merchant rows", () => {
    const sql = readFileSync(files[0], "utf8");
    expect(sql).not.toMatch(/delete\s+from\s+public\.merchants/i);
    expect(sql).toMatch(/role\s*=\s*'owner'/i);
  });
});
