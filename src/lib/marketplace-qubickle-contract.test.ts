/**
 * QUBICKLE C3/M4 + Rule 22 — migration contract pins (static, executable).
 *
 * Migrations are architectural changes (Rule 12): these tests pin the exact
 * contract so a future retire/restore or idempotency change cannot silently
 * narrow it — the migration file and this test must change together.
 *
 * - C3: the retire migration's RESTRICTIVE deny-writes are ALL dropped by a
 *   restore migration that sorts AFTER it, and the restore re-adds
 *   merchant-scoped write policies (single active contract, no dual path).
 * - H1/H2: the idempotency migration dedupes, adds the unique
 *   (merchant_id, idempotency_key) backstop, and adds terminal `lapsed`.
 * - Rule 15/22: marketplace_installs carries merchant-scoped read+write RLS.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf-8");
}

function migrations(): string[] {
  return readdirSync(resolve(process.cwd(), "supabase/migrations")).sort();
}

describe("C3/M4 — migration contract", () => {
  it("a restore migration sorts after the retire migration (single active contract)", () => {
    const files = migrations();
    const retire = files.find((f) => f.includes("retire_themes"));
    expect(retire).toBeDefined();
    const after = files.filter((f) => f > retire!);
    const restore = after.find((f) => {
      const sql = read(`supabase/migrations/${f}`);
      return (
        sql.includes("store_themes_retired_no_writes") &&
        sql.includes("DROP POLICY")
      );
    });
    expect(restore).toBeDefined();
  });

  it("the restore drops every RESTRICTIVE deny-write the retire installed", () => {
    const retire = read("supabase/migrations/20260923_retire_themes.sql");
    const created = [
      ...retire.matchAll(/CREATE POLICY (\S+_retired_no_writes)/g),
    ].map((m) => m[1]);
    expect(created.length).toBeGreaterThan(0);
    const restore = read(
      "supabase/migrations/20260924_theme_write_restore.sql",
    );
    for (const policy of created) {
      expect(restore).toContain(`DROP POLICY IF EXISTS ${policy}`);
    }
  });

  it("the restore re-adds merchant-scoped write policies (no open writes)", () => {
    const restore = read(
      "supabase/migrations/20260924_theme_write_restore.sql",
    );
    for (const table of ["store_themes", "theme_versions", "theme_drafts"]) {
      expect(restore).toMatch(
        new RegExp(
          `CREATE POLICY \\S*${table}\\S* [\\s\\S]{0,200}?is_merchant_member`,
        ),
      );
    }
    // No permissive write that skips the membership check.
    expect(restore).not.toMatch(/WITH CHECK \(true\)/);
  });

  it("the idempotency migration dedupes + backstops (merchant, key) + lapses trials", () => {
    const files = migrations();
    const idem = files.find((f) =>
      f.includes("marketplace_install_idempotency"),
    );
    expect(idem).toBeDefined();
    const sql = read(`supabase/migrations/${idem!}`);
    expect(sql).toContain(
      "create unique index if not exists marketplace_installs_merchant_key_uidx",
    );
    expect(sql).toContain("(merchant_id, idempotency_key)");
    expect(sql).toContain("add value if not exists 'lapsed'");
    // Dedupe keeps the earliest row per tuple — never a blind wipe.
    expect(sql).toMatch(/keep earliest|EARLIEST/i);
    expect(sql).toMatch(/b\.created_at < a\.created_at/);
  });

  it("marketplace_installs stays under merchant-scoped read+write RLS", () => {
    const baseline = read("migration/0001_baseline.sql");
    expect(baseline).toMatch(
      /CREATE POLICY marketplace_installs_tenant_read[\s\S]{0,300}?is_merchant_member/,
    );
    expect(baseline).toMatch(
      /CREATE POLICY marketplace_installs_tenant_write[\s\S]{0,300}?is_merchant_member/,
    );
  });
});
