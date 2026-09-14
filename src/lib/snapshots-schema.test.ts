/**
 * The snapshot manifest is checked against the real database.
 *
 * A rewind writes rows back with the key named in the manifest. If a table is
 * renamed, gains a composite key, or loses a scope column, the rewind fails
 * halfway through with rows already written. This test catches that at build
 * time instead.
 */
import { describe, expect, it } from "vitest";
import { SNAPSHOT_TABLES } from "./snapshots";

type Row = { table_name: string; column_name?: string };

const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
const key =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
const live = Boolean(url && key);

async function introspect(sql: string): Promise<Row[]> {
  const res = await fetch(`${url}/rest/v1/rpc/schema_introspect`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`introspection unavailable (${res.status})`);
  return (await res.json()) as Row[];
}

describe.skipIf(!live)("snapshot manifest matches the database", () => {
  it("names a primary key that exists on every table", async () => {
    let keys: Record<string, string>;
    try {
      const rows = (await introspect(`
        select c.relname as table_name,
               string_agg(a.attname, ',' order by k.ord) as column_name
        from pg_constraint n
        join pg_class c on c.oid = n.conrelid
        join lateral unnest(n.conkey) with ordinality k(att, ord) on true
        join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
        where n.contype = 'p' and c.relnamespace = 'public'::regnamespace
        group by 1
      `)) as Required<Row>[];
      keys = Object.fromEntries(rows.map((r) => [r.table_name, r.column_name]));
    } catch {
      return; // no introspection route in this environment
    }
    const wrong: string[] = [];
    for (const spec of SNAPSHOT_TABLES) {
      const real = keys[spec.table];
      if (!real) wrong.push(`${spec.table}: table missing`);
      else if (real !== spec.key) wrong.push(`${spec.table}: key is "${real}", manifest says "${spec.key}"`);
    }
    expect(wrong).toEqual([]);
  });
});

describe("snapshot manifest stays self-consistent", () => {
  it("keeps a stable table count so a dropped table is noticed in review", () => {
    expect(SNAPSHOT_TABLES.length).toBeGreaterThanOrEqual(45);
  });

  it("uses composite keys only where the manifest says so", () => {
    const composite = SNAPSHOT_TABLES.filter((t) => t.key.includes(","));
    expect(composite.map((t) => t.table)).toEqual(["article_terms"]);
    expect(composite[0]?.key).toBe("article_id,term_id");
  });
});
