/**
 * Time-machine rules.
 *
 * A snapshot feature is only worth having if three things can be proved: what
 * it captures, that credentials never leave the database inside it, and that
 * putting rows back cannot silently destroy newer data.
 */
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_FORMAT,
  archivePath,
  batches,
  confirmPhrase,
  formatBytes,
  phraseMatches,
  redactRow,
  restoreOrder,
  snapshotChecksum,
  SNAPSHOT_TABLES,
  tableSpec,
  tablesForScope,
  totalRows,
  verifyArchive,
  type TableCount,
} from "./snapshots";

describe("snapshot manifest", () => {
  it("captures money, tenancy, content, design and the audit trail", () => {
    const names = SNAPSHOT_TABLES.map((t) => t.table);
    for (const must of [
      "merchants",
      "orders",
      "order_items",
      "payments",
      "refunds",
      "payouts",
      "wallet_ledger_entries",
      "products",
      "product_variants",
      "inventory_levels",
      "articles",
      "storefront_pages",
      "theme_versions",
      "store_themes",
      "plan_definitions",
      "platform_audit_log",
    ]) {
      expect(names, must).toContain(must);
    }
    // No duplicates, and every table names the key a rewind upserts on.
    expect(new Set(names).size).toBe(names.length);
    for (const spec of SNAPSHOT_TABLES) expect(spec.key.length).toBeGreaterThan(0);
  });

  it("is written parents-before-children so a rewind cannot orphan rows", () => {
    const at = (t: string) => SNAPSHOT_TABLES.findIndex((s) => s.table === t);
    expect(at("merchants")).toBeLessThan(at("products"));
    expect(at("products")).toBeLessThan(at("product_variants"));
    expect(at("orders")).toBeLessThan(at("order_items"));
    expect(at("orders")).toBeLessThan(at("payments"));
    expect(at("theme_registry")).toBeLessThan(at("theme_versions"));
    expect(at("articles")).toBeLessThan(at("article_terms"));
    // The audit trail references everything, so it goes last.
    expect(at("platform_audit_log")).toBe(SNAPSHOT_TABLES.length - 1);
  });

  it("only offers merchant-scoped tables for a single-store snapshot", () => {
    const store = tablesForScope("store");
    expect(store.every((t) => t.scopeColumn !== null)).toBe(true);
    expect(store.map((t) => t.table)).not.toContain("plan_definitions");
    expect(store.map((t) => t.table)).not.toContain("platform_admins");
    expect(tablesForScope("platform").length).toBe(SNAPSHOT_TABLES.length);
    expect(tableSpec("merchants")?.scopeColumn).toBe("id");
    expect(tableSpec("not_a_table")).toBeNull();
  });
});

describe("credentials never reach an archive", () => {
  it("blanks the sealed gateway columns and copies everything else", () => {
    const row = {
      id: "g1",
      merchant_id: "m1",
      provider: "bkash",
      credentials_ciphertext: "sealed-secret-blob",
      webhook_secret: "hook-secret",
      active: true,
    };
    const out = redactRow("gateway_accounts", row);
    expect(out["credentials_ciphertext"]).toBeNull();
    expect(out["webhook_secret"]).toBeNull();
    expect(out["provider"]).toBe("bkash");
    expect(out["active"]).toBe(true);
    // The source row is untouched, and no secret survives serialisation.
    expect(row.credentials_ciphertext).toBe("sealed-secret-blob");
    expect(JSON.stringify(out)).not.toContain("sealed-secret-blob");
    expect(JSON.stringify(out)).not.toContain("hook-secret");
  });

  it("every table carrying a sealed column declares it", () => {
    const risky = SNAPSHOT_TABLES.filter((t) => t.table === "gateway_accounts");
    expect(risky).toHaveLength(1);
    expect(risky[0]?.redact).toEqual(["credentials_ciphertext", "webhook_secret"]);
  });

  it("leaves an ordinary row alone", () => {
    const row = { id: "p1", title: "Jamdani saree" };
    expect(redactRow("products", row)).toEqual(row);
  });
});

describe("fingerprint and sizes", () => {
  const counts: TableCount[] = [
    { table: "orders", rows: 6 },
    { table: "products", rows: 24 },
  ];

  it("is order-independent but changes with any row count", () => {
    expect(snapshotChecksum(counts)).toBe(snapshotChecksum([...counts].reverse()));
    expect(snapshotChecksum(counts)).not.toBe(
      snapshotChecksum([{ table: "orders", rows: 7 }, { table: "products", rows: 24 }]),
    );
    expect(snapshotChecksum(counts)).toMatch(/^[0-9a-f]{8}$/);
    expect(totalRows(counts)).toBe(30);
  });

  it("reads sizes the way a person would", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(15 * 1024)).toBe("15 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("names the archive file safely for object storage", () => {
    const path = archivePath("platform", "abc", "2026-09-07T15:04:05.123Z");
    expect(path).toBe("platform/2026-09-07T15-04-05-123Z-abc.ndjson.gz");
    expect(path).not.toMatch(/[:]/);
    expect(ARCHIVE_FORMAT).toBe("framique.snapshot.v1");
  });
});

describe("verifying an archive against the live database", () => {
  const archived: TableCount[] = [
    { table: "orders", rows: 6 },
    { table: "products", rows: 24 },
  ];
  const checksum = snapshotChecksum(archived);

  it("passes only when the archive is intact and the live rows agree", () => {
    const v = verifyArchive(archived, archived, checksum);
    expect(v.status).toBe("matches");
    expect(v.checks.every((c) => c.ok)).toBe(true);
    expect(v.drift).toEqual([]);
  });

  it("reports drift rather than hiding it", () => {
    const v = verifyArchive(archived, [{ table: "orders", rows: 9 }, { table: "products", rows: 24 }], checksum);
    expect(v.status).toBe("drifted");
    expect(v.drift).toEqual([{ table: "orders", archived: 6, live: 9 }]);
  });

  it("calls a tampered or empty archive damaged, never restorable", () => {
    expect(verifyArchive(archived, archived, "deadbeef").status).toBe("damaged");
    expect(verifyArchive([], [], snapshotChecksum([])).status).toBe("damaged");
    const missing = verifyArchive(archived, [{ table: "orders", rows: 6 }], checksum);
    expect(missing.drift).toEqual([{ table: "products", archived: 24, live: 0 }]);
  });
});

describe("rewind guards", () => {
  it("writes tables in manifest order and drops anything unknown", () => {
    expect(restoreOrder(["order_items", "orders", "merchants", "made_up_table", "orders"])).toEqual([
      "merchants",
      "orders",
      "order_items",
    ]);
  });

  it("requires the snapshot's own phrase, typed exactly", () => {
    const label = "Before the September release";
    expect(confirmPhrase(label)).toBe("restore before the september release");
    expect(phraseMatches("Restore Before The September Release", label)).toBe(true);
    expect(phraseMatches("  restore   before the september release  ", label)).toBe(true);
    expect(phraseMatches("restore", label)).toBe(false);
    expect(phraseMatches("", label)).toBe(false);
    expect(phraseMatches(confirmPhrase("Another snapshot"), label)).toBe(false);
  });

  it("writes in bounded batches so a large table cannot exhaust the worker", () => {
    const rows = Array.from({ length: 901 }, (_, i) => i);
    const chunks = batches(rows);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(400);
    expect(chunks[2]).toHaveLength(101);
    expect(chunks.flat()).toEqual(rows);
    expect(batches([])).toEqual([]);
  });
});
