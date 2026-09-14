/**
 * Schema guard — every public table must have a primary key.
 *
 * TODO.md P0.7: eleven tables came back from the restore without one, so every
 * `upsert` (settings save, theme install, plan edit) appended a duplicate row
 * instead of updating. The keys were restored in
 * `migration/0004_restore_primary_keys.sql`; this test is what stops the same
 * hole from reopening the next time the schema is rebuilt from a dump.
 *
 * Skipped when no database URL is present, exactly like the RLS matrix.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const dbUrl = process.env["SUPABASE_DB_URL"] ?? "";
const d = dbUrl ? describe : describe.skip;

/**
 * Read `pg_catalog`, not `information_schema`. The information_schema views
 * hide constraints on tables the connecting role does not own, so a
 * least-privilege maintenance role sees zero primary keys and the assertion
 * passes or fails for the wrong reason. `pg_class`/`pg_constraint` are visible
 * to every role, which makes this guard say something true.
 */
const QUERY = `
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not exists (
      select 1
      from pg_constraint k
      where k.conrelid = c.oid
        and k.contype = 'p'
    )
  order by 1
`;

d("public schema primary keys", () => {
  it("no table in the public schema is without a primary key", () => {
    const out = execFileSync("psql", [dbUrl, "-tAc", QUERY], { encoding: "utf8" });
    const missing = out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    expect(missing).toEqual([]);
  });
});
